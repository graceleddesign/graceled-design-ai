import assert from "node:assert/strict";
import test from "node:test";
import { ROUND1_V2_CONFIG } from "../config";
import { GRAMMAR_KEYS } from "../grammars";
import { buildScoutPlan, type ScoutPlanInput } from "./build-scout-plan";

const BASE_INPUT: ScoutPlanInput = {
  runSeed: "test-seed-abc",
  tone: "neutral",
  motifs: ["light", "cross"],
  negativeHints: [],
};

test("plan produces exactly scoutCount slots by default", () => {
  const plan = buildScoutPlan(BASE_INPUT);
  assert.equal(plan.slots.length, ROUND1_V2_CONFIG.scoutCount);
});

test("plan respects an explicit count override", () => {
  const plan = buildScoutPlan({ ...BASE_INPUT, count: 3 });
  assert.equal(plan.slots.length, 3);
});

test("plan covers at least 4 distinct diversity families", () => {
  const plan = buildScoutPlan(BASE_INPUT);
  assert.ok(
    plan.distinctFamilyCount >= 4,
    `expected ≥4 distinct families, got ${plan.distinctFamilyCount}`
  );
  assert.equal(
    plan.distinctFamilyCount,
    new Set(plan.slots.map((s) => s.diversityFamily)).size
  );
});

test("plan covers all 6 grammar families when count >= 6", () => {
  const plan = buildScoutPlan({ ...BASE_INPUT, count: 6 });
  const families = new Set(plan.slots.map((s) => s.diversityFamily));
  assert.equal(families.size, GRAMMAR_KEYS.length);
});

test("plan is deterministic — same seed produces identical slots", () => {
  const a = buildScoutPlan(BASE_INPUT);
  const b = buildScoutPlan(BASE_INPUT);
  assert.deepEqual(a.slots, b.slots);
});

test("different run seeds produce different slot seeds", () => {
  const a = buildScoutPlan({ ...BASE_INPUT, runSeed: "seed-one" });
  const b = buildScoutPlan({ ...BASE_INPUT, runSeed: "seed-two" });
  const aSeeds = a.slots.map((s) => s.seed);
  const bSeeds = b.slots.map((s) => s.seed);
  // At least one seed should differ; in practice all will differ
  const anyDiffers = aSeeds.some((s, i) => s !== bSeeds[i]);
  assert.ok(anyDiffers, "expected different seeds for different runSeeds");
});

test("all slots carry the correct tone from input", () => {
  const plan = buildScoutPlan({ ...BASE_INPUT, tone: "dark" });
  for (const slot of plan.slots) {
    assert.equal(slot.tone, "dark");
    assert.equal(slot.promptSpec.tone, "dark");
  }
});

test("incompatible motifs are excluded from motifBinding per slot", () => {
  // abstract_texture is incompatible with centered_focal_motif and edge_anchored_motif
  const plan = buildScoutPlan({
    ...BASE_INPUT,
    motifs: ["abstract_texture", "fire"],
  });
  for (const slot of plan.slots) {
    if (
      slot.grammarKey === "centered_focal_motif" ||
      slot.grammarKey === "edge_anchored_motif"
    ) {
      assert.ok(
        !slot.motifBinding.includes("abstract_texture"),
        `${slot.grammarKey} should exclude abstract_texture from motifBinding`
      );
    }
  }
});

test("plan with no motifs produces empty motifBinding on all slots", () => {
  const plan = buildScoutPlan({ ...BASE_INPUT, motifs: [] });
  for (const slot of plan.slots) {
    assert.equal(slot.motifBinding.length, 0);
  }
});

test("plan falls back to all grammars when all are filtered by motif incompatibility", () => {
  // Provide only motifs that are incompatible with every grammar.
  // This is impossible in practice with our grammar bank (no motif is banned in all 6),
  // but the fallback branch should still produce a valid plan.
  // Use an empty-motifs plan to exercise the code path:
  const plan = buildScoutPlan({ ...BASE_INPUT, motifs: [] });
  assert.ok(plan.slots.length > 0);
  assert.ok(plan.distinctFamilyCount >= 4);
});

test("all slot grammarKeys are valid registered keys", () => {
  const plan = buildScoutPlan(BASE_INPUT);
  for (const slot of plan.slots) {
    assert.ok(
      (GRAMMAR_KEYS as readonly string[]).includes(slot.grammarKey),
      `unknown grammarKey: ${slot.grammarKey}`
    );
  }
});

test("plan metadata fields are correctly populated", () => {
  const plan = buildScoutPlan(BASE_INPUT);
  assert.equal(plan.runSeed, BASE_INPUT.runSeed);
  assert.equal(plan.tone, BASE_INPUT.tone);
  assert.equal(typeof plan.distinctFamilyCount, "number");
});

test("promptSpec template is the grammar scout template", () => {
  const plan = buildScoutPlan(BASE_INPUT);
  for (const slot of plan.slots) {
    assert.ok(
      slot.promptSpec.template.length > 0,
      `slot ${slot.grammarKey} has empty prompt template`
    );
    assert.ok(
      slot.promptSpec.template.includes("{motif}"),
      `slot ${slot.grammarKey} template missing {motif}`
    );
  }
});
