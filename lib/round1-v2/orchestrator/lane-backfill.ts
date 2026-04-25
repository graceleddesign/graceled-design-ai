/**
 * V2 Lane Backfill
 *
 * When a selected A/B/C lane fails rebuild/validation, we can pull a
 * replacement scout from the already-generated (but not-selected) pool
 * instead of immediately failing the lane.
 *
 * Design constraints:
 * - Pure pool/selection helpers are synchronous and fully testable.
 * - `runLaneWithBackfill` has injectable evalFn/acceptanceFn for testing.
 * - No new scout generation — only scouts from the existing pool.
 * - Text retry still runs for `background_text_detected` within each attempt.
 * - Budget is bounded; no unbounded loops.
 * - Does not weaken any validation gate.
 * - Failed lanes remain honestly failed with specific reasons.
 */

import type { ScoutPlan, ScoutSlot } from "./build-scout-plan";
import type { ScoutGenerationResult } from "./run-scout-batch";
import type { ScoutEvalResult } from "../eval/evaluate-scout";
import type { SelectedScout, SelectionLabel } from "./select-scouts";
import type { RebuildProvider } from "../providers/rebuild-provider";
import { RebuildProviderError, REBUILD_WIDE_WIDTH_PX, REBUILD_WIDE_HEIGHT_PX } from "../providers/rebuild-provider";
import type { ProductionBackgroundValidationEvidence } from "@/lib/production-valid-option";
import type { GrammarKey } from "../grammars";
import { buildRebuildPrompt, buildTextPurgedRebuildPrompt } from "./build-rebuild-prompt";

// ── Public types ──────────────────────────────────────────────────────────────

export interface BackfillCandidate {
  slotIndex: number;
  slot: ScoutSlot;
  result: ScoutGenerationResult;
  eval: ScoutEvalResult;
  grammarKey: string;
  diversityFamily: string;
  compositeScore: number;
}

export interface BackfillRejectedAttempt {
  slotIndex: number;
  grammarKey: string;
  diversityFamily: string;
  failureReason: string;
  textRetryAttempted: boolean;
}

export interface BackfillDebugMeta {
  attempted: boolean;
  attemptCount: number;
  primaryScoutSlotIndex: number;
  usedScoutSlotIndex: number | null;
  rejectedCandidates: BackfillRejectedAttempt[];
  finalOutcome: "primary" | "backfill" | "exhausted";
  diversityRelaxed: boolean;
}

export interface TextRetryMeta {
  attempted: boolean;
  originalRejectionReason: string | null;
  retryRejectionReason: string | null;
  retryBecameAccepted: boolean;
}

export type LaneWithBackfillResult =
  | {
      status: "accepted";
      imageBytes: Buffer;
      backgroundEvidence: ProductionBackgroundValidationEvidence;
      textRetryMeta: TextRetryMeta;
      backfillDebug: BackfillDebugMeta;
      providerId: string;
      providerModel: string | undefined;
      usedFallback: boolean;
      /** Slot index of the scout whose rebuild image was accepted. */
      usedScoutSlotIndex: number;
      /** Grammar key of the accepted scout (may differ from primary). */
      usedGrammarKey: string;
      /** Diversity family of the accepted scout. */
      usedDiversityFamily: string;
      /** Composite score of the accepted scout. */
      usedCompositeScore: number;
    }
  | {
      status: "exhausted";
      lastFailureReason: string;
      lastFailureEvidence?: ProductionBackgroundValidationEvidence;
      textRetryMeta: TextRetryMeta;
      backfillDebug: BackfillDebugMeta;
    };

// ── Seed helpers ──────────────────────────────────────────────────────────────

/** Deterministic rebuild seed per-attempt (mirrors run-rebuild-batch.ts). */
function rebuildSeed(scoutSeed: number, attemptOrder: number): number {
  return (scoutSeed ^ (0xdeadbeef * (attemptOrder + 1))) >>> 0;
}

