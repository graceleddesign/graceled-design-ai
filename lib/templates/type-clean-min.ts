import sharp from "sharp";
import type { LockupRecipe, ResolvedLockupPalette, StyleFamily } from "@/lib/design-brief";
import type { DesignDoc } from "@/lib/design-doc";
import { buildOverlayDisplayContent } from "@/lib/overlay-lines";
import { getFontPairing } from "@/lib/lockups/fonts";
import { getLockupPresetById } from "@/lib/lockups/presets";
import {
  buildLockupDesignLayers,
  computeLockupLayout,
  type LockupTextPalette,
  renderLockup
} from "@/lib/lockups/renderer";

export type CleanMinimalShape = "square" | "wide" | "tall";

export type CleanMinimalTextContent = {
  title: string;
  subtitle?: string | null;
  passage?: string | null;
};

type TextBlockLayout = {
  key: "title" | "subtitle" | "passage";
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  fontFamily: string;
  lines: string[];
  align: "left" | "center" | "right";
  letterSpacing: number;
  lineWeights?: number[];
};

export type CleanMinimalTextRegion = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type CleanMinimalTextPalette = LockupTextPalette;

export type CleanMinimalLayout = {
  width: number;
  height: number;
  shape: CleanMinimalShape;
  marginX: number;
  marginY: number;
  textRegion: CleanMinimalTextRegion;
  backingRegion: CleanMinimalTextRegion;
  blocks: TextBlockLayout[];
};

const DEFAULT_LOCKUP_RECIPE: LockupRecipe = getLockupPresetById("editorial_serif_stack");

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function shapeFromDimensions(width: number, height: number): CleanMinimalShape {
  if (width > height) {
    return "wide";
  }
  if (height > width) {
    return "tall";
  }
  return "square";
}

function channelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminanceFromRgb(red: number, green: number, blue: number): number {
  return 0.2126 * channelToLinear(red) + 0.7152 * channelToLinear(green) + 0.0722 * channelToLinear(blue);
}

function parseHexColor(input: string): [number, number, number] {
  const normalized = input.trim().replace(/^#/, "");
  if (normalized.length !== 6) {
    return [15, 23, 42];
  }
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ];
}

function relativeLuminanceFromHex(color: string): number {
  const [red, green, blue] = parseHexColor(color);
  return relativeLuminanceFromRgb(red, green, blue);
}

