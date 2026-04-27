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
    motifUsed: string | null;
    paletteUsed: ModePalette;
    typographyTreatment: string;
    backgroundKind: BackgroundKind;
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
  | "offset_block"
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
  const { svg: backgroundSvg, kind: backgroundKind } = buildBackgroundSvg({
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
  //    rendered text and no scaffold text, and motifs are present iff a
  //    recognizable shape was rendered.
  const backgroundEvidence: ProductionBackgroundValidationEvidence = {
    source: "generated", // produced by this engine, not a fallback
    sourceGenerationId: null,
    textFree: true,
    scaffoldFree: true,
    motifPresent: backgroundKind === "symbol_plate" || backgroundKind === "abstract_blocks",
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
      motifUsed,
      paletteUsed: palette,
      typographyTreatment: recipeOverride.titleTreatment,
      backgroundKind,
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

function buildBackgroundSvg(input: BuildBgInput): { svg: string; kind: BackgroundKind } {
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
      };
  }
}

function buildTypographyLedBackground(i: BuildBgInput): { svg: string; kind: BackgroundKind } {
  // Solid field with a large offset block of accent color creating depth for type.
  const w = i.width;
  const h = i.height;
  const blockX = Math.round(w * 0.55);
  const blockY = 0;
  const blockW = Math.round(w * 0.45);
  const blockH = h;
  const noise = subtleNoiseRect(w, h, i.palette.shadow, 0.06);
  const svg = svgWrap(w, h, [
    `<rect width="${w}" height="${h}" fill="${i.palette.background}"/>`,
    `<rect x="${blockX}" y="${blockY}" width="${blockW}" height="${blockH}" fill="${i.palette.accent}" fill-opacity="0.10"/>`,
    // Diagonal subtle accent line
    `<line x1="${Math.round(w * 0.05)}" y1="${Math.round(h * 0.92)}" x2="${Math.round(w * 0.95)}" y2="${Math.round(h * 0.92)}" stroke="${i.palette.rule}" stroke-width="2" stroke-opacity="0.45"/>`,
    noise,
  ]);
  return { svg, kind: "offset_block" };
}

function buildMinimalEditorialBackground(i: BuildBgInput): { svg: string; kind: BackgroundKind } {
  // Light field with a fine top rule, a small folio mark, and a faint baseline grid.
  const w = i.width;
  const h = i.height;
  const margin = Math.round(w * 0.05);
  const ruleY = Math.round(h * 0.08);
  const baselineY = Math.round(h * 0.92);
  const grid: string[] = [];
  // 7 vertical hairline columns at very low opacity
  for (let col = 1; col < 8; col++) {
    const x = Math.round((w * col) / 8);
    grid.push(
      `<line x1="${x}" y1="${ruleY + 6}" x2="${x}" y2="${baselineY - 6}" stroke="${i.palette.rule}" stroke-width="1" stroke-opacity="0.07"/>`
    );
  }
  const svg = svgWrap(w, h, [
    `<rect width="${w}" height="${h}" fill="${i.palette.background}"/>`,
    // Top rule
    `<line x1="${margin}" y1="${ruleY}" x2="${w - margin}" y2="${ruleY}" stroke="${i.palette.rule}" stroke-width="1.5" stroke-opacity="0.55"/>`,
    // Bottom rule
    `<line x1="${margin}" y1="${baselineY}" x2="${w - margin}" y2="${baselineY}" stroke="${i.palette.rule}" stroke-width="1" stroke-opacity="0.35"/>`,
    // Faint baseline grid
    ...grid,
    // Editorial folio dot
    `<circle cx="${w - margin}" cy="${ruleY - 12}" r="3" fill="${i.palette.rule}" fill-opacity="0.7"/>`,
    `<circle cx="${margin}" cy="${ruleY - 12}" r="3" fill="${i.palette.rule}" fill-opacity="0.7"/>`,
    subtleNoiseRect(w, h, i.palette.rule, 0.025),
  ]);
  return { svg, kind: "minimal_editorial_grid" };
}

function buildModernAbstractBackground(i: BuildBgInput): { svg: string; kind: BackgroundKind } {
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
  return { svg, kind: "abstract_blocks" };
}

function buildGraphicSymbolBackground(i: BuildBgInput): { svg: string; kind: BackgroundKind } {
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
  return { svg, kind: "symbol_plate" };
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
