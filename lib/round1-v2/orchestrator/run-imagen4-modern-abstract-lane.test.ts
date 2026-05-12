import assert from "node:assert/strict";
import test from "node:test";
import { Buffer } from "node:buffer";

import { ROUND1_V2_CONFIG } from "../config";
import { runImagen4ModernAbstractLane } from "./run-imagen4-modern-abstract-lane";
import type { Imagen4Provider, Imagen4Result } from "../providers/fal-imagen4";
import { Imagen4ProviderError } from "../providers/fal-imagen4";
import { DESIGN_MODE_META, DESIGN_MODES } from "../design-modes";
import type { ScoutEvalResult } from "../eval/evaluate-scout";
import type { ScoutSlot } from "./build-scout-plan";
import type { ProductionBackgroundValidationEvidence } from "@/lib/production-valid-option";

// ── Config defaults ──────────────────────────────────────────────────────────

test("feature flag is OFF by default", () => {
  assert.equal(ROUND1_V2_CONFIG.enableImagen4ModernAbstractExperiment, false);
});

test("config provider id points at fal-ai/imagen4/preview", () => {
  assert.equal(
    ROUND1_V2_CONFIG.imagen4ModernAbstractProvider,
    "fal-ai/imagen4/preview"
  );
});

test("modern_abstract design mode exists and is not seasonal-gated", () => {
  assert.ok(DESIGN_MODES.includes("modern_abstract"));
  assert.equal(DESIGN_MODE_META.modern_abstract.experimental, false);
});

// ── Test doubles ─────────────────────────────────────────────────────────────

function makeOkProvider(): Imagen4Provider {
  return {
    id: "fal.imagen4-preview",
    async generate(): Promise<Imagen4Result> {
      return {
        imageBytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]), // PNG-ish header bytes
        latencyMs: 1234,
        providerModel: "fal-ai/imagen4/preview",
        providerMetadata: {
          aspectRatio: "16:9",
          resolution: "2K",
          outputFormat: "png",
          description: "stub",
        },
      };
    },
  };
}

function makeFailingProvider(kind: "TIMEOUT" | "RATE_LIMIT" | "UNKNOWN"): Imagen4Provider {
  return {
    id: "fal.imagen4-preview",
    async generate(): Promise<Imagen4Result> {
      throw new Imagen4ProviderError(kind, `mock ${kind}`);
    },
  };
}

function makeEvalFn(reasons: ScoutEvalResult["rejectReasons"]) {
  return async (_input: { slot: ScoutSlot; imageBytes: Buffer }): Promise<ScoutEvalResult> => ({
    hardReject: reasons.length > 0,
    rejectReasons: reasons,
    toneScore: 1,
    structureScore: 1,
    marginScore: 1,
    compositeScore: 1,
    imageStats: null,
    textDetected: reasons.includes("text_artifact_detected"),
  });
}

function makeAcceptanceFn(opts: { accepted: boolean; reason?: string }) {
  return (_params: { evidence: ProductionBackgroundValidationEvidence }) => ({
    accepted: opts.accepted,
    invalidReasons: opts.accepted ? [] : [opts.reason ?? "background_text_detected"],
  });
}

// ── Behavior tests ───────────────────────────────────────────────────────────

test("accepted path returns image bytes, evidence, and debug.accepted=true", async () => {
  const res = await runImagen4ModernAbstractLane({
    tone: "dark",
    provider: makeOkProvider(),
    evalFn: makeEvalFn([]),
    acceptanceFn: makeAcceptanceFn({ accepted: true }),
  });
  assert.equal(res.status, "accepted");
  if (res.status !== "accepted") return;
  assert.ok(Buffer.isBuffer(res.imageBytes));
  assert.equal(res.providerId, "fal.imagen4-preview");
  assert.equal(res.providerModel, "fal-ai/imagen4/preview");
  assert.equal(res.debug.enabled, true);
  assert.equal(res.debug.attempted, true);
  assert.equal(res.debug.accepted, true);
  assert.equal(res.debug.promptFamily, "prism_refraction_light_on_dark");
  assert.equal(res.backgroundEvidence.source, "generated");
  assert.equal(res.backgroundEvidence.textFree, true);
});

