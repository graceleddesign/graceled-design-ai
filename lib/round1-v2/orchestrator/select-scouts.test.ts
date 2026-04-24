import assert from "node:assert/strict";
import test from "node:test";
import { GRAMMAR_BANK, GRAMMAR_KEYS } from "../grammars";
import { buildScoutPlan, type ScoutPlan, type ScoutSlot } from "./build-scout-plan";
import { selectScouts } from "./select-scouts";
import type { ScoutGenerationResult } from "./run-scout-batch";
import type { ScoutEvalResult } from "../eval/evaluate-scout";

// ── Fixture builders ──────────────────────────────────────────────────────────

function makePlan(count = 6): ScoutPlan {
  return buildScoutPlan({ runSeed: "sel-test", tone: "neutral", motifs: [], negativeHints: [], count });
}

function makePassingEval(overrides?: Partial<ScoutEvalResult>): ScoutEvalResult {
  return {
    hardReject: false,
    rejectReasons: [],
    toneScore: 0.8,
    structureScore: 0.7,
    marginScore: 0.6,
    compositeScore: 0.72,
    imageStats: null,
    textDetected: false,
    ...overrides,
  };
}

function makeFailingEval(reason: import("../eval/evaluate-scout").ScoutRejectReason): ScoutEvalResult {
  return {
    hardReject: true,
    rejectReasons: [reason],
    toneScore: 0,
    structureScore: 0,
    marginScore: 0,
    compositeScore: 0,
    imageStats: null,
    textDetected: reason === "text_artifact_detected",
  };
}

function makeSuccessResult(slot: ScoutSlot): ScoutGenerationResult {
  return { slot, prompt: "test-prompt", status: "success", imageBytes: Buffer.from("x"), latencyMs: 100 };
}

function makeFailResult(slot: ScoutSlot): ScoutGenerationResult {
  return { slot, prompt: "test-prompt", status: "failed", error: "boom" };
}

function makeResultsAndEvals(plan: ScoutPlan, evalFn: (i: number, slot: ScoutSlot) => ScoutEvalResult) {
  const results: ScoutGenerationResult[] = plan.slots.map((s) => makeSuccessResult(s));
  const evals: ScoutEvalResult[] = plan.slots.map((s, i) => evalFn(i, s));
  return { results, evals };
}

// ── Basic selection ───────────────────────────────────────────────────────────

test("selects up to 3 scouts from passing pool", () => {
  const plan = makePlan(6);
  const { results, evals } = makeResultsAndEvals(plan, () => makePassingEval());
  const sel = selectScouts(plan, results, evals);
  assert.equal(sel.selected.length, 3);
  assert.equal(sel.shortfall, false);
  assert.equal(sel.shortfallCount, 0);
});

test("selected scouts are labelled A, B, C in order", () => {
  const plan = makePlan(6);
  const { results, evals } = makeResultsAndEvals(plan, () => makePassingEval());
  const sel = selectScouts(plan, results, evals);
  assert.equal(sel.selected[0].label, "A");
  assert.equal(sel.selected[1].label, "B");
  assert.equal(sel.selected[2].label, "C");
});

test("selected scouts are ordered by composite score descending", () => {
  const plan = makePlan(6);
  const scores = [0.9, 0.6, 0.5, 0.8, 0.4, 0.3];
  const { results, evals } = makeResultsAndEvals(plan, (i) =>
    makePassingEval({ compositeScore: scores[i] })
  );
  const sel = selectScouts(plan, results, evals);
  assert.ok(sel.selected[0].compositeScore >= sel.selected[1].compositeScore);
  assert.ok(sel.selected[1].compositeScore >= sel.selected[2].compositeScore);
});

// ── Distinctiveness enforcement ───────────────────────────────────────────────

test("no two selected scouts share the same grammarKey (when pool is large enough)", () => {
  const plan = makePlan(9); // 9 slots = all 6 grammars covered
  const { results, evals } = makeResultsAndEvals(plan, () => makePassingEval());
  const sel = selectScouts(plan, results, evals);
  const keys = sel.selected.map((s) => s.grammarKey);
  assert.equal(new Set(keys).size, keys.length, `duplicate grammarKey: ${keys.join(", ")}`);
});

test("distinct grammar families in selection", () => {
  const plan = makePlan(9);
  const { results, evals } = makeResultsAndEvals(plan, () => makePassingEval());
  const sel = selectScouts(plan, results, evals);
  assert.ok(sel.distinctFamilyCount >= 3, `expected ≥3 distinct families, got ${sel.distinctFamilyCount}`);
});

// ── Hard-reject filtering ─────────────────────────────────────────────────────

test("hard-rejected scouts never appear in selected", () => {
  const plan = makePlan(6);
  const { results, evals } = makeResultsAndEvals(plan, () =>
    makeFailingEval("scaffold_collapse")
  );
  const sel = selectScouts(plan, results, evals);
  assert.equal(sel.selected.length, 0);
  assert.equal(sel.shortfall, true);
  assert.equal(sel.shortfallCount, 3);
});

