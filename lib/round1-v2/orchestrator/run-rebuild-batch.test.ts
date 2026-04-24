import assert from "node:assert/strict";
import test from "node:test";
import { runRebuildBatch } from "./run-rebuild-batch";
import type { RebuildProvider, RebuildRequest, RebuildResult } from "../providers/rebuild-provider";
import { RebuildProviderError } from "../providers/rebuild-provider";
import type { SelectedScout } from "./select-scouts";
import type { NormalizedBrief } from "../briefs/types";
import { GRAMMAR_BANK } from "../grammars";
import type { ScoutSlot } from "./build-scout-plan";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeBrief(): NormalizedBrief {
  return {
    title: "Rest in Him",
    subtitle: null,
    scripturePassages: null,
    toneTarget: "neutral",
    motifs: ["light"],
    negativeHints: [],
    styleIntent: null,
    topicalContext: null,
  };
}

function makeSlot(grammarKey: keyof typeof GRAMMAR_BANK = "centered_focal_motif"): ScoutSlot {
  const grammar = GRAMMAR_BANK[grammarKey];
  return {
    grammarKey,
    diversityFamily: grammar.diversityFamily,
    tone: "neutral",
    motifBinding: ["light"],
    seed: 42,
    promptSpec: {
      template: grammar.scoutPromptTemplate,
      motifBinding: ["light"],
      tone: "neutral",
      negativeHints: [],
    },
  };
}

function makeSelected(
  label: "A" | "B" | "C",
  slotIndex: number,
  grammarKey: keyof typeof GRAMMAR_BANK = "centered_focal_motif"
): SelectedScout {
  const slot = makeSlot(grammarKey);
  return {
    label,
    slotIndex,
    slot,
    result: { slot, prompt: "p", status: "success", imageBytes: Buffer.from("x"), latencyMs: 100 },
    eval: { hardReject: false, rejectReasons: [], toneScore: 0.8, structureScore: 0.7, marginScore: 0.6, compositeScore: 0.74, imageStats: null, textDetected: false },
    grammarKey,
    diversityFamily: GRAMMAR_BANK[grammarKey].diversityFamily,
    compositeScore: 0.74,
    selectionReason: "test",
  };
}

function makeSuccessProvider(id: string): RebuildProvider {
  return {
    id,
    async generate(_req: RebuildRequest): Promise<RebuildResult> {
      return {
        imageBytes: Buffer.from(`rebuilt-by-${id}`),
        latencyMs: 500,
        providerModel: `model-${id}`,
        seed: _req.seed,
      };
    },
  };
}

function makeFailProvider(id: string, kind: RebuildProviderError["kind"]): RebuildProvider {
  return {
    id,
    async generate(_req: RebuildRequest): Promise<RebuildResult> {
      throw new RebuildProviderError(kind, `${id} error: ${kind}`);
    },
  };
}

// ── Basic success path ────────────────────────────────────────────────────────

test("successful rebuild returns one result per selected scout", async () => {
  const brief = makeBrief();
  const selected = [makeSelected("A", 0), makeSelected("B", 2), makeSelected("C", 4)];
  const primary = makeSuccessProvider("nano-banana-pro");
  const fallback = makeSuccessProvider("nano-banana-2");

  const batch = await runRebuildBatch(brief, selected, primary, fallback);

  assert.equal(batch.results.length, 3);
  assert.equal(batch.successCount, 3);
  assert.equal(batch.failureCount, 0);
});

test("successful result has imageBytes and correct label", async () => {
  const brief = makeBrief();
  const selected = [makeSelected("A", 0)];
  const primary = makeSuccessProvider("nano-banana-pro");
  const fallback = makeSuccessProvider("nano-banana-2");

  const batch = await runRebuildBatch(brief, selected, primary, fallback);
  const r = batch.results[0];

  assert.equal(r.status, "success");
  assert.equal(r.label, "A");
  assert.ok(r.imageBytes && r.imageBytes.length > 0);
  assert.equal(r.usedFallback, false);
});

// ── Fallback routing ──────────────────────────────────────────────────────────

test("falls back to secondary on RATE_LIMIT from primary", async () => {
  const brief = makeBrief();
  const selected = [makeSelected("A", 0)];
  const primary = makeFailProvider("nano-banana-pro", "RATE_LIMIT");
  const fallback = makeSuccessProvider("nano-banana-2");

  const batch = await runRebuildBatch(brief, selected, primary, fallback);
  const r = batch.results[0];

  assert.equal(r.status, "success");
  assert.equal(r.usedFallback, true);
  assert.ok(r.providerId?.includes("nano-banana-2"));
});

test("falls back to secondary on MODEL_UNAVAILABLE from primary", async () => {
  const brief = makeBrief();
  const selected = [makeSelected("A", 0)];
  const primary = makeFailProvider("nano-banana-pro", "MODEL_UNAVAILABLE");
  const fallback = makeSuccessProvider("nano-banana-2");

  const batch = await runRebuildBatch(brief, selected, primary, fallback);

  assert.equal(batch.results[0].status, "success");
  assert.equal(batch.results[0].usedFallback, true);
});

