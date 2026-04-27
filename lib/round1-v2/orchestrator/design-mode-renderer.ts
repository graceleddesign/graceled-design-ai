/**
 * Deterministic DesignMode renderer (v1).
 *
 * Produces a sermon-series direction preview WITHOUT calling FAL or any other
 * AI image provider. Backgrounds are SVG-rendered design plates (color fields,
 * geometry, abstract symbols) appropriate to the planned DesignMode. Lockups
 * use the existing clean-minimal lockup pipeline driven by the DesignMode
 * recipe override.
 *
 * Supported modes (v1):
 *   - typography_led
 *   - minimal_editorial
 *   - modern_abstract
 *   - graphic_symbol
 *
 * Other modes (cinematic_atmospheric, photo_composite, illustrative_collage,
 * playful_seasonal, retro_print) continue to use the AI scout/rebuild path.
 *
 * The renderer is intentionally simple. It is not the final design system —
 * it exists to break the canary's "cinematic background + title overlay"
 * trap so that non-cinematic modes are visibly non-cinematic.
 */

import sharp from "sharp";
import type { DesignMode } from "../design-modes";
import type { TonalVariant } from "../grammars";
import type { ProductionBackgroundValidationEvidence } from "@/lib/production-valid-option";
import {
  getDesignModeLockupRecipeOverride,
  shouldSuppressAutoScrim,
} from "./design-mode-lockup-recipes";

// ── Public types ──────────────────────────────────────────────────────────────

export interface RenderDesignModeInput {
  designMode: DesignMode;
  tone: TonalVariant;
  motifs: string[];
  content: {
    title: string;
    subtitle: string | null;
    passage: string | null;
  };
  width: number;
  height: number;
  /** Deterministic seed for any non-deterministic visual choices. */
  seed: number;
}

export interface RenderedDesignModePreview {
  backgroundPng: Buffer;
  lockupPng: Buffer;
  widePng: Buffer;
  backgroundEvidence: ProductionBackgroundValidationEvidence;
  debug: {
    renderer: "deterministic_design_mode_v1";
    designMode: DesignMode;
    recipeId: string;
    noAiBackground: true;
    aiCalls: 0;
    motifUsed: string | null;
    paletteUsed: ModePalette;
    typographyTreatment: string;
    backgroundKind: BackgroundKind;
    /** Specific non-text structure rendered (e.g. "type_axis_with_light_rays"). */
    motifStructureKind: string | null;
    /** Honest reason motifPresent was set true / false. */
    motifPresentReason: string;
  };
}

interface ModePalette {
  background: string;
  accent: string;
  rule: string;
  shadow: string;
  textOnBackground: "dark" | "light";
}

type BackgroundKind =
  | "solid_field"
  | "type_support_system"
  | "minimal_editorial_grid"
  | "abstract_blocks"
  | "symbol_plate";

// ── Public API ────────────────────────────────────────────────────────────────

const LOCAL_RENDER_MODES: readonly DesignMode[] = [
  "typography_led",
  "minimal_editorial",
  "modern_abstract",
  "graphic_symbol",
];

export function canRenderDesignModeLocally(mode: DesignMode): boolean {
  return LOCAL_RENDER_MODES.includes(mode);
}

