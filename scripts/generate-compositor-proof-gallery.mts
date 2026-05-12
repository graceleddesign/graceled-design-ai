/**
 * scripts/generate-compositor-proof-gallery.mts
 *
 * LOCAL COMPOSITOR PROOF GALLERY — Typography Lockup Evaluation
 *
 * No provider calls. No DB writes. No production behavior changes.
 *
 * Goal: Evaluate whether the local compositor can produce at least one
 * "Gospel of John" wide design where typography feels intentionally designed
 * rather than pasted on. Surfaces the autoScrim / shadow-box problem and
 * tests treatments that avoid it.
 *
 * Usage:
 *   node --import tsx scripts/generate-compositor-proof-gallery.mts
 *
 * Output: tmp/compositor-proof-gallery/<timestamp>/
 *   - <id>.png       — composed 1920×1080 wide outputs
 *   - gallery.html   — visual contact sheet with metadata
 *
 * --- What is production code vs. experimental ---
 *
 * PRODUCTION (unchanged):
 *   computeCleanMinimalLayout, chooseTextPaletteForBackground,
 *   buildCleanMinimalOverlaySvg, renderTrimmedLockupPngFromSvg,
 *   composeLockupOnBackground, getDesignModeLockupRecipeOverride,
 *   shouldSuppressAutoScrim, getLockupPresetById
 *
 * EXPERIMENTAL (local to this script only, no production change):
 *   - suppressAutoScrim: forces { ...palette, autoScrim: false } after sampling.
 *     This removes the localized dark rectangle (rgba(0,0,0,0.28)) that renders
 *     behind the title. The palette override is done in this script, not in the
 *     production compositor or renderer.
 *   - forceWhitePalette: forces { primary: "#F8FAFC", secondary: "#E2E8F0", ... }
 *     regardless of what the sampler returns. For treatments targeting dark bgs.
 *   - safeRegionOverride: passes custom placement ratios to composeLockupOnBackground
 *     so we can anchor lockups to upper/lower portions of the image rather than
 *     always centering in the default safe region.
 *   - generateSyntheticBackground: creates gradient/solid PNGs via sharp SVG for
 *     testing additional background types without paid generation.
 *   - Custom LockupRecipe literals (designed_plate family) defined locally.
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import type { LockupRecipe } from "@/lib/design-brief";
import type { LockupIntegrationMode, LockupSafeRegionRatio } from "@/lib/lockup-compositor";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "..");

// ── Production imports ────────────────────────────────────────────────────────

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

const { getLockupPresetById } = await import("../lib/lockups/presets.js");

// ── Constants ─────────────────────────────────────────────────────────────────

const WIDE_WIDTH = 1920;
const WIDE_HEIGHT = 1080;
const CONTENT = {
  title: "The Gospel of John",
  subtitle: "Light and Life",
  passage: "John 1:1–5",
};

const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = join(repoRoot, `tmp/compositor-proof-gallery/${timestamp}`);
mkdirSync(outDir, { recursive: true });

// ── Types ──────────────────────────────────────────────────────────────────────

type TreatmentFamily =
  | "direct_editorial_serif"
  | "minimal_label"
  | "monumental_split"
  | "designed_plate"
  | "modern_abstract_integrated";

type TreatmentSpec = {
  id: string;
  family: TreatmentFamily;
  label: string;
  lockupRecipe: LockupRecipe;
  lockupPresetId: string | null;
  integrationMode: LockupIntegrationMode;
  align: "left" | "center" | "right";
  suppressAutoScrim: boolean;
  forceWhitePalette: boolean;
  safeRegionOverride?: LockupSafeRegionRatio;
  isProductionPath: boolean;
  scrimUsed: boolean;
  notes: string;
};

type Background = {
  id: string;
  label: string;
  path: string | null;
  syntheticType?: "dark_gradient" | "light_minimal";
  bgClass: "dark_abstract" | "dark_gradient" | "light_minimal";
};

// ── Safe region overrides (EXPERIMENTAL) ──────────────────────────────────────
// Production default wide region: { left: 0.09, top: 0.12, width: 0.5, height: 0.7 }
// (centers lockup vertically within the region)

const UPPER_LEFT_REGION: LockupSafeRegionRatio = {
  left: 0.08,
  top: 0.08,
  width: 0.52,
  height: 0.42,
};

const LOWER_LEFT_REGION: LockupSafeRegionRatio = {
  left: 0.08,
  top: 0.58,
  width: 0.52,
  height: 0.34,
};

const LOWER_CENTER_REGION: LockupSafeRegionRatio = {
  left: 0.15,
  top: 0.60,
  width: 0.70,
  height: 0.34,
};

// ── Treatment family specs ─────────────────────────────────────────────────────

function buildTreatmentSpecs(): TreatmentSpec[] {
  // Production recipes from design-mode-lockup-recipes.ts
  const modernAbstractRecipe = getDesignModeLockupRecipeOverride("modern_abstract");
  const minimalEditorialRecipe = getDesignModeLockupRecipeOverride("minimal_editorial");
  const cinematicRecipe = getDesignModeLockupRecipeOverride("cinematic_atmospheric");

  // Production presets
  const editorialSerifPreset = getLockupPresetById("editorial_serif_stack");
  const highContrastPreset = getLockupPresetById("high_contrast_serif");

  // EXPERIMENTAL: local recipe for designed plate — not in production
  // Compact title, intentional bottom-left placement, pairs with plate integration.
  const designedPlateRecipe: LockupRecipe = {
    layoutIntent: "photographic_titleplate",
    titleTreatment: "singleline",
    hierarchy: { titleScale: 1.2, subtitleScale: 0.5, tracking: 0.04, case: "upper" },
    alignment: "left",
    placement: { anchor: "bottom_left", safeMarginPct: 0.06, maxTitleWidthPct: 0.50 },
    titleSizeClamp: { wide: { minPx: 64, maxPx: 110 } },
    ornament: { kind: "rule_dot", weight: "thin" },
  };

  // EXPERIMENTAL: monumental split variant with bottom anchor
  const monumentalSplitBottomRecipe: LockupRecipe = {
    ...modernAbstractRecipe,
    placement: { ...modernAbstractRecipe.placement, anchor: "bottom_left" },
  };

  // EXPERIMENTAL: editorial serif with bottom anchor for variety
  const editorialSerifBottomRecipe: LockupRecipe = {
    ...editorialSerifPreset,
    placement: { ...editorialSerifPreset.placement, anchor: "bottom_left" },
  };

  return [
    // ─── 1. Direct editorial serif ──────────────────────────────────────────
    // Production: editorial_serif_stack preset, clean integration
    // Experimental: suppressAutoScrim removes the localized dark rect behind text
    {
      id: "1a_editorial_serif_topleft",
      family: "direct_editorial_serif",
      label: "1A · Editorial Serif — Top Left",
      lockupRecipe: editorialSerifPreset,
      lockupPresetId: "editorial_serif_stack",
      integrationMode: "clean",
      align: "left",
      suppressAutoScrim: true,
      forceWhitePalette: false,
      safeRegionOverride: UPPER_LEFT_REGION,
      isProductionPath: false, // suppressAutoScrim is experimental
      scrimUsed: false,
      notes:
        "Production editorial_serif_stack recipe; clean integration; autoScrim suppressed (experimental). " +
        "Large serif title, careful top-left placement in quiet zone. No box.",
    },
    {
      id: "1b_editorial_serif_bottomleft",
      family: "direct_editorial_serif",
      label: "1B · Editorial Serif — Bottom Left",
      lockupRecipe: editorialSerifBottomRecipe,
      lockupPresetId: "editorial_serif_stack",
      integrationMode: "clean",
      align: "left",
      suppressAutoScrim: true,
      forceWhitePalette: false,
      safeRegionOverride: LOWER_LEFT_REGION,
      isProductionPath: false,
      scrimUsed: false,
      notes:
        "Same recipe; bottom-left anchor variant. Lower safe region override. No box.",
    },
    {
      id: "1c_high_contrast_serif",
      family: "direct_editorial_serif",
      label: "1C · High Contrast Serif — Cinematic Recipe",
      lockupRecipe: cinematicRecipe,
      lockupPresetId: null,
      integrationMode: "clean",
      align: "left",
      suppressAutoScrim: true,
      forceWhitePalette: false,
      safeRegionOverride: UPPER_LEFT_REGION,
      isProductionPath: false,
      scrimUsed: false,
      notes:
        "Production cinematic_atmospheric recipe; bold stacked; autoScrim suppressed. " +
        "Tests whether the cinematic recipe reads editorial without its scrim.",
    },

    // ─── 2. Minimal label ────────────────────────────────────────────────────
    // Production: minimal_editorial recipe + shouldSuppressAutoScrim = true
    // This IS the production path for minimal_editorial mode.
    {
      id: "2a_minimal_label",
      family: "minimal_label",
      label: "2A · Minimal Label — Upper Left",
      lockupRecipe: minimalEditorialRecipe,
      lockupPresetId: null,
      integrationMode: "clean",
      align: "left",
      suppressAutoScrim: true, // shouldSuppressAutoScrim("minimal_editorial") = true (production)
      forceWhitePalette: false,
      safeRegionOverride: UPPER_LEFT_REGION,
      isProductionPath: true,
      scrimUsed: false,
      notes:
        "Production minimal_editorial recipe; scrim suppression is production behavior. " +
        "Small singleline title, generous negative space, no box.",
    },

    // ─── 3. Monumental split title ───────────────────────────────────────────
    // Production: modern_abstract recipe override (titleScale 1.8, split treatment)
    // Experimental: suppressAutoScrim — modern_abstract does not suppress by default
    {
      id: "3a_monumental_split_topleft",
      family: "monumental_split",
      label: "3A · Monumental Split — Upper Left",
      lockupRecipe: modernAbstractRecipe,
      lockupPresetId: null,
      integrationMode: "clean",
      align: "left",
      suppressAutoScrim: true,
      forceWhitePalette: false,
      safeRegionOverride: UPPER_LEFT_REGION,
      isProductionPath: false,
      scrimUsed: false,
      notes:
        "Production modern_abstract recipe (split, titleScale 1.8); autoScrim suppressed (experimental). " +
        "Large title broken across lines, upper-left zone.",
    },
    {
      id: "3b_monumental_split_bottomleft",
      family: "monumental_split",
      label: "3B · Monumental Split — Bottom Left",
      lockupRecipe: monumentalSplitBottomRecipe,
      lockupPresetId: null,
      integrationMode: "clean",
      align: "left",
      suppressAutoScrim: true,
      forceWhitePalette: false,
      safeRegionOverride: LOWER_LEFT_REGION,
      isProductionPath: false,
      scrimUsed: false,
      notes:
        "Modern abstract recipe with bottom_left anchor override. Lower safe region.",
    },

    // ─── 4. Designed plate treatment ─────────────────────────────────────────
    // Production: plate integration mode renders a rounded-rect backdrop
    // Key: compact recipe + bottom-left anchor = plate feels like a deliberate
    // design panel, not a generic centered shadow box.
    {
      id: "4a_designed_plate_bottomleft",
      family: "designed_plate",
      label: "4A · Designed Plate — Bottom Left Panel",
      lockupRecipe: designedPlateRecipe,
      lockupPresetId: null,
      integrationMode: "plate",
      align: "left",
      suppressAutoScrim: false, // plate IS the intentional design element
      forceWhitePalette: false,
      safeRegionOverride: LOWER_LEFT_REGION,
      isProductionPath: true, // plate integration is production
      scrimUsed: true,
      notes:
        "Intentional plate/panel at bottom-left. Compact singleline recipe. " +
        "Production plate mode (rounded-rect, 32% opacity). Plate is designed, not incidental.",
    },
    {
      id: "4b_designed_plate_lowercenter",
      family: "designed_plate",
      label: "4B · Designed Plate — Lower Center",
      lockupRecipe: designedPlateRecipe,
      lockupPresetId: null,
      integrationMode: "plate",
      align: "center",
      suppressAutoScrim: false,
      forceWhitePalette: false,
      safeRegionOverride: LOWER_CENTER_REGION,
      isProductionPath: true,
      scrimUsed: true,
      notes:
        "Same designed plate recipe; lower-center anchor. Tests plate at bottom of composition.",
    },

    // ─── 5. Modern abstract integrated ───────────────────────────────────────
    // Specifically for dark geometric backgrounds.
    // Experimental: suppressAutoScrim + forceWhitePalette + clean integration.
    // No hard shadow box at all — type sits directly on background.
    {
      id: "5a_modern_abstract_topleft",
      family: "modern_abstract_integrated",
      label: "5A · Modern Abstract Integrated — Upper Left",
      lockupRecipe: modernAbstractRecipe,
      lockupPresetId: null,
      integrationMode: "clean",
      align: "left",
      suppressAutoScrim: true,
      forceWhitePalette: true,
      safeRegionOverride: UPPER_LEFT_REGION,
      isProductionPath: false,
      scrimUsed: false,
      notes:
        "Modern abstract recipe; clean integration; white palette forced; no scrim. " +
        "Full experimental. Type sits directly on dark geometric background.",
    },
    {
      id: "5b_modern_abstract_bottomleft",
      family: "modern_abstract_integrated",
      label: "5B · Modern Abstract Integrated — Bottom Left",
      lockupRecipe: monumentalSplitBottomRecipe,
      lockupPresetId: null,
      integrationMode: "clean",
      align: "left",
      suppressAutoScrim: true,
      forceWhitePalette: true,
      safeRegionOverride: LOWER_LEFT_REGION,
      isProductionPath: false,
      scrimUsed: false,
      notes:
        "Modern abstract recipe with bottom_left anchor; white forced; no box.",
    },
  ];
}

// ── Background definitions ─────────────────────────────────────────────────────

const BACKGROUND_DEFS: Background[] = [
  {
    id: "prism_dark",
    label: "Imagen 4: Modern Abstract Prism Dark (fixture)",
    path: join(repoRoot, "test/fixtures/round1-v2/imagen4-modern-abstract-prism-dark.png"),
    bgClass: "dark_abstract",
  },
  {
    id: "prism_refraction",
    label: "Imagen 4: Geometric Keyart — Prism Refraction",
    path: join(
      repoRoot,
      "tmp/imagen4-geometric-keyart-spike/2026-05-11T15-27-05/output-3-prism_refraction.png"
    ),
    bgClass: "dark_abstract",
  },
  {
    id: "threshold_doorway",
    label: "Imagen 4: Geometric Keyart — Threshold Doorway",
    path: join(
      repoRoot,
      "tmp/imagen4-geometric-keyart-spike/2026-05-11T15-27-05/output-2-threshold_doorway.png"
    ),
    bgClass: "dark_abstract",
  },
  {
    id: "dark_gradient",
    label: "Synthetic: Deep Navy Gradient",
    path: null,
    syntheticType: "dark_gradient",
    bgClass: "dark_gradient",
  },
  {
    id: "light_minimal",
    label: "Synthetic: Light Warm Minimal",
    path: null,
    syntheticType: "light_minimal",
    bgClass: "light_minimal",
  },
];

// ── Synthetic background generator (EXPERIMENTAL) ─────────────────────────────

async function generateSyntheticBackground(
  type: "dark_gradient" | "light_minimal",
  width: number,
  height: number
): Promise<Buffer> {
  let svg: string;
  if (type === "dark_gradient") {
    svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
      "<defs>",
      `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`,
      `<stop offset="0%" stop-color="#070b13"/>`,
      `<stop offset="55%" stop-color="#0f1825"/>`,
      `<stop offset="100%" stop-color="#18202e"/>`,
      "</linearGradient>",
      `<radialGradient id="accent" cx="72%" cy="30%" r="48%">`,
      `<stop offset="0%" stop-color="#1a2d4a" stop-opacity="0.9"/>`,
      `<stop offset="100%" stop-color="#070b13" stop-opacity="0"/>`,
      "</radialGradient>",
      "</defs>",
      `<rect width="${width}" height="${height}" fill="url(#g)"/>`,
      `<rect width="${width}" height="${height}" fill="url(#accent)"/>`,
      "</svg>",
    ].join("");
  } else {
    svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
      "<defs>",
      `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">`,
      `<stop offset="0%" stop-color="#f8f4ec"/>`,
      `<stop offset="100%" stop-color="#ece7de"/>`,
      "</linearGradient>",
      "</defs>",
      `<rect width="${width}" height="${height}" fill="url(#g)"/>`,
      `<line x1="0" y1="${Math.round(height * 0.87)}" x2="${width}" y2="${Math.round(height * 0.87)}" stroke="#ccc4b4" stroke-width="1" opacity="0.45"/>`,
      "</svg>",
    ].join("");
  }
  return sharp(Buffer.from(svg), { failOn: "none" }).png().toBuffer();
}

// ── Load or generate a background PNG ─────────────────────────────────────────

async function loadBackground(bg: Background): Promise<Buffer | null> {
  if (bg.path !== null) {
    if (!existsSync(bg.path)) {
      console.warn(`  ⚠ Background not found, skipping: ${bg.path}`);
      return null;
    }
    return readFileSync(bg.path);
  }
  if (bg.syntheticType) {
    return generateSyntheticBackground(bg.syntheticType, WIDE_WIDTH, WIDE_HEIGHT);
  }
  return null;
}

// ── White palette override (EXPERIMENTAL) ─────────────────────────────────────

function makeWhitePalette(base: Awaited<ReturnType<typeof chooseTextPaletteForBackground>>) {
  return {
    ...base,
    primary: "#F8FAFC",
    secondary: "#E2E8F0",
    tertiary: "#CBD5E1",
    rule: "#E2E8F0",
    accent: "#F8FAFC",
    autoScrim: false,
  };
}

// ── Result record ─────────────────────────────────────────────────────────────

type CompositeResult = {
  outputId: string;
  pngFilename: string;
  bgId: string;
  bgLabel: string;
  treatment: TreatmentSpec;
  autoScrimSampled: boolean;
  autoScrimApplied: boolean;
  paletteMode: "sampled" | "white_forced";
  success: boolean;
  error?: string;
};

// ── Core compositor pipeline ──────────────────────────────────────────────────

async function runCompositor(
  backgroundPng: Buffer,
  bg: Background,
  treatment: TreatmentSpec
): Promise<{ png: Buffer; autoScrimSampled: boolean; autoScrimApplied: boolean; paletteMode: string }> {
  // Step 1: Layout (production)
  const layout = computeCleanMinimalLayout({
    width: WIDE_WIDTH,
    height: WIDE_HEIGHT,
    content: CONTENT,
    lockupRecipe: treatment.lockupRecipe,
    lockupPresetId: treatment.lockupPresetId,
  });

  // Step 2: Palette sampling (production)
  const sampledPalette = await chooseTextPaletteForBackground({
    backgroundPng,
    sampleRegion: layout.textRegion,
    width: WIDE_WIDTH,
    height: WIDE_HEIGHT,
  });

  const autoScrimSampled = sampledPalette.autoScrim;

  // Step 3: Apply experimental overrides
  let palette = sampledPalette;
  let paletteMode: "sampled" | "white_forced" = "sampled";

  if (treatment.forceWhitePalette) {
    // EXPERIMENTAL: force white text for dark backgrounds
    palette = makeWhitePalette(sampledPalette);
    paletteMode = "white_forced";
  } else if (treatment.suppressAutoScrim) {
    // EXPERIMENTAL: keep sampled colors, just remove the scrim rect
    palette = { ...sampledPalette, autoScrim: false };
  }

  const autoScrimApplied = palette.autoScrim;

  // Step 4: Build SVG overlay (production)
  const overlaySvg = buildCleanMinimalOverlaySvg({
    width: WIDE_WIDTH,
    height: WIDE_HEIGHT,
    content: CONTENT,
    palette,
    lockupRecipe: treatment.lockupRecipe,
    lockupPresetId: treatment.lockupPresetId,
  });

  // Step 5: Render lockup PNG (production)
  const { png: lockupPng } = await renderTrimmedLockupPngFromSvg(overlaySvg);

  // Step 6: Compose on background (production)
  const finalPng = await composeLockupOnBackground({
    backgroundPng,
    lockupPng,
    shape: "wide",
    width: WIDE_WIDTH,
    height: WIDE_HEIGHT,
    align: treatment.align,
    integrationMode: treatment.integrationMode,
    safeRegionOverride: treatment.safeRegionOverride,
  });

  return { png: finalPng, autoScrimSampled, autoScrimApplied, paletteMode };
}

// ── HTML gallery generation ────────────────────────────────────────────────────

function buildHtml(results: CompositeResult[], relativeOutDir: string): string {
  const successResults = results.filter((r) => r.success);
  const familyOrder: TreatmentFamily[] = [
    "direct_editorial_serif",
    "minimal_label",
    "monumental_split",
    "designed_plate",
    "modern_abstract_integrated",
  ];
  const familyLabels: Record<TreatmentFamily, string> = {
    direct_editorial_serif: "1 · Direct Editorial Serif",
    minimal_label: "2 · Minimal Label",
    monumental_split: "3 · Monumental Split Title",
    designed_plate: "4 · Designed Plate Treatment",
    modern_abstract_integrated: "5 · Modern Abstract Integrated",
  };

  const rows = successResults
    .map((r) => {
      const scrimBadge = r.autoScrimApplied
        ? `<span style="color:#ef4444;font-size:11px">⬛ scrim applied</span>`
        : `<span style="color:#22c55e;font-size:11px">✓ no scrim</span>`;
      const prodBadge = r.treatment.isProductionPath
        ? `<span style="background:#1e3a5f;color:#93c5fd;padding:1px 5px;border-radius:3px;font-size:10px">PROD</span>`
        : `<span style="background:#3b2a00;color:#fbbf24;padding:1px 5px;border-radius:3px;font-size:10px">EXP</span>`;
      return `
    <div style="margin-bottom:40px;border:1px solid #2d3748;border-radius:6px;overflow:hidden">
      <a href="${r.pngFilename}" target="_blank">
        <img src="${r.pngFilename}" style="width:100%;display:block" alt="${r.treatment.label}"/>
      </a>
      <div style="padding:12px 14px;background:#111827;font-family:monospace;font-size:12px;line-height:1.6;color:#e2e8f0">
        <div style="font-size:13px;font-weight:600;color:#f8fafc;margin-bottom:6px">${r.treatment.label}</div>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="color:#94a3b8;padding-right:12px;white-space:nowrap">Background</td><td>${r.bgLabel}</td></tr>
          <tr><td style="color:#94a3b8;padding-right:12px">Family</td><td>${familyLabels[r.treatment.family]}</td></tr>
          <tr><td style="color:#94a3b8;padding-right:12px">Integration</td><td>${r.treatment.integrationMode} · align ${r.treatment.align}</td></tr>
          <tr><td style="color:#94a3b8;padding-right:12px">Scrim sampled</td><td>${r.autoScrimSampled ? "yes" : "no"} → ${scrimBadge}</td></tr>
          <tr><td style="color:#94a3b8;padding-right:12px">Palette</td><td>${r.paletteMode} ${prodBadge}</td></tr>
          <tr><td style="color:#94a3b8;padding-right:12px">Plate used</td><td>${r.treatment.scrimUsed ? "yes (intentional)" : "no"}</td></tr>
          <tr><td style="color:#94a3b8;padding-right:12px">Notes</td><td style="color:#94a3b8">${r.treatment.notes}</td></tr>
        </table>
      </div>
    </div>`;
    })
    .join("\n");

  const checklist = `
  <div style="margin-top:60px;padding:24px;background:#0f172a;border:1px solid #2d3748;border-radius:8px;font-family:monospace">
    <h2 style="color:#f8fafc;margin:0 0 16px;font-size:16px">Self-Evaluation Checklist</h2>
    <p style="color:#94a3b8;font-size:13px;margin-bottom:20px">
      Review each question honestly before marking the gallery complete.
    </p>
    <ol style="color:#e2e8f0;font-size:13px;line-height:2;margin:0;padding-left:20px">
      <li><strong>Does ANY single output look like a real church design team made it?</strong><br>
        <span style="color:#94a3b8">→ Look for: confident type scale, intentional placement, visual integration with background.</span></li>
      <li style="margin-top:10px"><strong>Which treatment family worked best for each background type?</strong><br>
        <span style="color:#94a3b8">→ Compare dark_abstract, dark_gradient, light_minimal side by side.</span></li>
      <li style="margin-top:10px"><strong>Does the typography feel integrated with the image, or pasted on?</strong><br>
        <span style="color:#94a3b8">→ Does the text respond to the background's tonal zones and geometry?</span></li>
      <li style="margin-top:10px"><strong>Is there a default shadow/scrim box problem?</strong><br>
        <span style="color:#94a3b8">→ Check outputs where "scrim sampled: yes" but "no scrim applied" — does removing it help?</span></li>
      <li style="margin-top:10px"><strong>Does the best result feel connected to the sermon series?</strong><br>
        <span style="color:#94a3b8">→ "The Gospel of John · Light and Life" — does any output evoke that?</span></li>
      <li style="margin-top:10px"><strong>What is the gap between the best output and designer-grade?</strong><br>
        <span style="color:#94a3b8">→ Font quality? Letter spacing? Placement precision? Color harmony? Overall hierarchy?</span></li>
    </ol>
    <div style="margin-top:20px;padding:12px;background:#1e293b;border-radius:4px;color:#fbbf24;font-size:12px">
      <strong>Honest negative result protocol:</strong> If none of the ${successResults.length} outputs meet the bar of
      "visually defensible as a sermon series direction a church team could have produced," that is a meaningful
      finding — not a script failure. Record the gap honestly.
    </div>
  </div>`;

  // Build family sections for cleaner navigation
  const toc = familyOrder
    .map((f) => {
      const count = successResults.filter((r) => r.treatment.family === f).length;
      return `<a href="#${f}" style="color:#93c5fd;text-decoration:none;margin-right:16px">${familyLabels[f]} (${count})</a>`;
    })
    .join("");

  const sections = familyOrder
    .map((f) => {
      const familyResults = successResults.filter((r) => r.treatment.family === f);
      if (familyResults.length === 0) return "";
      const items = familyResults
        .map((r) => {
          const scrimBadge = r.autoScrimApplied
            ? `<span style="color:#ef4444">⬛ scrim</span>`
            : `<span style="color:#22c55e">✓ clean</span>`;
          const prodBadge = r.treatment.isProductionPath
            ? `<span style="background:#1e3a5f;color:#93c5fd;padding:1px 5px;border-radius:3px;font-size:10px">PROD</span>`
            : `<span style="background:#3b2a00;color:#fbbf24;padding:1px 5px;border-radius:3px;font-size:10px">EXP</span>`;
          return `
      <div style="margin-bottom:32px;border:1px solid #1e293b;border-radius:6px;overflow:hidden">
        <a href="${r.pngFilename}" target="_blank">
          <img src="${r.pngFilename}" style="width:100%;display:block" loading="lazy" alt="${r.treatment.label}"/>
        </a>
        <div style="padding:10px 14px;background:#0f172a;font-family:monospace;font-size:11px;line-height:1.7;color:#e2e8f0">
          <div style="font-size:12px;font-weight:600;color:#f8fafc;margin-bottom:4px">${r.treatment.label} ${prodBadge}</div>
          <div style="color:#94a3b8">BG: ${r.bgLabel}</div>
          <div>Scrim sampled: ${r.autoScrimSampled ? "yes" : "no"} → ${scrimBadge} &nbsp;|&nbsp; ${r.treatment.integrationMode} · ${r.treatment.align} · ${r.paletteMode}</div>
          <div style="color:#64748b;margin-top:4px">${r.treatment.notes}</div>
        </div>
      </div>`;
        })
        .join("\n");
      return `
    <h2 id="${f}" style="color:#f8fafc;margin:40px 0 16px;font-size:16px;border-bottom:1px solid #1e293b;padding-bottom:8px">
      ${familyLabels[f]}
    </h2>
    ${items}`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Compositor Proof Gallery — ${timestamp}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #090e1a; color: #e2e8f0; font-family: system-ui, sans-serif; }
    .header { padding: 24px 32px; border-bottom: 1px solid #1e293b; }
    .header h1 { margin: 0 0 4px; font-size: 20px; color: #f8fafc; }
    .header p { margin: 0; color: #94a3b8; font-size: 13px; }
    .toc { padding: 16px 32px; background: #0f172a; border-bottom: 1px solid #1e293b; font-size: 13px; }
    .content { max-width: 1400px; margin: 0 auto; padding: 24px 32px 80px; }
    .stats { padding: 16px; background: #0f172a; border-radius: 6px; margin-bottom: 32px; font-size: 12px; color: #94a3b8; font-family: monospace; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Compositor Proof Gallery — Typography Lockup Evaluation</h1>
    <p>${timestamp} &nbsp;|&nbsp; "${CONTENT.title}" / "${CONTENT.subtitle}" &nbsp;|&nbsp; ${successResults.length} of ${results.length} outputs succeeded</p>
  </div>
  <div class="toc">${toc}</div>
  <div class="content">
    <div class="stats">
      Backgrounds: ${[...new Set(successResults.map((r) => r.bgId))].length} &nbsp;|&nbsp;
      Treatments: ${[...new Set(successResults.map((r) => r.treatment.id))].length} &nbsp;|&nbsp;
      Production path: ${successResults.filter((r) => r.treatment.isProductionPath).length} &nbsp;|&nbsp;
      Experimental: ${successResults.filter((r) => !r.treatment.isProductionPath).length} &nbsp;|&nbsp;
      With plate/scrim: ${successResults.filter((r) => r.treatment.scrimUsed).length} &nbsp;|&nbsp;
      No box: ${successResults.filter((r) => !r.autoScrimApplied && !r.treatment.scrimUsed).length}
    </div>
    ${sections}
    ${checklist}
  </div>
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║   Compositor Proof Gallery — Typography Lockup Evaluation     ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");
  console.log(`  Output dir : ${outDir}`);
  console.log(`  Series     : "${CONTENT.title}" / "${CONTENT.subtitle}"`);
  console.log(`  Canvas     : ${WIDE_WIDTH}×${WIDE_HEIGHT} (wide)\n`);

  const treatments = buildTreatmentSpecs();
  console.log(`  Treatments : ${treatments.length}`);
  console.log(`  Backgrounds: ${BACKGROUND_DEFS.length}`);
  console.log(`  Max outputs: ${treatments.length * BACKGROUND_DEFS.length}\n`);

  const results: CompositeResult[] = [];
  let totalAttempted = 0;
  let totalSuccess = 0;

  for (const bg of BACKGROUND_DEFS) {
    console.log(`\n── Background: ${bg.label}`);
    const backgroundPng = await loadBackground(bg);
    if (!backgroundPng) continue;

    for (const treatment of treatments) {
      const outputId = `${bg.id}__${treatment.id}`;
      const pngFilename = `${outputId}.png`;
      const pngPath = join(outDir, pngFilename);
      totalAttempted++;

      process.stdout.write(`  [${treatment.id}] ...`);

      try {
        const { png, autoScrimSampled, autoScrimApplied, paletteMode } = await runCompositor(
          backgroundPng,
          bg,
          treatment
        );
        writeFileSync(pngPath, png);
        totalSuccess++;
        process.stdout.write(
          ` ✓  scrim: ${autoScrimSampled ? "sampled" : "no"} → ${autoScrimApplied ? "applied" : "suppressed"}  ${paletteMode}\n`
        );

        results.push({
          outputId,
          pngFilename,
          bgId: bg.id,
          bgLabel: bg.label,
          treatment,
          autoScrimSampled,
          autoScrimApplied,
          paletteMode: paletteMode as "sampled" | "white_forced",
          success: true,
        });
      } catch (err) {
        process.stdout.write(` ✗  ${err instanceof Error ? err.message : String(err)}\n`);
        results.push({
          outputId,
          pngFilename,
          bgId: bg.id,
          bgLabel: bg.label,
          treatment,
          autoScrimSampled: false,
          autoScrimApplied: false,
          paletteMode: "sampled",
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Write HTML gallery
  const htmlPath = join(outDir, "gallery.html");
  const htmlContent = buildHtml(results, outDir);
  writeFileSync(htmlPath, htmlContent);

  // Final report
  console.log("\n── Report ───────────────────────────────────────────────────────");
  console.log(`  Attempted : ${totalAttempted}`);
  console.log(`  Succeeded : ${totalSuccess}`);
  console.log(`  Failed    : ${totalAttempted - totalSuccess}`);
  console.log(`  Output dir: ${outDir}`);
  console.log(`  Gallery   : ${htmlPath}`);

  const successResults = results.filter((r) => r.success);
  const scrimSuppressed = successResults.filter((r) => !r.autoScrimApplied && !r.treatment.scrimUsed);
  const plateUsed = successResults.filter((r) => r.treatment.scrimUsed);
  console.log(`\n  No-box outputs : ${scrimSuppressed.length}`);
  console.log(`  Plate outputs  : ${plateUsed.length}`);

  console.log("\n── Self-Evaluation Checklist ─────────────────────────────────────");
  console.log(`
  Review the gallery at: ${htmlPath}

  1. Does ANY single output look like a real church design team made it?
     → Look at the "modern_abstract_integrated" and "direct_editorial_serif" families first.
     → A positive result = confident type, intentional placement, visual integration.
     → A negative result is also meaningful — record the gap honestly.

  2. Which treatment family worked best for each background type?
     → dark_abstract: Try family 5 (modern abstract integrated) and family 3 (monumental split)
     → dark_gradient: Try family 1 (editorial serif) and family 2 (minimal label)
     → light_minimal: Try family 2 (minimal label) and family 4 (designed plate)

  3. Does the typography feel integrated with the image, or pasted on?
     → Does text respond to background tonal zones and geometry?
     → Is the text scale proportional to the background's visual weight?

  4. Is there a default shadow/scrim box problem?
     → Compare outputs where "scrim sampled: yes → suppressed" vs. the designed plate.
     → The localized rgba(0,0,0,0.28) rect is the production scrim box.
     → Its suppression (experimental) is the critical variable in this gallery.

  5. Does the best result feel meaningfully connected to the sermon series?
     → "The Gospel of John · Light and Life" — light, clarity, Gospel narrative.
     → Does any output evoke that without being generic?

  6. What is the gap between the best output and designer-grade?
     → Font quality, letter-spacing precision, placement geometry, color harmony.
     → This gap is the roadmap for typography deepening work.

  Honest negative result: If none of the ${totalSuccess} outputs are visually defensible
  as a sermon series direction a church team could have intentionally produced,
  that is a meaningful finding — not a failure. The compositor needs deeper work.
`);

  if (totalSuccess < 12) {
    console.warn(`  ⚠ Only ${totalSuccess} outputs generated (target ≥ 12). Check for missing background files.`);
  } else {
    console.log(`  ✓ ${totalSuccess} outputs generated (target ≥ 12 — passed)`);
  }

  console.log(`\n  Paid calls made: NONE`);
  console.log(`  DB writes: NONE`);
  console.log(`  Production behavior changed: NO\n`);
}

await main();
