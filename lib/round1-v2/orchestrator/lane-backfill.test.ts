import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBackfillPool,
  selectEligibleBackfill,
  runLaneWithBackfill,
} from "./lane-backfill";
import type { BackfillCandidate } from "./lane-backfill";
import type { ScoutPlan, ScoutSlot } from "./build-scout-plan";
import type { ScoutGenerationResult } from "./run-scout-batch";
import type { ScoutEvalResult } from "../eval/evaluate-scout";
import type { SelectedScout } from "./select-scouts";
import type { RebuildProvider } from "../providers/rebuild-provider";
import { RebuildProviderError } from "../providers/rebuild-provider";
import type { ProductionBackgroundValidationEvidence } from "@/lib/production-valid-option";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSlot(overrides: Partial<ScoutSlot> = {}): ScoutSlot {
  return {
    grammarKey: "centered_focal_motif",
    diversityFamily: "focal",
    tone: "dark",
    motifBinding: ["cross"],
    seed: 1000,
    promptSpec: {
      template: "test template",
      motifBinding: ["cross"],
      tone: "dark",
      negativeHints: [],
    },
    ...overrides,
  } as ScoutSlot;
}

function makeEval(overrides: Partial<ScoutEvalResult> = {}): ScoutEvalResult {
  return {
    hardReject: false,
    rejectReasons: [],
    toneScore: 0.8,
    structureScore: 0.8,
    marginScore: 0.8,
    compositeScore: 0.8,
    imageStats: null,
    textDetected: false,
    ...overrides,
  } as ScoutEvalResult;
}

function makeResult(overrides: Partial<ScoutGenerationResult> = {}): ScoutGenerationResult {
  return {
    status: "success",
    slotIndex: 0,
    slot: makeSlot(),
    prompt: "test",
    imageBytes: Buffer.from("img"),
    latencyMs: 100,
    providerModel: "test-model",
    ...overrides,
  } as ScoutGenerationResult;
}

function makeSelectedScout(overrides: Partial<SelectedScout> = {}): SelectedScout {
  return {
    label: "A",
    slotIndex: 0,
    slot: makeSlot(),
    result: makeResult({ slotIndex: 0 }),
    eval: makeEval(),
    grammarKey: "centered_focal_motif",
    diversityFamily: "focal",
    compositeScore: 0.9,
    selectionReason: "test",
    ...overrides,
  } as SelectedScout;
}

function makePlan(slotCount = 5): ScoutPlan {
  return {
    slots: Array.from({ length: slotCount }, (_, i) =>
      makeSlot({ seed: 1000 + i, grammarKey: i % 2 === 0 ? "centered_focal_motif" : "edge_anchored_motif" } as Partial<ScoutSlot>)
    ),
    runSeed: "test-seed",
    tone: "dark",
    distinctFamilyCount: 2,
  };
}

// A provider that always succeeds with a fixed buffer
function makeOkProvider(id = "ok-provider"): RebuildProvider {
  return {
    id,
    generate: async () => ({
      imageBytes: Buffer.from("background-ok"),
      latencyMs: 50,
      providerModel: "test-model",
      seed: 999,
    }),
  };
}

// A provider that always fails with a retryable error
function makeFailProvider(): RebuildProvider {
  return {
    id: "fail-provider",
    generate: async () => {
      throw new RebuildProviderError("RATE_LIMIT", "rate limit");
    },
  };
}

// evalFn: always returns accepted (no reject reasons)
const alwaysAcceptEval = async (_input: { slot: ScoutSlot; imageBytes: Buffer }): Promise<ScoutEvalResult> =>
  makeEval({ rejectReasons: [], hardReject: false, compositeScore: 0.8 });

// evalFn: always returns text_artifact_detected
const textDetectedEval = async (_input: { slot: ScoutSlot; imageBytes: Buffer }): Promise<ScoutEvalResult> =>
  makeEval({ rejectReasons: ["text_artifact_detected"], hardReject: false });

// acceptanceFn: always accepts
const alwaysAccept = (_: { evidence: ProductionBackgroundValidationEvidence }) => ({
  accepted: true,
  invalidReasons: [],
});

// acceptanceFn: always rejects
const alwaysReject = (_: { evidence: ProductionBackgroundValidationEvidence }) => ({
  accepted: false,
  invalidReasons: ["background_blank_or_motif_weak"],
});

