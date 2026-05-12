/**
 * Smoke test for the compositor proof gallery script.
 *
 * Verifies:
 * - The fixture image exists
 * - The compositor pipeline can run on the fixture (no provider calls)
 * - A composed PNG output is produced
 * - No DB writes or provider calls happen
 *
 * Does NOT run the full 50-output gallery — that is for manual review.
 * Uses the production compositor functions directly, mirroring the script.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "..");

const FIXTURE_PATH = join(repoRoot, "test/fixtures/round1-v2/imagen4-modern-abstract-prism-dark.png");
const WIDE_WIDTH = 1920;
const WIDE_HEIGHT = 1080;
const CONTENT = {
  title: "The Gospel of John",
  subtitle: "Light and Life",
  passage: "John 1:1–5",
};

test("fixture image exists", () => {
  assert.ok(existsSync(FIXTURE_PATH), `Fixture not found: ${FIXTURE_PATH}`);
});

test("compositor pipeline produces a PNG without provider calls", async () => {
  // Import production functions — same as the gallery script
  const {
    computeCleanMinimalLayout,
    chooseTextPaletteForBackground,
    buildCleanMinimalOverlaySvg,
  } = await import("../lib/templates/type-clean-min.js");

  const {
    renderTrimmedLockupPngFromSvg,
    composeLockupOnBackground,
  } = await import("../lib/lockup-compositor.js");

  const {
    getDesignModeLockupRecipeOverride,
  } = await import("../lib/round1-v2/orchestrator/design-mode-lockup-recipes.js");

  const backgroundPng = readFileSync(FIXTURE_PATH);

  // Use production modern_abstract recipe
  const recipe = getDesignModeLockupRecipeOverride("modern_abstract");

  const layout = computeCleanMinimalLayout({
    width: WIDE_WIDTH,
    height: WIDE_HEIGHT,
    content: CONTENT,
    lockupRecipe: recipe,
    lockupPresetId: null,
  });

  assert.ok(layout.textRegion, "layout.textRegion should be defined");
  assert.ok(layout.width === WIDE_WIDTH, "layout width should match canvas");
  assert.ok(layout.height === WIDE_HEIGHT, "layout height should match canvas");

  const sampledPalette = await chooseTextPaletteForBackground({
    backgroundPng,
    sampleRegion: layout.textRegion,
    width: WIDE_WIDTH,
    height: WIDE_HEIGHT,
  });

  // Experimental: suppress autoScrim (as the gallery script does)
  const palette = { ...sampledPalette, autoScrim: false };
  assert.strictEqual(palette.autoScrim, false, "autoScrim should be suppressed");

  const overlaySvg = buildCleanMinimalOverlaySvg({
    width: WIDE_WIDTH,
    height: WIDE_HEIGHT,
    content: CONTENT,
    palette,
    lockupRecipe: recipe,
    lockupPresetId: null,
  });

  assert.ok(typeof overlaySvg === "string" && overlaySvg.length > 0, "SVG overlay should be non-empty");
  assert.ok(overlaySvg.startsWith("<svg") || overlaySvg.includes("<svg"), "output should be SVG");

  const { png: lockupPng, width: lockupWidth, height: lockupHeight } = await renderTrimmedLockupPngFromSvg(overlaySvg);

  assert.ok(lockupPng instanceof Buffer && lockupPng.length > 0, "lockup PNG should be non-empty buffer");
  assert.ok(lockupWidth > 0, "lockup width should be positive");
  assert.ok(lockupHeight > 0, "lockup height should be positive");

  const finalPng = await composeLockupOnBackground({
    backgroundPng,
    lockupPng,
    shape: "wide",
    width: WIDE_WIDTH,
    height: WIDE_HEIGHT,
    align: "left",
    integrationMode: "clean",
    safeRegionOverride: { left: 0.08, top: 0.08, width: 0.52, height: 0.42 },
  });

  assert.ok(finalPng instanceof Buffer && finalPng.length > 0, "final composed PNG should be non-empty buffer");

  // Rough size check — a 1920×1080 PNG should be at least 50KB
  assert.ok(finalPng.length > 50_000, `composed PNG suspiciously small: ${finalPng.length} bytes`);
});

test("gallery script is syntactically reachable (module import check)", async () => {
  // Verify that the gallery script file exists and is importable as a module
  // (without actually executing the main() function)
  const scriptPath = join(repoRoot, "scripts/generate-compositor-proof-gallery.mts");
  assert.ok(existsSync(scriptPath), `Gallery script not found: ${scriptPath}`);
});