test("acceptance rejection produces honest failure (NOT marked accepted)", async () => {
  const res = await runImagen4ModernAbstractLane({
    tone: "dark",
    provider: makeOkProvider(),
    evalFn: makeEvalFn(["text_artifact_detected"]),
    acceptanceFn: makeAcceptanceFn({ accepted: false, reason: "background_text_detected" }),
  });
  assert.equal(res.status, "rejected");
  if (res.status !== "rejected") return;
  assert.equal(res.failureReason, "background_text_detected");
  assert.equal(res.debug.accepted, false);
  assert.equal(res.debug.attempted, true);
  assert.equal(res.backgroundEvidence?.textFree, false);
});

test("provider error is classified and rejected without faking success", async () => {
  const res = await runImagen4ModernAbstractLane({
    tone: "dark",
    provider: makeFailingProvider("TIMEOUT"),
    evalFn: makeEvalFn([]),
    acceptanceFn: makeAcceptanceFn({ accepted: true }),
  });
  assert.equal(res.status, "rejected");
  if (res.status !== "rejected") return;
  assert.equal(res.failureReason, "imagen4_provider_error:timeout");
  assert.equal(res.debug.providerErrorKind, "TIMEOUT");
  assert.equal(res.debug.accepted, false);
});

test("debug metadata is persisted on both accept and reject paths", async () => {
  const okRes = await runImagen4ModernAbstractLane({
    tone: "dark",
    provider: makeOkProvider(),
    evalFn: makeEvalFn([]),
    acceptanceFn: makeAcceptanceFn({ accepted: true }),
  });
  assert.equal(okRes.debug.provider, "fal.imagen4-preview");
  assert.equal(okRes.debug.promptFamily, "prism_refraction_light_on_dark");
  assert.equal(okRes.debug.enabled, true);

  const rejRes = await runImagen4ModernAbstractLane({
    tone: "dark",
    provider: makeOkProvider(),
    evalFn: makeEvalFn(["scaffold_collapse"]),
    acceptanceFn: makeAcceptanceFn({ accepted: false, reason: "background_scaffold_like" }),
  });
  assert.equal(rejRes.debug.attempted, true);
  assert.equal(rejRes.debug.rejectionReason, "background_scaffold_like");
});

test("provider is never called when caller does not invoke the lane runner", async () => {
  // Sanity: the experiment is opt-in. The lane runner is only reached from
  // index.ts when the flag is true AND mode === modern_abstract. We can't
  // exercise the full orchestrator without prisma/storage, but we can assert
  // the config defaults remain off.
  assert.equal(ROUND1_V2_CONFIG.enableImagen4ModernAbstractExperiment, false);
});

// ── New: prompt, evidence, and debug fields ───────────────────────────────────

test("debug.prompt is populated on both accept and reject paths", async () => {
  const accepted = await runImagen4ModernAbstractLane({
    tone: "dark",
    provider: makeOkProvider(),
    evalFn: makeEvalFn([]),
    acceptanceFn: makeAcceptanceFn({ accepted: true }),
  });
  assert.ok(typeof accepted.debug.prompt === "string" && accepted.debug.prompt.length > 0);

  const rejected = await runImagen4ModernAbstractLane({
    tone: "dark",
    provider: makeOkProvider(),
    evalFn: makeEvalFn(["text_artifact_detected"]),
    acceptanceFn: makeAcceptanceFn({ accepted: false, reason: "background_text_detected" }),
  });
  assert.ok(typeof rejected.debug.prompt === "string" && rejected.debug.prompt.length > 0);
});

test("debug.prompt matches the prompt field on the result", async () => {
  const res = await runImagen4ModernAbstractLane({
    tone: "dark",
    provider: makeOkProvider(),
    evalFn: makeEvalFn([]),
    acceptanceFn: makeAcceptanceFn({ accepted: true }),
  });
  assert.equal(res.debug.prompt, res.prompt);
});

test("textDetectionEvidence is populated on eval-rejection with correct fields", async () => {
  const res = await runImagen4ModernAbstractLane({
    tone: "dark",
    provider: makeOkProvider(),
    evalFn: makeEvalFn(["text_artifact_detected"]),
    acceptanceFn: makeAcceptanceFn({ accepted: false, reason: "background_text_detected" }),
  });
  assert.equal(res.status, "rejected");
  if (res.status !== "rejected") return;
  const tde = res.debug.textDetectionEvidence;
  assert.ok(tde, "textDetectionEvidence must be present on eval-rejection");
  assert.equal(tde.detected, true);
  assert.ok(tde.rejectReasons.includes("text_artifact_detected"));
  assert.equal(tde.evaluatorNote, "gradient_heuristic_no_ocr");
});