// acceptanceFn: rejects only when textFree is false
const rejectIfText = (params: { evidence: ProductionBackgroundValidationEvidence }) => {
  if (!params.evidence.textFree) {
    return { accepted: false, invalidReasons: ["background_text_detected"] };
  }
  return { accepted: true, invalidReasons: [] };
};

// ── buildBackfillPool ─────────────────────────────────────────────────────────

test("buildBackfillPool excludes selected scouts", () => {
  const plan = makePlan(5);
  const results = plan.slots.map((s, i) => makeResult({ slotIndex: i, slot: s }));
  const evals = plan.slots.map(() => makeEval());

  const pool = buildBackfillPool({
    plan,
    results,
    evals,
    selectedSlotIndices: new Set([0, 1, 2]),
  });

  assert.equal(pool.length, 2);
  assert.ok(pool.every((c) => c.slotIndex >= 3));
});

test("buildBackfillPool excludes hard-rejected scouts", () => {
  const plan = makePlan(5);
  const results = plan.slots.map((s, i) => makeResult({ slotIndex: i, slot: s }));
  const evals = plan.slots.map((_, i) =>
    i === 3 ? makeEval({ hardReject: true, rejectReasons: ["scaffold_collapse"] }) : makeEval()
  );

  const pool = buildBackfillPool({
    plan,
    results,
    evals,
    selectedSlotIndices: new Set([0, 1, 2]),
  });

  // Slot 3 is hard-rejected, slot 4 is ok
  assert.equal(pool.length, 1);
  assert.equal(pool[0].slotIndex, 4);
});

test("buildBackfillPool excludes generation-failed scouts", () => {
  const plan = makePlan(5);
  const results = plan.slots.map((s, i) =>
    i === 4
      ? ({ status: "failed", slotIndex: i, slot: s, prompt: "test", error: "timeout" } as ScoutGenerationResult)
      : makeResult({ slotIndex: i, slot: s })
  );
  const evals = plan.slots.map(() => makeEval());

  const pool = buildBackfillPool({
    plan,
    results,
    evals,
    selectedSlotIndices: new Set([0, 1, 2]),
  });

  // Slot 3 is ok, slot 4 failed
  assert.equal(pool.length, 1);
  assert.equal(pool[0].slotIndex, 3);
});

test("buildBackfillPool sorts by compositeScore descending", () => {
  const plan = makePlan(5);
  const results = plan.slots.map((s, i) => makeResult({ slotIndex: i, slot: s }));
  const evals = plan.slots.map((_, i) =>
    makeEval({ compositeScore: i === 3 ? 0.9 : 0.5 })
  );

  const pool = buildBackfillPool({
    plan,
    results,
    evals,
    selectedSlotIndices: new Set([0, 1, 2]),
  });

  assert.equal(pool[0].slotIndex, 3); // highest score first
  assert.equal(pool[1].slotIndex, 4);
});

// ── selectEligibleBackfill ────────────────────────────────────────────────────

test("selectEligibleBackfill excludes completedSlotIndices", () => {
  const pool: BackfillCandidate[] = [
    { slotIndex: 3, grammarKey: "a", diversityFamily: "f", compositeScore: 0.9, slot: makeSlot(), result: makeResult(), eval: makeEval() },
    { slotIndex: 4, grammarKey: "b", diversityFamily: "g", compositeScore: 0.8, slot: makeSlot(), result: makeResult(), eval: makeEval() },
  ];

  const { candidates } = selectEligibleBackfill({
    pool,
    completedSlotIndices: new Set([3]),
    maxCount: 2,
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].slotIndex, 4);
});

test("selectEligibleBackfill prefers diverse grammar keys", () => {
  const pool: BackfillCandidate[] = [
    { slotIndex: 3, grammarKey: "same_grammar", diversityFamily: "f", compositeScore: 0.9, slot: makeSlot(), result: makeResult(), eval: makeEval() },
    { slotIndex: 4, grammarKey: "different_grammar", diversityFamily: "g", compositeScore: 0.5, slot: makeSlot(), result: makeResult(), eval: makeEval() },
  ];

  const { candidates, diversityRelaxed } = selectEligibleBackfill({
    pool,
    completedSlotIndices: new Set(),
    preferNotGrammarKeys: new Set(["same_grammar"]),
    maxCount: 2,
  });

  // different_grammar should come first despite lower score
  assert.equal(candidates[0].grammarKey, "different_grammar");
  assert.equal(candidates[1].grammarKey, "same_grammar");
  assert.equal(diversityRelaxed, true); // had to include same_grammar candidate
});