test("falls back to secondary on TIMEOUT from primary", async () => {
  const brief = makeBrief();
  const selected = [makeSelected("A", 0)];
  const primary = makeFailProvider("nano-banana-pro", "TIMEOUT");
  const fallback = makeSuccessProvider("nano-banana-2");

  const batch = await runRebuildBatch(brief, selected, primary, fallback);

  assert.equal(batch.results[0].status, "success");
  assert.equal(batch.results[0].usedFallback, true);
});

test("does NOT fall back on CONTENT_POLICY — lane fails immediately", async () => {
  const brief = makeBrief();
  const selected = [makeSelected("A", 0)];
  const primary = makeFailProvider("nano-banana-pro", "CONTENT_POLICY");
  const fallback = makeSuccessProvider("nano-banana-2");

  const batch = await runRebuildBatch(brief, selected, primary, fallback);

  assert.equal(batch.results[0].status, "failed");
  assert.equal(batch.results[0].usedFallback, false);
});

test("does NOT fall back on UNKNOWN error — lane fails immediately", async () => {
  const brief = makeBrief();
  const selected = [makeSelected("A", 0)];
  const primary = makeFailProvider("nano-banana-pro", "UNKNOWN");
  const fallback = makeSuccessProvider("nano-banana-2");

  const batch = await runRebuildBatch(brief, selected, primary, fallback);

  assert.equal(batch.results[0].status, "failed");
  assert.equal(batch.results[0].usedFallback, false);
});

test("fails cleanly when both primary and fallback fail with retryable error", async () => {
  const brief = makeBrief();
  const selected = [makeSelected("A", 0)];
  const primary = makeFailProvider("nano-banana-pro", "RATE_LIMIT");
  const fallback = makeFailProvider("nano-banana-2", "RATE_LIMIT");

  const batch = await runRebuildBatch(brief, selected, primary, fallback);

  assert.equal(batch.results[0].status, "failed");
  assert.ok(typeof batch.results[0].error === "string");
});

// ── Multi-lane independence ───────────────────────────────────────────────────

test("each lane is independent — one failure does not block others", async () => {
  const brief = makeBrief();
  const selected = [
    makeSelected("A", 0, "centered_focal_motif"),
    makeSelected("B", 2, "horizon_band"),
    makeSelected("C", 4, "textural_field"),
  ];

  let callCount = 0;
  const primary: RebuildProvider = {
    id: "mixed",
    async generate(_req) {
      callCount++;
      if (callCount === 2) throw new RebuildProviderError("CONTENT_POLICY", "blocked");
      return { imageBytes: Buffer.from("ok"), latencyMs: 100, providerModel: "m", seed: _req.seed };
    },
  };
  const fallback = makeSuccessProvider("nano-banana-2");

  const batch = await runRebuildBatch(brief, selected, primary, fallback);

  assert.equal(batch.results.length, 3);
  assert.equal(batch.results[0].status, "success");
  assert.equal(batch.results[1].status, "failed");  // content policy, no fallback
  assert.equal(batch.results[2].status, "success");
});

// ── Result shape ──────────────────────────────────────────────────────────────

test("result contains totalLatencyMs", async () => {
  const brief = makeBrief();
  const selected = [makeSelected("A", 0)];
  const primary = makeSuccessProvider("p");
  const fallback = makeSuccessProvider("f");

  const batch = await runRebuildBatch(brief, selected, primary, fallback);

  assert.ok(typeof batch.totalLatencyMs === "number" && batch.totalLatencyMs >= 0);
});

test("empty selected list returns empty results", async () => {
  const brief = makeBrief();
  const primary = makeSuccessProvider("p");
  const fallback = makeSuccessProvider("f");

  const batch = await runRebuildBatch(brief, [], primary, fallback);

  assert.equal(batch.results.length, 0);
  assert.equal(batch.successCount, 0);
  assert.equal(batch.failureCount, 0);
});

test("error field is undefined on success", async () => {
  const brief = makeBrief();
  const selected = [makeSelected("A", 0)];
  const primary = makeSuccessProvider("p");
  const fallback = makeSuccessProvider("f");

  const batch = await runRebuildBatch(brief, selected, primary, fallback);

  assert.equal(batch.results[0].error, undefined);
});

// ── Rebuild seed determinism ──────────────────────────────────────────────────

test("primary and fallback use different seeds (no collision)", async () => {
  const brief = makeBrief();
  const selected = [makeSelected("A", 0)];
  const seeds: number[] = [];

  const primary = makeFailProvider("p", "RATE_LIMIT");
  const fallback: RebuildProvider = {
    id: "f",
    async generate(req) {
      seeds.push(req.seed);
      return { imageBytes: Buffer.from("ok"), latencyMs: 10, providerModel: "m", seed: req.seed };
    },
  };

  // We don't check primary seed here (it fails), just that fallback gets a different seed
  const primarySeeds: number[] = [];
  const primaryWithSeedCapture: RebuildProvider = {
    id: "p",
    async generate(req) {
      primarySeeds.push(req.seed);
      throw new RebuildProviderError("RATE_LIMIT", "fail");
    },
  };

  await runRebuildBatch(brief, selected, primaryWithSeedCapture, fallback);

  assert.equal(primarySeeds.length, 1);
  assert.equal(seeds.length, 1);
  assert.notEqual(primarySeeds[0], seeds[0], "fallback should use a different seed than primary");
});