test("text_artifact scouts are rejected with correct reason", () => {
  const plan = makePlan(3);
  const evals = plan.slots.map(() => makeFailingEval("text_artifact_detected"));
  const results = plan.slots.map((s) => makeSuccessResult(s));
  const sel = selectScouts(plan, results, evals);
  assert.equal(sel.selected.length, 0);
  for (const r of sel.rejected) {
    assert.ok(r.rejectionReason.includes("text_artifact_detected"), r.rejectionReason);
  }
});

test("failed generation results are rejected without calling into eval", () => {
  const plan = makePlan(3);
  const results = plan.slots.map((s) => makeFailResult(s));
  const evals = plan.slots.map(() => makePassingEval()); // evals wouldn't matter
  const sel = selectScouts(plan, results, evals);
  assert.equal(sel.selected.length, 0);
  assert.equal(sel.shortfall, true);
  for (const r of sel.rejected) {
    assert.ok(r.rejectionReason.startsWith("generation_failed"), r.rejectionReason);
  }
});

// ── Honest shortfall ─────────────────────────────────────────────────────────

test("reports shortfall when only 1 scout passes", () => {
  const plan = makePlan(6);
  const { results, evals } = makeResultsAndEvals(plan, (i) =>
    i === 0 ? makePassingEval({ compositeScore: 0.9 }) : makeFailingEval("scaffold_collapse")
  );
  const sel = selectScouts(plan, results, evals);
  assert.equal(sel.selected.length, 1);
  assert.equal(sel.shortfall, true);
  assert.equal(sel.shortfallCount, 2);
});

test("reports shortfall when only 2 scouts pass", () => {
  const plan = makePlan(6);
  const { results, evals } = makeResultsAndEvals(plan, (i) =>
    i < 2 ? makePassingEval({ compositeScore: 0.8 - i * 0.1 }) : makeFailingEval("tone_implausible")
  );
  const sel = selectScouts(plan, results, evals);
  assert.equal(sel.selected.length, 2);
  assert.equal(sel.shortfall, true);
  assert.equal(sel.shortfallCount, 1);
});

test("shortfall result has no filler — selected count + shortfallCount = 3", () => {
  const plan = makePlan(6);
  const { results, evals } = makeResultsAndEvals(plan, (i) =>
    i < 2 ? makePassingEval() : makeFailingEval("scaffold_collapse")
  );
  const sel = selectScouts(plan, results, evals);
  assert.equal(sel.selected.length + sel.shortfallCount, 3);
});

// ── Relaxed fallback ─────────────────────────────────────────────────────────

test("relaxes grammar-key uniqueness when pool has only 2 distinct grammars", () => {
  // Build a minimal plan with 3 slots but ensure only 2 grammar keys appear
  const plan = makePlan(3);
  // Force all slots to appear as if same grammar by building custom plan
  const forcedSlots = plan.slots.map((s) => ({
    ...s,
    grammarKey: "centered_focal_motif" as const,
    diversityFamily: "focal_centered",
  }));
  const forcedPlan = { ...plan, slots: forcedSlots };
  const results = forcedSlots.map((s) => makeSuccessResult(s as typeof plan.slots[0]));
  const evals = forcedSlots.map(() => makePassingEval());
  const sel = selectScouts(forcedPlan as typeof plan, results, evals);
  // Should fill 3 even with duplicate grammar, using relaxed uniqueness
  assert.equal(sel.selected.length, 3);
  assert.ok(sel.selected.some((s) => s.selectionReason.includes("relaxed-uniqueness")));
});

// ── Length / input guards ─────────────────────────────────────────────────────

test("throws when results and plan length mismatch", () => {
  const plan = makePlan(3);
  assert.throws(
    () => selectScouts(plan, [], plan.slots.map(() => makePassingEval())),
    /lengths must match/
  );
});

// ── Result shape ──────────────────────────────────────────────────────────────

test("all rejected entries have rejectionReason strings", () => {
  const plan = makePlan(6);
  const { results, evals } = makeResultsAndEvals(plan, (i) =>
    i < 3 ? makePassingEval() : makeFailingEval("scaffold_collapse")
  );
  const sel = selectScouts(plan, results, evals);
  for (const r of sel.rejected) {
    assert.ok(typeof r.rejectionReason === "string" && r.rejectionReason.length > 0);
  }
});

test("candidateCount equals non-hard-rejected non-failed count", () => {
  const plan = makePlan(6);
  const { results, evals } = makeResultsAndEvals(plan, (i) =>
    i < 4 ? makePassingEval() : makeFailingEval("tone_implausible")
  );
  const sel = selectScouts(plan, results, evals);
  assert.equal(sel.candidateCount, 4);
});