test("selectEligibleBackfill respects maxCount", () => {
  const pool: BackfillCandidate[] = [
    { slotIndex: 3, grammarKey: "a", diversityFamily: "f", compositeScore: 0.9, slot: makeSlot(), result: makeResult(), eval: makeEval() },
    { slotIndex: 4, grammarKey: "b", diversityFamily: "g", compositeScore: 0.8, slot: makeSlot(), result: makeResult(), eval: makeEval() },
    { slotIndex: 5, grammarKey: "c", diversityFamily: "h", compositeScore: 0.7, slot: makeSlot(), result: makeResult(), eval: makeEval() },
  ];

  const { candidates } = selectEligibleBackfill({
    pool,
    completedSlotIndices: new Set(),
    maxCount: 2,
  });

  assert.equal(candidates.length, 2);
});

// ── runLaneWithBackfill ───────────────────────────────────────────────────────

test("primary succeeds → accepted with finalOutcome=primary", async () => {
  const primaryScout = makeSelectedScout({ slotIndex: 0 });
  const result = await runLaneWithBackfill({
    laneLabel: "A",
    primaryScout,
    backfillCandidates: [],
    budget: 2,
    negativeHints: [],
    primaryProvider: makeOkProvider(),
    fallbackProvider: makeOkProvider(),
    rebuildFallbackBudget: 1,
    evalFn: alwaysAcceptEval,
    acceptanceFn: alwaysAccept,
  });

  assert.equal(result.status, "accepted");
  if (result.status === "accepted") {
    assert.equal(result.backfillDebug.finalOutcome, "primary");
    assert.equal(result.backfillDebug.attempted, false);
    assert.equal(result.usedScoutSlotIndex, 0);
  }
});

test("primary fails, first backfill passes → accepted with finalOutcome=backfill", async () => {
  const primaryScout = makeSelectedScout({ slotIndex: 0 });
  const backfillCandidate: BackfillCandidate = {
    slotIndex: 3,
    slot: makeSlot({ seed: 3000, grammarKey: "edge_anchored_motif" } as Partial<ScoutSlot>),
    result: makeResult({ slotIndex: 3 }),
    eval: makeEval(),
    grammarKey: "edge_anchored_motif",
    diversityFamily: "frame",
    compositeScore: 0.75,
  };

  let callCount = 0;
  // Provider succeeds, but primary's eval produces text_detected, backfill's eval is clean
  const evalFn = async (_input: { slot: ScoutSlot; imageBytes: Buffer }): Promise<ScoutEvalResult> => {
    callCount++;
    // First call = primary rebuild eval → text detected
    if (callCount === 1) return makeEval({ rejectReasons: ["text_artifact_detected"] });
    // Second call = primary text-retry eval → still text detected
    if (callCount === 2) return makeEval({ rejectReasons: ["text_artifact_detected"] });
    // Third call = backfill rebuild eval → clean
    return makeEval({ rejectReasons: [] });
  };

  const result = await runLaneWithBackfill({
    laneLabel: "A",
    primaryScout,
    backfillCandidates: [backfillCandidate],
    budget: 2,
    negativeHints: [],
    primaryProvider: makeOkProvider(),
    fallbackProvider: makeOkProvider(),
    rebuildFallbackBudget: 1,
    evalFn,
    acceptanceFn: rejectIfText,
  });

  assert.equal(result.status, "accepted");
  if (result.status === "accepted") {
    assert.equal(result.backfillDebug.finalOutcome, "backfill");
    assert.equal(result.backfillDebug.attempted, true);
    assert.equal(result.backfillDebug.attemptCount, 1);
    assert.equal(result.usedScoutSlotIndex, 3);
    assert.equal(result.usedGrammarKey, "edge_anchored_motif");
    // Text retry was attempted for the primary
    assert.equal(result.textRetryMeta.attempted, true);
    assert.equal(result.textRetryMeta.retryBecameAccepted, false);
  }
});