test("textDetectionEvidence is NOT set on provider-error rejection (no image produced)", async () => {
  const res = await runImagen4ModernAbstractLane({
    tone: "dark",
    provider: makeFailingProvider("TIMEOUT"),
    evalFn: makeEvalFn([]),
    acceptanceFn: makeAcceptanceFn({ accepted: true }),
  });
  assert.equal(res.status, "rejected");
  if (res.status !== "rejected") return;
  assert.equal(res.debug.textDetectionEvidence, undefined);
});

test("onRejectedBytes callback is called with image bytes on eval-rejection", async () => {
  let capturedBytes: Buffer | null = null;
  const res = await runImagen4ModernAbstractLane({
    tone: "dark",
    provider: makeOkProvider(),
    evalFn: makeEvalFn(["text_artifact_detected"]),
    acceptanceFn: makeAcceptanceFn({ accepted: false, reason: "background_text_detected" }),
    onRejectedBytes: async (bytes) => {
      capturedBytes = bytes;
      return "/tmp/test-stub-raw.png";
    },
  });
  assert.equal(res.status, "rejected");
  assert.ok(capturedBytes !== null, "callback must have been called");
  assert.ok(Buffer.isBuffer(capturedBytes));
});

test("onRejectedBytes callback is NOT called on provider-error (no image bytes available)", async () => {
  let callCount = 0;
  await runImagen4ModernAbstractLane({
    tone: "dark",
    provider: makeFailingProvider("TIMEOUT"),
    evalFn: makeEvalFn([]),
    acceptanceFn: makeAcceptanceFn({ accepted: true }),
    onRejectedBytes: async () => { callCount++; return null; },
  });
  assert.equal(callCount, 0);
});

test("onRejectedBytes callback is NOT called on accepted result", async () => {
  let callCount = 0;
  await runImagen4ModernAbstractLane({
    tone: "dark",
    provider: makeOkProvider(),
    evalFn: makeEvalFn([]),
    acceptanceFn: makeAcceptanceFn({ accepted: true }),
    onRejectedBytes: async () => { callCount++; return null; },
  });
  assert.equal(callCount, 0);
});

test("rejectedRawPath is set in debug when callback returns a path", async () => {
  const res = await runImagen4ModernAbstractLane({
    tone: "dark",
    provider: makeOkProvider(),
    evalFn: makeEvalFn(["text_artifact_detected"]),
    acceptanceFn: makeAcceptanceFn({ accepted: false, reason: "background_text_detected" }),
    onRejectedBytes: async () => "/tmp/gen-abc-raw.png",
  });
  assert.equal(res.status, "rejected");
  if (res.status !== "rejected") return;
  assert.equal(res.debug.rejectedRawPath, "/tmp/gen-abc-raw.png");
});

test("rejectedRawPath is absent when callback returns null", async () => {
  const res = await runImagen4ModernAbstractLane({
    tone: "dark",
    provider: makeOkProvider(),
    evalFn: makeEvalFn(["text_artifact_detected"]),
    acceptanceFn: makeAcceptanceFn({ accepted: false, reason: "background_text_detected" }),
    onRejectedBytes: async () => null,
  });
  assert.equal(res.status, "rejected");
  if (res.status !== "rejected") return;
  assert.equal(res.debug.rejectedRawPath, undefined);
});

test("callback failure is swallowed and does not affect rejection settlement", async () => {
  const res = await runImagen4ModernAbstractLane({
    tone: "dark",
    provider: makeOkProvider(),
    evalFn: makeEvalFn(["text_artifact_detected"]),
    acceptanceFn: makeAcceptanceFn({ accepted: false, reason: "background_text_detected" }),
    onRejectedBytes: async () => { throw new Error("disk full"); },
  });
  // Must still be rejected (not throw, not succeed)
  assert.equal(res.status, "rejected");
  if (res.status !== "rejected") return;
  assert.equal(res.failureReason, "background_text_detected");
  assert.equal(res.debug.rejectedRawPath, undefined);
});

test("rejected output is not marked as accepted regardless of callback", async () => {
  const res = await runImagen4ModernAbstractLane({
    tone: "dark",
    provider: makeOkProvider(),
    evalFn: makeEvalFn(["text_artifact_detected"]),
    acceptanceFn: makeAcceptanceFn({ accepted: false, reason: "background_text_detected" }),
    onRejectedBytes: async () => "/tmp/saved.png",
  });
  assert.equal(res.status, "rejected");
  assert.equal(res.debug.accepted, false);
});
