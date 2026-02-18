import sharp from "sharp";
import type { LockupRecipe } from "@/lib/design-brief";
import type { DesignDoc, DesignLayer } from "@/lib/design-doc";
import { buildOverlayDisplayContent } from "@/lib/overlay-lines";

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
};

export type CleanMinimalTextRegion = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type CleanMinimalTextPalette = {
  primary: string;
  secondary: string;
  tertiary: string;
  rule: string;
  accent: string;
  autoScrim: boolean;
  scrimTint: "#FFFFFF" | "#000000";
};

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

const TITLE_STACK = "'Inter','Helvetica','Arial',sans-serif";
const BODY_STACK = "'Inter','Helvetica','Arial',sans-serif";
const SERIF_STACK = "'Georgia','Times New Roman',serif";
const DEFAULT_LOCKUP_RECIPE: LockupRecipe = {
  layoutIntent: "minimal_clean",
  titleTreatment: "singleline",
  hierarchy: {
    titleScale: 1.2,
    subtitleScale: 0.56,
    tracking: 0.02,
    case: "upper"
  },
  alignment: "left",
  placement: {
    anchor: "top_left",
    safeMarginPct: 0.08,
    maxTitleWidthPct: 0.55
  },
  ornament: {
    kind: "rule_dot",
    weight: "thin"
  }
};

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function estimateCharsPerLine(width: number, fontSize: number): number {
  const averageCharWidth = Math.max(1, fontSize * 0.56);
  return Math.max(8, Math.floor(width / averageCharWidth));
}

function wrapText(value: string, maxCharsPerLine: number, maxLines: number): string[] {
  if (!value.trim()) {
    return [];
  }

  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(word.slice(0, maxCharsPerLine));
      current = word.slice(maxCharsPerLine);
    }

    if (lines.length >= maxLines) {
      break;
    }
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  }

  return lines.slice(0, maxLines);
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function applyCaseTreatment(value: string, mode: LockupRecipe["hierarchy"]["case"]): string {
  if (!value.trim()) {
    return "";
  }

  if (mode === "upper" || mode === "small_caps") {
    return value.toUpperCase();
  }
  if (mode === "title_case") {
    return toTitleCase(value);
  }

  return value;
}

function maxTitleLinesForTreatment(
  treatment: LockupRecipe["titleTreatment"],
  shape: CleanMinimalShape
): number {
  if (treatment === "singleline") {
    return 1;
  }
  if (treatment === "split") {
    return 2;
  }
  if (treatment === "stacked") {
    return shape === "tall" ? 4 : 3;
  }
  if (treatment === "boxed") {
    return 3;
  }
  return 2;
}