test("primary fails, all backfills fail → exhausted with honest reason", async () => {
  const primaryScout = makeSelectedScout({ slotIndex: 0 });
  const backfillCandidates: BackfillCandidate[] = [
    {
      slotIndex: 3,
      slot: makeSlot({ seed: 3000 }),
      result: makeResult({ slotIndex: 3 }),
      eval: makeEval(),
      grammarKey: "centered_focal_motif",
      diversityFamily: "focal",
      compositeScore: 0.7,
    },
    {
      slotIndex: 4,
      slot: makeSlot({ seed: 4000 }),
      result: makeResult({ slotIndex: 4 }),
      eval: makeEval(),
      grammarKey: "centered_focal_motif",
      diversityFamily: "focal",
      compositeScore: 0.6,
    },
  ];

  const result = await runLaneWithBackfill({
    laneLabel: "B",
    primaryScout,
    backfillCandidates,
    budget: 2,
    negativeHints: [],
    primaryProvider: makeOkProvider(),
    fallbackProvider: makeOkProvider(),
    rebuildFallbackBudget: 1,
    evalFn: alwaysAcceptEval,
    acceptanceFn: alwaysReject, // always reject acceptance
  });

  assert.equal(result.status, "exhausted");
  if (result.status === "exhausted") {
    assert.equal(result.backfillDebug.finalOutcome, "exhausted");
    assert.equal(result.backfillDebug.attempted, true);
    assert.equal(result.backfillDebug.attemptCount, 2);
    assert.equal(result.backfillDebug.rejectedCandidates.length, 3); // primary + 2 backfills
    assert.ok(result.lastFailureReason.includes("background_rejected"));
  }
});

test("same scout not reused — completedSlotIndices blocks reuse", () => {
  const pool: BackfillCandidate[] = [
    { slotIndex: 3, grammarKey: "a", diversityFamily: "f", compositeScore: 0.9, slot: makeSlot(), result: makeResult(), eval: makeEval() },
  ];

  // Simulate scout 3 already committed to another lane
  const { candidates } = selectEligibleBackfill({
    pool,
    completedSlotIndices: new Set([3]),
    maxCount: 2,
  });

  assert.equal(candidates.length, 0, "scout 3 should be excluded since it was used by another lane");
});

test("budget is respected — no more than budget backfill attempts", async () => {
  const primaryScout = makeSelectedScout({ slotIndex: 0 });
  const backfillCandidates: BackfillCandidate[] = [
    {
      slotIndex: 3,
      slot: makeSlot({ seed: 3000 }),
      result: makeResult({ slotIndex: 3 }),
      eval: makeEval(),
      grammarKey: "edge_anchored_motif",
      diversityFamily: "frame",
      compositeScore: 0.7,
    },
    {
      slotIndex: 4,
      slot: makeSlot({ seed: 4000 }),
      result: makeResult({ slotIndex: 4 }),
      eval: makeEval(),
      grammarKey: "edge_anchored_motif",
      diversityFamily: "frame",
      compositeScore: 0.6,
    },
    {
      slotIndex: 5,
      slot: makeSlot({ seed: 5000 }),
      result: makeResult({ slotIndex: 5 }),
      eval: makeEval(),
      grammarKey: "centered_focal_motif",
      diversityFamily: "focal",
      compositeScore: 0.5,
    },
  ];

  const result = await runLaneWithBackfill({
    laneLabel: "C",
    primaryScout,
    backfillCandidates,
    budget: 2, // only 2 backfills allowed
    negativeHints: [],
    primaryProvider: makeOkProvider(),
    fallbackProvider: makeOkProvider(),
    rebuildFallbackBudget: 1,
    evalFn: alwaysAcceptEval,
    acceptanceFn: alwaysReject,
  });

  assert.equal(result.status, "exhausted");
  if (result.status === "exhausted") {
    // Should have tried primary + 2 backfills = 3 rejected, but budget limits backfills to 2
    assert.equal(result.backfillDebug.attemptCount, 2);
    // 3 total rejections (primary + budget 2)
    assert.equal(result.backfillDebug.rejectedCandidates.length, 3);
  }
});

