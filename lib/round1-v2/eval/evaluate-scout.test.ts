import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { computeScoutImageStats, detectTextArtifact } from "./image-stats";
import { evaluateScout } from "./evaluate-scout";
import type { ScoutSlot } from "../orchestrator/build-scout-plan";
import { GRAMMAR_BANK } from "../grammars";

// ── Synthetic image factories ─────────────────────────────────────────────────

async function solidColorBuffer(r: number, g: number, b: number, w = 64, h = 64): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r, g, b } } })
    .png()
    .toBuffer();
}

// Alternating-stripe pattern: sharp transitions every 4 rows so gradient magnitude
// (|lum_down - lum_up|) routinely exceeds the V1 EDGE_MAGNITUDE_THRESHOLD of 68.
async function gradientBuffer(w = 64, h = 64): Promise<Buffer> {
  const pixels = Buffer.alloc(w * h * 3);
  const STRIPE = 4;
  for (let y = 0; y < h; y++) {
    const v = Math.floor(y / STRIPE) % 2 === 0 ? 30 : 210;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      pixels[i] = v; pixels[i + 1] = v; pixels[i + 2] = v;
    }
  }
  return sharp(pixels, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

function makeSlot(grammarKey: keyof typeof GRAMMAR_BANK, tone: import("../grammars").TonalVariant): ScoutSlot {
  const grammar = GRAMMAR_BANK[grammarKey];
  return {
    grammarKey,
    diversityFamily: grammar.diversityFamily,
    tone,
    motifBinding: ["light"],
    seed: 99,
    promptSpec: { template: grammar.scoutPromptTemplate, motifBinding: ["light"], tone, negativeHints: [] },
  };
}

// ── computeScoutImageStats ────────────────────────────────────────────────────

test("computeScoutImageStats returns non-null for a valid image", async () => {
  const img = await solidColorBuffer(128, 128, 128);
  const stats = await computeScoutImageStats(img);
  assert.ok(stats !== null);
});

test("solid gray image has low std dev and low edge density", async () => {
  const img = await solidColorBuffer(128, 128, 128);
  const stats = await computeScoutImageStats(img);
  assert.ok(stats);
  assert.ok(stats.luminanceStdDev < 5, `std dev should be ~0 for solid image, got ${stats.luminanceStdDev}`);
  assert.ok(stats.edgeDensity < 0.01, `edge density should be ~0 for solid image, got ${stats.edgeDensity}`);
});

test("bright white image has high mean luminance", async () => {
  const img = await solidColorBuffer(240, 240, 240);
  const stats = await computeScoutImageStats(img);
  assert.ok(stats);
  assert.ok(stats.meanLuminance > 200, `expected high luminance, got ${stats.meanLuminance}`);
});

test("dark image has low mean luminance", async () => {
  const img = await solidColorBuffer(20, 20, 20);
  const stats = await computeScoutImageStats(img);
  assert.ok(stats);
  assert.ok(stats.meanLuminance < 30, `expected low luminance, got ${stats.meanLuminance}`);
});

test("gradient image has high std dev and edge density", async () => {
  const img = await gradientBuffer();
  const stats = await computeScoutImageStats(img);
  assert.ok(stats);
  assert.ok(stats.luminanceStdDev > 20, `expected high std dev, got ${stats.luminanceStdDev}`);
  assert.ok(stats.edgeDensity > 0.01, `expected edges in gradient, got ${stats.edgeDensity}`);
});

test("saturated red image has high saturation", async () => {
  const img = await solidColorBuffer(220, 20, 20);
  const stats = await computeScoutImageStats(img);
  assert.ok(stats);
  assert.ok(stats.meanSaturation > 100, `expected high saturation, got ${stats.meanSaturation}`);
});

test("computeScoutImageStats returns null for invalid bytes", async () => {
  const stats = await computeScoutImageStats(Buffer.from("not-an-image"));
  assert.equal(stats, null);
});

// ── detectTextArtifact ────────────────────────────────────────────────────────

test("detectTextArtifact returns false for solid color image (no text)", async () => {
  const img = await solidColorBuffer(180, 170, 160);
  const detected = await detectTextArtifact(img);
  assert.equal(detected, false);
});

test("detectTextArtifact returns false for half-split image (design structure, no text)", async () => {
  // Top half light, bottom half dark — one clean edge band, not text-like
  const w = 64, h = 64;
  const pixels = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    const v = y < h / 2 ? 200 : 50;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      pixels[i] = v; pixels[i + 1] = v; pixels[i + 2] = v;
    }
  }
  const img = await sharp(pixels, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  const detected = await detectTextArtifact(img);
  assert.equal(detected, false, "single-horizon image should not be detected as text");
});

