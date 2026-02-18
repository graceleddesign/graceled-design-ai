import type { DesignDoc, DesignLayer } from "@/lib/design-doc";
import { buildOverlayDisplayContent } from "@/lib/overlay-lines";

const SHAPE_DIMENSIONS = {
  square: { width: 1080, height: 1080 },
  wide: { width: 1920, height: 1080 },
  tall: { width: 1080, height: 1920 }
} as const;

export type TemplateShape = "square" | "wide" | "tall";

type TemplateProjectInput = {
  title: string;
  subtitle: string | null;
  passage: string | null;
  description: string | null;
};

type TemplateBrandInput = {
  palette: string[];
  logoPath: string | null;
};

export type BuildTemplateDesignDocParams = {
  presetKey: string;
  shape: TemplateShape;
  optionIndex: number;
  round: number;
  project: TemplateProjectInput;
  brand: TemplateBrandInput;
  seed: string;
};

type NormalizedTemplateContext = {
  title: string;
  subtitle: string;
  passage: string;
  palette: string[];
  logoPath: string | null;
  optionIndex: number;
  round: number;
  variant: number;
  seed: string;
};

type ShapeMetrics = {
  width: number;
  height: number;
  safeX: number;
  safeY: number;
  safeW: number;
  safeH: number;
  titleMin: number;
  titleMax: number;
  subtitleSize: number;
  passageSize: number;
  descriptionSize: number;
  logoWidth: number;
};

type TemplatePalette = {
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentStrong: string;
  rule: string;
};

type TitleFit = {
  text: string;
  fontSize: number;
  lineCount: number;
  lineHeight: number;
};

type SeededRandom = {
  next: () => number;
  float: (min: number, max: number) => number;
  int: (min: number, max: number) => number;
  bool: (probability?: number) => boolean;
};

const DEFAULT_PALETTE = ["#0F172A", "#1E293B", "#F8FAFC", "#0EA5E9", "#14B8A6", "#F97316"];
const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cleanCopy(value: string | null | undefined): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeLogoPath(value: string | null | undefined): string | null {
  const normalized = cleanCopy(value);
  if (!normalized) {
    return null;
  }

  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function normalizeHexColor(value: string): string {
  if (!HEX_COLOR_REGEX.test(value)) {
    return "";
  }

  if (value.length === 4) {
    const [_, r, g, b] = value;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  return value.toUpperCase();
}

function normalizePalette(colors: string[]): string[] {
  const normalized: string[] = [];

  for (const color of colors) {
    if (typeof color !== "string") {
      continue;
    }

    const candidate = normalizeHexColor(color.trim());
    if (!candidate || normalized.includes(candidate)) {
      continue;
    }

    normalized.push(candidate);
  }

  return normalized.length > 0 ? normalized : DEFAULT_PALETTE;
}

function parseHex(color: string): [number, number, number] {
  const normalized = normalizeHexColor(color);
  if (!normalized) {
    return [15, 23, 42];
  }

  const value = normalized.slice(1);
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16)
  ];
}

function clampByte(value: number): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 255) {
    return 255;
  }

  return Math.round(value);
}

function toHex(rgb: [number, number, number]): string {
  const [r, g, b] = rgb;
  return `#${clampByte(r).toString(16).padStart(2, "0")}${clampByte(g).toString(16).padStart(2, "0")}${clampByte(b)
    .toString(16)
    .padStart(2, "0")}`.toUpperCase();
}

function mixHex(a: string, b: string, amount: number): string {
  const factor = clamp(amount, 0, 1);
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);

  return toHex([
    ar + (br - ar) * factor,
    ag + (bg - ag) * factor,
    ab + (bb - ab) * factor
  ]);
}

function lightenHex(color: string, amount: number): string {
  return mixHex(color, "#FFFFFF", amount);
}

function darkenHex(color: string, amount: number): string {
  return mixHex(color, "#000000", amount);
}

function channelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  const [r, g, b] = parseHex(color);
  return 0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b);
}

function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

function readableTextOn(background: string): string {
  return luminance(background) > 0.35 ? "#0F172A" : "#F8FAFC";
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seed: number): SeededRandom {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    float(min: number, max: number) {
      return min + (max - min) * next();
    },
    int(min: number, max: number) {
      if (max <= min) {
        return min;
      }

      return Math.floor(min + next() * (max - min + 1));
    },
    bool(probability = 0.5) {
      return next() < probability;
    }
  };
}

