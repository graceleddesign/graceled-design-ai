import assert from "node:assert/strict";
import test from "node:test";
import { buildScoutPlan, type ScoutSlot } from "./build-scout-plan";
import { selectScouts } from "./select-scouts";
import type { ScoutGenerationResult } from "./run-scout-batch";
import type { ScoutEvalResult } from "../eval/evaluate-scout";

const RUN_SEED = "select-lane-test";

function makeBatch(plan: ReturnType<typeof buildScoutPlan>, scoresByLane: Record<string, number[]>): {
  results: ScoutGenerationResult[];
  evals: ScoutEvalResult[];
} {
  const laneCursor: Record<string, number> = { A: 0, B: 0, C: 0 };
  const results: ScoutGenerationResult[] = [];
  const evals: ScoutEvalResult[] = [];
  for (const slot of plan.slots) {
    const ln = slot.laneKey ?? "A";
    const idx = laneCursor[ln]++;
    const score = scoresByLane[ln]?.[idx] ?? 0.5;
    results.push({
      slot,
      prompt: "test",
      status: "success",
      imageBytes: Buffer.from([1, 2, 3]),
      latencyMs: 10,
      providerModel: "test-model",
    });
    evals.push({
      hardReject: false,
      rejectReasons: [],
      toneScore: 0.7,
      structureScore: 0.7,
      marginScore: 0.7,
      compositeScore: score,
      imageStats: null,
      textDetected: false,
    });
  }
  return { results, evals };
}

test("lane-aware selection picks lane winner from same lane group", () => {
  const plan = buildScoutPlan({
    runSeed: RUN_SEED,
    tone: "neutral",
    motifs: ["light"],
    negativeHints: [],
    lanes: [
      { laneKey: "A", designMode: "minimal_editorial" },
      { laneKey: "B", designMode: "cinematic_atmospheric" },
      { laneKey: "C", designMode: "typography_led" },
    ],
  });
  // Make lane A's middle slot the highest, lane B's first, lane C's last.
  const { results, evals } = makeBatch(plan, {
    A: [0.5, 0.9, 0.3],
    B: [0.85, 0.4, 0.4],
    C: [0.3, 0.3, 0.8],
  });
  const sel = selectScouts(plan, results, evals);
  assert.equal(sel.selected.length, 3);
  const byLabel = Object.fromEntries(sel.selected.map((s) => [s.label, s]));
  assert.ok(byLabel.A);
  assert.ok(byLabel.B);
  assert.ok(byLabel.C);
  assert.equal(byLabel.A.slot.laneKey, "A");
  assert.equal(byLabel.B.slot.laneKey, "B");
  assert.equal(byLabel.C.slot.laneKey, "C");
  // Lane winners must be the highest-score slot in their own lane:
  assert.equal(byLabel.A.compositeScore, 0.9);
  assert.equal(byLabel.B.compositeScore, 0.85);
  assert.equal(byLabel.C.compositeScore, 0.8);
});

test("lane-aware selection: each lane's design mode propagates into the selectionReason", () => {
  const plan = buildScoutPlan({
    runSeed: RUN_SEED,
    tone: "neutral",
    motifs: [],
    negativeHints: [],
    lanes: [
      { laneKey: "A", designMode: "minimal_editorial" },
      { laneKey: "B", designMode: "cinematic_atmospheric" },
      { laneKey: "C", designMode: "typography_led" },
    ],
  });
  const { results, evals } = makeBatch(plan, { A: [0.6, 0.5, 0.4], B: [0.6, 0.5, 0.4], C: [0.6, 0.5, 0.4] });
  const sel = selectScouts(plan, results, evals);
  for (const s of sel.selected) {
    assert.match(s.selectionReason, /mode=/);
  }
});

test("lane-aware selection: lane with all hard-rejected scouts triggers cross-lane mode-relaxed fallback", () => {
  const plan = buildScoutPlan({
    runSeed: RUN_SEED,
    tone: "neutral",
    motifs: [],
    negativeHints: [],
    lanes: [
      { laneKey: "A", designMode: "minimal_editorial" },
      { laneKey: "B", designMode: "cinematic_atmospheric" },
      { laneKey: "C", designMode: "typography_led" },
    ],
  });
  // Hard-reject every C-lane scout
  const { results, evals } = makeBatch(plan, {});
  for (let i = 0; i < plan.slots.length; i++) {
    if (plan.slots[i].laneKey === "C") {
      evals[i] = { ...evals[i], hardReject: true, rejectReasons: ["test"] } as ScoutEvalResult;
    }
  }
  const sel = selectScouts(plan, results, evals);
  // Should still produce 3 selections; C label is filled from cross-lane remainder.
  const byLabel = Object.fromEntries(sel.selected.map((s) => [s.label, s]));
  assert.equal(sel.selected.length, 3);
  assert.match(byLabel.C.selectionReason, /mode-relaxed/);
});

test("legacy non-lane-aware plan still uses grammar-diversity selection (back-compat)", () => {
  const plan = buildScoutPlan({
    runSeed: RUN_SEED,
    tone: "neutral",
    motifs: ["light"],
    negativeHints: [],
  });
  // Slots have no laneKey/designMode in legacy path.
  for (const s of plan.slots as ScoutSlot[]) {
    assert.equal(s.laneKey, undefined);
  }
  const results: ScoutGenerationResult[] = plan.slots.map((slot) => ({
    slot,
    prompt: "test",
    status: "success",
    imageBytes: Buffer.from([1, 2, 3]),
  }));
  const evals: ScoutEvalResult[] = plan.slots.map((_, i) => ({
    hardReject: false,
    rejectReasons: [],
    toneScore: 0.7,
    structureScore: 0.7,
    marginScore: 0.7,
    compositeScore: 0.9 - i * 0.01,
    imageStats: null,
    textDetected: false,
  }));
  const sel = selectScouts(plan, results, evals);
  assert.equal(sel.selected.length, 3);
});