export async function renderDesignModeDirectionPreview(
  input: RenderDesignModeInput
): Promise<RenderedDesignModePreview> {
  if (!canRenderDesignModeLocally(input.designMode)) {
    throw new Error(
      `renderDesignModeDirectionPreview: mode ${input.designMode} is not locally renderable`
    );
  }

  // Deferred imports — keeps the startup module graph lean.
  const { computeCleanMinimalLayout, buildCleanMinimalOverlaySvg } = await import(
    "@/lib/templates/type-clean-min"
  );
  const { renderTrimmedLockupPngFromSvg } = await import("@/lib/lockup-compositor");

  const palette = pickModePalette(input.designMode, input.tone);
  const motifUsed = pickPrimaryMotif(input.motifs);

  // 1. Background SVG → PNG
  const { svg: backgroundSvg, kind: backgroundKind, motifStructureKind } = buildBackgroundSvg({
    mode: input.designMode,
    width: input.width,
    height: input.height,
    palette,
    motif: motifUsed,
    seed: input.seed,
  });
  const backgroundPng = await renderSvgToPng(backgroundSvg, input.width, input.height);

  // 2. Lockup SVG via existing clean-minimal pipeline + DesignMode recipe override
  const recipeOverride = getDesignModeLockupRecipeOverride(input.designMode);
  const layout = computeCleanMinimalLayout({
    width: input.width,
    height: input.height,
    content: input.content,
    lockupRecipe: recipeOverride,
  });
  // Build a lockup palette directly from the deterministic mode palette.
  // No background sampling — we know the field is solid/structured.
  const lockupPalette = buildLockupPaletteForMode(palette, input.designMode);
  const overlaySvg = buildCleanMinimalOverlaySvg({
    width: input.width,
    height: input.height,
    content: input.content,
    palette: lockupPalette,
    lockupRecipe: recipeOverride,
  });
  void layout; // computed for future reuse; currently the SVG drives the lockup
  const { png: lockupPng } = await renderTrimmedLockupPngFromSvg(overlaySvg);

  // 3. Compose wide: background + lockup positioned per recipe alignment.
  const widePng = await composeWide({
    backgroundPng,
    lockupPng,
    width: input.width,
    height: input.height,
    alignment: recipeOverride.alignment,
    anchor: recipeOverride.placement.anchor,
    safeMarginPct: recipeOverride.placement.safeMarginPct,
  });

  // 4. Evidence — honest by construction. Deterministic SVG plates contain no
  //    rendered text and no scaffold text. motifPresent reflects whether the
  //    background kind ACTUALLY rendered a non-text design structure.
  //
  //    All four locally renderable modes now produce visible non-text structure
  //    by construction:
  //      - typography_led       → type_support_system (axis + slab + cast shadow [+ motif accent])
  //      - minimal_editorial    → minimal_editorial_grid (rules + emphasized column + folio label + motif mark)
  //      - modern_abstract      → abstract_blocks (color blocks + circle accent)
  //      - graphic_symbol       → symbol_plate (motif-derived vector mark)
  //
  //    A renderer that emits "solid_field" would NOT pass; we keep this branch
  //    explicit so honesty is preserved if a future mode forgets to render
  //    structure.
  const motifPresent =
    backgroundKind === "type_support_system" ||
    backgroundKind === "minimal_editorial_grid" ||
    backgroundKind === "abstract_blocks" ||
    backgroundKind === "symbol_plate";
  const motifPresentReason = motifPresent
    ? `rendered_${motifStructureKind ?? backgroundKind}`
    : "background_kind_has_no_structure";

  const backgroundEvidence: ProductionBackgroundValidationEvidence = {
    source: "generated", // produced by this engine, not a fallback
    sourceGenerationId: null,
    textFree: true,
    scaffoldFree: true,
    motifPresent,
    toneFit: true,
    referenceFit: null,
  };

  return {
    backgroundPng,
    lockupPng,
    widePng,
    backgroundEvidence,
    debug: {
      renderer: "deterministic_design_mode_v1",
      designMode: input.designMode,
      recipeId: `${input.designMode}_v1`,
      noAiBackground: true,
      aiCalls: 0,
      motifUsed,
      paletteUsed: palette,
      typographyTreatment: recipeOverride.titleTreatment,
      backgroundKind,
      motifStructureKind,
      motifPresentReason,
    },
  };
}

// ── Palette ───────────────────────────────────────────────────────────────────

function pickModePalette(mode: DesignMode, tone: TonalVariant): ModePalette {
  // Tone-driven anchor color choices, with mode-specific adjustments.
  const isDark = tone === "dark" || tone === "mono" || tone === "neutral";
  const baseDark: ModePalette = {
    background: "#0F172A",
    accent: "#F8FAFC",
    rule: "#94A3B8",
    shadow: "#020617",
    textOnBackground: "light",
  };
  const baseLight: ModePalette = {
    background: "#F8FAFC",
    accent: "#0F172A",
    rule: "#475569",
    shadow: "#CBD5E1",
    textOnBackground: "dark",
  };
  const baseVivid: ModePalette = {
    background: "#1E1B4B",
    accent: "#FBBF24",
    rule: "#F472B6",
    shadow: "#020617",
    textOnBackground: "light",
  };

  void isDark;
  let palette: ModePalette;
  if (tone === "vivid") palette = baseVivid;
  else if (tone === "light") palette = baseLight;
  else palette = baseDark;

  // Mode-specific tweaks
  switch (mode) {
    case "minimal_editorial":
      // Minimal_editorial leans light, restrained.
      return tone === "dark" || tone === "mono"
        ? {
            ...baseDark,
            background: "#0B1220",
            accent: "#E2E8F0",
            rule: "#475569",
          }
        : {
            ...baseLight,
            background: "#F5F2EB", // warm paper
            rule: "#9CA3AF",
            accent: "#111827",
          };
    case "typography_led":
      // High contrast — lean into dark unless tone explicitly light.
      return tone === "light"
        ? { ...baseLight, background: "#F8FAFC", accent: "#0F172A" }
        : tone === "vivid"
        ? baseVivid
        : { ...baseDark, background: "#111827", accent: "#F9FAFB" };
    case "modern_abstract":
      return tone === "vivid"
        ? baseVivid
        : tone === "light"
        ? { ...baseLight, accent: "#1E40AF", rule: "#FCD34D" }
        : { ...baseDark, accent: "#FBBF24", rule: "#F472B6" };
    case "graphic_symbol":
      return tone === "light"
        ? { ...baseLight, accent: "#0F172A" }
        : tone === "vivid"
        ? baseVivid
        : { ...baseDark, accent: "#F8FAFC" };
    default:
      return palette;
  }
}

