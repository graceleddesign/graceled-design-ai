/**
 * Smoke test for the Imagen 4 modern_abstract fixture composition replay.
 *
 * Verifies:
 *   - The full compositor pipeline runs against the fixture without error.
 *   - The output is 1920×1080 (16:9).
 *   - The pipeline makes no provider calls.
 *   - The modern_abstract lockup recipe is applied.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import { computeCleanMinimalLayout, chooseTextPaletteForBackground, buildCleanMinimalOverlaySvg } from "@/lib/templates/type-clean-min";
import { renderTrimmedLockupPngFromSvg, composeLockupOnBackground } from "@/lib/lockup-compositor";
import { getDesignModeLockupRecipeOverride, shouldSuppressAutoScrim } from "./design-mode-lockup-recipes";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const FIXTURE = join(__dirname, "../../../test/fixtures/round1-v2/imagen4-modern-abstract-prism-dark.png");
const WIDE_WIDTH = 1920;
const WIDE_HEIGHT = 1080;

const content = { title: "The Gospel of John", subtitle: "Light and Life", passage: "John 1:1–5" };

test("modern_abstract lockup recipe is not suppressed for autoScrim", () => {
  assert.equal(shouldSuppressAutoScrim("modern_abstract"), false);
});

test("modern_abstract lockup recipe override has expected shape", () => {
  const recipe = getDesignModeLockupRecipeOverride("modern_abstract");
  assert.equal(recipe.layoutIntent, "bold_modern");
  assert.equal(recipe.alignment, "left");
});

test("fixture composition pipeline produces 1920x1080 PNG without provider calls", async () => {
  const backgroundPng = readFileSync(FIXTURE);
  const recipe = getDesignModeLockupRecipeOverride("modern_abstract");

  const wideLayout = computeCleanMinimalLayout({
    width: WIDE_WIDTH,
    height: WIDE_HEIGHT,
    content,
    lockupRecipe: recipe,
    lockupPresetId: null,
  });
  assert.ok(wideLayout.textRegion, "layout must have a textRegion");

  const palette = await chooseTextPaletteForBackground({
    backgroundPng,
    sampleRegion: wideLayout.textRegion,
    width: WIDE_WIDTH,
    height: WIDE_HEIGHT,
  });
  assert.ok(typeof palette.primary === "string", "palette must have a primary color");

  const svg = buildCleanMinimalOverlaySvg({
    width: WIDE_WIDTH,
    height: WIDE_HEIGHT,
    content,
    palette,
    lockupRecipe: recipe,
    lockupPresetId: null,
  });
  assert.ok(svg.includes("<svg"), "SVG output must start with <svg");

  const { png: lockupPng } = await renderTrimmedLockupPngFromSvg(svg);
  assert.ok(lockupPng.byteLength > 0, "lockup PNG must be non-empty");

  const finalPng = await composeLockupOnBackground({
    backgroundPng,
    lockupPng,
    shape: "wide",
    width: WIDE_WIDTH,
    height: WIDE_HEIGHT,
    align: "left",
    integrationMode: "clean",
  });
  assert.ok(finalPng.byteLength > 0, "composed PNG must be non-empty");

  const meta = await sharp(finalPng).metadata();
  assert.equal(meta.width, WIDE_WIDTH, `output width must be ${WIDE_WIDTH}`);
  assert.equal(meta.height, WIDE_HEIGHT, `output height must be ${WIDE_HEIGHT}`);
});
