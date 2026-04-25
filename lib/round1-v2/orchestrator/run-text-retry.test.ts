/**
 * Tests for runV2BackgroundTextRetry and textRetrySeed.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { textRetrySeed, runV2BackgroundTextRetry } from "./run-text-retry";
import type { TextRetryInput } from "./run-text-retry";
import type { ScoutEvalResult } from "../eval/evaluate-scout";
import type { ProductionBackgroundValidationEvidence } from "@/lib/production-valid-option";
import type { RebuildProvider, RebuildRequest } from "../providers/rebuild-provider";

// ── Helpers ───────────────────────────────────────────────────────────────────

const FAKE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // stub PNG header

function makeProvider(overrides?: Partial<RebuildProvider>): RebuildProvider {
  return {
    id: "test-provider",
    generate: async (_req: RebuildRequest) => ({
      imageBytes: FAKE_PNG,
      latencyMs: 10,
      providerModel: "test-model",
      seed: _req.seed,
    }),
    ...overrides,
  };
}

function makeScout(): TextRetryInput["scout"] {
  return {
    label: "A" as any,
    slotIndex: 0,
    grammarKey: "centered_focal_motif",
    diversityFamily: "focal",
    compositeScore: 0.7,
    slot: {
      grammarKey: "centered_focal_motif",
      diversityFamily: "focal",
      tone: "neutral" as any,
      motifBinding: ["hope", "light"],
      seed: 12345,
      promptSpec: {},
    } as any,
    result: {} as any,
    eval: {} as any,
  };
}

function makePassingAcceptance() {
  return (_params: { evidence: ProductionBackgroundValidationEvidence }) => ({
    accepted: true,
    invalidReasons: [] as string[],
  });
}

function makeFailingAcceptance(reasons: string[]) {
  return (_params: { evidence: ProductionBackgroundValidationEvidence }) => ({
    accepted: false,
    invalidReasons: reasons,
  });
}

function makeEvalWithRejectReasons(reasons: string[]): () => Promise<ScoutEvalResult> {
  return async (_input: { slot: any; imageBytes: Buffer }) => ({
    hardReject: reasons.length > 0,
    rejectReasons: reasons as any[],
    toneScore: 0.8,
    structureScore: 0.8,
    marginScore: 0.8,
    compositeScore: 0.8,
    imageStats: null,
    textDetected: reasons.includes("text_artifact_detected"),
  });
}

// ── textRetrySeed ─────────────────────────────────────────────────────────────

describe("textRetrySeed", () => {
  it("produces a different seed from the input", () => {
    const seed = 12345;
    const retry = textRetrySeed(seed);
    assert.notEqual(retry, seed);
  });

  it("is deterministic", () => {
    assert.equal(textRetrySeed(12345), textRetrySeed(12345));
  });

  it("stays within unsigned 32-bit range", () => {
    const retry = textRetrySeed(0xdeadbeef);
    assert.ok(retry >= 0);
    assert.ok(retry <= 0xffffffff);
  });
});

// ── runV2BackgroundTextRetry ──────────────────────────────────────────────────

describe("runV2BackgroundTextRetry", () => {
  it("returns accepted when retry passes evaluation", async () => {
    const input: TextRetryInput = {
      scout: makeScout(),
      negativeHints: [],
      primaryProvider: makeProvider(),
      fallbackProvider: makeProvider(),
      retrySeed: textRetrySeed(12345),
      evalFn: makeEvalWithRejectReasons([]), // no rejections
      acceptanceFn: makePassingAcceptance(),
    };

    const result = await runV2BackgroundTextRetry(input);

    assert.equal(result.status, "accepted");
    assert.ok(result.imageBytes, "imageBytes should be set");
    assert.ok(result.backgroundEvidence, "backgroundEvidence should be set");
    assert.equal(result.backgroundEvidence!.textFree, true);
    assert.equal(result.backgroundEvidence!.scaffoldFree, true);
    assert.equal(result.backgroundEvidence!.motifPresent, true);
    assert.equal(result.backgroundEvidence!.toneFit, true);
  });

  it("returns rejected when retry still fails with background_text_detected", async () => {
    const input: TextRetryInput = {
      scout: makeScout(),
      negativeHints: [],
      primaryProvider: makeProvider(),
      fallbackProvider: makeProvider(),
      retrySeed: textRetrySeed(12345),
      evalFn: makeEvalWithRejectReasons(["text_artifact_detected"]),
      acceptanceFn: makeFailingAcceptance(["background_text_detected"]),
    };

    const result = await runV2BackgroundTextRetry(input);

    assert.equal(result.status, "rejected");
    assert.ok(!result.imageBytes, "imageBytes should not be set on rejected");
    assert.deepEqual(result.retryRejectionReasons, ["background_text_detected"]);
    assert.ok(result.backgroundEvidence, "backgroundEvidence should still be set for diagnosis");
    assert.equal(result.backgroundEvidence!.textFree, false);
  });

  it("uses fallback provider when primary throws retryable error", async () => {
    const { RebuildProviderError } = await import("../providers/rebuild-provider");
    let fallbackCalled = false;

    const primary = makeProvider({
      generate: async () => {
        throw new RebuildProviderError("RATE_LIMIT", "rate limit");
      },
    });
    const fallback = makeProvider({
      id: "fallback-provider",
      generate: async (_req) => {
        fallbackCalled = true;
        return { imageBytes: FAKE_PNG, latencyMs: 10, providerModel: "fallback-model", seed: _req.seed };
      },
    });

    const input: TextRetryInput = {
      scout: makeScout(),
      negativeHints: [],
      primaryProvider: primary,
      fallbackProvider: fallback,
      retrySeed: textRetrySeed(12345),
      evalFn: makeEvalWithRejectReasons([]),
      acceptanceFn: makePassingAcceptance(),
    };

    const result = await runV2BackgroundTextRetry(input);

    assert.equal(result.status, "accepted");
    assert.ok(fallbackCalled, "fallback provider should have been called");
    assert.equal(result.usedFallback, true);
  });

  it("returns generation_failed when both providers fail", async () => {
    const { RebuildProviderError } = await import("../providers/rebuild-provider");
    const failProvider = makeProvider({
      generate: async () => {
        throw new RebuildProviderError("RATE_LIMIT", "rate limit");
      },
    });

    const input: TextRetryInput = {
      scout: makeScout(),
      negativeHints: [],
      primaryProvider: failProvider,
      fallbackProvider: failProvider,
      retrySeed: textRetrySeed(12345),
      evalFn: makeEvalWithRejectReasons([]),
      acceptanceFn: makePassingAcceptance(),
    };

    const result = await runV2BackgroundTextRetry(input);

    assert.equal(result.status, "generation_failed");
    assert.ok(result.error, "error message should be set");
  });

  it("does not call retry logic for non-text rejection reasons (verified at orchestrator level)", async () => {
    // This test verifies that when evalFn returns non-text reasons AND acceptanceFn
    // rejects for those reasons, the retry still runs to completion — but the
    // orchestrator is responsible for not calling retry for non-text rejections.
    // Here we just verify that a non-text-detected eval is correctly reflected in evidence.
    const input: TextRetryInput = {
      scout: makeScout(),
      negativeHints: [],
      primaryProvider: makeProvider(),
      fallbackProvider: makeProvider(),
      retrySeed: textRetrySeed(12345),
      evalFn: makeEvalWithRejectReasons(["scaffold_collapse"]),
      acceptanceFn: makeFailingAcceptance(["background_scaffold_check_missing"]),
    };

    const result = await runV2BackgroundTextRetry(input);

    // The retry itself returns "rejected" — the orchestrator is the one that decides
    // not to call this function for non-text-only rejection reasons.
    assert.equal(result.status, "rejected");
    assert.ok(result.backgroundEvidence);
    assert.equal(result.backgroundEvidence!.scaffoldFree, false);
    assert.equal(result.backgroundEvidence!.textFree, true); // no text reason
  });
});