function buildLockupPaletteForMode(palette: ModePalette, mode: DesignMode) {
  const useDark = palette.textOnBackground === "dark";
  const primary = useDark ? "#0F172A" : "#F8FAFC";
  const secondary = useDark ? "#1E293B" : "#E2E8F0";
  const tertiary = useDark ? "#334155" : "#94A3B8";
  const rule = palette.rule;
  const accent = palette.accent;
  // shouldSuppressAutoScrim already controls scrim for typography_led/minimal_editorial.
  const autoScrim = !shouldSuppressAutoScrim(mode);
  return {
    primary,
    secondary,
    tertiary,
    rule,
    accent,
    autoScrim,
    scrimTint: useDark ? ("#FFFFFF" as const) : ("#000000" as const),
    forceTitleOutline: false,
    forceTitleShadow: false,
    forceSubtitleShadow: false,
    safeVariantApplied: false,
  };
}

function pickPrimaryMotif(motifs: string[]): string | null {
  return motifs.find((m) => m && m.trim().length > 0) ?? null;
}

// ── Background SVG construction ───────────────────────────────────────────────

interface BuildBgInput {
  mode: DesignMode;
  width: number;
  height: number;
  palette: ModePalette;
  motif: string | null;
  seed: number;
}

interface BuildBgResult {
  svg: string;
  kind: BackgroundKind;
  /** Specific non-text structure description rendered into the background. */
  motifStructureKind: string | null;
}

function buildBackgroundSvg(input: BuildBgInput): BuildBgResult {
  switch (input.mode) {
    case "typography_led":
      return buildTypographyLedBackground(input);
    case "minimal_editorial":
      return buildMinimalEditorialBackground(input);
    case "modern_abstract":
      return buildModernAbstractBackground(input);
    case "graphic_symbol":
      return buildGraphicSymbolBackground(input);
    default:
      return {
        svg: solidRectSvg(input.width, input.height, input.palette.background),
        kind: "solid_field",
        motifStructureKind: null,
      };
  }
}

function buildTypographyLedBackground(i: BuildBgInput): BuildBgResult {
  // Typography-led plate with a confident non-text support system.
  // Always renders visible non-text structure: a large axis (oversized plus),
  // a tonal slab, and — if a recognized motif is present — a motif-aware
  // accent (light rays, water line, doorway frame, vine line).
  const w = i.width;
  const h = i.height;
  const cx = Math.round(w * 0.5);
  const cy = Math.round(h * 0.5);

  // Large tonal slab on the right ~40% of the canvas — gives type depth.
  const slabX = Math.round(w * 0.6);
  const slabW = Math.round(w * 0.4);
  const slab = `<rect x="${slabX}" y="0" width="${slabW}" height="${h}" fill="${i.palette.accent}" fill-opacity="0.12"/>`;

  // Oversized "type axis" — vertical and horizontal hairlines at very low opacity.
  const axisVertical = `<line x1="${cx}" y1="${Math.round(h * 0.05)}" x2="${cx}" y2="${Math.round(h * 0.95)}" stroke="${i.palette.rule}" stroke-width="2" stroke-opacity="0.18"/>`;
  const axisHorizontal = `<line x1="${Math.round(w * 0.05)}" y1="${cy}" x2="${Math.round(w * 0.95)}" y2="${cy}" stroke="${i.palette.rule}" stroke-width="2" stroke-opacity="0.18"/>`;

  // Long diagonal cast shadow shape behind the title area.
  const castShadow = `<polygon points="${Math.round(w * 0.08)},${Math.round(h * 0.18)} ${Math.round(w * 0.92)},${Math.round(h * 0.34)} ${Math.round(w * 0.92)},${Math.round(h * 0.42)} ${Math.round(w * 0.08)},${Math.round(h * 0.26)}" fill="${i.palette.shadow}" fill-opacity="0.18"/>`;

  // Bottom rule (existing).
  const bottomRule = `<line x1="${Math.round(w * 0.05)}" y1="${Math.round(h * 0.92)}" x2="${Math.round(w * 0.95)}" y2="${Math.round(h * 0.92)}" stroke="${i.palette.rule}" stroke-width="2" stroke-opacity="0.45"/>`;

  // Motif-aware accent (large, low-opacity, off-center).
  const motifLayer = buildTypographyMotifLayer({
    motif: i.motif,
    width: w,
    height: h,
    color: i.palette.accent,
    accent: i.palette.rule,
  });

  const motifKind = motifLayer.kind;
  const noise = subtleNoiseRect(w, h, i.palette.shadow, 0.06);

  const svg = svgWrap(w, h, [
    `<rect width="${w}" height="${h}" fill="${i.palette.background}"/>`,
    slab,
    castShadow,
    axisVertical,
    axisHorizontal,
    motifLayer.svg,
    bottomRule,
    noise,
  ]);

  return {
    svg,
    kind: "type_support_system",
    motifStructureKind: motifKind === "none" ? "type_axis_with_slab_and_shadow" : `type_support_with_${motifKind}`,
  };
}

interface TypographyMotifLayer {
  svg: string;
  kind: "light_axis" | "water_line" | "doorway_frame" | "vine_line" | "none";
}