function contrastRatio(a: number, b: number): number {
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function rgbToHsl(red: number, green: number, blue: number): { h: number; s: number; l: number } {
  const r = clamp(red, 0, 255) / 255;
  const g = clamp(green, 0, 255) / 255;
  const b = clamp(blue, 0, 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === r) {
      h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
      h = ((b - r) / delta + 2) / 6;
    } else {
      h = ((r - g) / delta + 4) / 6;
    }
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 1) + 1) % 1;
  const sat = clamp(s, 0, 1);
  const light = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
  const m = light - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  const segment = Math.floor(hue * 6);
  if (segment === 0) {
    r = c;
    g = x;
  } else if (segment === 1) {
    r = x;
    g = c;
  } else if (segment === 2) {
    g = c;
    b = x;
  } else if (segment === 3) {
    g = x;
    b = c;
  } else if (segment === 4) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function toHexChannel(value: number): string {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0").toUpperCase();
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`;
}

function adjustLightnessForContrast(params: {
  color: string;
  backgroundLuminance: number;
  minContrast: number;
}): string {
  const [red, green, blue] = parseHexColor(params.color);
  const hsl = rgbToHsl(red, green, blue);
  const darken = params.backgroundLuminance >= 0.55;
  let nextL = hsl.l;
  let best = params.color;

  for (let index = 0; index < 16; index += 1) {
    const [r, g, b] = hslToRgb(hsl.h, hsl.s, nextL);
    const candidate = rgbToHex(r, g, b);
    const candidateContrast = contrastRatio(params.backgroundLuminance, relativeLuminanceFromHex(candidate));
    best = candidate;
    if (candidateContrast >= params.minContrast) {
      return candidate;
    }
    nextL = clamp(nextL + (darken ? -0.05 : 0.05), 0.04, 0.96);
  }

  return best;
}

function resolveBaseLockupPalette(backgroundLuminance: number): ResolvedLockupPalette {
  const usesDarkText = backgroundLuminance >= 0.57;
  if (usesDarkText) {
    return {
      titleColor: "#0F172A",
      subtitleColor: "#1E293B",
      accentColor: "#0F172A",
      outlineColor: "#334155",
      ornamentColor: "#475569",
      boxFillColor: "#0F172A"
    };
  }

  return {
    titleColor: "#F8FAFC",
    subtitleColor: "#E2E8F0",
    accentColor: "#F8FAFC",
    outlineColor: "#CBD5E1",
    ornamentColor: "#E2E8F0",
    boxFillColor: "#F8FAFC"
  };
}

function resolveRenderConfig(params: {
  lockupRecipe?: LockupRecipe;
  lockupPresetId?: string | null;
  styleFamily?: StyleFamily;
  fontSeed?: string | null;
}) {
  const preset = params.lockupPresetId ? getLockupPresetById(params.lockupPresetId) : null;
  const recipe = params.lockupRecipe || preset || DEFAULT_LOCKUP_RECIPE;
  const styleFamily = params.styleFamily || preset?.styleFamily || "clean-min";
  const lockupPresetId = preset?.id || undefined;
  const fontPairing = getFontPairing(recipe, styleFamily, lockupPresetId, params.fontSeed);

  return {
    recipe,
    styleFamily,
    lockupPresetId,
    fontPairing
  };
}

export function computeCleanMinimalLayout(params: {
  width: number;
  height: number;
  content: CleanMinimalTextContent;
  lockupRecipe?: LockupRecipe;
  lockupPresetId?: string | null;
  styleFamily?: StyleFamily;
  fontSeed?: string | null;
}): CleanMinimalLayout {
  const shape = shapeFromDimensions(params.width, params.height);
  const displayContent = buildOverlayDisplayContent({
    title: params.content.title,
    subtitle: params.content.subtitle,
    scripturePassages: params.content.passage
  });

  const renderConfig = resolveRenderConfig({
    lockupRecipe: params.lockupRecipe,
    lockupPresetId: params.lockupPresetId,
    styleFamily: params.styleFamily,
    fontSeed: params.fontSeed
  });

  const layout = computeLockupLayout({
    backgroundSize: {
      width: params.width,
      height: params.height
    },
    aspect: shape,
    content: {
      title: displayContent.title,
      subtitle: displayContent.subtitle,
      passage: displayContent.scripturePassages
    },
    lockupRecipe: renderConfig.recipe,
    fontPairing: renderConfig.fontPairing,
    lockupPresetId: renderConfig.lockupPresetId
  });

  return {
    width: layout.width,
    height: layout.height,
    shape,
    marginX: Math.round(layout.width * layout.recipe.placement.safeMarginPct),
    marginY: Math.round(layout.height * layout.recipe.placement.safeMarginPct),
    textRegion: layout.textRegion,
    backingRegion: layout.backingRegion,
    blocks: layout.blocks.map((block) => ({
      key: block.key,
      x: block.x,
      y: block.y,
      w: block.w,
      h: block.h,
      fontSize: block.fontSize,
      fontWeight: block.fontWeight,
      lineHeight: block.lineHeight,
      fontFamily: block.fontFamily,
      lines: block.lines,
      align: block.align,
      letterSpacing: block.letterSpacing,
      lineWeights: block.lineWeights
    }))
  };
}

async function sampleBackgroundLuminance(params: {
  backgroundPng: Buffer;
  sampleRegion: CleanMinimalTextRegion;
  width: number;
  height: number;
}): Promise<number> {
  const left = clamp(Math.round(params.sampleRegion.left), 0, Math.max(0, params.width - 2));
  const top = clamp(Math.round(params.sampleRegion.top), 0, Math.max(0, params.height - 2));
  const regionWidth = clamp(Math.round(params.sampleRegion.width), 2, Math.max(2, params.width - left));
  const regionHeight = clamp(Math.round(params.sampleRegion.height), 2, Math.max(2, params.height - top));

  const stats = await sharp(params.backgroundPng, { failOn: "none" })
    .extract({
      left,
      top,
      width: regionWidth,
      height: regionHeight
    })
    .stats();

  const red = stats.channels[0]?.mean ?? 128;
  const green = stats.channels[1]?.mean ?? red;
  const blue = stats.channels[2]?.mean ?? green;
  return relativeLuminanceFromRgb(red, green, blue);
}

export async function resolveLockupPaletteForBackground(params: {
  backgroundPng: Buffer;
  sampleRegion: CleanMinimalTextRegion;
  width: number;
  height: number;
}): Promise<ResolvedLockupPalette> {
  const backgroundLuminance = await sampleBackgroundLuminance(params);
  return resolveBaseLockupPalette(backgroundLuminance);
}

export async function chooseTextPaletteForBackground(params: {
  backgroundPng: Buffer;
  sampleRegion: CleanMinimalTextRegion;
  width: number;
  height: number;
  resolvedPalette?: ResolvedLockupPalette;
  titleContrastThreshold?: number;
  subtitleContrastThreshold?: number;
}): Promise<CleanMinimalTextPalette> {
  const backgroundLuminance = await sampleBackgroundLuminance(params);
  const resolvedPalette = params.resolvedPalette || resolveBaseLockupPalette(backgroundLuminance);
  const titleThreshold = params.titleContrastThreshold ?? 3.0;
  const subtitleThreshold = params.subtitleContrastThreshold ?? 4.5;

  let primary = resolvedPalette.titleColor;
  let secondary = resolvedPalette.subtitleColor;
  let tertiary = resolvedPalette.ornamentColor;
  let rule = resolvedPalette.outlineColor;
  let accent = resolvedPalette.accentColor;

  let titleContrast = contrastRatio(backgroundLuminance, relativeLuminanceFromHex(primary));
  let subtitleContrast = contrastRatio(backgroundLuminance, relativeLuminanceFromHex(secondary));
  let forceTitleOutline = titleContrast < titleThreshold;
  let forceTitleShadow = titleContrast < titleThreshold;
  let forceSubtitleShadow = subtitleContrast < subtitleThreshold;

  if (titleContrast + (forceTitleOutline ? 0.6 : 0) < titleThreshold) {
    primary = adjustLightnessForContrast({
      color: primary,
      backgroundLuminance,
      minContrast: titleThreshold
    });
    titleContrast = contrastRatio(backgroundLuminance, relativeLuminanceFromHex(primary));
  }

  if (subtitleContrast + (forceSubtitleShadow ? 0.45 : 0) < subtitleThreshold) {
    secondary = adjustLightnessForContrast({
      color: secondary,
      backgroundLuminance,
      minContrast: subtitleThreshold
    });
    subtitleContrast = contrastRatio(backgroundLuminance, relativeLuminanceFromHex(secondary));
  }

  let safeVariantApplied = false;
  if (titleContrast < titleThreshold || subtitleContrast < subtitleThreshold) {
    safeVariantApplied = true;
    const useDarkText = backgroundLuminance >= 0.5;
    primary = useDarkText ? "#0F172A" : "#F8FAFC";
    secondary = useDarkText ? "#0F172A" : "#F8FAFC";
    tertiary = useDarkText ? "#1E293B" : "#E2E8F0";
    rule = useDarkText ? "#0F172A" : "#F8FAFC";
    accent = useDarkText ? "#0F172A" : "#F8FAFC";
    forceTitleOutline = true;
    forceTitleShadow = true;
    forceSubtitleShadow = true;
    titleContrast = contrastRatio(backgroundLuminance, relativeLuminanceFromHex(primary));
    subtitleContrast = contrastRatio(backgroundLuminance, relativeLuminanceFromHex(secondary));
  }

  const autoScrim = Math.min(titleContrast, subtitleContrast) < 4.8;

  return {
    primary,
    secondary,
    tertiary,
    rule,
    accent,
    autoScrim,
    scrimTint: backgroundLuminance >= 0.57 ? "#FFFFFF" : "#000000",
    forceTitleOutline,
    forceTitleShadow,
    forceSubtitleShadow,
    safeVariantApplied
  };
}

export function buildCleanMinimalOverlaySvg(params: {
  width: number;
  height: number;
  content: CleanMinimalTextContent;
  palette: CleanMinimalTextPalette;
  lockupRecipe?: LockupRecipe;
  lockupPresetId?: string | null;
  styleFamily?: StyleFamily;
  fontSeed?: string | null;
}): string {
  const shape = shapeFromDimensions(params.width, params.height);
  const displayContent = buildOverlayDisplayContent({
    title: params.content.title,
    subtitle: params.content.subtitle,
    scripturePassages: params.content.passage
  });

  const renderConfig = resolveRenderConfig({
    lockupRecipe: params.lockupRecipe,
    lockupPresetId: params.lockupPresetId,
    styleFamily: params.styleFamily,
    fontSeed: params.fontSeed
  });

  return renderLockup({
    backgroundSize: {
      width: params.width,
      height: params.height
    },
    aspect: shape,
    content: {
      title: displayContent.title,
      subtitle: displayContent.subtitle,
      passage: displayContent.scripturePassages
    },
    lockupRecipe: renderConfig.recipe,
    fontPairing: renderConfig.fontPairing,
    palette: params.palette,
    lockupPresetId: renderConfig.lockupPresetId
  }).overlaySvg;
}

export function buildCleanMinimalDesignDoc(params: {
  width: number;
  height: number;
  content: CleanMinimalTextContent;
  palette: CleanMinimalTextPalette;
  backgroundImagePath: string | null;
  lockupRecipe?: LockupRecipe;
  lockupPresetId?: string | null;
  styleFamily?: StyleFamily;
  fontSeed?: string | null;
}): DesignDoc {
  const shape = shapeFromDimensions(params.width, params.height);
  const displayContent = buildOverlayDisplayContent({
    title: params.content.title,
    subtitle: params.content.subtitle,
    scripturePassages: params.content.passage
  });

  const renderConfig = resolveRenderConfig({
    lockupRecipe: params.lockupRecipe,
    lockupPresetId: params.lockupPresetId,
    styleFamily: params.styleFamily,
    fontSeed: params.fontSeed
  });

  const layout = computeLockupLayout({
    backgroundSize: {
      width: params.width,
      height: params.height
    },
    aspect: shape,
    content: {
      title: displayContent.title,
      subtitle: displayContent.subtitle,
      passage: displayContent.scripturePassages
    },
    lockupRecipe: renderConfig.recipe,
    fontPairing: renderConfig.fontPairing,
    lockupPresetId: renderConfig.lockupPresetId
  });

  return {
    width: params.width,
    height: params.height,
    backgroundImagePath: params.backgroundImagePath,
    background: {
      color: "#F8FAFC"
    },
    layers: buildLockupDesignLayers({
      layout,
      palette: params.palette
    })
  };
}
