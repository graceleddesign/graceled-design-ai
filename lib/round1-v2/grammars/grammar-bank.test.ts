import assert from "node:assert/strict";
import test from "node:test";
import { GRAMMAR_BANK, GRAMMAR_KEYS, TONAL_VARIANTS, type Bbox, type GrammarKey } from "./index";

function isValidBbox(b: Bbox): boolean {
  return (
    b.x >= 0 && b.x <= 1 &&
    b.y >= 0 && b.y <= 1 &&
    b.w > 0 && b.w <= 1 &&
    b.h > 0 && b.h <= 1 &&
    b.x + b.w <= 1.001 && // allow floating-point tolerance
    b.y + b.h <= 1.001
  );
}

test("grammar bank has an entry for every declared key", () => {
  for (const key of GRAMMAR_KEYS) {
    assert.ok(GRAMMAR_BANK[key], `missing bank entry for key: ${key}`);
    assert.equal(GRAMMAR_BANK[key].key, key, `grammar.key mismatch for ${key}`);
  }
  assert.equal(Object.keys(GRAMMAR_BANK).length, GRAMMAR_KEYS.length);
});

test("all diversity families are unique across grammars", () => {
  const families = GRAMMAR_KEYS.map((k) => GRAMMAR_BANK[k].diversityFamily);
  const unique = new Set(families);
  assert.equal(unique.size, families.length, "duplicate diversityFamily detected");
});

test("every grammar has at least one compatible tone", () => {
  for (const key of GRAMMAR_KEYS) {
    const g = GRAMMAR_BANK[key];
    assert.ok(g.compatibleTones.length > 0, `${key} has no compatible tones`);
    for (const tone of g.compatibleTones) {
      assert.ok(
        TONAL_VARIANTS.includes(tone),
        `${key} references unknown tone: ${tone}`
      );
    }
  }
});

test("all bboxes in focalZones are valid normalized coordinates", () => {
  for (const key of GRAMMAR_KEYS) {
    const g = GRAMMAR_BANK[key];
    for (const bbox of g.focalZones) {
      assert.ok(isValidBbox(bbox), `${key} has invalid focalZone bbox: ${JSON.stringify(bbox)}`);
    }
  }
});

test("all bboxes in titleSafeZones are valid normalized coordinates", () => {
  for (const key of GRAMMAR_KEYS) {
    const g = GRAMMAR_BANK[key];
    assert.ok(g.titleSafeZones.length > 0, `${key} has no titleSafeZones`);
    for (const bbox of g.titleSafeZones) {
      assert.ok(
        isValidBbox(bbox),
        `${key} has invalid titleSafeZone bbox: ${JSON.stringify(bbox)}`
      );
    }
  }
});

test("no grammar has both empty focalZones and empty titleSafeZones", () => {
  for (const key of GRAMMAR_KEYS) {
    const g = GRAMMAR_BANK[key];
    const bothEmpty = g.focalZones.length === 0 && g.titleSafeZones.length === 0;
    assert.ok(!bothEmpty, `${key} has no focalZones and no titleSafeZones`);
  }
});

test("negativeSpaceMinPct is within 0–100 for all grammars", () => {
  for (const key of GRAMMAR_KEYS) {
    const g = GRAMMAR_BANK[key];
    assert.ok(
      g.negativeSpaceMinPct >= 0 && g.negativeSpaceMinPct <= 100,
      `${key} negativeSpaceMinPct out of range: ${g.negativeSpaceMinPct}`
    );
  }
});

test("all grammar keys have non-empty prompt templates", () => {
  for (const key of GRAMMAR_KEYS) {
    const g = GRAMMAR_BANK[key];
    assert.ok(g.scoutPromptTemplate.length > 20, `${key} scoutPromptTemplate too short`);
    assert.ok(g.rebuildPromptTemplate.length > 20, `${key} rebuildPromptTemplate too short`);
    // Templates must contain placeholder tokens so they can be bound at plan time
    assert.ok(
      g.scoutPromptTemplate.includes("{motif}"),
      `${key} scoutPromptTemplate missing {motif}`
    );
    assert.ok(
      g.scoutPromptTemplate.includes("{tone}"),
      `${key} scoutPromptTemplate missing {tone}`
    );
  }
});

test("all six expected grammar keys are present", () => {
  const expected: GrammarKey[] = [
    "centered_focal_motif",
    "edge_anchored_motif",
    "horizon_band",
    "layered_atmospheric",
    "geometric_block_composition",
    "textural_field",
  ];
  for (const key of expected) {
    assert.ok(GRAMMAR_BANK[key], `expected grammar key missing: ${key}`);
  }
  assert.equal(GRAMMAR_KEYS.length, expected.length);
});