function maxCharsForWidth(width: number, fontSize: number, factor = 0.56): number {
  return Math.max(8, Math.floor(width / (fontSize * factor)));
}

function wrapWords(words: string[], maxCharsPerLine: number): string[] {
  if (words.length === 0) {
    return [];
  }

  const lines: string[] = [];
  let currentWords: string[] = [];

  for (const word of words) {
    const candidate = currentWords.length === 0 ? word : `${currentWords.join(" ")} ${word}`;
    if (candidate.length <= maxCharsPerLine || currentWords.length === 0) {
      currentWords.push(word);
      continue;
    }

    lines.push(currentWords.join(" "));
    currentWords = [word];
  }

  if (currentWords.length > 0) {
    lines.push(currentWords.join(" "));
  }

  return lines;
}

function trimLineWithEllipsis(line: string, maxChars: number): string {
  if (line.length <= maxChars) {
    return line;
  }

  const target = Math.max(3, maxChars - 1);
  const shortened = line.slice(0, target).trimEnd();
  return `${shortened.replace(/[.,;:!?-]+$/, "")}…`;
}

function wrapAndClamp(text: string, maxCharsPerLine: number, maxLines: number): string {
  const normalized = cleanCopy(text);
  if (!normalized) {
    return "";
  }

  const wrapped = wrapWords(normalized.split(" "), maxCharsPerLine);
  if (wrapped.length <= maxLines) {
    return wrapped.join("\n");
  }

  const clamped = wrapped.slice(0, maxLines);
  const lastIndex = clamped.length - 1;
  clamped[lastIndex] = trimLineWithEllipsis(clamped[lastIndex], maxCharsPerLine);
  return clamped.join("\n");
}

function scoreLineBalance(lines: string[]): number {
  if (lines.length <= 1) {
    return 0;
  }

  const lengths = lines.map((line) => line.length);
  const mean = lengths.reduce((sum, length) => sum + length, 0) / lengths.length;
  return lengths.reduce((sum, length) => sum + Math.abs(length - mean), 0);
}

function fitTitleText(params: {
  text: string;
  width: number;
  maxHeight: number;
  minSize: number;
  maxSize: number;
  maxLines: number;
}): TitleFit {
  const words = cleanCopy(params.text).split(" ").filter(Boolean);

  if (words.length === 0) {
    return {
      text: "Untitled Series",
      fontSize: params.minSize,
      lineCount: 1,
      lineHeight: Math.round(params.minSize * 1.2)
    };
  }

  let best: TitleFit | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let fontSize = params.maxSize; fontSize >= params.minSize; fontSize -= 2) {
    const maxChars = maxCharsForWidth(params.width, fontSize, 0.54);
    const lines = wrapWords(words, maxChars);

    if (lines.length === 0 || lines.length > params.maxLines) {
      continue;
    }

    const lineHeight = Math.round(fontSize * 1.2);
    const height = lineHeight * lines.length;
    if (height > params.maxHeight) {
      continue;
    }

    const widowPenalty = lines.length > 1 && lines[lines.length - 1].split(" ").length === 1 ? 12 : 0;
    const score = fontSize * 5 - scoreLineBalance(lines) - widowPenalty;

    if (score > bestScore) {
      bestScore = score;
      best = {
        text: lines.join("\n"),
        fontSize,
        lineCount: lines.length,
        lineHeight
      };
    }
  }

  if (best) {
    return best;
  }

  const fallbackSize = params.minSize;
  const fallbackLines = wrapWords(words, maxCharsForWidth(params.width, fallbackSize, 0.54)).slice(0, params.maxLines);
  return {
    text: fallbackLines.join("\n"),
    fontSize: fallbackSize,
    lineCount: fallbackLines.length || 1,
    lineHeight: Math.round(fallbackSize * 1.2)
  };
}