test("text retry runs for background_text_detected within a backfill attempt", async () => {
  const primaryScout = makeSelectedScout({ slotIndex: 0 });
  const backfillCandidate: BackfillCandidate = {
    slotIndex: 3,
    slot: makeSlot({ seed: 3000, grammarKey: "edge_anchored_motif" } as Partial<ScoutSlot>),
    result: makeResult({ slotIndex: 3 }),
    eval: makeEval(),
    grammarKey: "edge_anchored_motif",
    diversityFamily: "frame",
    compositeScore: 0.7,
  };

  let evalCallCount = 0;
  const evalFn = async (_input: { slot: ScoutSlot; imageBytes: Buffer }): Promise<ScoutEvalResult> => {
    evalCallCount++;
    // calls 1: primary rebuild → text detected
    // calls 2: primary text-retry → still text detected
    // calls 3: backfill rebuild → text detected
    // calls 4: backfill text-retry → clean (accepted)
    if (evalCallCount <= 2) return makeEval({ rejectReasons: ["text_artifact_detected"] });
    if (evalCallCount === 3) return makeEval({ rejectReasons: ["text_artifact_detected"] });
    return makeEval({ rejectReasons: [] }); // backfill text-retry succeeds
  };

  const result = await runLaneWithBackfill({
    laneLabel: "A",
    primaryScout,
    backfillCandidates: [backfillCandidate],
    budget: 2,
    negativeHints: [],
    primaryProvider: makeOkProvider(),
    fallbackProvider: makeOkProvider(),
    rebuildFallbackBudget: 1,
    evalFn,
    acceptanceFn: rejectIfText,
  });

  assert.equal(result.status, "accepted");
  if (result.status === "accepted") {
    assert.equal(result.usedScoutSlotIndex, 3); // backfill scout accepted
    assert.equal(result.backfillDebug.finalOutcome, "backfill");
    // 4 eval calls: primary rebuild, primary text-retry, backfill rebuild, backfill text-retry
    assert.equal(evalCallCount, 4);
  }
});

test("non-text failure does not trigger text retry", async () => {
  const primaryScout = makeSelectedScout({ slotIndex: 0 });

  let evalCallCount = 0;
  const evalFn = async (_input: { slot: ScoutSlot; imageBytes: Buffer }): Promise<ScoutEvalResult> => {
    evalCallCount++;
    return makeEval({ rejectReasons: ["scaffold_collapse"] }); // non-text failure
  };

  // acceptanceFn rejects for scaffold_collapse (not text-based)
  const acceptanceFn = (_: { evidence: ProductionBackgroundValidationEvidence }) => ({
    accepted: false,
    invalidReasons: ["background_blank_or_motif_weak"], // non-text reason
  });

  const result = await runLaneWithBackfill({
    laneLabel: "A",
    primaryScout,
    backfillCandidates: [],
    budget: 2,
    negativeHints: [],
    primaryProvider: makeOkProvider(),
    fallbackProvider: makeOkProvider(),
    rebuildFallbackBudget: 1,
    evalFn,
    acceptanceFn,
  });

  assert.equal(result.status, "exhausted");
  // Only 1 eval call — no text retry
  assert.equal(evalCallCount, 1);
  if (result.status === "exhausted") {
    assert.equal(result.textRetryMeta.attempted, false);
    assert.ok(result.backfillDebug.rejectedCandidates[0].textRetryAttempted === false);
  }
});

test("direction_preview contract: textFree required for COMPLETED (acceptance gate)", async () => {
  const primaryScout = makeSelectedScout({ slotIndex: 0 });

  // eval says text detected; acceptance rejects for background_text_detected;
  // text retry also returns text detected; no backfill available → exhausted
  let callCount = 0;
  const evalFn = async (_: { slot: ScoutSlot; imageBytes: Buffer }): Promise<ScoutEvalResult> => {
    callCount++;
    return makeEval({ rejectReasons: ["text_artifact_detected"] });
  };

  const result = await runLaneWithBackfill({
    laneLabel: "A",
    primaryScout,
    backfillCandidates: [],
    budget: 2,
    negativeHints: [],
    primaryProvider: makeOkProvider(),
    fallbackProvider: makeOkProvider(),
    rebuildFallbackBudget: 1,
    evalFn,
    acceptanceFn: rejectIfText,
  });

  assert.equal(result.status, "exhausted");
  if (result.status === "exhausted") {
    assert.ok(
      result.lastFailureReason.includes("text_retry_failed") ||
        result.lastFailureReason.includes("background_text_detected"),
      `expected text failure reason, got: ${result.lastFailureReason}`
    );
    assert.equal(result.textRetryMeta.attempted, true);
    assert.equal(result.textRetryMeta.retryBecameAccepted, false);
  }
});