test("detectTextArtifact fails open (returns false) for invalid bytes", async () => {
  const detected = await detectTextArtifact(Buffer.from("garbage"));
  assert.equal(detected, false);
});

// ── evaluateScout ─────────────────────────────────────────────────────────────

test("solid gray image is hard-rejected as scaffold_collapse", async () => {
  const img = await solidColorBuffer(128, 128, 128);
  const slot = makeSlot("centered_focal_motif", "neutral");
  const result = await evaluateScout({ slot, imageBytes: img });
  assert.equal(result.hardReject, true);
  assert.ok(
    result.rejectReasons.includes("scaffold_collapse") || result.rejectReasons.includes("design_presence_absent"),
    `expected scaffold/design_absence, got: ${result.rejectReasons.join(", ")}`
  );
});

test("gradient image passes design presence for neutral tone", async () => {
  const img = await gradientBuffer();
  const slot = makeSlot("layered_atmospheric", "neutral");
  const result = await evaluateScout({ slot, imageBytes: img });
  assert.ok(!result.rejectReasons.includes("scaffold_collapse"), "should not be scaffold");
  assert.ok(!result.rejectReasons.includes("design_presence_absent"), "should have design presence");
});

test("dark image is hard-rejected for light tone", async () => {
  const img = await solidColorBuffer(30, 30, 30);
  const slot = makeSlot("centered_focal_motif", "light");
  const result = await evaluateScout({ slot, imageBytes: img });
  assert.equal(result.hardReject, true);
  assert.ok(result.rejectReasons.includes("tone_implausible"), `expected tone_implausible, got: ${result.rejectReasons.join(", ")}`);
});

test("bright white image passes light tone check", async () => {
  const img = await gradientBuffer(64, 64);
  // Build a bright variant
  // Cool neutral white — avoids sepia hue range so LIGHT_MAX_SEPIA_LIKELIHOOD passes
  const brightImg = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 210, g: 215, b: 230 } } })
    .png().toBuffer();
  const slot = makeSlot("centered_focal_motif", "light");
  const result = await evaluateScout({ slot, imageBytes: brightImg });
  // May still reject if std dev too low, but tone should not be the reason
  assert.ok(!result.rejectReasons.includes("tone_implausible"), `tone should pass for bright image`);
});

test("compositeScore is 0 for hard-rejected scout", async () => {
  const img = await solidColorBuffer(128, 128, 128);
  const slot = makeSlot("centered_focal_motif", "neutral");
  const result = await evaluateScout({ slot, imageBytes: img });
  assert.equal(result.hardReject, true);
  assert.equal(result.compositeScore, 0);
});

test("eval result always has required fields", async () => {
  const img = await gradientBuffer();
  const slot = makeSlot("horizon_band", "neutral");
  const result = await evaluateScout({ slot, imageBytes: img });
  assert.ok(typeof result.hardReject === "boolean");
  assert.ok(Array.isArray(result.rejectReasons));
  assert.ok(typeof result.toneScore === "number");
  assert.ok(typeof result.structureScore === "number");
  assert.ok(typeof result.marginScore === "number");
  assert.ok(typeof result.compositeScore === "number");
  assert.ok(result.compositeScore >= 0 && result.compositeScore <= 1, `score out of range: ${result.compositeScore}`);
});