function normalizeContext(params: BuildTemplateDesignDocParams): NormalizedTemplateContext {
  const displayContent = buildOverlayDisplayContent({
    title: params.project.title,
    subtitle: params.project.subtitle,
    scripturePassages: params.project.passage
  });

  return {
    title: cleanCopy(displayContent.title) || "Untitled Series",
    subtitle: cleanCopy(displayContent.subtitle),
    passage: cleanCopy(displayContent.scripturePassages),
    palette: normalizePalette(Array.isArray(params.brand.palette) ? params.brand.palette : []),
    logoPath: normalizeLogoPath(params.brand.logoPath),
    optionIndex: Number.isFinite(params.optionIndex) ? Math.max(0, Math.floor(params.optionIndex)) : 0,
    round: Number.isFinite(params.round) ? Math.max(1, Math.floor(params.round)) : 1,
    variant: Number.isFinite(params.optionIndex) ? Math.abs(Math.floor(params.optionIndex)) % 3 : 0,
    seed: cleanCopy(params.seed) || `${params.presetKey}|${params.shape}|${params.optionIndex}|${params.round}`
  };
}

function getShapeMetrics(shape: TemplateShape): ShapeMetrics {
  const dimensions = SHAPE_DIMENSIONS[shape];

  if (shape === "wide") {
    const safeX = 142;
    const safeY = 86;
    return {
      width: dimensions.width,
      height: dimensions.height,
      safeX,
      safeY,
      safeW: dimensions.width - safeX * 2,
      safeH: dimensions.height - safeY * 2,
      titleMin: 64,
      titleMax: 136,
      subtitleSize: 31,
      passageSize: 24,
      descriptionSize: 19,
      logoWidth: 170
    };
  }

  if (shape === "tall") {
    const safeX = 92;
    const safeY = 134;
    return {
      width: dimensions.width,
      height: dimensions.height,
      safeX,
      safeY,
      safeW: dimensions.width - safeX * 2,
      safeH: dimensions.height - safeY * 2,
      titleMin: 64,
      titleMax: 130,
      subtitleSize: 30,
      passageSize: 24,
      descriptionSize: 20,
      logoWidth: 138
    };
  }

  const safeX = 90;
  const safeY = 90;
  return {
    width: dimensions.width,
    height: dimensions.height,
    safeX,
    safeY,
    safeW: dimensions.width - safeX * 2,
    safeH: dimensions.height - safeY * 2,
    titleMin: 56,
    titleMax: 116,
    subtitleSize: 29,
    passageSize: 23,
    descriptionSize: 18,
    logoWidth: 136
  };
}

function chooseAccent(palette: string[], background: string, darkMode: boolean): string {
  const candidates = [palette[3], palette[4], palette[5], palette[1], "#0EA5E9"]
    .filter((color): color is string => typeof color === "string" && Boolean(color));

  let best = candidates[0] || "#0EA5E9";
  let bestRatio = contrastRatio(best, background);

  for (const candidate of candidates.slice(1)) {
    const ratio = contrastRatio(candidate, background);
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
  }

  if (bestRatio < 2.2) {
    return darkMode ? lightenHex(best, 0.28) : darkenHex(best, 0.28);
  }

  return best;
}

function buildPalette(ctx: NormalizedTemplateContext): TemplatePalette {
  const primaryBase = ctx.palette[2] || ctx.palette[0] || "#F8FAFC";
  const darkMode = luminance(primaryBase) < 0.32;

  const background = darkMode ? mixHex(primaryBase, "#0B1220", 0.15) : mixHex(primaryBase, "#FFFFFF", 0.12);
  const accent = chooseAccent(ctx.palette, background, darkMode);
  const textPrimary = readableTextOn(background);

  return {
    background,
    surface: darkMode ? mixHex(background, "#FFFFFF", 0.06) : mixHex(background, "#0F172A", 0.04),
    textPrimary,
    textSecondary: darkMode ? mixHex("#FFFFFF", accent, 0.26) : mixHex("#0F172A", accent, 0.36),
    textMuted: darkMode ? mixHex("#FFFFFF", background, 0.42) : mixHex("#0F172A", background, 0.52),
    accent,
    accentStrong: darkMode ? lightenHex(accent, 0.06) : darkenHex(accent, 0.08),
    rule: darkMode ? mixHex(background, "#FFFFFF", 0.17) : mixHex(background, "#0F172A", 0.2)
  };
}

