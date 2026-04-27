import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  canRenderDesignModeLocally,
  renderDesignModeDirectionPreview,
} from "./design-mode-renderer";
import type { DesignMode } from "../design-modes";

const BASE_INPUT = {
  tone: "neutral" as const,
  motifs: ["light", "water"],
  content: { title: "Gospel of John", subtitle: "A study", passage: "John 1" },
  width: 1920,
  height: 1080,
  seed: 1,
};

// ── canRenderDesignModeLocally ───────────────────────────────────────────────

test("canRenderDesignModeLocally returns true for the 4 locally renderable modes", () => {
  assert.equal(canRenderDesignModeLocally("typography_led"), true);
  assert.equal(canRenderDesignModeLocally("minimal_editorial"), true);
  assert.equal(canRenderDesignModeLocally("modern_abstract"), true);
  assert.equal(canRenderDesignModeLocally("graphic_symbol"), true);
});

test("canRenderDesignModeLocally returns false for AI-only modes", () => {
  assert.equal(canRenderDesignModeLocally("cinematic_atmospheric"), false);
  assert.equal(canRenderDesignModeLocally("photo_composite"), false);
  assert.equal(canRenderDesignModeLocally("illustrative_collage"), false);
  assert.equal(canRenderDesignModeLocally("playful_seasonal"), false);
  assert.equal(canRenderDesignModeLocally("retro_print"), false);
});

// ── Renderer output shape ────────────────────────────────────────────────────

test("typography_led renderer returns 3 PNG buffers and honest evidence", async () => {
  const r = await renderDesignModeDirectionPreview({ ...BASE_INPUT, designMode: "typography_led" });
  assert.ok(Buffer.isBuffer(r.backgroundPng));
  assert.ok(Buffer.isBuffer(r.lockupPng));
  assert.ok(Buffer.isBuffer(r.widePng));
  // Background image dimensions should match canvas
  const bgMeta = await sharp(r.backgroundPng).metadata();
  assert.equal(bgMeta.width, BASE_INPUT.width);
  assert.equal(bgMeta.height, BASE_INPUT.height);
  const wideMeta = await sharp(r.widePng).metadata();
  assert.equal(wideMeta.width, BASE_INPUT.width);
  assert.equal(wideMeta.height, BASE_INPUT.height);
  // Evidence: text-free, scaffold-free, tone-fit
  assert.equal(r.backgroundEvidence.textFree, true);
  assert.equal(r.backgroundEvidence.scaffoldFree, true);
  assert.equal(r.backgroundEvidence.toneFit, true);
  assert.equal(r.backgroundEvidence.source, "generated");
  // Debug
  assert.equal(r.debug.renderer, "deterministic_design_mode_v1");
  assert.equal(r.debug.designMode, "typography_led");
  assert.equal(r.debug.noAiBackground, true);
});

test("minimal_editorial renderer uses minimal_editorial_grid background and motifPresent=true (real editorial structure)", async () => {
  const r = await renderDesignModeDirectionPreview({
    ...BASE_INPUT,
    designMode: "minimal_editorial",
  });
  assert.equal(r.debug.backgroundKind, "minimal_editorial_grid");
  // Editorial grid now renders rules + emphasized column + folio label + motif mark.
  assert.equal(r.backgroundEvidence.motifPresent, true);
  assert.match(r.debug.motifPresentReason, /rendered_/);
});

test("modern_abstract renderer uses abstract_blocks background and reports motifPresent=true", async () => {
  const r = await renderDesignModeDirectionPreview({
    ...BASE_INPUT,
    designMode: "modern_abstract",
  });
  assert.equal(r.debug.backgroundKind, "abstract_blocks");
  assert.equal(r.backgroundEvidence.motifPresent, true);
});

test("graphic_symbol renderer uses symbol_plate and motifPresent=true with a light motif", async () => {
  const r = await renderDesignModeDirectionPreview({
    ...BASE_INPUT,
    designMode: "graphic_symbol",
    motifs: ["light"],
  });
  assert.equal(r.debug.backgroundKind, "symbol_plate");
  assert.equal(r.backgroundEvidence.motifPresent, true);
  assert.equal(r.debug.motifUsed, "light");
});

test("graphic_symbol renderer with water motif uses water-shape vector mark", async () => {
  const r = await renderDesignModeDirectionPreview({
    ...BASE_INPUT,
    designMode: "graphic_symbol",
    motifs: ["water"],
  });
  assert.equal(r.debug.motifUsed, "water");
  assert.equal(r.debug.backgroundKind, "symbol_plate");
});

test("graphic_symbol renderer with vine motif works", async () => {
  const r = await renderDesignModeDirectionPreview({
    ...BASE_INPUT,
    designMode: "graphic_symbol",
    motifs: ["vine"],
  });
  assert.equal(r.debug.motifUsed, "vine");
});

test("graphic_symbol renderer with doorway motif works", async () => {
  const r = await renderDesignModeDirectionPreview({
    ...BASE_INPUT,
    designMode: "graphic_symbol",
    motifs: ["doorway"],
  });
  assert.equal(r.debug.motifUsed, "doorway");
});

test("graphic_symbol renderer with no motifs falls back to generic shape", async () => {
  const r = await renderDesignModeDirectionPreview({
    ...BASE_INPUT,
    designMode: "graphic_symbol",
    motifs: [],
  });
  assert.equal(r.debug.motifUsed, null);
  // Even without a motif, the symbol plate is rendered (generic circle/frame fallback)
  assert.equal(r.debug.backgroundKind, "symbol_plate");
});

// ── Output is deterministic ──────────────────────────────────────────────────

test("renderer is deterministic for same inputs (same byte length and metadata)", async () => {
  const a = await renderDesignModeDirectionPreview({ ...BASE_INPUT, designMode: "typography_led" });
  const b = await renderDesignModeDirectionPreview({ ...BASE_INPUT, designMode: "typography_led" });
  assert.equal(a.backgroundPng.length, b.backgroundPng.length);
  assert.deepEqual(a.debug.paletteUsed, b.debug.paletteUsed);
});

// ── Throws for unsupported mode ──────────────────────────────────────────────

test("renderer throws for unsupported mode (cinematic_atmospheric)", async () => {
  await assert.rejects(
    () =>
      renderDesignModeDirectionPreview({
        ...BASE_INPUT,
        designMode: "cinematic_atmospheric" as DesignMode,
      }),
    /not locally renderable/
  );
});
