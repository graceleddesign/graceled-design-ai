import assert from "node:assert/strict";
import test from "node:test";
import { buildScoutPlan, LANE_KEYS } from "./build-scout-plan";
import type { ScoutPlanInput } from "./build-scout-plan";
import { getPreferredGrammarsForMode } from "./mode-grammar-affinity";

const BASE: ScoutPlanInput = {
  runSeed: "lane-test-seed",
  tone: "neutral",
  motifs: ["light"],
  negativeHints: [],
};

test("lane-aware plan generates 3 slots per lane (9 total)", () => {
  const plan = buildScoutPlan({
    ...BASE,
    lanes: [
      { laneKey: "A", designMode: "minimal_editorial" },
      { laneKey: "B", designMode: "cinematic_atmospheric" },
      { laneKey: "C", designMode: "typography_led" },
    ],
    slotsPerLane: 3,
  });
  assert.equal(plan.laneAware, true);
  assert.equal(plan.slots.length, 9);
  for (const lane of LANE_KEYS) {
    const laneSlots = plan.slots.filter((s) => s.laneKey === lane);
    assert.equal(laneSlots.length, 3, `lane ${lane} should have 3 slots`);
  }
});

test("each lane-aware slot carries the lane's planned designMode", () => {
  const plan = buildScoutPlan({
    ...BASE,
    lanes: [
      { laneKey: "A", designMode: "minimal_editorial" },
      { laneKey: "B", designMode: "cinematic_atmospheric" },
      { laneKey: "C", designMode: "typography_led" },
    ],
  });
  for (const slot of plan.slots) {
    assert.ok(slot.designMode);
    assert.ok(slot.laneKey);
  }
  const aSlots = plan.slots.filter((s) => s.laneKey === "A");
  for (const s of aSlots) assert.equal(s.designMode, "minimal_editorial");
  const cSlots = plan.slots.filter((s) => s.laneKey === "C");
  for (const s of cSlots) assert.equal(s.designMode, "typography_led");
});

test("lane-aware plan picks grammars from each mode's preferred set when possible", () => {
  const plan = buildScoutPlan({
    ...BASE,
    lanes: [
      { laneKey: "A", designMode: "graphic_symbol" },
      { laneKey: "B", designMode: "minimal_editorial" },
      { laneKey: "C", designMode: "typography_led" },
    ],
  });
  const graphicSymbolPreferred = new Set(getPreferredGrammarsForMode("graphic_symbol"));
  const minimalPreferred = new Set(getPreferredGrammarsForMode("minimal_editorial"));
  const typographyPreferred = new Set(getPreferredGrammarsForMode("typography_led"));

  const aGrammars = plan.slots.filter((s) => s.laneKey === "A").map((s) => s.grammarKey);
  const bGrammars = plan.slots.filter((s) => s.laneKey === "B").map((s) => s.grammarKey);
  const cGrammars = plan.slots.filter((s) => s.laneKey === "C").map((s) => s.grammarKey);

  for (const g of aGrammars) assert.ok(graphicSymbolPreferred.has(g), `lane A grammar ${g} not in graphic_symbol preferred`);
  for (const g of bGrammars) assert.ok(minimalPreferred.has(g), `lane B grammar ${g} not in minimal_editorial preferred`);
  for (const g of cGrammars) assert.ok(typographyPreferred.has(g), `lane C grammar ${g} not in typography_led preferred`);
});

test("lane-aware plan is deterministic for same seed", () => {
  const a = buildScoutPlan({
    ...BASE,
    lanes: [
      { laneKey: "A", designMode: "minimal_editorial" },
      { laneKey: "B", designMode: "cinematic_atmospheric" },
      { laneKey: "C", designMode: "typography_led" },
    ],
  });
  const b = buildScoutPlan({
    ...BASE,
    lanes: [
      { laneKey: "A", designMode: "minimal_editorial" },
      { laneKey: "B", designMode: "cinematic_atmospheric" },
      { laneKey: "C", designMode: "typography_led" },
    ],
  });
  assert.deepEqual(
    a.slots.map((s) => ({ lane: s.laneKey, mode: s.designMode, g: s.grammarKey, seed: s.seed })),
    b.slots.map((s) => ({ lane: s.laneKey, mode: s.designMode, g: s.grammarKey, seed: s.seed }))
  );
});

test("lane-aware plan: different lanes get different grammar sets where modes diverge", () => {
  const plan = buildScoutPlan({
    ...BASE,
    lanes: [
      { laneKey: "A", designMode: "graphic_symbol" },
      { laneKey: "B", designMode: "minimal_editorial" },
      { laneKey: "C", designMode: "typography_led" },
    ],
  });
  const aGrammars = new Set(plan.slots.filter((s) => s.laneKey === "A").map((s) => s.grammarKey));
  const bGrammars = new Set(plan.slots.filter((s) => s.laneKey === "B").map((s) => s.grammarKey));
  // graphic_symbol prefers focal/edge/geometric; minimal prefers textural/horizon/atmospheric
  // — at least one grammar should differ between A and B.
  const onlyInA = [...aGrammars].filter((g) => !bGrammars.has(g));
  assert.ok(onlyInA.length > 0, "expected graphic_symbol and minimal_editorial lanes to diverge in grammars");
});

test("non-lane-aware plan still works (backward compat)", () => {
  const plan = buildScoutPlan(BASE);
  // Default scoutCount is 9 from config
  assert.equal(plan.slots.length, 9);
  assert.equal(plan.laneAware, false);
  for (const s of plan.slots) {
    assert.equal(s.laneKey, undefined);
    assert.equal(s.designMode, undefined);
  }
});