function createTextureLayers(metrics: ShapeMetrics, palette: TemplatePalette, rng: SeededRandom): DesignLayer[] {
  const tintTarget = luminance(palette.background) > 0.35 ? darkenHex(palette.accent, 0.42) : lightenHex(palette.accent, 0.4);
  const bandCount = metrics.height > metrics.width ? 30 : metrics.width > metrics.height ? 24 : 22;
  const bandHeight = Math.ceil(metrics.height / bandCount);

  const layers: DesignLayer[] = [];

  for (let index = 0; index < bandCount; index += 1) {
    const t = bandCount <= 1 ? 0 : index / (bandCount - 1);
    const wave = Math.abs(0.5 - t) * 2;
    const blend = 0.012 + wave * 0.018 + rng.float(0, 0.008);
    const color = mixHex(palette.background, tintTarget, blend);

    layers.push({
      type: "shape",
      x: 0,
      y: index * bandHeight,
      w: metrics.width,
      h: bandHeight + 1,
      shape: "rect",
      fill: color,
      stroke: color,
      strokeWidth: 0
    });
  }

  const grainCount = metrics.width > metrics.height ? 96 : metrics.height > metrics.width ? 88 : 76;
  for (let index = 0; index < grainCount; index += 1) {
    const size = rng.int(1, 2);
    const color = rng.bool(0.58)
      ? mixHex(palette.background, palette.textPrimary, rng.float(0.03, 0.065))
      : mixHex(palette.background, palette.accent, rng.float(0.025, 0.06));

    layers.push({
      type: "shape",
      x: rng.float(metrics.safeX, metrics.safeX + metrics.safeW - size),
      y: rng.float(metrics.safeY, metrics.safeY + metrics.safeH - size),
      w: size,
      h: size,
      shape: "rect",
      fill: color,
      stroke: color,
      strokeWidth: 0
    });
  }

  return layers;
}

function addLogoLayer(layers: DesignLayer[], logoPath: string | null, metrics: ShapeMetrics): void {
  if (!logoPath) {
    return;
  }

  const logoWidth = metrics.logoWidth;
  const logoHeight = Math.round(logoWidth * 0.42);

  layers.push({
    type: "image",
    x: metrics.safeX + metrics.safeW - logoWidth,
    y: metrics.safeY + metrics.safeH - logoHeight,
    w: logoWidth,
    h: logoHeight,
    src: logoPath
  });
}

function createVariantLeftRule(
  ctx: NormalizedTemplateContext,
  shape: TemplateShape,
  metrics: ShapeMetrics,
  palette: TemplatePalette,
  rng: SeededRandom
): DesignLayer[] {
  const ruleWidth = clamp(Math.round(Math.min(metrics.width, metrics.height) * 0.008) + rng.int(-1, 2), 6, 12);
  const ruleX = metrics.safeX + rng.int(0, 4);
  const ruleY = metrics.safeY + Math.round(metrics.safeH * 0.06);
  const ruleH = metrics.safeH - Math.round(metrics.safeH * 0.12);

  const titleX = ruleX + ruleWidth + Math.round(metrics.safeW * (shape === "wide" ? 0.06 : 0.08));
  const titleW = shape === "wide" ? Math.round(metrics.safeW * 0.56) : Math.round(metrics.safeW * 0.76);
  const titleY = metrics.safeY + Math.round(metrics.safeH * (shape === "tall" ? 0.13 : 0.16));
  const titleH = Math.round(metrics.safeH * (shape === "tall" ? 0.36 : 0.32));

  const titleFit = fitTitleText({
    text: ctx.title,
    width: titleW,
    maxHeight: titleH,
    minSize: metrics.titleMin,
    maxSize: metrics.titleMax,
    maxLines: shape === "tall" ? 4 : 3
  });

  const subtitleY = titleY + titleFit.lineCount * titleFit.lineHeight + Math.round(metrics.safeH * 0.05);
  const subtitleText = wrapAndClamp(
    ctx.subtitle.toUpperCase(),
    maxCharsForWidth(titleW, metrics.subtitleSize, 0.53),
    2
  );
  const subtitleLines = subtitleText ? subtitleText.split("\n").length : 0;

  const passageText = wrapAndClamp(ctx.passage, maxCharsForWidth(titleW, metrics.passageSize, 0.55), shape === "tall" ? 3 : 2);
  const passageY = subtitleY + subtitleLines * metrics.subtitleSize * 1.24 + Math.round(metrics.safeH * 0.03);

  const microRuleW = shape === "wide" ? 214 : 146;
  const microRuleY = metrics.safeY + metrics.safeH - Math.round(metrics.safeH * 0.045);

  const layers: DesignLayer[] = [
    {
      type: "shape",
      x: ruleX,
      y: ruleY,
      w: ruleWidth,
      h: ruleH,
      shape: "rect",
      fill: palette.accentStrong,
      stroke: palette.accentStrong,
      strokeWidth: 0
    },
    {
      type: "shape",
      x: metrics.safeX,
      y: metrics.safeY,
      w: metrics.safeW,
      h: 1,
      shape: "rect",
      fill: palette.rule,
      stroke: palette.rule,
      strokeWidth: 0
    },
    {
      type: "text",
      x: titleX,
      y: titleY,
      w: titleW,
      h: titleH,
      text: titleFit.text,
      fontSize: titleFit.fontSize,
      fontFamily: "Inter, Arial, sans-serif",
      fontWeight: 800,
      color: palette.textPrimary,
      align: "left"
    }
  ];

  if (subtitleText) {
    layers.push({
      type: "text",
      x: titleX,
      y: subtitleY,
      w: titleW,
      h: subtitleLines * metrics.subtitleSize * 1.25 + 8,
      text: subtitleText,
      fontSize: metrics.subtitleSize,
      fontFamily: "Inter, Arial, sans-serif",
      fontWeight: 600,
      color: palette.textSecondary,
      align: "left"
    });
  }

  if (passageText) {
    const passageLines = passageText.split("\n").length;
    layers.push({
      type: "text",
      x: titleX,
      y: passageY,
      w: titleW,
      h: passageLines * metrics.passageSize * 1.24 + 8,
      text: passageText,
      fontSize: metrics.passageSize,
      fontFamily: "DM Serif Display, Georgia, serif",
      fontWeight: 500,
      color: palette.textMuted,
      align: "left"
    });
  }

  layers.push(
    {
      type: "shape",
      x: metrics.safeX + metrics.safeW - microRuleW,
      y: microRuleY,
      w: microRuleW,
      h: 2,
      shape: "rect",
      fill: mixHex(palette.accentStrong, palette.textPrimary, 0.28),
      stroke: mixHex(palette.accentStrong, palette.textPrimary, 0.28),
      strokeWidth: 0
    },
    {
      type: "shape",
      x: metrics.safeX + metrics.safeW - 10,
      y: microRuleY - 24,
      w: 10,
      h: 10,
      shape: "rect",
      fill: palette.accentStrong,
      stroke: palette.accentStrong,
      strokeWidth: 0
    }
  );

  return layers;
}