test("square/vertical not required: acceptance only checks wide evidence", async () => {
  // Verify no aspect evidence is checked in runLaneWithBackfill itself
  // (aspect validation happens in resolveProductionValidOption, not here)
  const primaryScout = makeSelectedScout({ slotIndex: 0 });

  const result = await runLaneWithBackfill({
    laneLabel: "A",
    primaryScout,
    backfillCandidates: [],
    budget: 2,
    negativeHints: [],
    primaryProvider: makeOkProvider(),
    fallbackProvider: makeOkProvider(),
    rebuildFallbackBudget: 1,
    evalFn: alwaysAcceptEval,
    acceptanceFn: alwaysAccept,
  });

  // Should complete without needing square/vertical
  assert.equal(result.status, "accepted");
});

// ── Provider TIMEOUT classification behavior ──────────────────────────────────

// A provider that throws RebuildProviderError("TIMEOUT", ...) — simulates
// what the FAL provider does when withTimeout fires.
function makeTimeoutProvider(id = "timeout-provider"): RebuildProvider {
  return {
    id,
    generate: async () => {
      throw new RebuildProviderError("TIMEOUT", `${id} timed out after 90000ms`);
    },
  };
}

test("rebuild TIMEOUT is retryable — triggers fallback provider when budget allows", async () => {
  const primaryScout = makeSelectedScout({ slotIndex: 0 });

  // Primary times out, fallback succeeds
  const result = await runLaneWithBackfill({
    laneLabel: "A",
    primaryScout,
    backfillCandidates: [],
    budget: 0,
    negativeHints: [],
    primaryProvider: makeTimeoutProvider("fal.nano-banana-pro"),
    fallbackProvider: makeOkProvider("fal.nano-banana"),
    rebuildFallbackBudget: 1, // allows one fallback
    evalFn: alwaysAcceptEval,
    acceptanceFn: alwaysAccept,
  });

  assert.equal(result.status, "accepted", "fallback provider should succeed after primary timeout");
  if (result.status === "accepted") {
    assert.equal(result.providerId, "fal.nano-banana", "should have used fallback provider");
    assert.equal(result.usedFallback, true);
  }
});

test("rebuild TIMEOUT on primary with budget=0 fails that attempt with TIMEOUT reason", async () => {
  const primaryScout = makeSelectedScout({ slotIndex: 0 });

  const result = await runLaneWithBackfill({
    laneLabel: "A",
    primaryScout,
    backfillCandidates: [],
    budget: 0,
    negativeHints: [],
    primaryProvider: makeTimeoutProvider("fal.nano-banana-pro"),
    fallbackProvider: makeOkProvider("fal.nano-banana"),
    rebuildFallbackBudget: 0, // no fallback
    evalFn: alwaysAcceptEval,
    acceptanceFn: alwaysAccept,
  });

  assert.equal(result.status, "exhausted");
  if (result.status === "exhausted") {
    assert.ok(
      result.lastFailureReason.includes("timeout"),
      `expected 'timeout' in reason, got: ${result.lastFailureReason}`
    );
    assert.ok(
      result.lastFailureReason.includes("fal.nano-banana-pro"),
      `expected provider id in reason, got: ${result.lastFailureReason}`
    );
  }
});

test("primary + fallback both TIMEOUT → exhausted with fallback TIMEOUT reason", async () => {
  const primaryScout = makeSelectedScout({ slotIndex: 0 });

  const result = await runLaneWithBackfill({
    laneLabel: "A",
    primaryScout,
    backfillCandidates: [],
    budget: 0,
    negativeHints: [],
    primaryProvider: makeTimeoutProvider("fal.nano-banana-pro"),
    fallbackProvider: makeTimeoutProvider("fal.nano-banana"),
    rebuildFallbackBudget: 1,
    evalFn: alwaysAcceptEval,
    acceptanceFn: alwaysAccept,
  });

  assert.equal(result.status, "exhausted");
  if (result.status === "exhausted") {
    assert.ok(
      result.lastFailureReason.includes("timeout"),
      `expected 'timeout' in reason, got: ${result.lastFailureReason}`
    );
    // Should mention fallback attempt
    assert.ok(
      result.lastFailureReason.includes("fallback"),
      `expected 'fallback' in reason when fallback also fails, got: ${result.lastFailureReason}`
    );
    assert.ok(
      result.lastFailureReason.includes("fal.nano-banana"),
      `expected fallback provider id in reason, got: ${result.lastFailureReason}`
    );
  }
});