function chooseTitleFontSizeByLength(titleLength: number, shape: CleanMinimalShape, width: number, height: number): number {
  const base = Math.min(width, height);
  const laneFactor = shape === "wide" ? 0.98 : shape === "tall" ? 1.04 : 1;

  if (titleLength <= 18) {
    return Math.round(base * 0.117 * laneFactor);
  }
  if (titleLength <= 34) {
    return Math.round(base * 0.098 * laneFactor);
  }
  if (titleLength <= 52) {
    return Math.round(base * 0.083 * laneFactor);
  }
  return Math.round(base * 0.071 * laneFactor);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderTextBlockSvg(block: TextBlockLayout, color: string): string {
  if (block.lines.length === 0) {
    return "";
  }

  const firstBaseline = block.y + block.fontSize;
  const textX = block.align === "center" ? block.x + block.w / 2 : block.align === "right" ? block.x + block.w : block.x;
  const textAnchor = block.align === "center" ? "middle" : block.align === "right" ? "end" : "start";
  const lineParts = block.lines.map((line, index) => {
    const y = firstBaseline + index * block.lineHeight;
    return `<tspan x="${textX}" y="${y}">${escapeXml(line)}</tspan>`;
  });

  const letterSpacing = Number.isFinite(block.letterSpacing) ? block.letterSpacing : 0;
  return `<text x="${textX}" y="${firstBaseline}" fill="${color}" font-family="${block.fontFamily}" font-size="${block.fontSize}" font-weight="${block.fontWeight}" text-anchor="${textAnchor}" letter-spacing="${letterSpacing}">${lineParts.join("")}</text>`;
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

export function computeCleanMinimalLayout(params: {
  width: number;
  height: number;
  content: CleanMinimalTextContent;
  lockupRecipe?: LockupRecipe;
}): CleanMinimalLayout {
  const shape = shapeFromDimensions(params.width, params.height);
  const width = params.width;
  const height = params.height;
  const recipe = params.lockupRecipe || DEFAULT_LOCKUP_RECIPE;
  const marginX = Math.round(width * recipe.placement.safeMarginPct);
  const marginY = Math.round(height * recipe.placement.safeMarginPct);
  const displayContent = buildOverlayDisplayContent({
    title: params.content.title,
    subtitle: params.content.subtitle,
    scripturePassages: params.content.passage
  });

  const textWidth = clamp(
    Math.round(width * recipe.placement.maxTitleWidthPct),
    Math.round(width * 0.32),
    Math.round(width * 0.8)
  );
  const centeredAnchor =
    recipe.placement.anchor === "top_center" ||
    recipe.placement.anchor === "bottom_center" ||
    recipe.placement.anchor === "center";
  const textX =
    centeredAnchor
      ? Math.round((width - textWidth) / 2)
      : recipe.alignment === "left"
      ? marginX
      : recipe.alignment === "center"
        ? Math.round((width - textWidth) / 2)
        : Math.max(0, width - marginX - textWidth);
  const title = applyCaseTreatment(displayContent.title, recipe.hierarchy.case);
  const subtitle = applyCaseTreatment(displayContent.subtitle, recipe.hierarchy.case);
  const passage = applyCaseTreatment(displayContent.scripturePassages, recipe.hierarchy.case === "as_is" ? "as_is" : "title_case");

  const baseTitleFontSize = chooseTitleFontSizeByLength(title.length, shape, width, height);
  const titleFontSize = clamp(
    Math.round(baseTitleFontSize * recipe.hierarchy.titleScale),
    44,
    shape === "tall" ? 170 : 148
  );
  const subtitleFontSize = clamp(Math.round(titleFontSize * recipe.hierarchy.subtitleScale), 18, 64);
  const passageFontSize = clamp(Math.round(subtitleFontSize * 0.82), 18, 40);

  const titleLines = wrapText(
    title,
    estimateCharsPerLine(textWidth, titleFontSize),
    maxTitleLinesForTreatment(recipe.titleTreatment, shape)
  );
  const subtitleLines = wrapText(subtitle, estimateCharsPerLine(textWidth, subtitleFontSize), 2);
  const passageLines = wrapText(passage, estimateCharsPerLine(textWidth, passageFontSize), 2);

  const blocks: TextBlockLayout[] = [];
  const titleLineHeight = Math.round(titleFontSize * 1.08);
  const subtitleLineHeight = Math.round(subtitleFontSize * 1.2);
  const passageLineHeight = Math.round(passageFontSize * 1.24);
  const titleHeight = Math.max(titleFontSize + 10, titleLines.length * titleLineHeight);
  const subtitleHeight = subtitleLines.length > 0 ? Math.max(subtitleFontSize + 8, subtitleLines.length * subtitleLineHeight) : 0;
  const passageHeight = passageLines.length > 0 ? Math.max(passageFontSize + 6, passageLines.length * passageLineHeight) : 0;
  const blockGap = Math.round(height * 0.018);
  const totalContentHeight =
    titleHeight + (subtitleHeight > 0 ? subtitleHeight + blockGap : 0) + (passageHeight > 0 ? passageHeight + blockGap : 0);
  let currentY = marginY + Math.round(height * (shape === "tall" ? 0.02 : 0.015));

  if (recipe.placement.anchor === "center") {
    currentY = Math.round((height - totalContentHeight) / 2);
  } else if (recipe.placement.anchor === "bottom_left" || recipe.placement.anchor === "bottom_center") {
    currentY = height - marginY - totalContentHeight;
  }

  currentY = clamp(currentY, marginY, Math.max(marginY, height - marginY - totalContentHeight));

  blocks.push({
    key: "title",
    x: textX,
    y: currentY,
    w: textWidth,
    h: titleHeight,
    fontSize: titleFontSize,
    fontWeight: 720,
    lineHeight: titleLineHeight,
    fontFamily: TITLE_STACK,
    lines: titleLines,
    align: recipe.alignment,
    letterSpacing: clamp(Math.round(titleFontSize * recipe.hierarchy.tracking), -12, 22)
  });

  currentY += titleHeight + blockGap;

  if (subtitleLines.length > 0) {
    blocks.push({
      key: "subtitle",
      x: textX,
      y: currentY,
      w: textWidth,
      h: subtitleHeight,
      fontSize: subtitleFontSize,
      fontWeight: 540,
      lineHeight: subtitleLineHeight,
      fontFamily: BODY_STACK,
      lines: subtitleLines,
      align: recipe.alignment,
      letterSpacing: clamp(Math.round(subtitleFontSize * recipe.hierarchy.tracking), -10, 18)
    });
    currentY += subtitleHeight + blockGap;
  }

  if (passageLines.length > 0) {
    blocks.push({
      key: "passage",
      x: textX,
      y: currentY,
      w: textWidth,
      h: passageHeight,
      fontSize: passageFontSize,
      fontWeight: 430,
      lineHeight: passageLineHeight,
      fontFamily: SERIF_STACK,
      lines: passageLines,
      align: recipe.alignment,
      letterSpacing: clamp(Math.round(passageFontSize * (recipe.hierarchy.tracking * 0.7)), -8, 14)
    });
  }

  const textRegionTop = clamp(Math.round(blocks[0]?.y || marginY) - Math.round(height * 0.03), 0, Math.max(0, height - 2));
  const textRegionHeight = clamp(
    Math.round(totalContentHeight + Math.round(height * 0.06)),
    2,
    Math.max(2, height - textRegionTop - marginY)
  );
  const textRegion: CleanMinimalTextRegion = {
    left: textX,
    top: textRegionTop,
    width: textWidth,
    height: textRegionHeight
  };

  const backingRegion: CleanMinimalTextRegion = {
    left: Math.max(0, textRegion.left - Math.round(width * 0.025)),
    top: Math.max(0, textRegion.top - Math.round(height * 0.02)),
    width: Math.min(width - textRegion.left, textRegion.width + Math.round(width * 0.07)),
    height: Math.min(height - textRegion.top, textRegion.height + Math.round(height * 0.08))
  };

  return {
    width,
    height,
    shape,
    marginX,
    marginY,
    textRegion,
    backingRegion,
    blocks
  };
}

export async function chooseTextPaletteForBackground(params: {
  backgroundPng: Buffer;
  sampleRegion: CleanMinimalTextRegion;
  width: number;
  height: number;
}): Promise<CleanMinimalTextPalette> {
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
  const backgroundLuminance = relativeLuminanceFromRgb(red, green, blue);
  const usesDarkText = backgroundLuminance >= 0.57;

  const basePalette = usesDarkText
    ? {
        primary: "#0F172A",
        secondary: "#334155",
        tertiary: "#475569",
        rule: "rgba(15,23,42,0.46)",
        accent: "rgba(15,23,42,0.64)",
        scrimTint: "#FFFFFF" as const
      }
    : {
        primary: "#F8FAFC",
        secondary: "#E2E8F0",
        tertiary: "#CBD5E1",
        rule: "rgba(226,232,240,0.56)",
        accent: "rgba(248,250,252,0.72)",
        scrimTint: "#000000" as const
      };

  const textLuminance = relativeLuminanceFromHex(basePalette.primary);
  const measuredContrast = contrastRatio(backgroundLuminance, textLuminance);
  const autoScrim = measuredContrast < 4.8;

  return {
    ...basePalette,
    autoScrim
  };
}

export function buildCleanMinimalOverlaySvg(params: {
  width: number;
  height: number;
  content: CleanMinimalTextContent;
  palette: CleanMinimalTextPalette;
  lockupRecipe?: LockupRecipe;
}): string {
  const layout = computeCleanMinimalLayout({
    width: params.width,
    height: params.height,
    content: params.content,
    lockupRecipe: params.lockupRecipe
  });

  const titleBlock = layout.blocks.find((block) => block.key === "title");
  const subtitleBlock = layout.blocks.find((block) => block.key === "subtitle");
  const passageBlock = layout.blocks.find((block) => block.key === "passage");
  const topRuleY = layout.textRegion.top - Math.round(layout.height * 0.03);
  const topRuleX = layout.textRegion.left;
  const topRuleWidth = Math.round(layout.textRegion.width * 0.58);
  const isTall = layout.shape === "tall";
  const ornamentKind = params.lockupRecipe?.ornament?.kind || "rule_dot";
  const ornamentWeight = params.lockupRecipe?.ornament?.weight || "thin";
  const ornamentStroke = ornamentWeight === "bold" ? 3 : ornamentWeight === "med" ? 2 : 1.4;
  const titleTreatment = params.lockupRecipe?.titleTreatment || "singleline";

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">`);

  if (params.palette.autoScrim) {
    parts.push("<defs>");
    parts.push(
      `<linearGradient id="cm-scrim-main" x1="0" y1="0" x2="${isTall ? "0" : "1"}" y2="${isTall ? "1" : "0"}">`
    );
    parts.push(`<stop offset="0%" stop-color="${params.palette.scrimTint}" stop-opacity="0.18" />`);
    parts.push(`<stop offset="45%" stop-color="${params.palette.scrimTint}" stop-opacity="0.09" />`);
    parts.push(`<stop offset="100%" stop-color="${params.palette.scrimTint}" stop-opacity="0.00" />`);
    parts.push("</linearGradient>");
    parts.push('<radialGradient id="cm-scrim-soft" cx="22%" cy="20%" r="62%">');
    parts.push(`<stop offset="0%" stop-color="${params.palette.scrimTint}" stop-opacity="0.14" />`);
    parts.push(`<stop offset="100%" stop-color="${params.palette.scrimTint}" stop-opacity="0.00" />`);
    parts.push("</radialGradient>");
    parts.push("</defs>");
    parts.push(`<rect x="0" y="0" width="${layout.width}" height="${layout.height}" fill="url(#cm-scrim-main)" />`);
    parts.push(`<rect x="0" y="0" width="${layout.width}" height="${layout.height}" fill="url(#cm-scrim-soft)" />`);
  }

  if (ornamentKind === "rule_dot") {
    parts.push(
      `<line x1="${topRuleX}" y1="${topRuleY}" x2="${topRuleX + topRuleWidth}" y2="${topRuleY}" stroke="${params.palette.rule}" stroke-width="${ornamentStroke}" stroke-linecap="round" />`
    );
    parts.push(`<circle cx="${topRuleX + topRuleWidth + 20}" cy="${topRuleY}" r="${ornamentStroke + 2}" fill="${params.palette.accent}" />`);
  } else if (ornamentKind === "grain") {
    parts.push(
      `<line x1="${topRuleX}" y1="${topRuleY}" x2="${topRuleX + topRuleWidth}" y2="${topRuleY}" stroke="${params.palette.rule}" stroke-width="${ornamentStroke}" stroke-linecap="round" stroke-dasharray="2 7" />`
    );
  } else if (ornamentKind === "wheat") {
    parts.push(
      `<line x1="${topRuleX}" y1="${topRuleY}" x2="${topRuleX + topRuleWidth}" y2="${topRuleY}" stroke="${params.palette.rule}" stroke-width="${ornamentStroke}" stroke-linecap="round" />`
    );
    parts.push(`<circle cx="${topRuleX + topRuleWidth + 16}" cy="${topRuleY - 5}" r="3" fill="${params.palette.accent}" />`);
    parts.push(`<circle cx="${topRuleX + topRuleWidth + 22}" cy="${topRuleY}" r="3" fill="${params.palette.accent}" />`);
    parts.push(`<circle cx="${topRuleX + topRuleWidth + 16}" cy="${topRuleY + 5}" r="3" fill="${params.palette.accent}" />`);
  } else if (ornamentKind === "frame") {
    parts.push(
      `<rect x="${layout.backingRegion.left}" y="${layout.backingRegion.top}" width="${layout.backingRegion.width}" height="${layout.backingRegion.height}" rx="8" fill="none" stroke="${params.palette.rule}" stroke-width="${ornamentStroke}" />`
    );
  }

  if (titleTreatment === "boxed" || titleTreatment === "badge") {
    parts.push(
      `<rect x="${layout.textRegion.left - 10}" y="${layout.textRegion.top - 8}" width="${layout.textRegion.width + 20}" height="${layout.textRegion.height + 16}" rx="${titleTreatment === "badge" ? 16 : 8}" fill="none" stroke="${params.palette.rule}" stroke-width="1.2" />`
    );
  }

  if (titleBlock) {
    parts.push(renderTextBlockSvg(titleBlock, params.palette.primary));
  }
  if (subtitleBlock) {
    parts.push(renderTextBlockSvg(subtitleBlock, params.palette.secondary));
  }
  if (passageBlock) {
    parts.push(renderTextBlockSvg(passageBlock, params.palette.tertiary));
  }

  parts.push("</svg>");
  return parts.join("\n");
}

export function buildCleanMinimalDesignDoc(params: {
  width: number;
  height: number;
  content: CleanMinimalTextContent;
  palette: CleanMinimalTextPalette;
  backgroundImagePath: string | null;
  lockupRecipe?: LockupRecipe;
}): DesignDoc {
  const layout = computeCleanMinimalLayout({
    width: params.width,
    height: params.height,
    content: params.content,
    lockupRecipe: params.lockupRecipe
  });

  const layers: DesignLayer[] = [];

  for (const block of layout.blocks) {
    const color = block.key === "title" ? params.palette.primary : block.key === "passage" ? params.palette.tertiary : params.palette.secondary;

    layers.push({
      type: "text",
      x: block.x,
      y: block.y,
      w: block.w,
      h: block.h,
      text: block.lines.join("\n"),
      fontSize: block.fontSize,
      fontFamily: block.key === "passage" ? "Georgia" : "Inter",
      fontWeight: block.fontWeight,
      color,
      align: block.align,
      letterSpacing: block.letterSpacing
    });
  }

  return {
    width: params.width,
    height: params.height,
    backgroundImagePath: params.backgroundImagePath,
    background: {
      color: "#F8FAFC"
    },
    layers
  };
}