function createVariantCenteredRule(
  ctx: NormalizedTemplateContext,
  shape: TemplateShape,
  metrics: ShapeMetrics,
  palette: TemplatePalette,
  rng: SeededRandom
): DesignLayer[] {
  const topRuleWidth = Math.round(metrics.safeW * (shape === "wide" ? 0.44 : 0.58));
  const topRuleX = metrics.safeX + Math.round((metrics.safeW - topRuleWidth) / 2);
  const topRuleY = metrics.safeY + Math.round(metrics.safeH * 0.08);
  const markerSize = shape === "wide" ? 18 : 14;

  const titleW = Math.round(metrics.safeW * (shape === "wide" ? 0.62 : 0.8));
  const titleX = metrics.safeX + Math.round((metrics.safeW - titleW) / 2);
  const titleY = metrics.safeY + Math.round(metrics.safeH * (shape === "tall" ? 0.25 : 0.24));
  const titleH = Math.round(metrics.safeH * (shape === "tall" ? 0.29 : 0.3));

  const titleFit = fitTitleText({
    text: ctx.title,
    width: titleW,
    maxHeight: titleH,
    minSize: Math.max(52, metrics.titleMin - 4),
    maxSize: Math.max(84, metrics.titleMax - 10),
    maxLines: shape === "tall" ? 4 : 3
  });

  const subtitleText = wrapAndClamp(
    ctx.subtitle.toUpperCase(),
    maxCharsForWidth(titleW, metrics.subtitleSize, 0.52),
    2
  );
  const subtitleLines = subtitleText ? subtitleText.split("\n").length : 0;

  const passageText = wrapAndClamp(ctx.passage, maxCharsForWidth(titleW, metrics.passageSize, 0.55), shape === "tall" ? 4 : 2);

  const subtitleY = titleY + titleFit.lineCount * titleFit.lineHeight + Math.round(metrics.safeH * 0.05);
  const passageY = subtitleY + subtitleLines * metrics.subtitleSize * 1.24 + Math.round(metrics.safeH * 0.03);

  const layers: DesignLayer[] = [
    {
      type: "shape",
      x: topRuleX,
      y: topRuleY,
      w: topRuleWidth,
      h: 2,
      shape: "rect",
      fill: palette.accentStrong,
      stroke: palette.accentStrong,
      strokeWidth: 0
    },
    {
      type: "shape",
      x: metrics.safeX + Math.round(metrics.safeW / 2) - Math.round(markerSize / 2),
      y: topRuleY - Math.round(markerSize * 0.7),
      w: markerSize,
      h: markerSize,
      shape: "rect",
      fill: palette.accentStrong,
      stroke: palette.accentStrong,
      strokeWidth: 0,
      rotation: rng.float(-3, 3)
    },
    {
      type: "text",
      x: titleX,
      y: titleY,
      w: titleW,
      h: titleH,
      text: titleFit.text,
      fontSize: titleFit.fontSize,
      fontFamily: "Inter, Arial, sans-serif",
      fontWeight: 800,
      color: palette.textPrimary,
      align: "center"
    }
  ];

  if (subtitleText) {
    layers.push({
      type: "text",
      x: titleX,
      y: subtitleY,
      w: titleW,
      h: subtitleLines * metrics.subtitleSize * 1.25 + 8,
      text: subtitleText,
      fontSize: metrics.subtitleSize,
      fontFamily: "Inter, Arial, sans-serif",
      fontWeight: 600,
      color: palette.textSecondary,
      align: "center"
    });
  }

  if (passageText) {
    const passageLines = passageText.split("\n").length;
    layers.push({
      type: "text",
      x: titleX,
      y: passageY,
      w: titleW,
      h: passageLines * metrics.passageSize * 1.22 + 8,
      text: passageText,
      fontSize: metrics.passageSize,
      fontFamily: "DM Serif Display, Georgia, serif",
      fontWeight: 500,
      color: palette.textMuted,
      align: "center"
    });
  }

  const bottomY = metrics.safeY + metrics.safeH - Math.round(metrics.safeH * 0.09);
  layers.push(
    {
      type: "shape",
      x: metrics.safeX,
      y: bottomY - 20,
      w: 28,
      h: 2,
      shape: "rect",
      fill: palette.rule,
      stroke: palette.rule,
      strokeWidth: 0
    },
    {
      type: "shape",
      x: metrics.safeX + metrics.safeW - 28,
      y: bottomY - 20,
      w: 28,
      h: 2,
      shape: "rect",
      fill: palette.rule,
      stroke: palette.rule,
      strokeWidth: 0
    }
  );

  return layers;
}