function buildTypographyMotifLayer(input: {
  motif: string | null;
  width: number;
  height: number;
  color: string;
  accent: string;
}): TypographyMotifLayer {
  const m = (input.motif ?? "").toLowerCase();
  const w = input.width;
  const h = input.height;

  // Light / radiance — large rays from off-canvas top-right.
  if (/light|radian|dawn|glory|sun|star/.test(m)) {
    const ox = Math.round(w * 1.1);
    const oy = Math.round(h * -0.1);
    const rays: string[] = [];
    for (let i = 0; i < 7; i++) {
      const angle = Math.PI * 0.55 + (i * Math.PI * 0.3) / 7;
      const len = Math.max(w, h) * 1.4;
      const x2 = ox + Math.cos(angle) * len;
      const y2 = oy + Math.sin(angle) * len;
      rays.push(
        `<line x1="${ox}" y1="${oy}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${input.accent}" stroke-width="${(h * 0.005).toFixed(1)}" stroke-opacity="0.18"/>`
      );
    }
    return { svg: rays.join(""), kind: "light_axis" };
  }

  // Water — long flowing waveline across mid-frame.
  if (/water|river|wave|sea|ocean|flow/.test(m)) {
    const y = Math.round(h * 0.68);
    const ampl = Math.round(h * 0.07);
    const seg = w / 6;
    let path = `M 0 ${y}`;
    for (let i = 0; i < 6; i++) {
      const sign = i % 2 === 0 ? -1 : 1;
      path += ` q ${(seg / 2).toFixed(1)} ${(sign * ampl).toFixed(1)} ${seg.toFixed(1)} 0`;
    }
    return {
      svg: `<path d="${path}" fill="none" stroke="${input.accent}" stroke-width="${(h * 0.008).toFixed(1)}" stroke-opacity="0.22" stroke-linecap="round"/>`,
      kind: "water_line",
    };
  }

  // Doorway / path / threshold — large arched frame in low opacity.
  if (/door|path|threshold|gate|way/.test(m)) {
    const cx = Math.round(w * 0.78);
    const archW = Math.round(w * 0.18);
    const archTop = Math.round(h * 0.18);
    const archBot = Math.round(h * 0.92);
    const half = Math.round(archW / 2);
    return {
      svg: `<path d="M ${cx - half} ${archBot} L ${cx - half} ${archTop + half} A ${half} ${half} 0 0 1 ${cx + half} ${archTop + half} L ${cx + half} ${archBot}" fill="none" stroke="${input.accent}" stroke-width="${(h * 0.01).toFixed(1)}" stroke-opacity="0.30" stroke-linejoin="round"/>`,
      kind: "doorway_frame",
    };
  }

  // Vine / branch — a vertical hairline with two short branches.
  if (/vine|branch|root|tree/.test(m)) {
    const trunkX = Math.round(w * 0.86);
    const top = Math.round(h * 0.12);
    const bot = Math.round(h * 0.88);
    const mid = Math.round(h * 0.5);
    const off = Math.round(w * 0.04);
    const sw = (h * 0.005).toFixed(1);
    return {
      svg: [
        `<line x1="${trunkX}" y1="${top}" x2="${trunkX}" y2="${bot}" stroke="${input.accent}" stroke-width="${sw}" stroke-opacity="0.30"/>`,
        `<line x1="${trunkX}" y1="${mid - h * 0.08}" x2="${trunkX - off}" y2="${mid - h * 0.16}" stroke="${input.accent}" stroke-width="${sw}" stroke-opacity="0.30"/>`,
        `<line x1="${trunkX}" y1="${mid + h * 0.08}" x2="${trunkX - off}" y2="${mid + h * 0.16}" stroke="${input.accent}" stroke-width="${sw}" stroke-opacity="0.30"/>`,
      ].join(""),
      kind: "vine_line",
    };
  }

  return { svg: "", kind: "none" };
}

