import assert from "node:assert/strict";
import test from "node:test";
import { buildScoutPlan } from "./build-scout-plan";
import { runScoutBatch } from "./run-scout-batch";
import { selectScouts } from "./select-scouts";
import { runRebuildBatch } from "./run-rebuild-batch";
import type { ScoutProvider, ScoutRequest, ScoutResult } from "../providers/scout-provider";
import type { RebuildProvider, RebuildRequest, RebuildResult } from "../providers/rebuild-provider";
import { RebuildProviderError } from "../providers/rebuild-provider";
import { evaluateScout } from "../eval/evaluate-scout";
import type { ScoutEvalResult } from "../eval/evaluate-scout";
import { GRAMMAR_BANK } from "../grammars";

// ── Stub providers ─────────────────────────────────────────────────────────────

const STUB_IMAGE = Buffer.alloc(64, 0x80); // 64 bytes of 0x80, passes image stats

function makeScoutProvider(mode: "success" | "fail"): ScoutProvider {
  return {
    id: `stub-scout-${mode}`,
    async generate(_req: ScoutRequest): Promise<ScoutResult> {
      if (mode === "fail") throw new Error("scout-fail");
      return {
        imageBytes: STUB_IMAGE,
        latencyMs: 100,
        providerModel: "stub-flux",
        seed: _req.seed,
      };
    },
  };
}

function makeRebuildProvider(mode: "success" | "fail", kind?: RebuildProviderError["kind"]): RebuildProvider {
  return {
    id: `stub-rebuild-${mode}`,
    async generate(_req: RebuildRequest): Promise<RebuildResult> {
      if (mode === "fail") throw new RebuildProviderError(kind ?? "RATE_LIMIT", "stub fail");
      return {
        imageBytes: STUB_IMAGE,
        latencyMs: 200,
        providerModel: "stub-rebuild",
        seed: _req.seed,
      };
    },
  };
}

// Deterministic passthrough eval — accepts any non-null imageBytes
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