function createVariantInsetCard(
  ctx: NormalizedTemplateContext,
  shape: TemplateShape,
  metrics: ShapeMetrics,
  palette: TemplatePalette
): DesignLayer[] {
  const cardInset = shape === "wide" ? 18 : 14;
  const cardX = metrics.safeX + cardInset;
  const cardY = metrics.safeY + cardInset;
  const cardW = metrics.safeW - cardInset * 2;
  const cardH = metrics.safeH - cardInset * 2;

  const titleAreaW = shape === "wide" ? Math.round(cardW * 0.58) : Math.round(cardW * 0.84);
  const titleAreaX = cardX + Math.round(cardW * 0.08);
  const titleAreaY = cardY + Math.round(cardH * 0.14);
  const titleAreaH = Math.round(cardH * (shape === "tall" ? 0.36 : 0.34));

  const titleFit = fitTitleText({
    text: ctx.title,
    width: titleAreaW,
    maxHeight: titleAreaH,
    minSize: metrics.titleMin,
    maxSize: metrics.titleMax - 8,
    maxLines: shape === "wide" ? 3 : 4
  });

  const rightMetaX =
    shape === "wide" ? cardX + Math.round(cardW * 0.66) : cardX + Math.round(cardW * 0.38);
  const rightMetaW =
    shape === "wide" ? Math.round(cardW * 0.26) : Math.round(cardW * 0.54);
  const rightMetaY =
    shape === "wide" ? cardY + Math.round(cardH * 0.5) : cardY + Math.round(cardH * 0.58);

  const subtitleText = wrapAndClamp(
    ctx.subtitle.toUpperCase(),
    maxCharsForWidth(rightMetaW, metrics.subtitleSize, 0.52),
    2
  );
  const subtitleLines = subtitleText ? subtitleText.split("\n").length : 0;

  const passageText = wrapAndClamp(ctx.passage, maxCharsForWidth(rightMetaW, metrics.passageSize, 0.54), shape === "tall" ? 3 : 2);

  const layers: DesignLayer[] = [
    {
      type: "shape",
      x: cardX,
      y: cardY,
      w: cardW,
      h: cardH,
      shape: "rect",
      fill: palette.surface,
      stroke: palette.rule,
      strokeWidth: 2
    },
    {
      type: "shape",
      x: cardX + 18,
      y: cardY + 22,
      w: 78,
      h: 2,
      shape: "rect",
      fill: palette.accentStrong,
      stroke: palette.accentStrong,
      strokeWidth: 0
    },
    {
      type: "shape",
      x: cardX + 18,
      y: cardY + 22,
      w: 2,
      h: 44,
      shape: "rect",
      fill: palette.accentStrong,
      stroke: palette.accentStrong,
      strokeWidth: 0
    },
    {
      type: "shape",
      x: cardX + cardW - 30,
      y: cardY + 20,
      w: 12,
      h: 12,
      shape: "rect",
      fill: palette.accentStrong,
      stroke: palette.accentStrong,
      strokeWidth: 0
    },
    {
      type: "text",
      x: titleAreaX,
      y: titleAreaY,
      w: titleAreaW,
      h: titleAreaH,
      text: titleFit.text,
      fontSize: titleFit.fontSize,
      fontFamily: "Inter, Arial, sans-serif",
      fontWeight: 800,
      color: palette.textPrimary,
      align: "left"
    }
  ];

  if (subtitleText) {
    layers.push({
      type: "text",
      x: rightMetaX,
      y: rightMetaY,
      w: rightMetaW,
      h: subtitleLines * metrics.subtitleSize * 1.24 + 8,
      text: subtitleText,
      fontSize: metrics.subtitleSize,
      fontFamily: "Inter, Arial, sans-serif",
      fontWeight: 600,
      color: palette.textSecondary,
      align: "right"
    });
  }

  if (passageText) {
    const passageLines = passageText.split("\n").length;
    const passageY = rightMetaY + subtitleLines * metrics.subtitleSize * 1.24 + Math.round(cardH * 0.03);

    layers.push({
      type: "text",
      x: rightMetaX,
      y: passageY,
      w: rightMetaW,
      h: passageLines * metrics.passageSize * 1.22 + 8,
      text: passageText,
      fontSize: metrics.passageSize,
      fontFamily: "DM Serif Display, Georgia, serif",
      fontWeight: 500,
      color: palette.textMuted,
      align: "right"
    });
  }

  layers.push(
    {
      type: "shape",
      x: cardX + cardW - 4,
      y: cardY + Math.round(cardH * 0.52),
      w: 4,
      h: Math.round(cardH * 0.26),
      shape: "rect",
      fill: mixHex(palette.accentStrong, palette.surface, 0.22),
      stroke: mixHex(palette.accentStrong, palette.surface, 0.22),
      strokeWidth: 0
    }
  );

  return layers;
}