/** Deterministic text-retry seed (mirrors run-text-retry.ts). */
function textRetryRebuildSeed(scoutSeed: number): number {
  return (scoutSeed ^ 0xbeefcafe) >>> 0;
}

// ── Pure pool helpers ─────────────────────────────────────────────────────────

/**
 * Build the pool of candidates eligible for backfill.
 *
 * Eligible = generation succeeded + scout eval passed (not hardReject)
 *            + not in the initially selected set.
 *
 * Sorted by compositeScore descending (best first).
 */
export function buildBackfillPool(params: {
  plan: ScoutPlan;
  results: ScoutGenerationResult[];
  evals: ScoutEvalResult[];
  selectedSlotIndices: ReadonlySet<number>;
}): BackfillCandidate[] {
  const { plan, results, evals, selectedSlotIndices } = params;
  const candidates: BackfillCandidate[] = [];

  for (let i = 0; i < plan.slots.length; i++) {
    const slot = plan.slots[i];
    const result = results[i];
    const ev = evals[i];

    if (selectedSlotIndices.has(i)) continue;       // was selected for A/B/C
    if (result.status === "failed" || !result.imageBytes) continue; // generation failed
    if (ev.hardReject) continue;                    // structural quality failure

    candidates.push({
      slotIndex: i,
      slot,
      result,
      eval: ev,
      grammarKey: slot.grammarKey,
      diversityFamily: slot.diversityFamily,
      compositeScore: ev.compositeScore,
    });
  }

  candidates.sort((a, b) => b.compositeScore - a.compositeScore);
  return candidates;
}

/**
 * Select up to `maxCount` backfill candidates for a failing lane.
 *
 * - Excludes scouts already used by another completed lane.
 * - Prefers candidates whose grammarKey is NOT in `preferNotGrammarKeys`
 *   (diversity preference), but falls back to same-grammar if needed.
 *
 * Returns `{ candidates, diversityRelaxed }` — diversityRelaxed is true if
 * all returned candidates share a grammar key with `preferNotGrammarKeys`.
 */
export function selectEligibleBackfill(params: {
  pool: BackfillCandidate[];
  completedSlotIndices: ReadonlySet<number>;
  preferNotGrammarKeys?: ReadonlySet<string>;
  maxCount: number;
}): { candidates: BackfillCandidate[]; diversityRelaxed: boolean } {
  const { pool, completedSlotIndices, preferNotGrammarKeys, maxCount } = params;

  const available = pool.filter((c) => !completedSlotIndices.has(c.slotIndex));
  if (available.length === 0) return { candidates: [], diversityRelaxed: false };

  const preferred: BackfillCandidate[] = [];
  const remainder: BackfillCandidate[] = [];

  for (const c of available) {
    if (preferNotGrammarKeys && preferNotGrammarKeys.has(c.grammarKey)) {
      remainder.push(c);
    } else {
      preferred.push(c);
    }
  }

  const ordered = [...preferred, ...remainder];
  const result = ordered.slice(0, maxCount);

  // diversityRelaxed: true if we had to include any same-grammar candidates
  const diversityRelaxed =
    result.length > preferred.length ||
    (preferred.length === 0 && result.length > 0);

  return { candidates: result, diversityRelaxed };
}

// ── Internal generation helpers ───────────────────────────────────────────────

interface GenerateResult {
  imageBytes: Buffer;
  providerId: string;
  providerModel: string | undefined;
  usedFallback: boolean;
}