function buildMinimalEditorialBackground(i: BuildBgInput): BuildBgResult {
  // Editorial paper field with a deliberate, restrained design system:
  //  - Top + bottom rules
  //  - Folio dots at the corners of the top rule
  //  - One emphasized vertical column hairline (not all columns equal)
  //  - A folio-style label rectangle at top-left
  //  - A small motif mark in the lower-right margin (when motif provided)
  //    fallback: a small ruled square accent
  const w = i.width;
  const h = i.height;
  const margin = Math.round(w * 0.05);
  const ruleY = Math.round(h * 0.08);
  const baselineY = Math.round(h * 0.92);

  // 7 vertical column hairlines, with one emphasized for visual rhythm.
  const grid: string[] = [];
  const emphasizedCol = 5;
  for (let col = 1; col < 8; col++) {
    const x = Math.round((w * col) / 8);
    const isEmphasized = col === emphasizedCol;
    grid.push(
      `<line x1="${x}" y1="${ruleY + 6}" x2="${x}" y2="${baselineY - 6}" stroke="${i.palette.rule}" stroke-width="${isEmphasized ? 1.5 : 1}" stroke-opacity="${isEmphasized ? 0.22 : 0.07}"/>`
    );
  }

  // Folio label rectangle: a thin frame at top-left, large enough to read as
  // an editorial section marker (no text).
  const folioLabel = (() => {
    const lblW = Math.round(w * 0.07);
    const lblH = Math.round(h * 0.024);
    const lx = margin;
    const ly = ruleY - lblH - 16;
    return [
      `<rect x="${lx}" y="${ly}" width="${lblW}" height="${lblH}" fill="none" stroke="${i.palette.rule}" stroke-width="1.5" stroke-opacity="0.6"/>`,
      `<line x1="${lx + 6}" y1="${ly + lblH / 2}" x2="${lx + lblW - 6}" y2="${ly + lblH / 2}" stroke="${i.palette.rule}" stroke-width="1" stroke-opacity="0.45"/>`,
    ].join("");
  })();

  // Motif mark in lower-right margin.
  const motifLayer = buildEditorialMotifLayer({
    motif: i.motif,
    width: w,
    height: h,
    color: i.palette.rule,
    accent: i.palette.accent,
  });

  const svg = svgWrap(w, h, [
    `<rect width="${w}" height="${h}" fill="${i.palette.background}"/>`,
    // Top rule
    `<line x1="${margin}" y1="${ruleY}" x2="${w - margin}" y2="${ruleY}" stroke="${i.palette.rule}" stroke-width="1.5" stroke-opacity="0.55"/>`,
    // Bottom rule
    `<line x1="${margin}" y1="${baselineY}" x2="${w - margin}" y2="${baselineY}" stroke="${i.palette.rule}" stroke-width="1" stroke-opacity="0.35"/>`,
    // Faint baseline grid with emphasized column
    ...grid,
    // Folio dots
    `<circle cx="${w - margin}" cy="${ruleY - 12}" r="3" fill="${i.palette.rule}" fill-opacity="0.7"/>`,
    `<circle cx="${margin}" cy="${ruleY - 12}" r="3" fill="${i.palette.rule}" fill-opacity="0.7"/>`,
    // Folio label rectangle
    folioLabel,
    // Motif mark
    motifLayer.svg,
    subtleNoiseRect(w, h, i.palette.rule, 0.025),
  ]);

  return {
    svg,
    kind: "minimal_editorial_grid",
    motifStructureKind: `editorial_label_with_${motifLayer.kind}`,
  };
}

interface EditorialMotifLayer {
  svg: string;
  kind:
    | "light_mark"
    | "water_mark"
    | "doorway_mark"
    | "vine_mark"
    | "ruled_square";
}

function buildEditorialMotifLayer(input: {
  motif: string | null;
  width: number;
  height: number;
  color: string;
  accent: string;
}): EditorialMotifLayer {
  const m = (input.motif ?? "").toLowerCase();
  const w = input.width;
  const h = input.height;
  const cx = Math.round(w * 0.93);
  const cy = Math.round(h * 0.85);
  const r = Math.round(h * 0.045);
  const stroke = (h * 0.0025).toFixed(2);

  if (/light|radian|dawn|glory|sun|star/.test(m)) {
    const rays: string[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8;
      const x1 = cx + Math.cos(a) * r * 1.1;
      const y1 = cy + Math.sin(a) * r * 1.1;
      const x2 = cx + Math.cos(a) * r * 1.6;
      const y2 = cy + Math.sin(a) * r * 1.6;
      rays.push(
        `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${input.color}" stroke-width="${stroke}" stroke-opacity="0.7"/>`
      );
    }
    return {
      svg: [
        `<circle cx="${cx}" cy="${cy}" r="${r * 0.9}" fill="none" stroke="${input.color}" stroke-width="${stroke}" stroke-opacity="0.7"/>`,
        ...rays,
      ].join(""),
      kind: "light_mark",
    };
  }

  if (/water|river|wave|sea|ocean|flow/.test(m)) {
    const ampl = r * 0.5;
    const lines: string[] = [];
    for (let row = 0; row < 3; row++) {
      const y = cy + (row - 1) * (r * 0.7);
      const path = `M ${cx - r * 1.5} ${y} q ${(r / 2).toFixed(1)} ${(-ampl).toFixed(1)} ${r.toFixed(1)} 0 t ${r.toFixed(1)} 0 t ${r.toFixed(1)} 0`;
      lines.push(
        `<path d="${path}" fill="none" stroke="${input.color}" stroke-width="${stroke}" stroke-opacity="${(0.45 + 0.12 * row).toFixed(2)}" stroke-linecap="round"/>`
      );
    }
    return { svg: lines.join(""), kind: "water_mark" };
  }

  if (/door|path|threshold|gate|way/.test(m)) {
    const half = r * 0.7;
    const top = cy - r * 0.9;
    const bot = cy + r * 0.9;
    return {
      svg: `<path d="M ${cx - half} ${bot} L ${cx - half} ${cy - half * 0.2} A ${half} ${half} 0 0 1 ${cx + half} ${cy - half * 0.2} L ${cx + half} ${bot}" fill="none" stroke="${input.color}" stroke-width="${stroke}" stroke-opacity="0.7" stroke-linejoin="round"/>` +
        `<line x1="${cx - half * 0.6}" y1="${top + r * 0.2}" x2="${cx + half * 0.6}" y2="${top + r * 0.2}" stroke="${input.color}" stroke-width="${stroke}" stroke-opacity="0.6"/>`,
      kind: "doorway_mark",
    };
  }

  if (/vine|branch|root|tree/.test(m)) {
    return {
      svg: [
        `<line x1="${cx}" y1="${cy - r}" x2="${cx}" y2="${cy + r}" stroke="${input.color}" stroke-width="${stroke}" stroke-opacity="0.7"/>`,
        `<line x1="${cx}" y1="${cy - r * 0.3}" x2="${cx + r * 0.6}" y2="${cy - r * 0.7}" stroke="${input.color}" stroke-width="${stroke}" stroke-opacity="0.6"/>`,
        `<line x1="${cx}" y1="${cy + r * 0.3}" x2="${cx - r * 0.6}" y2="${cy + r * 0.7}" stroke="${input.color}" stroke-width="${stroke}" stroke-opacity="0.6"/>`,
      ].join(""),
      kind: "vine_mark",
    };
  }

  // Generic editorial fallback: small ruled square accent
  return {
    svg: [
      `<rect x="${cx - r * 0.6}" y="${cy - r * 0.6}" width="${r * 1.2}" height="${r * 1.2}" fill="none" stroke="${input.color}" stroke-width="${stroke}" stroke-opacity="0.6"/>`,
      `<line x1="${cx - r * 0.4}" y1="${cy}" x2="${cx + r * 0.4}" y2="${cy}" stroke="${input.color}" stroke-width="${stroke}" stroke-opacity="0.45"/>`,
    ].join(""),
    kind: "ruled_square",
  };
}

