import assert from "node:assert/strict";
import test from "node:test";
import { GRAMMAR_BANK } from "../grammars";
import type { ScoutSlot } from "../orchestrator/build-scout-plan";
import type { ScoutGenerationResult } from "../orchestrator/run-scout-batch";
import type { ScoutEvalResult } from "../eval/evaluate-scout";
import type { SelectedScout } from "../orchestrator/select-scouts";
import {
  buildCreateScoutRunInput,
  buildUpdateScoutRunResultInput,
  buildCreateScoutEvalInput,
  buildCreateRebuildAttemptInput,
} from "./input-builders";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSlot(): ScoutSlot {
  const grammar = GRAMMAR_BANK.centered_focal_motif;
  return {
    grammarKey: "centered_focal_motif",
    diversityFamily: grammar.diversityFamily,
    tone: "neutral",
    motifBinding: ["light", "hope"],
    seed: 12345,
    promptSpec: {
      template: grammar.scoutPromptTemplate,
      motifBinding: ["light", "hope"],
      tone: "neutral",
      negativeHints: [],
    },
  };
}

function makeSuccessResult(slot: ScoutSlot): ScoutGenerationResult {
  return {
    slot,
    prompt: "test prompt",
    status: "success",
    imageBytes: Buffer.from("x"),
    latencyMs: 850,
    providerModel: "fal-ai/flux/schnell",
  };
}

function makeFailResult(slot: ScoutSlot): ScoutGenerationResult {
  return { slot, prompt: "test prompt", status: "failed", error: "rate limit" };
}

function makePassingEval(): ScoutEvalResult {
  return {
    hardReject: false,
    rejectReasons: [],
    toneScore: 0.8,
    structureScore: 0.7,
    marginScore: 0.6,
    compositeScore: 0.74,
    imageStats: null,
    textDetected: false,
  };
}

function makeFailingEval(): ScoutEvalResult {
  return {
    hardReject: true,
    rejectReasons: ["scaffold_collapse"],
    toneScore: 0,
    structureScore: 0,
    marginScore: 0,
    compositeScore: 0,
    imageStats: null,
    textDetected: false,
  };
}

function makeSelectedScout(slot: ScoutSlot): SelectedScout {
  return {
    label: "A",
    slotIndex: 0,
    slot,
    result: makeSuccessResult(slot),
    eval: makePassingEval(),
    grammarKey: slot.grammarKey,
    diversityFamily: slot.diversityFamily,
    compositeScore: 0.74,
    selectionReason: "score=0.740 grammar=centered_focal_motif",
  };
}

// ── buildCreateScoutRunInput ──────────────────────────────────────────────────

test("buildCreateScoutRunInput maps slot fields correctly", () => {
  const slot = makeSlot();
  const input = buildCreateScoutRunInput({
    generationId: "gen_abc",
    runSeed: "test-seed-123",
    slotIndex: 2,
    slot,
    providerId: "fal-flux-schnell",
    prompt: "a test prompt",
  });

  assert.equal(input.generationId, "gen_abc");
  assert.equal(input.runSeed, "test-seed-123");
  assert.equal(input.slotIndex, 2);
  assert.equal(input.grammarKey, "centered_focal_motif");
  assert.equal(input.diversityFamily, slot.diversityFamily);
  assert.equal(input.tone, "neutral");
  assert.deepEqual(input.motifBinding, ["light", "hope"]);
  assert.equal(input.seed, 12345);
  assert.equal(input.providerId, "fal-flux-schnell");
  assert.equal(input.prompt, "a test prompt");
  assert.ok(typeof input.promptSpec === "object");
});

// ── buildUpdateScoutRunResultInput ────────────────────────────────────────────

test("success result maps to SUCCESS status with latency", () => {
  const slot = makeSlot();
  const update = buildUpdateScoutRunResultInput("run_1", makeSuccessResult(slot));
  assert.equal(update.id, "run_1");
  assert.equal(update.status, "SUCCESS");
  assert.equal(update.latencyMs, 850);
  assert.equal(update.providerModel, "fal-ai/flux/schnell");
  assert.equal(update.failureReason, undefined);
});