/** Run one rebuild attempt with primary→fallback provider chain. */
async function attemptGenerate(
  prompt: string,
  seed: number,
  primaryProvider: RebuildProvider,
  fallbackProvider: RebuildProvider,
  rebuildFallbackBudget: number
): Promise<GenerateResult | null> {
  for (let attempt = 0; attempt <= rebuildFallbackBudget; attempt++) {
    const isFirst = attempt === 0;
    const provider = isFirst ? primaryProvider : fallbackProvider;
    const attemptSeed = rebuildSeed(seed, attempt);
    try {
      const res = await provider.generate({
        prompt,
        widthPx: REBUILD_WIDE_WIDTH_PX,
        heightPx: REBUILD_WIDE_HEIGHT_PX,
        seed: attemptSeed,
      });
      return {
        imageBytes: res.imageBytes,
        providerId: provider.id,
        providerModel: res.providerModel,
        usedFallback: !isFirst,
      };
    } catch (err) {
      const isRetryable = err instanceof RebuildProviderError ? err.isRetryable : false;
      if (!isRetryable) break;
    }
  }
  return null;
}

/** Build background evidence from an eval result. */
function buildBackgroundEvidence(ev: ScoutEvalResult): ProductionBackgroundValidationEvidence {
  return {
    source: "generated",
    sourceGenerationId: null,
    textFree: !ev.rejectReasons.includes("text_artifact_detected"),
    scaffoldFree: !ev.rejectReasons.includes("scaffold_collapse"),
    motifPresent: !ev.rejectReasons.includes("design_presence_absent"),
    toneFit: !ev.rejectReasons.includes("tone_implausible"),
    referenceFit: null,
  };
}

// ── Main backfill runner ──────────────────────────────────────────────────────

/**
 * Run one A/B/C lane attempt with backfill.
 *
 * Tries the primary scout first, then up to `budget` backfill candidates if
 * the primary fails. Returns `accepted` with the winning image, or `exhausted`
 * with honest failure details.
 *
 * For each attempt:
 *   1. Rebuild image from scout slot (primary → fallback provider)
 *   2. Evaluate with evalFn
 *   3. Check acceptance with acceptanceFn
 *   4. If `background_text_detected`, run one text-purge retry
 *   5. Accept or mark failed and move to next candidate
 */