function makeRejectEval(): ScoutEvalResult {
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

// ── Stage integration: scout → select → rebuild ───────────────────────────────

test("successful pipeline: 9 scouts → select A/B/C → 3 rebuilds succeed", async () => {
  const plan = buildScoutPlan({ runSeed: "test-seed-1", tone: "neutral", motifs: ["light"], negativeHints: [] });
  assert.equal(plan.slots.length, 9);

  const scoutBatch = await runScoutBatch(plan, makeScoutProvider("success"));
  assert.equal(scoutBatch.successCount, 9);

  // Use stub evals (passing) to avoid sharp image processing in unit tests
  const evals = scoutBatch.results.map(() => makePassingEval());
  const selection = selectScouts(plan, scoutBatch.results, evals);

  assert.equal(selection.selected.length, 3);
  assert.equal(selection.shortfall, false);
  const labels = selection.selected.map((s) => s.label).sort();
  assert.deepEqual(labels, ["A", "B", "C"]);

  // All selected have distinct grammar keys (greedy selection policy)
  const grammarKeys = selection.selected.map((s) => s.grammarKey);
  const uniqueGrammarKeys = new Set(grammarKeys);
  assert.equal(uniqueGrammarKeys.size, 3, "selection should prefer distinct grammar keys");

  const brief = { title: "Test", subtitle: null, scripturePassages: null, toneTarget: "neutral" as const, motifs: [], negativeHints: [], styleIntent: null, topicalContext: null };
  const rebuildBatch = await runRebuildBatch(brief, selection.selected, makeRebuildProvider("success"), makeRebuildProvider("success"));

  assert.equal(rebuildBatch.results.length, 3);
  assert.equal(rebuildBatch.successCount, 3);
  assert.equal(rebuildBatch.failureCount, 0);

  for (let i = 0; i < rebuildBatch.results.length; i++) {
    const r = rebuildBatch.results[i];
    assert.equal(r.status, "success");
    assert.ok(r.imageBytes && r.imageBytes.length > 0);
    assert.equal(r.label, selection.selected[i].label);
  }
});

test("shortfall=3: all scouts fail → no selection", async () => {
  const plan = buildScoutPlan({ runSeed: "test-seed-2", tone: "neutral", motifs: [], negativeHints: [] });

  const scoutBatch = await runScoutBatch(plan, makeScoutProvider("fail"));
  assert.equal(scoutBatch.successCount, 0);
  assert.equal(scoutBatch.failureCount, 9);

  const evals = scoutBatch.results.map(() => makeRejectEval());
  const selection = selectScouts(plan, scoutBatch.results, evals);

  assert.equal(selection.selected.length, 0);
  assert.equal(selection.shortfall, true);
  assert.equal(selection.shortfallCount, 3);
});

test("shortfall=1: 8 scouts pass → select 3, rebuild produces 3", async () => {
  const plan = buildScoutPlan({ runSeed: "test-seed-3", tone: "neutral", motifs: [], negativeHints: [] });

  // First scout fails, rest succeed
  let callCount = 0;
  const mixedScoutProvider: ScoutProvider = {
    id: "mixed",
    async generate(_req: ScoutRequest): Promise<ScoutResult> {
      callCount++;
      if (callCount === 1) throw new Error("first-fail");
      return { imageBytes: STUB_IMAGE, latencyMs: 50, providerModel: "m", seed: _req.seed };
    },
  };

  const scoutBatch = await runScoutBatch(plan, mixedScoutProvider);
  assert.equal(scoutBatch.successCount, 8);

  const evals = scoutBatch.results.map((r) =>
    r.status === "failed" ? makeRejectEval() : makePassingEval()
  );
  const selection = selectScouts(plan, scoutBatch.results, evals);

  assert.equal(selection.selected.length, 3);
  assert.equal(selection.shortfall, false);

  const brief = { title: "X", subtitle: null, scripturePassages: null, toneTarget: "neutral" as const, motifs: [], negativeHints: [], styleIntent: null, topicalContext: null };
  const rebuildBatch = await runRebuildBatch(brief, selection.selected, makeRebuildProvider("success"), makeRebuildProvider("success"));
  assert.equal(rebuildBatch.successCount, 3);
});

test("rebuild partial failure: one lane content-policy blocks, others succeed", async () => {
  const plan = buildScoutPlan({ runSeed: "test-seed-4", tone: "neutral", motifs: [], negativeHints: [] });
  const scoutBatch = await runScoutBatch(plan, makeScoutProvider("success"));
  const evals = scoutBatch.results.map(() => makePassingEval());
  const selection = selectScouts(plan, scoutBatch.results, evals);
  assert.equal(selection.selected.length, 3);

  let rebuildCallCount = 0;
  const mixedRebuildPrimary: RebuildProvider = {
    id: "mixed-primary",
    async generate(_req: RebuildRequest): Promise<RebuildResult> {
      rebuildCallCount++;
      if (rebuildCallCount === 2) throw new RebuildProviderError("CONTENT_POLICY", "blocked");
      return { imageBytes: STUB_IMAGE, latencyMs: 100, providerModel: "m", seed: _req.seed };
    },
  };

  const brief = { title: "X", subtitle: null, scripturePassages: null, toneTarget: "neutral" as const, motifs: [], negativeHints: [], styleIntent: null, topicalContext: null };
  const rebuildBatch = await runRebuildBatch(brief, selection.selected, mixedRebuildPrimary, makeRebuildProvider("success"));

  assert.equal(rebuildBatch.results.length, 3);
  // Lane A (index 0): success
  assert.equal(rebuildBatch.results[0].status, "success");
  // Lane B (index 1): CONTENT_POLICY → no fallback → failed
  assert.equal(rebuildBatch.results[1].status, "failed");
  assert.equal(rebuildBatch.results[1].usedFallback, false);
  // Lane C (index 2): success
  assert.equal(rebuildBatch.results[2].status, "success");

  assert.equal(rebuildBatch.successCount, 2);
  assert.equal(rebuildBatch.failureCount, 1);
});

test("rebuild retryable failure: primary RATE_LIMIT → fallback succeeds → usedFallback=true", async () => {
  const plan = buildScoutPlan({ runSeed: "test-seed-5", tone: "neutral", motifs: [], negativeHints: [] });
  const scoutBatch = await runScoutBatch(plan, makeScoutProvider("success"));
  const evals = scoutBatch.results.map(() => makePassingEval());
  const selection = selectScouts(plan, scoutBatch.results, evals);

  const brief = { title: "Grace", subtitle: null, scripturePassages: null, toneTarget: "neutral" as const, motifs: [], negativeHints: [], styleIntent: null, topicalContext: null };
  const rebuildBatch = await runRebuildBatch(
    brief,
    selection.selected,
    makeRebuildProvider("fail", "RATE_LIMIT"),
    makeRebuildProvider("success")
  );

  for (const r of rebuildBatch.results) {
    assert.equal(r.status, "success", `lane ${r.label} should succeed via fallback`);
    assert.equal(r.usedFallback, true);
  }
});

test("scout plan has correct count and grammar diversity", () => {
  const plan = buildScoutPlan({ runSeed: "diversity-test", tone: "light", motifs: ["hope", "cross"], negativeHints: [] });

  assert.equal(plan.slots.length, 9);
  assert.equal(plan.tone, "light");

  // Each slot has a valid grammar key
  for (const slot of plan.slots) {
    assert.ok(slot.grammarKey in GRAMMAR_BANK, `grammarKey ${slot.grammarKey} must be in GRAMMAR_BANK`);
    assert.equal(slot.tone, "light");
    assert.ok(slot.seed > 0, "seed must be positive");
  }

  // Plan covers distinct diversity families
  const families = new Set(plan.slots.map((s) => s.diversityFamily));
  assert.ok(families.size >= 3, `should have >= 3 distinct families, got ${families.size}`);
});

test("selection labels are deterministic given same runSeed", () => {
  const plan = buildScoutPlan({ runSeed: "determinism-test", tone: "neutral", motifs: [], negativeHints: [] });
  const evals1 = plan.slots.map(() => makePassingEval());
  const evals2 = plan.slots.map(() => makePassingEval());

  // We need results — simulate success for all slots
  const results = plan.slots.map((slot) => ({
    slot,
    prompt: "p",
    status: "success" as const,
    imageBytes: STUB_IMAGE,
    latencyMs: 100,
  }));

  const sel1 = selectScouts(plan, results, evals1);
  const sel2 = selectScouts(plan, results, evals2);

  assert.deepEqual(
    sel1.selected.map((s) => s.slotIndex),
    sel2.selected.map((s) => s.slotIndex)
  );
});