function buildModernAbstractBackground(i: BuildBgInput): BuildBgResult {
  // Two large color blocks + a circle accent + a thin rule.
  const w = i.width;
  const h = i.height;
  const blockA = {
    x: 0,
    y: Math.round(h * 0.5),
    w: Math.round(w * 0.62),
    h: Math.round(h * 0.5),
    color: i.palette.accent,
    opacity: 0.92,
  };
  const blockB = {
    x: Math.round(w * 0.62),
    y: 0,
    w: Math.round(w * 0.38),
    h: Math.round(h * 0.55),
    color: i.palette.rule,
    opacity: 0.85,
  };
  const circleAccent = {
    cx: Math.round(w * 0.3),
    cy: Math.round(h * 0.3),
    r: Math.round(h * 0.18),
    fill: i.palette.rule,
    opacity: 0.85,
  };
  const svg = svgWrap(w, h, [
    `<rect width="${w}" height="${h}" fill="${i.palette.background}"/>`,
    `<rect x="${blockA.x}" y="${blockA.y}" width="${blockA.w}" height="${blockA.h}" fill="${blockA.color}" fill-opacity="${blockA.opacity}"/>`,
    `<rect x="${blockB.x}" y="${blockB.y}" width="${blockB.w}" height="${blockB.h}" fill="${blockB.color}" fill-opacity="${blockB.opacity}"/>`,
    `<circle cx="${circleAccent.cx}" cy="${circleAccent.cy}" r="${circleAccent.r}" fill="${circleAccent.fill}" fill-opacity="${circleAccent.opacity}"/>`,
    `<line x1="${Math.round(w * 0.05)}" y1="${Math.round(h * 0.5)}" x2="${Math.round(w * 0.6)}" y2="${Math.round(h * 0.5)}" stroke="${i.palette.background}" stroke-width="3" stroke-opacity="0.9"/>`,
  ]);
  return { svg, kind: "abstract_blocks", motifStructureKind: "abstract_blocks_with_circle_accent" };
}

function buildGraphicSymbolBackground(i: BuildBgInput): BuildBgResult {
  // Solid field + a motif-derived vector mark, sized to leave space for the lockup.
  const w = i.width;
  const h = i.height;
  const markCx = Math.round(w * 0.32);
  const markCy = Math.round(h * 0.48);
  const markScale = Math.round(h * 0.28);
  const markSvg = buildSymbolMark({
    motif: i.motif,
    cx: markCx,
    cy: markCy,
    scale: markScale,
    color: i.palette.accent,
    accent: i.palette.rule,
  });
  const svg = svgWrap(w, h, [
    `<rect width="${w}" height="${h}" fill="${i.palette.background}"/>`,
    // Soft right-side panel where the lockup will sit
    `<rect x="${Math.round(w * 0.55)}" y="0" width="${Math.round(w * 0.45)}" height="${h}" fill="${i.palette.shadow}" fill-opacity="0.12"/>`,
    markSvg,
    subtleNoiseRect(w, h, i.palette.shadow, 0.04),
  ]);
  const motifStructureKind = i.motif
    ? `symbol_${i.motif.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`
    : "symbol_generic";
  return { svg, kind: "symbol_plate", motifStructureKind };
}

// ── Symbol mark library (motif → simple vector form) ────────────────────────