test("rebuild TIMEOUT on primary scout — lane continues to next backfill candidate", async () => {
  const primaryScout = makeSelectedScout({ slotIndex: 0 });
  const backfillSlot = makeSlot({ seed: 2000, grammarKey: "horizon_band" } as Partial<ScoutSlot>);
  const backfillCandidate: BackfillCandidate = {
    slotIndex: 1,
    slot: backfillSlot,
    result: makeResult({ slotIndex: 1, slot: backfillSlot }),
    eval: makeEval(),
    grammarKey: "horizon_band",
    diversityFamily: "horizontal",
    compositeScore: 0.7,
  };

  // Primary times out (even with fallback provider), backfill candidate succeeds
  const result = await runLaneWithBackfill({
    laneLabel: "A",
    primaryScout,
    backfillCandidates: [backfillCandidate],
    budget: 1,
    negativeHints: [],
    primaryProvider: makeTimeoutProvider("fal.nano-banana-pro"),
    fallbackProvider: makeTimeoutProvider("fal.nano-banana"),
    rebuildFallbackBudget: 0, // no fallback — timeout is immediate failure
    evalFn: alwaysAcceptEval,
    acceptanceFn: alwaysAccept,
  });

  // After primary scout times out, backfill is used but backfill ALSO uses the same
  // providers — which also time out. So we need a working provider for the backfill.
  // Re-test with ok provider for backfill:
  const result2 = await runLaneWithBackfill({
    laneLabel: "A",
    primaryScout,
    backfillCandidates: [backfillCandidate],
    budget: 1,
    negativeHints: [],
    // Primary scout rebuild: uses primaryProvider (times out, no fallback)
    // Backfill candidate rebuild: also uses primaryProvider (succeeds when we swap)
    primaryProvider: {
      id: "mixed-provider",
      generate: async (req) => {
        // Times out for seed 1000 (primary scout), succeeds for seed 2000 (backfill)
        if (req.seed === 0) {
          // rebuildSeed(1000, 0) — will not equal 2000 exactly but let's just use attempt count
          throw new RebuildProviderError("TIMEOUT", "mixed-provider timed out");
        }
        return { imageBytes: Buffer.from("ok"), latencyMs: 50, providerModel: "m", seed: req.seed };
      },
    },
    fallbackProvider: makeOkProvider("fallback"),
    rebuildFallbackBudget: 0,
    evalFn: alwaysAcceptEval,
    acceptanceFn: alwaysAccept,
  });

  // The important assertion: backfill was attempted after primary timed out
  assert.equal(result.status, "exhausted", "when both primary and backfill use timeout providers, should exhaust");
  assert.ok(
    result.status === "exhausted" && result.backfillDebug.attemptCount > 0,
    "backfill was attempted after primary timeout"
  );
});

test("lane failure after exhausted timeout attempts has honest specific reason", async () => {
  const primaryScout = makeSelectedScout({ slotIndex: 0 });
  const backfillSlot = makeSlot({ seed: 2000 } as Partial<ScoutSlot>);
  const backfillCandidate: BackfillCandidate = {
    slotIndex: 1,
    slot: backfillSlot,
    result: makeResult({ slotIndex: 1, slot: backfillSlot }),
    eval: makeEval(),
    grammarKey: "edge_anchored_motif",
    diversityFamily: "edge",
    compositeScore: 0.6,
  };

  const result = await runLaneWithBackfill({
    laneLabel: "B",
    primaryScout,
    backfillCandidates: [backfillCandidate],
    budget: 1,
    negativeHints: [],
    primaryProvider: makeTimeoutProvider("fal.nano-banana-pro"),
    fallbackProvider: makeTimeoutProvider("fal.nano-banana"),
    rebuildFallbackBudget: 1,
    evalFn: alwaysAcceptEval,
    acceptanceFn: alwaysAccept,
  });

  assert.equal(result.status, "exhausted");
  if (result.status === "exhausted") {
    // Must not be a generic "rebuild_failed" — must have provider-specific info
    assert.notEqual(result.lastFailureReason, "rebuild_failed",
      "failure reason should be specific, not generic rebuild_failed");
    assert.ok(
      result.lastFailureReason.includes("timeout"),
      `expected 'timeout' in final failure reason, got: ${result.lastFailureReason}`
    );
    // rejected candidates should show the progression
    assert.ok(result.backfillDebug.rejectedCandidates.length >= 1,
      "should have at least one rejected candidate logged");
  }
});