export async function runLaneWithBackfill(params: {
  laneLabel: SelectionLabel;
  primaryScout: SelectedScout;
  backfillCandidates: BackfillCandidate[];
  budget: number;
  negativeHints: string[];
  primaryProvider: RebuildProvider;
  fallbackProvider: RebuildProvider;
  rebuildFallbackBudget: number;
  /** preferNotGrammarKeys: grammar keys to deprioritise for diversity. */
  preferNotGrammarKeys?: ReadonlySet<string>;
  evalFn: (input: { slot: ScoutSlot; imageBytes: Buffer }) => Promise<ScoutEvalResult>;
  acceptanceFn: (params: {
    evidence: ProductionBackgroundValidationEvidence;
  }) => { accepted: boolean; invalidReasons: string[] };
}): Promise<LaneWithBackfillResult> {
  const {
    primaryScout,
    backfillCandidates,
    budget,
    negativeHints,
    primaryProvider,
    fallbackProvider,
    rebuildFallbackBudget,
    preferNotGrammarKeys,
    evalFn,
    acceptanceFn,
  } = params;

  // Build attempt queue: primary scout + up to budget backfills
  type AttemptEntry = {
    slotIndex: number;
    slot: ScoutSlot;
    grammarKey: string;
    diversityFamily: string;
    compositeScore: number;
    isPrimary: boolean;
  };

  const attemptQueue: AttemptEntry[] = [
    {
      slotIndex: primaryScout.slotIndex,
      slot: primaryScout.slot,
      grammarKey: primaryScout.grammarKey,
      diversityFamily: primaryScout.diversityFamily,
      compositeScore: primaryScout.compositeScore,
      isPrimary: true,
    },
    ...backfillCandidates.slice(0, budget).map((c) => ({
      slotIndex: c.slotIndex,
      slot: c.slot,
      grammarKey: c.grammarKey,
      diversityFamily: c.diversityFamily,
      compositeScore: c.compositeScore,
      isPrimary: false,
    })),
  ];

  const rejectedCandidates: BackfillRejectedAttempt[] = [];
  // textRetryMeta reflects the FIRST text retry run (on primary scout, or first backfill)
  let textRetryMeta: TextRetryMeta = {
    attempted: false,
    originalRejectionReason: null,
    retryRejectionReason: null,
    retryBecameAccepted: false,
  };
  let lastFailureReason = "no_candidates";
  let lastFailureEvidence: ProductionBackgroundValidationEvidence | undefined;
  let backfillAttemptCount = 0; // counts attempts beyond the primary

  for (const attempt of attemptQueue) {
    if (!attempt.isPrimary) backfillAttemptCount++;

    // ── 1. Rebuild ────────────────────────────────────────────────────────────
    const rebuildPrompt = buildRebuildPrompt({
      grammarKey: attempt.slot.grammarKey as GrammarKey,
      tone: attempt.slot.tone,
      motifBinding: attempt.slot.motifBinding,
      negativeHints,
    });

    const gen = await attemptGenerate(
      rebuildPrompt,
      attempt.slot.seed,
      primaryProvider,
      fallbackProvider,
      rebuildFallbackBudget
    );

    if (!gen) {
      const reason = "rebuild_failed";
      lastFailureReason = reason;
      rejectedCandidates.push({
        slotIndex: attempt.slotIndex,
        grammarKey: attempt.grammarKey,
        diversityFamily: attempt.diversityFamily,
        failureReason: reason,
        textRetryAttempted: false,
      });
      continue;
    }

    // ── 2. Evaluate ───────────────────────────────────────────────────────────
    const rebuildEval = await evalFn({ slot: attempt.slot, imageBytes: gen.imageBytes });
    const evidence = buildBackgroundEvidence(rebuildEval);
    const acceptance = acceptanceFn({ evidence });

    if (acceptance.accepted) {
      return buildAccepted(attempt, gen, evidence, false, textRetryMeta, rejectedCandidates, backfillAttemptCount, primaryScout.slotIndex, preferNotGrammarKeys);
    }

    // ── 3. Text retry for background_text_detected ────────────────────────────
    if (acceptance.invalidReasons.includes("background_text_detected")) {
      const originalRejectionReason = acceptance.invalidReasons.join("; ");

      // Only record textRetryMeta for the first text retry encountered
      const isFirstTextRetry = !textRetryMeta.attempted;
      if (isFirstTextRetry) {
        textRetryMeta = {
          attempted: true,
          originalRejectionReason,
          retryRejectionReason: null,
          retryBecameAccepted: false,
        };
      }

      const retryPrompt = buildTextPurgedRebuildPrompt({
        grammarKey: attempt.slot.grammarKey as GrammarKey,
        tone: attempt.slot.tone,
        motifBinding: attempt.slot.motifBinding,
        negativeHints,
      });

      const retryGen = await attemptGenerate(
        retryPrompt,
        textRetryRebuildSeed(attempt.slot.seed),
        primaryProvider,
        fallbackProvider,
        1 // one fallback allowed for text retry too
      );

      if (retryGen) {
        const retryEval = await evalFn({ slot: attempt.slot, imageBytes: retryGen.imageBytes });
        const retryEvidence = buildBackgroundEvidence(retryEval);
        const retryAcceptance = acceptanceFn({ evidence: retryEvidence });

        if (retryAcceptance.accepted) {
          if (isFirstTextRetry) {
            textRetryMeta = { ...textRetryMeta, retryBecameAccepted: true };
          }
          return buildAccepted(attempt, retryGen, retryEvidence, false, textRetryMeta, rejectedCandidates, backfillAttemptCount, primaryScout.slotIndex, preferNotGrammarKeys);
        }

        // Retry also rejected
        const retryRejectionReason = retryAcceptance.invalidReasons.join("; ");
        if (isFirstTextRetry) {
          textRetryMeta = { ...textRetryMeta, retryRejectionReason, retryBecameAccepted: false };
        }
        lastFailureReason = `text_retry_failed: ${retryRejectionReason}`;
        lastFailureEvidence = retryEvidence;
        rejectedCandidates.push({
          slotIndex: attempt.slotIndex,
          grammarKey: attempt.grammarKey,
          diversityFamily: attempt.diversityFamily,
          failureReason: lastFailureReason,
          textRetryAttempted: true,
        });
        continue;
      }

      // Text retry generation failed
      if (isFirstTextRetry) {
        textRetryMeta = { ...textRetryMeta, retryRejectionReason: "generation_failed", retryBecameAccepted: false };
      }
      lastFailureReason = "text_retry_generation_failed";
      lastFailureEvidence = evidence;
      rejectedCandidates.push({
        slotIndex: attempt.slotIndex,
        grammarKey: attempt.grammarKey,
        diversityFamily: attempt.diversityFamily,
        failureReason: lastFailureReason,
        textRetryAttempted: true,
      });
      continue;
    }

    // ── 4. Non-text acceptance failure ────────────────────────────────────────
    const reason = acceptance.invalidReasons.join("; ");
    lastFailureReason = `background_rejected: ${reason}`;
    lastFailureEvidence = evidence;
    rejectedCandidates.push({
      slotIndex: attempt.slotIndex,
      grammarKey: attempt.grammarKey,
      diversityFamily: attempt.diversityFamily,
      failureReason: lastFailureReason,
      textRetryAttempted: false,
    });
  }

  // All candidates exhausted
  const backfillDebug: BackfillDebugMeta = {
    attempted: backfillAttemptCount > 0,
    attemptCount: backfillAttemptCount,
    primaryScoutSlotIndex: primaryScout.slotIndex,
    usedScoutSlotIndex: null,
    rejectedCandidates,
    finalOutcome: "exhausted",
    diversityRelaxed: false,
  };

  return {
    status: "exhausted",
    lastFailureReason,
    lastFailureEvidence,
    textRetryMeta,
    backfillDebug,
  };
}