function buildSymbolMark(input: {
  motif: string | null;
  cx: number;
  cy: number;
  scale: number;
  color: string;
  accent: string;
}): string {
  const m = (input.motif ?? "").toLowerCase();
  const { cx, cy, scale, color, accent } = input;

  // Light / radiance / dawn → rays + circle
  if (/light|radian|dawn|glory|sun|star/.test(m)) {
    const rays: string[] = [];
    for (let i = 0; i < 12; i++) {
      const angle = (i * Math.PI * 2) / 12;
      const x1 = cx + Math.cos(angle) * scale * 0.55;
      const y1 = cy + Math.sin(angle) * scale * 0.55;
      const x2 = cx + Math.cos(angle) * scale * 1.0;
      const y2 = cy + Math.sin(angle) * scale * 1.0;
      rays.push(
        `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${(scale * 0.04).toFixed(1)}" stroke-linecap="round"/>`
      );
    }
    return [
      `<circle cx="${cx}" cy="${cy}" r="${(scale * 0.45).toFixed(1)}" fill="${color}"/>`,
      `<circle cx="${cx}" cy="${cy}" r="${(scale * 0.7).toFixed(1)}" fill="none" stroke="${accent}" stroke-width="${(scale * 0.02).toFixed(1)}" stroke-opacity="0.7"/>`,
      ...rays,
    ].join("");
  }

  // Water / river / wave → flowing horizontal curves
  if (/water|river|wave|sea|ocean|flow/.test(m)) {
    const lines: string[] = [];
    for (let row = 0; row < 5; row++) {
      const y = cy + (row - 2) * scale * 0.18;
      const ampl = scale * 0.22;
      const w = scale * 1.4;
      const path = `M ${cx - w} ${y} q ${(w / 4).toFixed(1)} ${(-ampl).toFixed(1)} ${(w / 2).toFixed(1)} 0 t ${(w / 2).toFixed(1)} 0 t ${(w / 2).toFixed(1)} 0`;
      lines.push(
        `<path d="${path}" fill="none" stroke="${color}" stroke-width="${(scale * 0.05).toFixed(1)}" stroke-linecap="round" stroke-opacity="${(0.4 + 0.15 * row).toFixed(2)}"/>`
      );
    }
    return lines.join("");
  }

  // Vine / branch / roots → simple branching lines
  if (/vine|branch|root|tree/.test(m)) {
    const trunkX = cx;
    const lines: string[] = [
      `<line x1="${trunkX}" y1="${cy + scale * 0.9}" x2="${trunkX}" y2="${cy - scale * 0.9}" stroke="${color}" stroke-width="${(scale * 0.06).toFixed(1)}" stroke-linecap="round"/>`,
    ];
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const y = cy + i * scale * 0.22;
      const dx = scale * 0.5 * (i % 2 === 0 ? 1 : -1);
      lines.push(
        `<line x1="${trunkX}" y1="${y}" x2="${(trunkX + dx).toFixed(1)}" y2="${(y - scale * 0.18).toFixed(1)}" stroke="${color}" stroke-width="${(scale * 0.04).toFixed(1)}" stroke-linecap="round"/>`
      );
    }
    return lines.join("");
  }

  // Doorway / path / threshold → arched frame
  if (/door|path|threshold|gate|way/.test(m)) {
    const wHalf = scale * 0.5;
    const top = cy - scale * 0.9;
    const bot = cy + scale * 0.9;
    return [
      `<path d="M ${cx - wHalf} ${bot} L ${cx - wHalf} ${cy - scale * 0.4} A ${wHalf} ${wHalf} 0 0 1 ${cx + wHalf} ${cy - scale * 0.4} L ${cx + wHalf} ${bot} Z" fill="none" stroke="${color}" stroke-width="${(scale * 0.07).toFixed(1)}" stroke-linejoin="round"/>`,
      `<line x1="${cx - wHalf * 0.85}" y1="${top + scale * 0.1}" x2="${cx + wHalf * 0.85}" y2="${top + scale * 0.1}" stroke="${accent}" stroke-width="${(scale * 0.04).toFixed(1)}" stroke-opacity="0.6"/>`,
    ].join("");
  }

  // Cross
  if (/cross|cruci/.test(m)) {
    const armW = scale * 0.18;
    const verticalH = scale * 1.4;
    const horizontalW = scale * 0.9;
    const horizontalY = cy - scale * 0.2;
    return [
      `<rect x="${cx - armW / 2}" y="${cy - verticalH / 2}" width="${armW}" height="${verticalH}" fill="${color}"/>`,
      `<rect x="${cx - horizontalW / 2}" y="${horizontalY - armW / 2}" width="${horizontalW}" height="${armW}" fill="${color}"/>`,
    ].join("");
  }

  // Mountain / horizon
  if (/mountain|peak|horizon/.test(m)) {
    const baseY = cy + scale * 0.4;
    const peak1 = `${cx - scale * 0.6},${baseY} ${cx - scale * 0.15},${cy - scale * 0.55} ${cx + scale * 0.15},${baseY}`;
    const peak2 = `${cx - scale * 0.05},${baseY} ${cx + scale * 0.4},${cy - scale * 0.85} ${cx + scale * 0.7},${baseY}`;
    return [
      `<polygon points="${peak1}" fill="${color}"/>`,
      `<polygon points="${peak2}" fill="${accent}" fill-opacity="0.75"/>`,
    ].join("");
  }

  // Generic fallback: circle + frame
  return [
    `<circle cx="${cx}" cy="${cy}" r="${(scale * 0.55).toFixed(1)}" fill="${color}"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${(scale * 0.85).toFixed(1)}" fill="none" stroke="${accent}" stroke-width="${(scale * 0.04).toFixed(1)}" stroke-opacity="0.7"/>`,
  ].join("");
}

