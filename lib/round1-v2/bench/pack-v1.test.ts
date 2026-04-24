import assert from "node:assert/strict";
import test from "node:test";
import { TONAL_VARIANTS } from "../grammars";
import { normalizeBrief } from "../briefs/normalize-brief";
import { buildScoutPlan } from "../orchestrator/build-scout-plan";
import { ROUND1_V2_CONFIG } from "../config";
import {
  BENCHMARK_PACK_V1,
  fixtureToScoutPlanInput,
  type BriefCategory,
  type TitleLength,
} from "./pack-v1";

test("pack has 10 fixtures", () => {
  assert.equal(BENCHMARK_PACK_V1.length, 10);
});

test("all fixture IDs are unique", () => {
  const ids = BENCHMARK_PACK_V1.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate fixture ID detected");
});

test("all fixtures have non-empty titles", () => {
  for (const fixture of BENCHMARK_PACK_V1) {
    assert.ok(fixture.rawInput.title.trim().length > 0, `fixture ${fixture.id} has empty title`);
  }
});

test("all five tonal variants are represented", () => {
  const tones = new Set(BENCHMARK_PACK_V1.map((f) => f.tone));
  for (const tone of TONAL_VARIANTS) {
    assert.ok(tones.has(tone), `tonal variant '${tone}' not represented in pack`);
  }
});

test("all four brief categories are represented", () => {
  const categories = new Set(BENCHMARK_PACK_V1.map((f) => f.category));
  const expected: BriefCategory[] = ["topical", "scriptural", "seasonal", "abstract"];
  for (const cat of expected) {
    assert.ok(categories.has(cat), `category '${cat}' not represented in pack`);
  }
});

test("both motif density levels are represented", () => {
  const densities = new Set(BENCHMARK_PACK_V1.map((f) => f.motifDensity));
  assert.ok(densities.has("light"), "motifDensity 'light' not represented");
  assert.ok(densities.has("heavy"), "motifDensity 'heavy' not represented");
});

test("multiple title lengths are represented", () => {
  const lengths = new Set(BENCHMARK_PACK_V1.map((f) => f.titleLength));
  const expected: TitleLength[] = ["short", "medium", "long"];
  for (const len of expected) {
    assert.ok(lengths.has(len), `titleLength '${len}' not represented`);
  }
});

test("at least two short-title hostile cases exist", () => {
  const short = BENCHMARK_PACK_V1.filter((f) => f.titleLength === "short");
  assert.ok(short.length >= 2, `expected ≥2 short-title fixtures, got ${short.length}`);
});

test("normalizeBrief produces valid NormalizedBrief for every fixture", () => {
  for (const fixture of BENCHMARK_PACK_V1) {
    const brief = normalizeBrief(fixture.rawInput);
    assert.ok(brief.title.length > 0, `${fixture.id}: empty title after normalization`);
    assert.ok(
      (TONAL_VARIANTS as readonly string[]).includes(brief.toneTarget),
      `${fixture.id}: invalid toneTarget '${brief.toneTarget}'`
    );
    assert.ok(Array.isArray(brief.motifs), `${fixture.id}: motifs not an array`);
    assert.ok(Array.isArray(brief.negativeHints), `${fixture.id}: negativeHints not an array`);
  }
});

test("toneHint is preserved through normalization for every fixture", () => {
  for (const fixture of BENCHMARK_PACK_V1) {
    const brief = normalizeBrief(fixture.rawInput);
    assert.equal(
      brief.toneTarget,
      fixture.tone,
      `${fixture.id}: expected toneTarget '${fixture.tone}', got '${brief.toneTarget}'`
    );
  }
});

test("fixtureToScoutPlanInput produces valid ScoutPlanInput for every fixture", () => {
  for (const fixture of BENCHMARK_PACK_V1) {
    const input = fixtureToScoutPlanInput(fixture, `bench-seed-${fixture.id}`);
    assert.ok(input.runSeed.length > 0, `${fixture.id}: empty runSeed`);
    assert.ok(
      (TONAL_VARIANTS as readonly string[]).includes(input.tone),
      `${fixture.id}: invalid tone`
    );
    assert.ok(Array.isArray(input.motifs), `${fixture.id}: motifs not an array`);
  }
});

test("every fixture can feed buildScoutPlan and produces a full plan", () => {
  for (const fixture of BENCHMARK_PACK_V1) {
    const input = fixtureToScoutPlanInput(fixture, `bench-seed-${fixture.id}`);
    const plan = buildScoutPlan(input);
    assert.equal(
      plan.slots.length,
      ROUND1_V2_CONFIG.scoutCount,
      `${fixture.id}: expected ${ROUND1_V2_CONFIG.scoutCount} slots`
    );
    assert.ok(
      plan.distinctFamilyCount >= 4,
      `${fixture.id}: expected ≥4 distinct families, got ${plan.distinctFamilyCount}`
    );
  }
});

test("scout plans across all fixtures cover all 6 grammar keys collectively", () => {
  const allGrammars = new Set<string>();
  for (const fixture of BENCHMARK_PACK_V1) {
    const input = fixtureToScoutPlanInput(fixture, `bench-seed-${fixture.id}`);
    const plan = buildScoutPlan(input);
    plan.slots.forEach((s) => allGrammars.add(s.grammarKey));
  }
  assert.equal(allGrammars.size, 6, `expected 6 grammar keys across all plans, got ${allGrammars.size}`);
});