// ── Private acceptance builder ────────────────────────────────────────────────

function buildAccepted(
  attempt: {
    slotIndex: number;
    slot: ScoutSlot;
    grammarKey: string;
    diversityFamily: string;
    compositeScore: number;
    isPrimary: boolean;
  },
  gen: GenerateResult,
  evidence: ProductionBackgroundValidationEvidence,
  _textRetried: boolean,
  textRetryMeta: TextRetryMeta,
  rejectedCandidates: BackfillRejectedAttempt[],
  backfillAttemptCount: number,
  primarySlotIndex: number,
  preferNotGrammarKeys?: ReadonlySet<string>
): Extract<LaneWithBackfillResult, { status: "accepted" }> {
  const finalOutcome = attempt.isPrimary ? "primary" : "backfill";
  const diversityRelaxed =
    !attempt.isPrimary &&
    preferNotGrammarKeys !== undefined &&
    preferNotGrammarKeys.has(attempt.grammarKey);

  const backfillDebug: BackfillDebugMeta = {
    attempted: backfillAttemptCount > 0,
    attemptCount: backfillAttemptCount,
    primaryScoutSlotIndex: primarySlotIndex,
    usedScoutSlotIndex: attempt.slotIndex,
    rejectedCandidates,
    finalOutcome,
    diversityRelaxed,
  };

  return {
    status: "accepted",
    imageBytes: gen.imageBytes,
    backgroundEvidence: evidence,
    textRetryMeta,
    backfillDebug,
    providerId: gen.providerId,
    providerModel: gen.providerModel,
    usedFallback: gen.usedFallback,
    usedScoutSlotIndex: attempt.slotIndex,
    usedGrammarKey: attempt.grammarKey,
    usedDiversityFamily: attempt.diversityFamily,
    usedCompositeScore: attempt.compositeScore,
  };
}
