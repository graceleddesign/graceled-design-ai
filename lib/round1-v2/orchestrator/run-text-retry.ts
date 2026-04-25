/**
 * V2 background text-detection retry.
 *
 * When a rebuilt background fails `evaluateBackgroundAcceptance` specifically
 * because of `background_text_detected`, we get one targeted retry with a
 * stronger text-removal prompt (TEXT_PURGE_FOOTER) before giving up.
 *
 * Design constraints:
 * - Does not weaken any validator.
 * - If the retry also fails, the lane stays FAILED with `background_text_detected`.
 * - The injectable `evalFn` parameter makes this testable without real image bytes.
 */

import type { RebuildProvider } from "../providers/rebuild-provider";
import { REBUILD_WIDE_WIDTH_PX, REBUILD_WIDE_HEIGHT_PX } from "../providers/rebuild-provider";
import type { SelectedScout } from "./select-scouts";
import type { ScoutEvalResult } from "../eval/evaluate-scout";
import type { ProductionBackgroundValidationEvidence } from "@/lib/production-valid-option";
import type { GrammarKey } from "../grammars";
import { buildTextPurgedRebuildPrompt } from "./build-rebuild-prompt";

export interface TextRetryInput {
  scout: SelectedScout;
  negativeHints: string[];
  primaryProvider: RebuildProvider;
  fallbackProvider: RebuildProvider;
  /** Deterministic seed for the retry generation. */
  retrySeed: number;
  /**
   * Injectable eval function. In production, pass `evaluateScout` from
   * `lib/round1-v2/eval/evaluate-scout`. In tests, pass a mock.
   */
  evalFn: (input: { slot: SelectedScout["slot"]; imageBytes: Buffer }) => Promise<ScoutEvalResult>;
  /**
   * Injectable acceptance function. In production, pass `evaluateBackgroundAcceptance`
   * from `lib/production-valid-option`. In tests, pass a mock.
   */
  acceptanceFn: (params: {
    evidence: ProductionBackgroundValidationEvidence;
  }) => { accepted: boolean; invalidReasons: string[] };
}

export interface TextRetryResult {
  /** Whether the retry produced an accepted background. */
  status: "accepted" | "rejected" | "generation_failed";
  /** Populated when status === "accepted". */
  imageBytes?: Buffer;
  /** Background evidence from the retry eval (always populated when generation succeeded). */
  backgroundEvidence?: ProductionBackgroundValidationEvidence;
  /** Rejection reasons from the retry acceptance check (when status === "rejected"). */
  retryRejectionReasons?: string[];
  /** Provider used for the retry. */
  providerId?: string;
  providerModel?: string;
  usedFallback?: boolean;
  error?: string;
}

/**
 * Derive a deterministic retry seed from the scout seed.
 * XOR with a magic constant so the retry explores a different image from the
 * original while remaining reproducible.
 */
export function textRetrySeed(scoutSeed: number): number {
  return (scoutSeed ^ 0xbeefcafe) >>> 0;
}

/**
 * Run one text-removal retry for a V2 lane that failed `background_text_detected`.
 *
 * Generates a new image using the same direction/motif/tone but with an
 * explicit TEXT_PURGE_FOOTER prompt, then re-evaluates acceptance.
 */
export async function runV2BackgroundTextRetry(
  input: TextRetryInput
): Promise<TextRetryResult> {
  const { scout, negativeHints, primaryProvider, fallbackProvider, retrySeed, evalFn, acceptanceFn } = input;

  const prompt = buildTextPurgedRebuildPrompt({
    grammarKey: scout.slot.grammarKey as GrammarKey,
    tone: scout.slot.tone,
    motifBinding: scout.slot.motifBinding,
    negativeHints,
  });

  // Attempt generation: primary first, fallback on retryable error.
  let imageBytes: Buffer | undefined;
  let providerModel: string | undefined;
  let providerId: string | undefined;
  let usedFallback = false;
  let generationError: string | undefined;

  for (let attempt = 0; attempt <= 1; attempt++) {
    const provider = attempt === 0 ? primaryProvider : fallbackProvider;
    try {
      const res = await provider.generate({
        prompt,
        widthPx: REBUILD_WIDE_WIDTH_PX,
        heightPx: REBUILD_WIDE_HEIGHT_PX,
        seed: retrySeed,
      });
      imageBytes = res.imageBytes;
      providerModel = res.providerModel;
      providerId = provider.id;
      usedFallback = attempt > 0;
      break;
    } catch (err) {
      const { RebuildProviderError } = await import("../providers/rebuild-provider");
      const isRetryable = err instanceof RebuildProviderError ? err.isRetryable : false;
      generationError = err instanceof Error ? err.message : String(err);
      if (!isRetryable) break;
    }
  }

  if (!imageBytes) {
    return { status: "generation_failed", error: generationError };
  }

  // Evaluate the retry image.
  const retryEval = await evalFn({ slot: scout.slot, imageBytes });

  const retryEvidence: ProductionBackgroundValidationEvidence = {
    source: "generated",
    sourceGenerationId: null,
    textFree: !retryEval.rejectReasons.includes("text_artifact_detected"),
    scaffoldFree: !retryEval.rejectReasons.includes("scaffold_collapse"),
    motifPresent: !retryEval.rejectReasons.includes("design_presence_absent"),
    toneFit: !retryEval.rejectReasons.includes("tone_implausible"),
    referenceFit: null,
  };

  const acceptance = acceptanceFn({ evidence: retryEvidence });

  if (acceptance.accepted) {
    return {
      status: "accepted",
      imageBytes,
      backgroundEvidence: retryEvidence,
      providerId,
      providerModel,
      usedFallback,
    };
  }

  return {
    status: "rejected",
    backgroundEvidence: retryEvidence,
    retryRejectionReasons: acceptance.invalidReasons,
    providerId,
    providerModel,
    usedFallback,
  };
}