function buildTypeCleanMinDoc(ctx: NormalizedTemplateContext, shape: TemplateShape): DesignDoc {
  const metrics = getShapeMetrics(shape);
  const palette = buildPalette(ctx);
  const rng = createSeededRandom(hashString(`${ctx.seed}|${shape}|${ctx.round}|${ctx.optionIndex}`));

  const layers: DesignLayer[] = [...createTextureLayers(metrics, palette, rng)];

  if (ctx.variant === 0) {
    layers.push(...createVariantLeftRule(ctx, shape, metrics, palette, rng));
  } else if (ctx.variant === 1) {
    layers.push(...createVariantCenteredRule(ctx, shape, metrics, palette, rng));
  } else {
    // Avoid hard-edged inset panels; keep this lane text-forward and open.
    layers.push(...createVariantLeftRule(ctx, shape, metrics, palette, rng));
  }

  addLogoLayer(layers, ctx.logoPath, metrics);

  return {
    width: metrics.width,
    height: metrics.height,
    background: {
      color: palette.background
    },
    layers
  };
}

export function buildTemplateDesignDoc(params: BuildTemplateDesignDocParams): DesignDoc | null {
  if (params.presetKey !== "type_clean_min_v1") {
    return null;
  }

  const context = normalizeContext(params);
  return buildTypeCleanMinDoc(context, params.shape);
}
