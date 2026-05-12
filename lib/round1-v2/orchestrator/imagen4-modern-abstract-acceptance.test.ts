/**
 * Research tests for the Imagen 4 modern_abstract experiment.
 *
 * Covers:
 *   - Fixture-based evaluator characterisation: dark prism image fails only on
 *     tone_implausible (text-free, strong structure, low edge density).
 *   - Waiver logic unit tests: all guard conditions are independently tested.
 *     The waiver function exists as a research artifact; it is NOT called from
 *     the runtime lane runner (removed after visual quality was rejected).
 *   - Lane runner confirmation: runtime consistently rejects tone-failed plates.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateScout } from "../eval/evaluate-scout";
import {
  checkImagen4ModernAbstractToneWaiver,
  PRISM_TONE_WAIVER_THRESHOLDS,
} from "./imagen4-modern-abstract-acceptance";
import { IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY } from "./build-imagen4-modern-abstract-prompt";
import { runImagen4ModernAbstractLane } from "./run-imagen4-modern-abstract-lane";
import type { Imagen4Provider, Imagen4Result } from "../providers/fal-imagen4";
import type { ScoutEvalResult } from "../eval/evaluate-scout";
import type { ScoutSlot } from "./build-scout-plan";
import type { ProductionBackgroundValidationEvidence } from "@/lib/production-valid-option";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const FIXTURE_PATH = join(__dirname, "../../../test/fixtures/round1-v2/imagen4-modern-abstract-prism-dark.png");

// ── Fixture: dark prism PNG ───────────────────────────────────────────────────

const fixtureBytes = readFileSync(FIXTURE_PATH);

const syntheticLightSlot: ScoutSlot = {
  grammarKey: "imagen4_modern_abstract" as unknown as ScoutSlot["grammarKey"],
  diversityFamily: "imagen4_modern_abstract",
  tone: "light",
  motifBinding: [],
  seed: 0,
  promptSpec: { template: "", motifBinding: [], tone: "light", negativeHints: [] },
};

// ── Section 1: Fixture-based evaluator characterisation ──────────────────────

test("fixture: dark prism image is text-free", async () => {
  const res = await evaluateScout({ slot: syntheticLightSlot, imageBytes: fixtureBytes });
  assert.equal(res.textDetected, false, "fixture must be text-free");
  assert.ok(
    !res.rejectReasons.includes("text_artifact_detected"),
    "text_artifact_detected must not be in rejectReasons"
  );
});

test("fixture: dark prism image has strong structure (>= 0.7)", async () => {
  const res = await evaluateScout({ slot: syntheticLightSlot, imageBytes: fixtureBytes });
  assert.ok(
    res.structureScore >= PRISM_TONE_WAIVER_THRESHOLDS.structureScoreMin,
    `structureScore ${res.structureScore} must be >= ${PRISM_TONE_WAIVER_THRESHOLDS.structureScoreMin}`
  );
});

test("fixture: dark prism image has acceptable margin (>= 0.3)", async () => {
  const res = await evaluateScout({ slot: syntheticLightSlot, imageBytes: fixtureBytes });
  assert.ok(
    res.marginScore >= PRISM_TONE_WAIVER_THRESHOLDS.marginScoreMin,
    `marginScore ${res.marginScore} must be >= ${PRISM_TONE_WAIVER_THRESHOLDS.marginScoreMin}`
  );
});

test("fixture: dark prism image has acceptable edge density (<= 0.15)", async () => {
  const res = await evaluateScout({ slot: syntheticLightSlot, imageBytes: fixtureBytes });
  const edgeDensity = res.imageStats?.edgeDensity ?? Infinity;
  assert.ok(
    edgeDensity <= PRISM_TONE_WAIVER_THRESHOLDS.edgeDensityMax,
    `edgeDensity ${edgeDensity} must be <= ${PRISM_TONE_WAIVER_THRESHOLDS.edgeDensityMax}`
  );
});

test("fixture: dark prism image fails tone_implausible ONLY under light-tone evaluation", async () => {
  const res = await evaluateScout({ slot: syntheticLightSlot, imageBytes: fixtureBytes });
  assert.equal(res.rejectReasons.length, 1, `expected exactly 1 reject reason, got: ${JSON.stringify(res.rejectReasons)}`);
  assert.equal(res.rejectReasons[0], "tone_implausible");
  assert.equal(res.toneScore, 0);
});

// ── Section 2: Waiver logic unit tests ───────────────────────────────────────

function makeEvalResult(overrides: Partial<ScoutEvalResult> = {}): ScoutEvalResult {
  return {
    hardReject: false,
    rejectReasons: [],
    toneScore: 0,
    structureScore: 0.82,
    marginScore: 0.40,
    compositeScore: 0,
    imageStats: {
      sampleCount: 4096,
      meanLuminance: 21,
      meanSaturation: 9,
      sepiaLikelihood: 0,
      luminanceStdDev: 38,
      edgeDensity: 0.061,
    },
    textDetected: false,
    ...overrides,
  };
}

const toneOnlyRejection = { accepted: false, invalidReasons: ["background_tone_fit_failed"] };
const accepted = { accepted: true, invalidReasons: [] };

test("waiver: applies for dark prism plate with tone-only failure", () => {
  const evalRes = makeEvalResult({ rejectReasons: ["tone_implausible"] });
  const result = checkImagen4ModernAbstractToneWaiver(IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY, evalRes, toneOnlyRejection);
  assert.ok(result !== null, "waiver should apply");
  assert.equal(result?.applied, true);
  assert.equal(result?.reason, "dark_prism_modern_abstract_tone_gate");
  assert.deepEqual(result?.originalRejectReasons, ["background_tone_fit_failed"]);
});

test("waiver: does NOT apply when acceptance already passed", () => {
  const evalRes = makeEvalResult();
  const result = checkImagen4ModernAbstractToneWaiver(IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY, evalRes, accepted);
  assert.equal(result, null);
});

test("waiver: does NOT apply for wrong prompt family", () => {
  const evalRes = makeEvalResult({ rejectReasons: ["tone_implausible"] });
  const result = checkImagen4ModernAbstractToneWaiver("some_other_family", evalRes, toneOnlyRejection);
  assert.equal(result, null);
});

test("waiver: does NOT apply when text is detected", () => {
  const evalRes = makeEvalResult({ textDetected: true, rejectReasons: ["tone_implausible"] });
  const result = checkImagen4ModernAbstractToneWaiver(IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY, evalRes, toneOnlyRejection);
  assert.equal(result, null);
});

test("waiver: does NOT apply when there are additional reject reasons beyond tone", () => {
  const multiRejection = { accepted: false, invalidReasons: ["background_tone_fit_failed", "background_text_detected"] };
  const evalRes = makeEvalResult({ rejectReasons: ["tone_implausible", "text_artifact_detected"] });
  const result = checkImagen4ModernAbstractToneWaiver(IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY, evalRes, multiRejection);
  assert.equal(result, null);
});

test("waiver: does NOT apply when failure reason is not tone (e.g. scaffold)", () => {
  const scaffoldRejection = { accepted: false, invalidReasons: ["background_scaffold_like"] };
  const evalRes = makeEvalResult({ rejectReasons: ["scaffold_collapse"] });
  const result = checkImagen4ModernAbstractToneWaiver(IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY, evalRes, scaffoldRejection);
  assert.equal(result, null);
});

test("waiver: does NOT apply when structureScore is below threshold", () => {
  const evalRes = makeEvalResult({ structureScore: 0.69 });
  const result = checkImagen4ModernAbstractToneWaiver(IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY, evalRes, toneOnlyRejection);
  assert.equal(result, null);
});

test("waiver: does NOT apply when structureScore is exactly below threshold (boundary)", () => {
  const evalRes = makeEvalResult({ structureScore: PRISM_TONE_WAIVER_THRESHOLDS.structureScoreMin - 0.001 });
  const result = checkImagen4ModernAbstractToneWaiver(IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY, evalRes, toneOnlyRejection);
  assert.equal(result, null);
});

test("waiver: applies when structureScore is exactly at threshold", () => {
  const evalRes = makeEvalResult({ structureScore: PRISM_TONE_WAIVER_THRESHOLDS.structureScoreMin });
  const result = checkImagen4ModernAbstractToneWaiver(IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY, evalRes, toneOnlyRejection);
  assert.ok(result !== null);
});

test("waiver: does NOT apply when marginScore is below threshold", () => {
  const evalRes = makeEvalResult({ marginScore: 0.29 });
  const result = checkImagen4ModernAbstractToneWaiver(IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY, evalRes, toneOnlyRejection);
  assert.equal(result, null);
});

test("waiver: does NOT apply when edgeDensity exceeds threshold", () => {
  const evalRes = makeEvalResult({
    imageStats: { sampleCount: 4096, meanLuminance: 21, meanSaturation: 9, sepiaLikelihood: 0, luminanceStdDev: 38, edgeDensity: 0.16 },
  });
  const result = checkImagen4ModernAbstractToneWaiver(IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY, evalRes, toneOnlyRejection);
  assert.equal(result, null);
});

test("waiver: does NOT apply when imageStats is null (edgeDensity unavailable)", () => {
  const evalRes = makeEvalResult({ imageStats: null });
  const result = checkImagen4ModernAbstractToneWaiver(IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY, evalRes, toneOnlyRejection);
  assert.equal(result, null);
});

test("waiver: records correct actual values in override metadata", () => {
  const evalRes = makeEvalResult({ toneScore: 0, structureScore: 0.82, marginScore: 0.40, rejectReasons: ["tone_implausible"] });
  const result = checkImagen4ModernAbstractToneWaiver(IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY, evalRes, toneOnlyRejection);
  assert.ok(result !== null);
  assert.equal(result?.actual.toneScore, 0);
  assert.equal(result?.actual.structureScore, 0.82);
  assert.equal(result?.actual.marginScore, 0.40);
  assert.equal(result?.actual.edgeDensity, 0.061);
});

test("waiver: thresholds are recorded in override metadata", () => {
  const evalRes = makeEvalResult({ rejectReasons: ["tone_implausible"] });
  const result = checkImagen4ModernAbstractToneWaiver(IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY, evalRes, toneOnlyRejection);
  assert.ok(result !== null);
  assert.equal(result?.thresholds.structureScoreMin, PRISM_TONE_WAIVER_THRESHOLDS.structureScoreMin);
  assert.equal(result?.thresholds.marginScoreMin, PRISM_TONE_WAIVER_THRESHOLDS.marginScoreMin);
  assert.equal(result?.thresholds.edgeDensityMax, PRISM_TONE_WAIVER_THRESHOLDS.edgeDensityMax);
});

// ── Section 3: Lane runner without runtime waiver (waiver removed from runtime) ──
//
// The tone waiver was removed from the runtime lane after visual evaluation
// determined the Imagen 4 modern_abstract path does not meet product quality.
// These tests confirm the runtime now consistently rejects tone-failed plates
// and that the waiver logic below (Section 2) is research-only, not runtime.

function makeFixtureProvider(): Imagen4Provider {
  return {
    id: "fal.imagen4-preview",
    async generate(): Promise<Imagen4Result> {
      return {
        imageBytes: fixtureBytes,
        latencyMs: 100,
        providerModel: "fal-ai/imagen4/preview",
        providerMetadata: { aspectRatio: "16:9", resolution: "2K", outputFormat: "png", description: "fixture" },
      };
    },
  };
}

function makeRealEvalFn() {
  return (args: { slot: ScoutSlot; imageBytes: Buffer }) => evaluateScout(args);
}

function makeAcceptanceFn() {
  return (params: { evidence: ProductionBackgroundValidationEvidence }) => {
    const reasons: string[] = [];
    if (params.evidence.textFree === false) reasons.push("background_text_detected");
    if (params.evidence.scaffoldFree === false) reasons.push("background_scaffold_like");
    if (params.evidence.motifPresent === false) reasons.push("background_blank_or_motif_weak");
    if (params.evidence.toneFit === false) reasons.push("background_tone_fit_failed");
    return { accepted: reasons.length === 0, invalidReasons: reasons };
  };
}

test("lane runner: dark prism fixture is REJECTED by runtime without waiver (tone=light)", async () => {
  // Confirms the runtime no longer applies a tone waiver. The dark prism image
  // fails tone_implausible under a light brief and must remain rejected.
  const res = await runImagen4ModernAbstractLane({
    tone: "light",
    provider: makeFixtureProvider(),
    evalFn: makeRealEvalFn(),
    acceptanceFn: makeAcceptanceFn(),
  });
  assert.equal(res.status, "rejected", "dark prism plate must be rejected by standard gate without waiver");
  assert.equal(res.debug.accepted, false);
});

test("lane runner: image passing all standard gates is accepted", async () => {
  const passingEvalFn = async (_args: { slot: ScoutSlot; imageBytes: Buffer }): Promise<ScoutEvalResult> => ({
    hardReject: false,
    rejectReasons: [],
    toneScore: 0.8,
    structureScore: 0.8,
    marginScore: 0.5,
    compositeScore: 0.75,
    imageStats: {
      sampleCount: 4096,
      meanLuminance: 150,
      meanSaturation: 100,
      sepiaLikelihood: 0,
      luminanceStdDev: 40,
      edgeDensity: 0.04,
    },
    textDetected: false,
  });
  const res = await runImagen4ModernAbstractLane({
    tone: "neutral",
    provider: makeFixtureProvider(),
    evalFn: passingEvalFn,
    acceptanceFn: makeAcceptanceFn(),
  });
  assert.equal(res.status, "accepted");
});

test("lane runner: onRejectedBytes is called when tone-failed plate is rejected", async () => {
  let callCount = 0;
  const res = await runImagen4ModernAbstractLane({
    tone: "light",
    provider: makeFixtureProvider(),
    evalFn: makeRealEvalFn(),
    acceptanceFn: makeAcceptanceFn(),
    onRejectedBytes: async () => { callCount++; return null; },
  });
  assert.equal(res.status, "rejected");
  assert.equal(callCount, 1, "onRejectedBytes must be called on rejection");
});