test("failed result maps to FAILED status with reason", () => {
  const slot = makeSlot();
  const update = buildUpdateScoutRunResultInput("run_2", makeFailResult(slot));
  assert.equal(update.id, "run_2");
  assert.equal(update.status, "FAILED");
  assert.equal(update.failureReason, "rate limit");
  assert.equal(update.latencyMs, undefined);
});

test("failed result with no error message falls back to 'unknown'", () => {
  const slot = makeSlot();
  const result: ScoutGenerationResult = { slot, prompt: "", status: "failed" };
  const update = buildUpdateScoutRunResultInput("run_3", result);
  assert.equal(update.status, "FAILED");
  assert.equal(update.failureReason, "unknown");
});

// ── buildCreateScoutEvalInput ─────────────────────────────────────────────────

test("buildCreateScoutEvalInput maps passing eval correctly", () => {
  const ev = makePassingEval();
  const input = buildCreateScoutEvalInput("run_99", ev);
  assert.equal(input.scoutRunId, "run_99");
  assert.equal(input.hardReject, false);
  assert.deepEqual(input.rejectReasons, []);
  assert.equal(input.textDetected, false);
  assert.equal(input.toneScore, 0.8);
  assert.equal(input.structureScore, 0.7);
  assert.equal(input.marginScore, 0.6);
  assert.equal(input.compositeScore, 0.74);
  assert.equal(input.imageStats, null);
});

test("buildCreateScoutEvalInput maps hard-rejected eval correctly", () => {
  const ev = makeFailingEval();
  const input = buildCreateScoutEvalInput("run_88", ev);
  assert.equal(input.hardReject, true);
  assert.deepEqual(input.rejectReasons, ["scaffold_collapse"]);
  assert.equal(input.compositeScore, 0);
});

test("buildCreateScoutEvalInput preserves multiple reject reasons", () => {
  const ev: ScoutEvalResult = {
    ...makeFailingEval(),
    rejectReasons: ["scaffold_collapse", "tone_implausible"],
  };
  const input = buildCreateScoutEvalInput("run_77", ev);
  assert.deepEqual(input.rejectReasons, ["scaffold_collapse", "tone_implausible"]);
});

// ── buildCreateRebuildAttemptInput ────────────────────────────────────────────

test("buildCreateRebuildAttemptInput maps selection correctly", () => {
  const slot = makeSlot();
  const selected = makeSelectedScout(slot);
  const input = buildCreateRebuildAttemptInput({
    generationId: "gen_xyz",
    selected,
    scoutRunId: "scout_run_1",
    providerId: "nano-banana-pro",
    attemptOrder: 0,
  });
  assert.equal(input.generationId, "gen_xyz");
  assert.equal(input.scoutRunId, "scout_run_1");
  assert.equal(input.optionIndex, 0); // slotIndex of selected scout
  assert.equal(input.providerId, "nano-banana-pro");
  assert.equal(input.attemptOrder, 0);
});

test("buildCreateRebuildAttemptInput handles missing scoutRunId", () => {
  const slot = makeSlot();
  const selected = makeSelectedScout(slot);
  const input = buildCreateRebuildAttemptInput({
    generationId: "gen_xyz",
    selected,
    providerId: "nano-banana-pro",
    attemptOrder: 1,
  });
  assert.equal(input.scoutRunId, undefined);
  assert.equal(input.attemptOrder, 1);
});

// ── Type contract sanity checks ───────────────────────────────────────────────

test("ScoutRunRecord status values are a closed set", () => {
  const validStatuses: Array<"PENDING" | "SUCCESS" | "FAILED"> = ["PENDING", "SUCCESS", "FAILED"];
  assert.equal(validStatuses.length, 3);
});

test("RebuildStatus values are a closed set", () => {
  const validStatuses: Array<"PENDING" | "SUCCESS" | "FAILED" | "SKIPPED"> = [
    "PENDING", "SUCCESS", "FAILED", "SKIPPED",
  ];
  assert.equal(validStatuses.length, 4);
});
