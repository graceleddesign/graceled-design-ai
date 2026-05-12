/**
 * Fixture composition replay for the Imagen 4 modern_abstract lane.
 *
 * Uses the saved raw prism/refraction plate as a background and runs the
 * EXACT same compositor code path that an accepted V2 Imagen 4 lane uses
 * (computeCleanMinimalLayout → chooseTextPaletteForBackground →
 *  buildCleanMinimalOverlaySvg → renderTrimmedLockupPngFromSvg →
 *  composeLockupOnBackground), with the modern_abstract lockup recipe from
 * getDesignModeLockupRecipeOverride("modern_abstract").
 *
 * Makes no provider calls. Writes nothing to the database.
 *
 * Usage:
 *   node --import tsx scripts/replay-imagen4-modern-abstract-composition.mts [fixturePath]
 *
 *   fixturePath  Optional path to a PNG background plate.
 *                Default: test/fixtures/round1-v2/imagen4-modern-abstract-prism-dark.png
 *
 * Output:
 *   tmp/imagen4-fixture-composition/wide-final.png   — composed 1920×1080 wide preview
 *   tmp/imagen4-fixture-composition/wide-bg.png      — raw background (copy of fixture)
 *   tmp/imagen4-fixture-composition/lockup.png       — trimmed lockup PNG
 *
 * What is reused from production:
 *   - computeCleanMinimalLayout   (lib/templates/type-clean-min.ts)
 *   - chooseTextPaletteForBackground  (lib/templates/type-clean-min.ts)
 *   - buildCleanMinimalOverlaySvg (lib/templates/type-clean-min.ts)
 *   - renderTrimmedLockupPngFromSvg   (lib/lockup-compositor.ts)
 *   - composeLockupOnBackground   (lib/lockup-compositor.ts)
 *   - getDesignModeLockupRecipeOverride("modern_abstract")  (design-mode-lockup-recipes.ts)
 *   - shouldSuppressAutoScrim("modern_abstract")            (design-mode-lockup-recipes.ts)
 *   - WIDE_WIDTH=1920, WIDE_HEIGHT=1080
 *
 * What is approximated:
 *   - Brief uses a hardcoded "The Gospel of John" mock instead of a real project.
 *   - No lockupPresetId DB lookup — lockupPresetId passed as null (same as the
 *     orchestrator when no preset is found for the mode).
 *   - No Asset DB rows are created.
 *   - No Generation DB record is written.
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "..");

// ── Args ──────────────────────────────────────────────────────────────────────

const DEFAULT_FIXTURE = join(repoRoot, "test/fixtures/round1-v2/imagen4-modern-abstract-prism-dark.png");
const fixturePath = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : DEFAULT_FIXTURE;

// ── Imports (mirrors the dynamic imports inside runRoundOneV2) ────────────────

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
  shouldSuppressAutoScrim,
} = await import("../lib/round1-v2/orchestrator/design-mode-lockup-recipes.js");

// ── Constants (match orchestrator) ───────────────────────────────────────────

const WIDE_WIDTH = 1920;
const WIDE_HEIGHT = 1080;

// ── Mock brief (The Gospel of John) ──────────────────────────────────────────

const content = {
  title: "The Gospel of John",
  subtitle: "Light and Life",
  passage: "John 1:1–5",
};

// ── Load fixture ──────────────────────────────────────────────────────────────

let backgroundPng: Buffer;
try {
  backgroundPng = readFileSync(fixturePath);
} catch {
  console.error(`Could not read fixture: ${fixturePath}`);
  process.exit(1);
}

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║   Imagen 4 Modern Abstract — Fixture Composition Replay      ║");
console.log("╚══════════════════════════════════════════════════════════════╝\n");
console.log(`  Background : ${fixturePath}`);
console.log(`  Brief      : "${content.title}" / "${content.subtitle}" / ${content.passage}`);
console.log(`  Canvas     : ${WIDE_WIDTH}×${WIDE_HEIGHT}`);
console.log();

// ── Composition (exact production path) ──────────────────────────────────────

// 1. Lockup recipe — modern_abstract override (same call as orchestrator line 532–537)
const fullRecipeOverride = getDesignModeLockupRecipeOverride("modern_abstract");
const suppressScrim = shouldSuppressAutoScrim("modern_abstract"); // false for modern_abstract

console.log(`  Recipe     : ${JSON.stringify(fullRecipeOverride)}`);
console.log(`  suppressScrim: ${suppressScrim}`);
console.log();

// 2. Layout — same call as orchestrator line 539–545
const wideLayout = computeCleanMinimalLayout({
  width: WIDE_WIDTH,
  height: WIDE_HEIGHT,
  content,
  lockupRecipe: fullRecipeOverride,
  lockupPresetId: null,
});
console.log(`  Layout textRegion: ${JSON.stringify(wideLayout.textRegion)}`);

// 3. Palette — same call as orchestrator line 546–554
const sampledPalette = await chooseTextPaletteForBackground({
  backgroundPng,
  sampleRegion: wideLayout.textRegion,
  width: WIDE_WIDTH,
  height: WIDE_HEIGHT,
});
const widePalette = suppressScrim ? { ...sampledPalette, autoScrim: false } : sampledPalette;
console.log(`  Palette    : primary=${widePalette.primary} autoScrim=${widePalette.autoScrim} safeVariant=${widePalette.safeVariantApplied}`);

// 4. Lockup SVG — same call as orchestrator line 555–562
const wideLockupSvg = buildCleanMinimalOverlaySvg({
  width: WIDE_WIDTH,
  height: WIDE_HEIGHT,
  content,
  palette: widePalette,
  lockupRecipe: fullRecipeOverride,
  lockupPresetId: null,
});

// 5. Render lockup PNG — same call as orchestrator line 563
console.log("\n  Rendering lockup PNG from SVG...");
const { png: lockupPng } = await renderTrimmedLockupPngFromSvg(wideLockupSvg);
console.log(`  Lockup     : ${lockupPng.byteLength} bytes`);

// 6. Compose — same call as orchestrator line 564–572
console.log("  Compositing lockup onto background...");
const wideFinalPng = await composeLockupOnBackground({
  backgroundPng,
  lockupPng,
  shape: "wide",
  width: WIDE_WIDTH,
  height: WIDE_HEIGHT,
  align: "left",         // matches fullRecipeOverride.alignment
  integrationMode: "clean", // clean default (grid_lock from getDesignModeLockupRecipe is V1 path; override takes precedence)
});
console.log(`  Composed   : ${wideFinalPng.byteLength} bytes`);

// ── Write output ──────────────────────────────────────────────────────────────

const outDir = join(repoRoot, "tmp/imagen4-fixture-composition");
mkdirSync(outDir, { recursive: true });

const bgOutPath    = join(outDir, "wide-bg.png");
const lockupOutPath = join(outDir, "lockup.png");
const finalOutPath = join(outDir, "wide-final.png");

writeFileSync(bgOutPath, backgroundPng);
writeFileSync(lockupOutPath, lockupPng);
writeFileSync(finalOutPath, wideFinalPng);

// ── Report ────────────────────────────────────────────────────────────────────

console.log("\n── Output ───────────────────────────────────────────────────────");
console.log(`  Background (copy) : ${bgOutPath}`);
console.log(`  Lockup PNG        : ${lockupOutPath}`);
console.log(`  ✓ Wide final      : ${finalOutPath}`);
console.log(`\n  Open ${finalOutPath} to inspect the composed direction preview.\n`);