// ── SVG / PNG plumbing ────────────────────────────────────────────────────────

function svgWrap(width: number, height: number, parts: string[]): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    ...parts,
    "</svg>",
  ].join("");
}

function solidRectSvg(width: number, height: number, color: string): string {
  return svgWrap(width, height, [`<rect width="${width}" height="${height}" fill="${color}"/>`]);
}

function subtleNoiseRect(width: number, height: number, color: string, opacity: number): string {
  // Lightweight simulated noise via overlapping low-opacity dots in an SVG pattern.
  // Cheap and deterministic; just suggests texture, not real noise.
  return [
    `<defs>`,
    `<pattern id="grain" width="6" height="6" patternUnits="userSpaceOnUse">`,
    `<circle cx="1.5" cy="1.5" r="0.6" fill="${color}" fill-opacity="${(opacity * 0.7).toFixed(3)}"/>`,
    `<circle cx="4.5" cy="3.5" r="0.4" fill="${color}" fill-opacity="${(opacity * 0.5).toFixed(3)}"/>`,
    `</pattern>`,
    `</defs>`,
    `<rect width="${width}" height="${height}" fill="url(#grain)"/>`,
  ].join("");
}

async function renderSvgToPng(svg: string, width: number, height: number): Promise<Buffer> {
  return sharp(Buffer.from(svg), { failOn: "none" })
    .resize({ width, height, fit: "fill" })
    .png()
    .toBuffer();
}

// ── Wide composition ─────────────────────────────────────────────────────────

async function composeWide(params: {
  backgroundPng: Buffer;
  lockupPng: Buffer;
  width: number;
  height: number;
  alignment: "left" | "center" | "right";
  anchor:
    | "top_left"
    | "top_center"
    | "center"
    | "bottom_left"
    | "bottom_center";
  safeMarginPct: number;
}): Promise<Buffer> {
  const { width, height, safeMarginPct, anchor, alignment } = params;

  // Lockup may have been rendered at higher pixel scale than canvas.
  // If it's larger than canvas (after the safe margin), scale it down
  // proportionally so it fits and Sharp's composite() accepts it.
  let lockupBuf = params.lockupPng;
  const meta = await sharp(lockupBuf).metadata();
  const origW = meta.width ?? Math.round(width * 0.6);
  const origH = meta.height ?? Math.round(height * 0.4);
  const maxW = Math.max(1, width - 2 * Math.round(width * safeMarginPct));
  const maxH = Math.max(1, height - 2 * Math.round(height * safeMarginPct));
  if (origW > maxW || origH > maxH) {
    const scale = Math.min(maxW / origW, maxH / origH);
    const targetW = Math.max(1, Math.round(origW * scale));
    const targetH = Math.max(1, Math.round(origH * scale));
    lockupBuf = await sharp(lockupBuf, { failOn: "none" })
      .resize({ width: targetW, height: targetH, fit: "inside", kernel: sharp.kernel.lanczos3 })
      .png()
      .toBuffer();
  }
  const lockupMeta = await sharp(lockupBuf).metadata();
  const lockupW = lockupMeta.width ?? origW;
  const lockupH = lockupMeta.height ?? origH;

  const marginX = Math.round(width * safeMarginPct);
  const marginY = Math.round(height * safeMarginPct);

  // Horizontal placement based on alignment
  let left: number;
  if (alignment === "center") left = Math.round((width - lockupW) / 2);
  else if (alignment === "right") left = width - lockupW - marginX;
  else left = marginX;

  // Vertical placement based on anchor
  let top: number;
  if (anchor === "center") top = Math.round((height - lockupH) / 2);
  else if (anchor === "bottom_left" || anchor === "bottom_center")
    top = height - lockupH - marginY;
  else if (anchor === "top_left" || anchor === "top_center") top = marginY;
  else top = Math.round((height - lockupH) / 2);

  // Override left for centered anchors
  if (anchor === "top_center" || anchor === "bottom_center") {
    left = Math.round((width - lockupW) / 2);
  }

  // Clamp to canvas
  left = Math.max(0, Math.min(left, width - lockupW));
  top = Math.max(0, Math.min(top, height - lockupH));

  return sharp(params.backgroundPng, { failOn: "none" })
    .composite([{ input: lockupBuf, left, top }])
    .png()
    .toBuffer();
}
