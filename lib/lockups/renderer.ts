import type { Aspect, LockupRecipe } from "@/lib/design-brief";
import type { DesignLayer } from "@/lib/design-doc";
import type { FontPairing } from "@/lib/lockups/fonts";
import { buildEmbeddedFontFaceCss } from "@/lib/lockups/font-registry";

export type LockupContent = {
  title: string;
  subtitle?: string | null;
  passage?: string | null;
};

export type LockupTextPalette = {
  primary: string;
  secondary: string;
  tertiary: string;
  rule: string;
  accent: string;
  autoScrim: boolean;
  scrimTint: "#FFFFFF" | "#000000";
  forceTitleOutline?: boolean;
  forceTitleShadow?: boolean;
  forceSubtitleShadow?: boolean;
  safeVariantApplied?: boolean;
};

export type LockupTextBlock = {
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
  colorRole: "primary" | "secondary" | "tertiary" | "accent";
  lineWeights?: number[];
  isOutline?: boolean;
  isOverprint?: boolean;
  inlineStroke?: boolean;
  opacity?: number;
  blur?: number;
  isKnockout?: boolean;
};

export type LockupShape = {
  x: number;
  y: number;
  w: number;
  h: number;
  fillRole: "rule" | "accent" | "scrim" | "none";
  strokeRole?: "rule" | "accent";
  strokeWidth?: number;
  radius?: number;
  opacity?: number;
  purpose?: "ornament" | "frame" | "box_fill";
};

export type LockupRegion = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type LockupLayout = {
  width: number;
  height: number;
  aspect: Aspect;
  recipe: LockupRecipe;
  textRegion: LockupRegion;
  backingRegion: LockupRegion;
  blocks: LockupTextBlock[];
  shapes: LockupShape[];
};

export type LockupRenderResult = {
  layout: LockupLayout;
  overlaySvg: string;
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

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function applyCaseTreatment(value: string, mode: LockupRecipe["hierarchy"]["case"]): string {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }

  if (mode === "upper" || mode === "small_caps") {
    return normalized.toUpperCase();
  }
  if (mode === "title_case") {
    return toTitleCase(normalized);
  }
  return normalized;
}

function estimateGlyphWidthFactor(fontFamily: string, line: string): number {
  const normalized = fontFamily.toLowerCase();
  const condensed =
    normalized.includes("bebas") ||
    normalized.includes("oswald") ||
    normalized.includes("narrow") ||
    normalized.includes("condensed") ||
    normalized.includes("impact");
  const serif =
    normalized.includes("serif") ||
    normalized.includes("garamond") ||
    normalized.includes("fraunces") ||
    normalized.includes("dm serif") ||
    normalized.includes("cinzel") ||
    normalized.includes("cormorant") ||
    normalized.includes("playfair") ||
    normalized.includes("times") ||
    normalized.includes("baskerville");
  const grotesk = normalized.includes("inter") || normalized.includes("grotesk") || normalized.includes("plex");

  let factor = condensed ? 0.47 : serif ? 0.55 : grotesk ? 0.5 : 0.52;
  if (/[A-Z]{4,}/.test(line)) {
    factor += 0.014;
  }
  return factor;
}

function estimateLineWidth(line: string, fontSize: number, letterSpacing: number, fontFamily: string): number {
  const glyphFactor = estimateGlyphWidthFactor(fontFamily, line);
  const glyphWidth = line.length * fontSize * glyphFactor;
  const spacingWidth = Math.max(0, line.length - 1) * letterSpacing;
  return glyphWidth + spacingWidth;
}

function estimateCharsPerLine(width: number, fontSize: number, letterSpacing: number, fontFamily: string): number {
  const avgCharWidth = Math.max(
    1,
    fontSize * estimateGlyphWidthFactor(fontFamily, "ABC") + Math.max(0, letterSpacing) * 0.62
  );
  return Math.max(7, Math.floor(width / avgCharWidth));
}

function splitLongToken(token: string, maxCharsPerLine: number): string[] {
  const chunks: string[] = [];
  let cursor = token;
  while (cursor.length > maxCharsPerLine) {
    chunks.push(cursor.slice(0, maxCharsPerLine));
    cursor = cursor.slice(maxCharsPerLine);
  }
  if (cursor) {
    chunks.push(cursor);
  }
  return chunks;
}

function clampTrailingLine(line: string, maxCharsPerLine: number): string {
  let next = line;
  while (next.length > maxCharsPerLine - 1 && next.includes(" ")) {
    next = next.slice(0, next.lastIndexOf(" "));
  }
  return `${next.replace(/[.,;:!?-]+$/, "")}...`;
}

function wrapWordsDeterministic(value: string, maxCharsPerLine: number, maxLines: number): string[] {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return [];
  }

  const words = normalized.split(" ");
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
      current = "";
      if (lines.length >= maxLines) {
        lines[maxLines - 1] = clampTrailingLine(lines[maxLines - 1], maxCharsPerLine);
        return lines.slice(0, maxLines);
      }
    }

    if (word.length <= maxCharsPerLine) {
      current = word;
      continue;
    }

    const chunks = splitLongToken(word, maxCharsPerLine);
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      if (index === chunks.length - 1) {
        current = chunk;
      } else {
        lines.push(chunk);
        if (lines.length >= maxLines) {
          lines[maxLines - 1] = clampTrailingLine(lines[maxLines - 1], maxCharsPerLine);
          return lines.slice(0, maxLines);
        }
      }
    }
  }

  if (current) {
    lines.push(current);
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  const clamped = lines.slice(0, maxLines);
  clamped[maxLines - 1] = clampTrailingLine(clamped[maxLines - 1], maxCharsPerLine);
  return clamped;
}

const BREAK_AVOID_WORDS = new Set(["and", "the", "of", "to", "a", "an", "in", "for", "with", "on", "at", "by"]);

function splitTitleDeterministic(value: string, maxCharsPerLine: number): string[] {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return [];
  }

  const words = normalized.split(" ");
  if (words.length <= 2) {
    return [normalized];
  }

  let bestBreakIndex = -1;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let breakIndex = 1; breakIndex < words.length; breakIndex += 1) {
    const left = words.slice(0, breakIndex).join(" ");
    const right = words.slice(breakIndex).join(" ");
    if (!left || !right) {
      continue;
    }

    const balancePenalty = Math.abs(left.length - right.length);
    const overflowPenalty =
      Math.max(0, left.length - maxCharsPerLine) * 8 + Math.max(0, right.length - maxCharsPerLine) * 8;
    const stopWordPenalty = BREAK_AVOID_WORDS.has(words[breakIndex].toLowerCase()) ? 7 : 0;
    const shortPenalty = left.length < 5 || right.length < 5 ? 5 : 0;
    const punctuationBonus = /[:.,;!?]$/.test(left) ? -3 : 0;
    const score = balancePenalty + overflowPenalty + stopWordPenalty + shortPenalty + punctuationBonus;

    if (score < bestScore) {
      bestScore = score;
      bestBreakIndex = breakIndex;
    }
  }

  if (bestBreakIndex < 0) {
    return wrapWordsDeterministic(normalized, maxCharsPerLine, 2);
  }

  const left = words.slice(0, bestBreakIndex).join(" ");
  const right = words.slice(bestBreakIndex).join(" ");
  if (left.length > Math.round(maxCharsPerLine * 1.3) || right.length > Math.round(maxCharsPerLine * 1.3)) {
    return wrapWordsDeterministic(normalized, maxCharsPerLine, 2);
  }

  return [left, right];
}

function subtitleCaseMode(recipe: LockupRecipe): LockupRecipe["hierarchy"]["case"] {
  if (recipe.hierarchy.case === "as_is") {
    return recipe.layoutIntent === "handmade_organic" ? "title_case" : "upper";
  }
  if (recipe.hierarchy.case === "title_case") {
    return "upper";
  }
  if (recipe.hierarchy.case === "small_caps") {
    return "upper";
  }
  return recipe.hierarchy.case;
}

function maxTitleLines(treatment: LockupRecipe["titleTreatment"], aspect: Aspect, titleLength: number): number {
  if (treatment === "stacked") {
    return aspect === "tall" ? 4 : 3;
  }
  if (treatment === "boxed" || treatment === "badge") {
    return 3;
  }
  if (treatment === "split") {
    return 2;
  }
  if (treatment === "singleline") {
    return titleLength > 22 ? 2 : 1;
  }
  return 2;
}

function resolveTitleSizeClamp(recipe: LockupRecipe, aspect: Aspect): { minPx: number; maxPx: number } {
  const defaults =
    aspect === "wide"
      ? { minPx: 44, maxPx: 152 }
      : aspect === "tall"
        ? { minPx: 52, maxPx: 170 }
        : { minPx: 48, maxPx: 158 };
  const byAspect = recipe.titleSizeClamp?.[aspect];
  const minPx = clamp(Math.round(byAspect?.minPx ?? defaults.minPx), 24, 260);
  const maxPx = clamp(Math.round(byAspect?.maxPx ?? defaults.maxPx), minPx, 320);
  return {
    minPx,
    maxPx
  };
}

function resolveTitleEcho(recipe: LockupRecipe): {
  enabled: boolean;
  opacity: number;
  dxPct: number;
  dyPct: number;
  blur: number;
} {
  const echo = recipe.titleEcho;
  if (!echo || !echo.enabled) {
    return {
      enabled: false,
      opacity: 0.06,
      dxPct: 0.006,
      dyPct: 0.006,
      blur: 0
    };
  }

  return {
    enabled: true,
    opacity: clamp(echo.opacity, 0, 0.1),
    dxPct: clamp(echo.dxPct, -0.02, 0.02),
    dyPct: clamp(echo.dyPct, -0.02, 0.02),
    blur: clamp(echo.blur || 0, 0, 16)
  };
}

function getTitleLines(params: {
  title: string;
  treatment: LockupRecipe["titleTreatment"];
  aspect: Aspect;
  maxCharsPerLine: number;
}): string[] {
  const normalized = normalizeWhitespace(params.title);
  if (!normalized) {
    return [];
  }

  const maxLines = maxTitleLines(params.treatment, params.aspect, normalized.length);
  if (params.treatment === "split") {
    return splitTitleDeterministic(normalized, params.maxCharsPerLine).slice(0, 2);
  }

  return wrapWordsDeterministic(normalized, params.maxCharsPerLine, maxLines);
}

function resolveColor(role: LockupTextBlock["colorRole"] | LockupShape["fillRole"] | LockupShape["strokeRole"], palette: LockupTextPalette): string {
  if (!role || role === "none") {
    return "none";
  }
  if (role === "primary") {
    return palette.primary;
  }
  if (role === "secondary") {
    return palette.secondary;
  }
  if (role === "tertiary") {
    return palette.tertiary;
  }
  if (role === "rule") {
    return palette.rule;
  }
  if (role === "accent") {
    return palette.accent;
  }
  return palette.scrimTint;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeXmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function blurFilterId(blur: number): string {
  const normalized = Math.max(0, Math.round(blur * 10));
  return `lockup-blur-${normalized}`;
}

function renderTextNode(
  block: LockupTextBlock,
  color: string,
  options: {
    outlined?: boolean;
    strokeWidthScale?: number;
  } = {}
): string {
  if (block.lines.length === 0) {
    return "";
  }

  const textX = block.align === "center" ? block.x + block.w / 2 : block.align === "right" ? block.x + block.w : block.x;
  const anchor = block.align === "center" ? "middle" : block.align === "right" ? "end" : "start";
  const baseline = block.y + block.fontSize;
  const spans = block.lines
    .map((line, index) => {
      const y = baseline + index * block.lineHeight;
      const weight = block.lineWeights?.[index] || block.fontWeight;
      return `<tspan x="${textX}" y="${y}" font-weight="${weight}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  const strokeAttrs = options.outlined
    ? ` fill="none" stroke="${escapeXml(color)}" stroke-width="${Math.max(1.2, block.fontSize * (options.strokeWidthScale || 0.045))}" stroke-linejoin="round"`
    : ` fill="${escapeXml(color)}"`;
  let opacityValue = typeof block.opacity === "number" ? clamp(block.opacity, 0, 1) : undefined;
  if (!block.isOverprint && (block.key === "title" || block.key === "subtitle") && !block.isOutline && !block.inlineStroke) {
    const floor = block.key === "title" ? 0.85 : 0.8;
    opacityValue = Math.max(typeof opacityValue === "number" ? opacityValue : 1, floor);
  }
  const opacityAttr = typeof opacityValue === "number" ? ` opacity="${opacityValue.toFixed(3)}"` : "";
  const blurAttr = block.blur && block.blur > 0 ? ` filter="url(#${blurFilterId(block.blur)})"` : "";

  return `<text x="${textX}" y="${baseline}" font-family="${escapeXml(block.fontFamily)}" font-size="${block.fontSize}" text-anchor="${anchor}" letter-spacing="${block.letterSpacing}"${strokeAttrs}${opacityAttr}${blurAttr}>${spans}</text>`;
}

function renderShapeNode(shape: LockupShape, palette: LockupTextPalette): string {
  const fill = resolveColor(shape.fillRole, palette);
  const stroke = shape.strokeRole ? resolveColor(shape.strokeRole, palette) : "none";
  const strokeWidth = shape.strokeWidth || 0;
  const radius = shape.radius || 0;
  const opacityValue = typeof shape.opacity === "number" ? clamp(shape.opacity, 0, 1) : undefined;
  const opacityAttr = typeof opacityValue === "number" ? ` fill-opacity="${opacityValue.toFixed(3)}"` : "";
  return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="${radius}" fill="${escapeXml(fill)}"${opacityAttr} stroke="${escapeXml(stroke)}" stroke-width="${strokeWidth}" />`;
}

function renderArcTitleNode(block: LockupTextBlock, color: string, pathId: string): string {
  const title = normalizeWhitespace(block.lines.join(" "));
  if (!title) {
    return "";
  }

  const centerX = block.x + block.w / 2;
  const radiusX = Math.max(block.w * 0.42, block.fontSize * 3.2);
  const radiusY = Math.max(block.fontSize * 0.82, radiusX * 0.12);
  const baseY = block.y + block.fontSize * 1.3;
  const startX = centerX - radiusX;
  const endX = centerX + radiusX;
  const opacityValue = typeof block.opacity === "number" ? clamp(block.opacity, 0, 1) : undefined;
  const opacityAttr = typeof opacityValue === "number" ? ` opacity="${opacityValue.toFixed(3)}"` : "";
  const blurAttr = block.blur && block.blur > 0 ? ` filter="url(#${blurFilterId(block.blur)})"` : "";

  return [
    `<path id="${pathId}" d="M ${startX} ${baseY} A ${radiusX} ${radiusY} 0 0 1 ${endX} ${baseY}" fill="none" />`,
    `<text font-family="${escapeXml(block.fontFamily)}" font-size="${block.fontSize}" fill="${escapeXml(color)}" text-anchor="middle" letter-spacing="${block.letterSpacing}"${opacityAttr}${blurAttr}>`,
    `<textPath href="#${pathId}" startOffset="50%">${escapeXml(title)}</textPath>`,
    "</text>"
  ].join("");
}

function normalizeForBounds(value: number, max: number): number {
  return clamp(Math.round(value), 0, Math.max(0, Math.round(max)));
}

type Bounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  area: number;
};

function boundsFromRects(rects: Array<{ x: number; y: number; w: number; h: number }>): Bounds | null {
  if (rects.length === 0) {
    return null;
  }

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const rect of rects) {
    if (rect.w <= 0 || rect.h <= 0) {
      continue;
    }
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.w);
    bottom = Math.max(bottom, rect.y + rect.h);
  }

  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
    return null;
  }

  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  return {
    left,
    top,
    right,
    bottom,
    width,
    height,
    area: width * height
  };
}

function textBoundsFromBlocks(blocks: LockupTextBlock[]): Bounds | null {
  return boundsFromRects(
    blocks
      .filter((block) => !block.isOverprint)
      .map((block) => ({
        x: block.x,
        y: block.y,
        w: block.w,
        h: block.h
      }))
  );
}

function lockupBoundsFromLayout(blocks: LockupTextBlock[], shapes: LockupShape[]): Bounds | null {
  const rects = [
    ...blocks
      .filter((block) => !block.isOverprint)
      .map((block) => ({
        x: block.x,
        y: block.y,
        w: block.w,
        h: block.h
      })),
    ...shapes.map((shape) => ({
      x: shape.x,
      y: shape.y,
      w: shape.w,
      h: shape.h
    }))
  ];

  return boundsFromRects(rects);
}

function translateLayoutElements(blocks: LockupTextBlock[], shapes: LockupShape[], dx: number, dy: number): void {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
    return;
  }

  for (const block of blocks) {
    block.x += dx;
    block.y += dy;
  }
  for (const shape of shapes) {
    shape.x += dx;
    shape.y += dy;
  }
}

function scaleLayoutElements(blocks: LockupTextBlock[], shapes: LockupShape[], scale: number, centerX: number, centerY: number): void {
  if (Math.abs(scale - 1) < 0.001) {
    return;
  }

  for (const block of blocks) {
    block.x = centerX + (block.x - centerX) * scale;
    block.y = centerY + (block.y - centerY) * scale;
    block.w = Math.max(1, block.w * scale);
    block.h = Math.max(1, block.h * scale);
    block.fontSize = Math.max(14, Math.round(block.fontSize * scale));
    block.lineHeight = Math.max(12, Math.round(block.lineHeight * scale));
    block.letterSpacing = Math.round(block.letterSpacing * scale);
  }

  for (const shape of shapes) {
    shape.x = centerX + (shape.x - centerX) * scale;
    shape.y = centerY + (shape.y - centerY) * scale;
    shape.w = Math.max(1, shape.w * scale);
    shape.h = Math.max(1, shape.h * scale);
    if (typeof shape.strokeWidth === "number") {
      shape.strokeWidth = Math.max(0.7, shape.strokeWidth * scale);
    }
    if (typeof shape.radius === "number") {
      shape.radius = Math.max(0, shape.radius * scale);
    }
  }
}

function normalizeLockupRegions(params: {
  width: number;
  height: number;
  textBounds: Bounds | null;
  marginX: number;
  marginY: number;
}): { textRegion: LockupRegion; backingRegion: LockupRegion } {
  const { width, height, marginX, marginY, textBounds } = params;
  const fallbackTop = clamp(Math.round(height * 0.28), marginY, Math.max(marginY, height - marginY - 12));
  const fallbackLeft = clamp(Math.round(width * 0.14), marginX, Math.max(marginX, width - marginX - 12));
  const rawTextRegion = textBounds
    ? {
        left: textBounds.left - width * 0.03,
        top: textBounds.top - height * 0.03,
        width: textBounds.width + width * 0.06,
        height: textBounds.height + height * 0.06
      }
    : {
        left: fallbackLeft,
        top: fallbackTop,
        width: width * 0.64,
        height: height * 0.24
      };

  const textLeft = normalizeForBounds(rawTextRegion.left, width - 2);
  const textTop = normalizeForBounds(rawTextRegion.top, height - 2);
  const textWidth = clamp(Math.round(rawTextRegion.width), 2, Math.max(2, width - textLeft));
  const textHeight = clamp(Math.round(rawTextRegion.height), 2, Math.max(2, height - textTop));
  const textRegion: LockupRegion = {
    left: textLeft,
    top: textTop,
    width: textWidth,
    height: textHeight
  };

  const backingLeft = normalizeForBounds(textRegion.left - width * 0.024, width - 2);
  const backingTop = normalizeForBounds(textRegion.top - height * 0.02, height - 2);
  const backingRegion: LockupRegion = {
    left: backingLeft,
    top: backingTop,
    width: clamp(Math.round(textRegion.width + width * 0.05), 2, Math.max(2, width - backingLeft)),
    height: clamp(Math.round(textRegion.height + height * 0.07), 2, Math.max(2, height - backingTop))
  };

  return {
    textRegion,
    backingRegion
  };
}

function visibleTitleBlocks(blocks: LockupTextBlock[]): LockupTextBlock[] {
  return blocks.filter(
    (block) =>
      block.key === "title" &&
      !block.isOverprint &&
      block.lines.some((line) => Boolean(normalizeWhitespace(line)))
  );
}

function isTitleLegible(params: {
  blocks: LockupTextBlock[];
  width: number;
  height: number;
}): boolean {
  const titleBlocks = visibleTitleBlocks(params.blocks);
  if (titleBlocks.length === 0) {
    return false;
  }

  const bounds = boundsFromRects(
    titleBlocks.map((block) => ({
      x: block.x,
      y: block.y,
      w: block.w,
      h: block.h
    }))
  );
  if (!bounds) {
    return false;
  }

  const minTitleArea = params.width * params.height * 0.018;
  if (bounds.area < minTitleArea) {
    return false;
  }

  const largestTitle = titleBlocks.reduce((max, block) => Math.max(max, block.fontSize), 0);
  return largestTitle >= 26;
}

function buildSafeFallbackTitleBlock(params: {
  width: number;
  height: number;
  aspect: Aspect;
  title: string;
  titleFontFamily: string;
  titleTrackingHint: number;
  colorRole?: LockupTextBlock["colorRole"];
}): LockupTextBlock {
  const minSide = Math.min(params.width, params.height);
  const titleFontSize = clamp(Math.round(minSide * 0.102), 36, 124);
  const letterSpacing = clamp(Math.round(titleFontSize * params.titleTrackingHint), -4, 16);
  const safeMarginX = Math.round(params.width * 0.08);
  const safeMarginY = Math.round(params.height * 0.08);
  const maxWidthPct = params.aspect === "wide" ? 0.56 : params.aspect === "tall" ? 0.64 : 0.62;
  const blockWidth = clamp(
    Math.round(params.width * maxWidthPct),
    Math.round(params.width * 0.4),
    Math.round(params.width * 0.8)
  );
  const charsPerLine = estimateCharsPerLine(blockWidth, titleFontSize, letterSpacing, params.titleFontFamily);
  const lines = wrapWordsDeterministic(params.title, Math.max(8, charsPerLine), 2);
  const lineHeight = Math.round(titleFontSize * 1.04);
  const blockHeight = Math.max(titleFontSize + 12, lines.length * lineHeight);

  return {
    key: "title",
    x: safeMarginX,
    y: safeMarginY,
    w: blockWidth,
    h: blockHeight,
    fontSize: titleFontSize,
    fontWeight: 760,
    lineHeight,
    fontFamily: params.titleFontFamily,
    lines: lines.length > 0 ? lines : [params.title],
    align: "left",
    letterSpacing,
    colorRole: params.colorRole || "primary"
  };
}

function applyLockupAutofitAndBalance(params: {
  width: number;
  height: number;
  marginX: number;
  marginY: number;
  aspect: Aspect;
  recipe: LockupRecipe;
  blocks: LockupTextBlock[];
  shapes: LockupShape[];
}): { textRegion: LockupRegion; backingRegion: LockupRegion } {
  const { width, height, marginX, marginY, aspect, recipe, blocks, shapes } = params;
  const safeLeft = marginX;
  const safeTop = marginY;
  const safeRight = width - marginX;
  const safeBottom = height - marginY;

  const minAreaPct = clamp(recipe.minTitleAreaPct ?? 0.14, 0.08, 0.45);
  const maxAreaPct = clamp(recipe.maxTitleAreaPct ?? 0.36, minAreaPct + 0.04, 0.6);
  const canvasArea = width * height;

  let bounds = lockupBoundsFromLayout(blocks, shapes);
  if (bounds && bounds.area > 0) {
    const areaPct = bounds.area / canvasArea;
    let targetScale = 1;
    if (areaPct < minAreaPct) {
      targetScale = Math.sqrt(minAreaPct / Math.max(areaPct, 0.0001));
    } else if (areaPct > maxAreaPct) {
      targetScale = Math.sqrt(maxAreaPct / areaPct);
    }

    if (Math.abs(targetScale - 1) > 0.01) {
      const maxScaleX = (safeRight - safeLeft) / Math.max(1, bounds.width);
      const maxScaleY = (safeBottom - safeTop) / Math.max(1, bounds.height);
      const maxScale = Math.max(0.6, Math.min(2.2, maxScaleX, maxScaleY));
      const minScale = 0.62;
      const scale = clamp(targetScale, minScale, maxScale);
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      scaleLayoutElements(blocks, shapes, scale, centerX, centerY);
      bounds = lockupBoundsFromLayout(blocks, shapes);
    }
  }

  if (bounds) {
    const minDx = safeLeft - bounds.left;
    const maxDx = safeRight - bounds.right;
    const minDy = safeTop - bounds.top;
    const maxDy = safeBottom - bounds.bottom;
    const dx = minDx <= maxDx ? clamp(0, minDx, maxDx) : (minDx + maxDx) / 2;
    const dy = minDy <= maxDy ? clamp(0, minDy, maxDy) : (minDy + maxDy) / 2;
    translateLayoutElements(blocks, shapes, dx, dy);
    bounds = lockupBoundsFromLayout(blocks, shapes);
  }

  if (bounds) {
    const emptyBottomRatio = (height - bounds.bottom) / height;
    if (bounds.top < height * 0.08 && emptyBottomRatio > 0.34) {
      const desiredTop = Math.max(safeTop, height * 0.12);
      const dy = clamp(desiredTop - bounds.top, safeTop - bounds.top, safeBottom - bounds.bottom);
      translateLayoutElements(blocks, shapes, 0, dy);
      bounds = lockupBoundsFromLayout(blocks, shapes);
    }
  }

  if (aspect === "tall") {
    const isTopLeftEditorial = recipe.layoutIntent === "editorial" && recipe.placement.anchor === "top_left" && recipe.alignment === "left";
    if (!isTopLeftEditorial && bounds) {
      const desiredCenterY = height * 0.5;
      const currentCenterY = bounds.top + bounds.height / 2;
      const dy = clamp(desiredCenterY - currentCenterY, safeTop - bounds.top, safeBottom - bounds.bottom);
      if (Math.abs(dy) > 3) {
        translateLayoutElements(blocks, shapes, 0, dy);
      }
    }
  }

  return normalizeLockupRegions({
    width,
    height,
    textBounds: textBoundsFromBlocks(blocks),
    marginX,
    marginY
  });
}

function enforceBackdropGuardrails(params: {
  shapes: LockupShape[];
  textRegion: LockupRegion;
  width: number;
  height: number;
}): void {
  const maxOpacity = 0.12;
  const tightPadX = clamp(Math.round(params.textRegion.width * 0.08), Math.round(params.width * 0.012), Math.round(params.width * 0.05));
  const tightPadY = clamp(Math.round(params.textRegion.height * 0.12), Math.round(params.height * 0.01), Math.round(params.height * 0.05));
  const maxLeft = params.textRegion.left - tightPadX;
  const maxTop = params.textRegion.top - tightPadY;
  const maxRight = params.textRegion.left + params.textRegion.width + tightPadX;
  const maxBottom = params.textRegion.top + params.textRegion.height + tightPadY;

  for (const shape of params.shapes) {
    if (shape.fillRole === "none") {
      continue;
    }

    const likelyBackdrop =
      shape.purpose === "box_fill" ||
      (shape.w >= params.textRegion.width * 0.62 && shape.h >= params.textRegion.height * 0.55);
    if (!likelyBackdrop) {
      continue;
    }

    shape.opacity = clamp(typeof shape.opacity === "number" ? shape.opacity : 0.1, 0, maxOpacity);

    const left = clamp(shape.x, 0, params.width - 2);
    const top = clamp(shape.y, 0, params.height - 2);
    const right = clamp(shape.x + shape.w, left + 1, params.width);
    const bottom = clamp(shape.y + shape.h, top + 1, params.height);
    const clampedLeft = clamp(left, maxLeft, maxRight - 1);
    const clampedTop = clamp(top, maxTop, maxBottom - 1);
    const clampedRight = clamp(right, clampedLeft + 1, maxRight);
    const clampedBottom = clamp(bottom, clampedTop + 1, maxBottom);

    shape.x = clampedLeft;
    shape.y = clampedTop;
    shape.w = Math.max(1, clampedRight - clampedLeft);
    shape.h = Math.max(1, clampedBottom - clampedTop);
  }
}

export function normalizeRecipeForAspect(recipe: LockupRecipe, aspect: Aspect): LockupRecipe {
  const placement = {
    ...recipe.placement
  };

  if (aspect === "wide") {
    placement.safeMarginPct = clamp(recipe.placement.safeMarginPct - 0.006, 0.04, 0.12);
    placement.maxTitleWidthPct = clamp(
      recipe.placement.maxTitleWidthPct + (recipe.alignment === "center" ? 0.045 : 0.075),
      0.35,
      0.75
    );
  }

  if (aspect === "tall") {
    placement.safeMarginPct = clamp(recipe.placement.safeMarginPct + 0.01, 0.04, 0.12);
    placement.maxTitleWidthPct = clamp(recipe.placement.maxTitleWidthPct - 0.06, 0.35, 0.75);
  }

  return {
    ...recipe,
    placement
  };
}

export function resolveRecipeFocalPoint(recipe: LockupRecipe, aspect: Aspect): { x: number; y: number } {
  const hasCustomFocal = typeof recipe.focalPoint?.x === "number" || typeof recipe.focalPoint?.y === "number";
  const baseX = clamp(recipe.focalPoint?.x ?? 0.5, 0, 1);
  const baseY = clamp(recipe.focalPoint?.y ?? 0.5, 0, 1);

  if (aspect === "wide" && recipe.alignment === "left" && !hasCustomFocal) {
    return {
      x: 0.45,
      y: 0.5
    };
  }

  return {
    x: baseX,
    y: baseY
  };
}

export function computeLockupLayout(params: {
  backgroundSize: { width: number; height: number };
  aspect: Aspect;
  content: LockupContent;
  lockupRecipe: LockupRecipe;
  fontPairing: FontPairing;
  lockupPresetId?: string | null;
}): LockupLayout {
  const width = Math.max(1, Math.round(params.backgroundSize.width));
  const height = Math.max(1, Math.round(params.backgroundSize.height));
  const recipe = normalizeRecipeForAspect(params.lockupRecipe, params.aspect);

  const marginX = Math.round(width * recipe.placement.safeMarginPct);
  const marginY = Math.round(height * recipe.placement.safeMarginPct);

  const textWidth = clamp(
    Math.round(width * recipe.placement.maxTitleWidthPct),
    Math.round(width * 0.32),
    Math.round(width * 0.82)
  );
  const centeredAnchor =
    recipe.placement.anchor === "top_center" ||
    recipe.placement.anchor === "bottom_center" ||
    recipe.placement.anchor === "center";
  const textX = centeredAnchor
    ? Math.round((width - textWidth) / 2)
    : recipe.alignment === "left"
      ? marginX
      : recipe.alignment === "center"
        ? Math.round((width - textWidth) / 2)
        : Math.max(0, width - marginX - textWidth);

  const requestedTitle = normalizeWhitespace(params.content.title || "");
  const title = applyCaseTreatment(requestedTitle || "Untitled Series", recipe.hierarchy.case);
  const subtitle = applyCaseTreatment(params.content.subtitle || "", subtitleCaseMode(recipe));
  const passage = applyCaseTreatment(
    params.content.passage || "",
    recipe.hierarchy.case === "as_is" ? "as_is" : "title_case"
  );

  const usesArcTitle = params.lockupPresetId === "arc_title";
  const usesStaggerTitle = params.lockupPresetId === "stacked_stagger";
  const usesSlabShadow = params.lockupPresetId === "slab_shadow";
  const usesInlineOutline = params.lockupPresetId === "inline_outline";
  const usesKnockoutMask = params.lockupPresetId === "knockout_mask";
  const titleEcho = resolveTitleEcho(recipe);
  const titleSizeClamp = resolveTitleSizeClamp(recipe, params.aspect);

  const minSide = Math.min(width, height);
  const aspectFactor = params.aspect === "wide" ? 0.95 : params.aspect === "tall" ? 1.04 : 1;
  let titleFontSize = clamp(
    Math.round(minSide * 0.108 * recipe.hierarchy.titleScale * aspectFactor),
    titleSizeClamp.minPx,
    titleSizeClamp.maxPx
  );

  let titleLines: string[] = [];
  let titleTracking = 0;

  for (let attempt = 0; attempt < 22; attempt += 1) {
    titleTracking = clamp(Math.round(titleFontSize * recipe.hierarchy.tracking), -12, 22);
    const titleChars = estimateCharsPerLine(textWidth, titleFontSize, titleTracking, params.fontPairing.titleFont);
    titleLines = usesArcTitle
      ? [title]
      : getTitleLines({
          title,
          treatment: recipe.titleTreatment,
          aspect: params.aspect,
          maxCharsPerLine: titleChars
        });

    const tooWide = titleLines.some(
      (line) => estimateLineWidth(line, titleFontSize, titleTracking, params.fontPairing.titleFont) > textWidth
    );
    if (!tooWide || titleFontSize <= titleSizeClamp.minPx) {
      break;
    }

    titleFontSize -= 2;
  }

  if (titleLines.length === 0) {
    titleLines = [title || "Untitled Series"];
  }

  let subtitleFontSize = clamp(Math.round(titleFontSize * recipe.hierarchy.subtitleScale), 16, 74);
  const subtitleTrackingBase = recipe.hierarchy.tracking + (/[A-Z]{4,}/.test(subtitle) ? 0.02 : 0.008);
  let subtitleTracking = clamp(Math.round(subtitleFontSize * subtitleTrackingBase), -9, 18);
  let subtitleLines: string[] = [];
  for (let attempt = 0; attempt < 14; attempt += 1) {
    subtitleTracking = clamp(Math.round(subtitleFontSize * subtitleTrackingBase), -9, 18);
    const subtitleChars = estimateCharsPerLine(textWidth, subtitleFontSize, subtitleTracking, params.fontPairing.subtitleFont);
    subtitleLines = wrapWordsDeterministic(subtitle, subtitleChars, 2);
    const tooWide = subtitleLines.some(
      (line) => estimateLineWidth(line, subtitleFontSize, subtitleTracking, params.fontPairing.subtitleFont) > textWidth
    );
    if (!tooWide || subtitleFontSize <= 14) {
      break;
    }
    subtitleFontSize -= 1;
  }

  const passageFontSize = clamp(Math.round(subtitleFontSize * 0.8), 16, 42);
  const passageTracking = clamp(Math.round(passageFontSize * Math.max(-0.02, recipe.hierarchy.tracking * 0.7)), -7, 12);
  const passageFontFamily = params.fontPairing.accentFont || params.fontPairing.subtitleFont || params.fontPairing.titleFont;
  const passageChars = estimateCharsPerLine(textWidth, passageFontSize, passageTracking, passageFontFamily);
  const passageLines = wrapWordsDeterministic(passage, passageChars, 2);

  const configuredTitleLineHeight = recipe.lineHeight?.title || (recipe.layoutIntent === "bold_modern" ? 0.98 : 1.06);
  const configuredSubtitleLineHeight = recipe.lineHeight?.subtitle || 1.2;
  const titleLineHeight = Math.round(titleFontSize * configuredTitleLineHeight);
  const subtitleLineHeight = Math.round(subtitleFontSize * configuredSubtitleLineHeight);
  const passageLineHeight = Math.round(passageFontSize * 1.24);

  let titleHeight = Math.max(titleFontSize + 10, titleLines.length * titleLineHeight);
  const subtitleHeight = subtitleLines.length > 0 ? Math.max(subtitleFontSize + 8, subtitleLines.length * subtitleLineHeight) : 0;
  const passageHeight = passageLines.length > 0 ? Math.max(passageFontSize + 6, passageLines.length * passageLineHeight) : 0;

  if (usesStaggerTitle) {
    const staggerLines = wrapWordsDeterministic(title, Math.max(8, Math.round((textWidth / titleFontSize) * 5.8)), 3);
    const lineCount = Math.max(1, Math.min(3, staggerLines.length));
    const staggerScales = [1, 0.86, 0.74];
    titleHeight = 0;
    for (let index = 0; index < lineCount; index += 1) {
      const lineSize = clamp(Math.round(titleFontSize * staggerScales[index]), titleSizeClamp.minPx - 4, titleSizeClamp.maxPx);
      const lineHeight = Math.round(lineSize * clamp(configuredTitleLineHeight + index * 0.02, 0.88, 1.2));
      titleHeight += lineHeight;
      if (index < lineCount - 1) {
        titleHeight -= Math.round(lineHeight * 0.06);
      }
    }
    titleHeight = Math.max(titleHeight, titleFontSize + 12);
  }

  const blockGap = Math.round(height * 0.018);
  const totalContentHeight =
    titleHeight +
    (subtitleHeight > 0 ? subtitleHeight + blockGap : 0) +
    (passageHeight > 0 ? passageHeight + blockGap : 0);

  let currentY = marginY + Math.round(height * (params.aspect === "tall" ? 0.03 : 0.02));
  if (recipe.placement.anchor === "center") {
    currentY = Math.round((height - totalContentHeight) / 2);
  } else if (recipe.placement.anchor === "bottom_left" || recipe.placement.anchor === "bottom_center") {
    currentY = height - marginY - totalContentHeight;
  }
  currentY = clamp(currentY, marginY, Math.max(marginY, height - marginY - totalContentHeight));

  const titleFontWeight =
    recipe.layoutIntent === "bold_modern" ? 820 : recipe.layoutIntent === "classic_serif" ? 700 : 740;
  const subtitleFontWeight = recipe.layoutIntent === "handmade_organic" ? 560 : 600;

  const blocks: LockupTextBlock[] = [];

  if (usesStaggerTitle) {
    const staggerLines = wrapWordsDeterministic(title, Math.max(8, Math.round((textWidth / titleFontSize) * 5.8)), 3);
    const fallbackStaggerLines = staggerLines.length > 0 ? staggerLines : [title];
    const staggerScales = [1, 0.86, 0.74];
    const staggerOffsets = recipe.alignment === "left" ? [0, 0.065, 0.02] : recipe.alignment === "center" ? [-0.02, 0.02, 0] : [0, -0.06, -0.015];
    let staggerY = currentY;

    fallbackStaggerLines.forEach((line, index) => {
      const lineSize = clamp(
        Math.round(titleFontSize * (staggerScales[index] || 0.74)),
        Math.max(24, titleSizeClamp.minPx - 4),
        titleSizeClamp.maxPx
      );
      const lineHeight = Math.round(lineSize * clamp(configuredTitleLineHeight + index * 0.02, 0.88, 1.2));
      const offsetFactor = staggerOffsets[index] || 0;
      const lineOffset = Math.round(textWidth * offsetFactor);

      blocks.push({
        key: "title",
        x: textX + lineOffset,
        y: staggerY,
        w: Math.max(80, textWidth - Math.abs(lineOffset)),
        h: lineHeight + 8,
        fontSize: lineSize,
        fontWeight: Math.max(560, titleFontWeight - index * 120),
        lineHeight,
        fontFamily: params.fontPairing.titleFont,
        lines: [line],
        align: recipe.alignment,
        letterSpacing: clamp(Math.round(lineSize * recipe.hierarchy.tracking), -12, 22),
        colorRole: "primary"
      });

      staggerY += lineHeight - Math.round(lineHeight * 0.06);
    });

    currentY += titleHeight + blockGap;
  } else {
    if (titleEcho.enabled) {
      blocks.push({
        key: "title",
        x: textX + Math.round(width * titleEcho.dxPct),
        y: currentY + Math.round(height * titleEcho.dyPct),
        w: textWidth,
        h: titleHeight,
        fontSize: titleFontSize,
        fontWeight: titleFontWeight,
        lineHeight: titleLineHeight,
        fontFamily: params.fontPairing.titleFont,
        lines: titleLines,
        align: recipe.alignment,
        letterSpacing: titleTracking,
        colorRole: "tertiary",
        isOverprint: true,
        opacity: titleEcho.opacity,
        blur: titleEcho.blur
      });
    }

    if (usesSlabShadow) {
      blocks.push({
        key: "title",
        x: textX + Math.round(width * 0.012),
        y: currentY + Math.round(height * 0.01),
        w: textWidth,
        h: titleHeight,
        fontSize: titleFontSize,
        fontWeight: Math.max(760, titleFontWeight),
        lineHeight: titleLineHeight,
        fontFamily: params.fontPairing.titleFont,
        lines: titleLines,
        align: recipe.alignment,
        letterSpacing: clamp(titleTracking + 1, -12, 24),
        colorRole: "accent",
        isOverprint: true,
        opacity: 0.35
      });
    }

    blocks.push({
      key: "title",
      x: textX,
      y: currentY,
      w: textWidth,
      h: titleHeight,
      fontSize: titleFontSize,
      fontWeight: titleFontWeight,
      lineHeight: titleLineHeight,
      fontFamily: params.fontPairing.titleFont,
      lines: titleLines,
      align: recipe.alignment,
      letterSpacing: titleTracking,
      colorRole: usesKnockoutMask ? "secondary" : "primary",
      lineWeights:
        recipe.titleTreatment === "split" && titleLines.length >= 2
          ? [titleFontWeight, Math.max(500, titleFontWeight - 180)]
          : undefined,
      isOutline: recipe.titleTreatment === "outline",
      inlineStroke: usesInlineOutline,
      isKnockout: usesKnockoutMask
    });

    currentY += titleHeight + blockGap;
  }

  if (subtitleLines.length > 0) {
    blocks.push({
      key: "subtitle",
      x: textX,
      y: currentY,
      w: textWidth,
      h: subtitleHeight,
      fontSize: subtitleFontSize,
      fontWeight: subtitleFontWeight,
      lineHeight: subtitleLineHeight,
      fontFamily: recipe.layoutIntent === "handmade_organic" && params.fontPairing.accentFont
        ? params.fontPairing.accentFont
        : params.fontPairing.subtitleFont,
      lines: subtitleLines,
      align: recipe.alignment,
      letterSpacing: subtitleTracking,
      colorRole: "secondary"
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
      fontFamily: passageFontFamily,
      lines: passageLines,
      align: recipe.alignment,
      letterSpacing: passageTracking,
      colorRole: "tertiary"
    });
  }

  const hasVisibleTitle = blocks.some(
    (block) =>
      block.key === "title" &&
      !block.isOverprint &&
      block.lines.some((line) => Boolean(normalizeWhitespace(line)))
  );
  if (requestedTitle && !hasVisibleTitle) {
    blocks.unshift({
      key: "title",
      x: textX,
      y: marginY + Math.round(height * 0.02),
      w: textWidth,
      h: Math.round(titleFontSize * 1.1),
      fontSize: clamp(Math.round(titleFontSize * 0.92), 32, titleSizeClamp.maxPx),
      fontWeight: 720,
      lineHeight: Math.round(titleFontSize * 1.04),
      fontFamily: params.fontPairing.titleFont,
      lines: [applyCaseTreatment(requestedTitle, recipe.hierarchy.case)],
      align: recipe.alignment,
      letterSpacing: clamp(Math.round(titleFontSize * recipe.hierarchy.tracking), -10, 20),
      colorRole: "primary"
    });
  }

  let { textRegion, backingRegion } = normalizeLockupRegions({
    width,
    height,
    textBounds: textBoundsFromBlocks(blocks),
    marginX,
    marginY
  });

  const ornamentWeight = recipe.ornament?.weight || "thin";
  const ornamentStroke = ornamentWeight === "bold" ? 5 : ornamentWeight === "med" ? 3 : 2;
  const topRuleY = textRegion.top - Math.round(height * 0.028);
  const topRuleX = textRegion.left;
  const topRuleW = Math.max(40, Math.round(textRegion.width * 0.56));

  const shapes: LockupShape[] = [];

  // Guardrail: disable rule+dot guide ornaments globally to avoid UI-like overlays.
  if (recipe.ornament?.kind === "rule_dot") {
    // Intentionally no-op.
  }

  if (recipe.ornament?.kind === "grain") {
    const step = Math.max(8, ornamentStroke * 3);
    for (let x = topRuleX; x < topRuleX + topRuleW; x += step) {
      shapes.push({
        x,
        y: topRuleY,
        w: Math.max(3, Math.floor(step * 0.48)),
        h: ornamentStroke,
        fillRole: "rule",
        purpose: "ornament"
      });
    }
  }

  if (recipe.ornament?.kind === "wheat") {
    shapes.push({
      x: topRuleX,
      y: topRuleY,
      w: topRuleW,
      h: ornamentStroke,
      fillRole: "rule",
      purpose: "ornament"
    });
    shapes.push({
      x: topRuleX + topRuleW + 8,
      y: topRuleY - 5,
      w: 4,
      h: 4,
      fillRole: "accent",
      purpose: "ornament"
    });
    shapes.push({
      x: topRuleX + topRuleW + 14,
      y: topRuleY,
      w: 4,
      h: 4,
      fillRole: "accent",
      purpose: "ornament"
    });
    shapes.push({
      x: topRuleX + topRuleW + 8,
      y: topRuleY + 5,
      w: 4,
      h: 4,
      fillRole: "accent",
      purpose: "ornament"
    });
  }

  if (recipe.ornament?.kind === "frame") {
    const framePadX = clamp(Math.round(textRegion.width * 0.06), Math.round(width * 0.012), Math.round(width * 0.055));
    const framePadY = clamp(Math.round(textRegion.height * 0.1), Math.round(height * 0.01), Math.round(height * 0.06));
    const frameLeft = clamp(Math.round(textRegion.left - framePadX), marginX, Math.max(marginX, width - marginX - 12));
    const frameTop = clamp(Math.round(textRegion.top - framePadY), marginY, Math.max(marginY, height - marginY - 12));
    const frameRight = clamp(
      Math.round(textRegion.left + textRegion.width + framePadX),
      frameLeft + 12,
      Math.max(frameLeft + 12, width - marginX)
    );
    const frameBottom = clamp(
      Math.round(textRegion.top + textRegion.height + framePadY),
      frameTop + 12,
      Math.max(frameTop + 12, height - marginY)
    );

    shapes.push({
      x: frameLeft,
      y: frameTop,
      w: frameRight - frameLeft,
      h: frameBottom - frameTop,
      fillRole: "none",
      strokeRole: "rule",
      strokeWidth: Math.max(1.1, ornamentStroke * 0.8),
      radius: recipe.titleTreatment === "badge" ? 16 : 8,
      purpose: "frame"
    });
  }

  if (recipe.titleTreatment === "boxed" || recipe.titleTreatment === "badge") {
    const tightPadX = clamp(
      Math.round(textRegion.width * (recipe.titleTreatment === "badge" ? 0.08 : 0.06)),
      Math.round(width * 0.012),
      Math.round(width * 0.05)
    );
    const tightPadY = clamp(Math.round(textRegion.height * 0.12), Math.round(height * 0.01), Math.round(height * 0.05));
    const boxWidth = clamp(textRegion.width + tightPadX * 2, textRegion.width + 10, Math.round(textRegion.width * 1.24));
    const boxHeight = clamp(textRegion.height + tightPadY * 2, textRegion.height + 10, Math.round(textRegion.height * 1.26));
    const boxLeft = clamp(Math.round(textRegion.left - tightPadX), marginX, Math.max(marginX, width - marginX - boxWidth));
    const boxTop = clamp(Math.round(textRegion.top - tightPadY), marginY, Math.max(marginY, height - marginY - boxHeight));
    const isBadge = recipe.titleTreatment === "badge";
    const fillRole: LockupShape["fillRole"] = usesKnockoutMask ? "rule" : "none";
    const strokeRole: LockupShape["strokeRole"] = usesKnockoutMask ? "accent" : "rule";
    const radius = usesKnockoutMask ? 8 : isBadge ? 14 : 6;

    shapes.push({
      x: boxLeft,
      y: boxTop,
      w: boxWidth,
      h: boxHeight,
      fillRole,
      strokeRole,
      strokeWidth: Math.max(1.2, isBadge ? ornamentStroke * 0.82 : ornamentStroke * 0.72),
      radius,
      opacity: fillRole === "none" ? undefined : 0.1,
      purpose: fillRole === "none" ? "frame" : "box_fill"
    });
  }

  const filteredShapes = shapes.filter((shape) => {
    const strokeWidth = typeof shape.strokeWidth === "number" ? shape.strokeWidth : 0;
    const isGuideLikeLine =
      (shape.h <= 2 && shape.w >= Math.max(24, Math.round(width * 0.08))) ||
      (shape.w <= 2 && shape.h >= Math.max(24, Math.round(height * 0.08)));
    const isFloatingDot = shape.w <= 8 && shape.h <= 8;
    const isThinFrame = shape.purpose === "frame" && shape.fillRole === "none" && strokeWidth > 0 && strokeWidth < 2.2;

    if (shape.purpose === "ornament" && (isGuideLikeLine || isFloatingDot)) {
      return false;
    }
    if (isThinFrame) {
      return false;
    }
    return true;
  });
  shapes.length = 0;
  shapes.push(...filteredShapes);

  const fittedRegions = applyLockupAutofitAndBalance({
    width,
    height,
    marginX,
    marginY,
    aspect: params.aspect,
    recipe,
    blocks,
    shapes
  });
  textRegion = fittedRegions.textRegion;
  backingRegion = fittedRegions.backingRegion;
  enforceBackdropGuardrails({
    shapes,
    textRegion,
    width,
    height
  });

  const normalizedRegions = normalizeLockupRegions({
    width,
    height,
    textBounds: textBoundsFromBlocks(blocks),
    marginX,
    marginY
  });
  textRegion = normalizedRegions.textRegion;
  backingRegion = normalizedRegions.backingRegion;

  if (!isTitleLegible({ blocks, width, height })) {
    const safeTitle = applyCaseTreatment(requestedTitle || "Untitled Series", recipe.hierarchy.case);
    const fallbackTitle = normalizeWhitespace(safeTitle) || "Untitled Series";
    const safeTitleBlock = buildSafeFallbackTitleBlock({
      width,
      height,
      aspect: params.aspect,
      title: fallbackTitle,
      titleFontFamily: params.fontPairing.titleFont,
      titleTrackingHint: recipe.hierarchy.tracking,
      colorRole: usesKnockoutMask ? "secondary" : "primary"
    });
    blocks.length = 0;
    blocks.push(safeTitleBlock);
    shapes.length = 0;

    const safeRegions = normalizeLockupRegions({
      width,
      height,
      textBounds: textBoundsFromBlocks(blocks),
      marginX,
      marginY
    });
    textRegion = safeRegions.textRegion;
    backingRegion = safeRegions.backingRegion;
  }

  return {
    width,
    height,
    aspect: params.aspect,
    recipe,
    textRegion,
    backingRegion,
    blocks,
    shapes
  };
}

export function renderLockup(params: {
  backgroundSize: { width: number; height: number };
  aspect: Aspect;
  content: LockupContent;
  lockupRecipe: LockupRecipe;
  fontPairing: FontPairing;
  palette: LockupTextPalette;
  lockupPresetId?: string | null;
}): LockupRenderResult {
  const layout = computeLockupLayout({
    backgroundSize: params.backgroundSize,
    aspect: params.aspect,
    content: params.content,
    lockupRecipe: params.lockupRecipe,
    fontPairing: params.fontPairing,
    lockupPresetId: params.lockupPresetId
  });

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">`
  );

  const fontFaceCss = buildEmbeddedFontFaceCss(
    layout.blocks.flatMap((block) => {
      const weightedFaces = (block.lineWeights || []).map((weight) => ({
        family: block.fontFamily,
        weight
      }));
      return [
        {
          family: block.fontFamily,
          weight: block.fontWeight
        },
        ...weightedFaces
      ];
    })
  );
  const blurValues = [...new Set(layout.blocks.map((block) => block.blur || 0).filter((value) => value > 0))]
    .map((value) => clamp(value, 0, 16))
    .sort((a, b) => a - b);
  const includeDefs = params.palette.autoScrim || Boolean(fontFaceCss) || blurValues.length > 0;

  if (includeDefs) {
    parts.push("<defs>");
    if (fontFaceCss) {
      parts.push(`<style type="text/css">${escapeXmlText(fontFaceCss)}</style>`);
    }
    for (const blurValue of blurValues) {
      parts.push(
        `<filter id="${blurFilterId(blurValue)}"><feGaussianBlur in="SourceGraphic" stdDeviation="${Math.max(0.2, blurValue).toFixed(2)}" /></filter>`
      );
    }
  }

  if (params.palette.autoScrim) {
    parts.push(
      `<linearGradient id="lockup-scrim-main" x1="0" y1="0" x2="${layout.aspect === "tall" ? "0" : "1"}" y2="${layout.aspect === "tall" ? "1" : "0"}">`
    );
    parts.push(`<stop offset="0%" stop-color="${params.palette.scrimTint}" stop-opacity="0.2" />`);
    parts.push(`<stop offset="50%" stop-color="${params.palette.scrimTint}" stop-opacity="0.11" />`);
    parts.push(`<stop offset="100%" stop-color="${params.palette.scrimTint}" stop-opacity="0.0" />`);
    parts.push("</linearGradient>");
    parts.push('<radialGradient id="lockup-scrim-soft" cx="20%" cy="18%" r="62%">');
    parts.push(`<stop offset="0%" stop-color="${params.palette.scrimTint}" stop-opacity="0.13" />`);
    parts.push(`<stop offset="100%" stop-color="${params.palette.scrimTint}" stop-opacity="0.0" />`);
    parts.push("</radialGradient>");
  }
  if (includeDefs) {
    parts.push("</defs>");
  }
  if (params.palette.autoScrim) {
    parts.push(`<rect x="0" y="0" width="${layout.width}" height="${layout.height}" fill="url(#lockup-scrim-main)" />`);
    parts.push(`<rect x="0" y="0" width="${layout.width}" height="${layout.height}" fill="url(#lockup-scrim-soft)" />`);
  }

  for (const shape of layout.shapes) {
    parts.push(renderShapeNode(shape, params.palette));
  }

  let arcTitleRendered = false;
  let arcTitleIndex = 0;
  const titleShadowOffsetX = Math.max(1, Math.round(layout.width * 0.0028));
  const titleShadowOffsetY = Math.max(1, Math.round(layout.height * 0.0022));
  const subtitleShadowOffsetY = Math.max(1, Math.round(layout.height * 0.0018));
  for (const block of layout.blocks) {
    const baseColor = resolveColor(block.colorRole, params.palette);
    const color = block.isKnockout
      ? params.palette.scrimTint === "#000000"
        ? "#FFFFFF"
        : "#0F172A"
      : baseColor;

    if (params.lockupPresetId === "arc_title" && block.key === "title" && !block.isOverprint && !arcTitleRendered) {
      const pathId = `lockup-arc-title-${arcTitleIndex++}`;
      parts.push(renderArcTitleNode(block, color, pathId));
      arcTitleRendered = true;
      continue;
    }

    if (!block.isOverprint && block.key === "title" && params.palette.forceTitleShadow) {
      parts.push(
        renderTextNode(
          {
            ...block,
            x: block.x + titleShadowOffsetX,
            y: block.y + titleShadowOffsetY,
            opacity: Math.max(typeof block.opacity === "number" ? block.opacity : 0.22, 0.22)
          },
          resolveColor("tertiary", params.palette)
        )
      );
    }

    if (!block.isOverprint && block.key === "subtitle" && params.palette.forceSubtitleShadow) {
      parts.push(
        renderTextNode(
          {
            ...block,
            y: block.y + subtitleShadowOffsetY,
            opacity: Math.max(typeof block.opacity === "number" ? block.opacity : 0.18, 0.18)
          },
          resolveColor("tertiary", params.palette)
        )
      );
    }

    if (!block.isOverprint && !block.isOutline && block.key === "title" && params.palette.forceTitleOutline) {
      parts.push(
        renderTextNode(block, resolveColor("rule", params.palette), {
          outlined: true,
          strokeWidthScale: 0.038
        })
      );
    }

    if (block.isOutline) {
      parts.push(
        renderTextNode(block, resolveColor("rule", params.palette), {
          outlined: true,
          strokeWidthScale: block.inlineStroke ? 0.056 : 0.045
        })
      );
      if (block.inlineStroke) {
        parts.push(
          renderTextNode(block, resolveColor("accent", params.palette), {
            outlined: true,
            strokeWidthScale: 0.024
          })
        );
      }
    }
    parts.push(renderTextNode(block, color));
  }

  parts.push("</svg>");

  return {
    layout,
    overlaySvg: parts.join("\n")
  };
}

function blockColorForLayer(block: LockupTextBlock, palette: LockupTextPalette): string {
  if (block.isKnockout) {
    return palette.scrimTint === "#000000" ? "#FFFFFF" : "#0F172A";
  }
  if (block.colorRole === "primary") {
    return palette.primary;
  }
  if (block.colorRole === "secondary") {
    return palette.secondary;
  }
  if (block.colorRole === "tertiary") {
    return palette.tertiary;
  }
  return palette.accent;
}

function applyOpacityToColor(color: string, opacity?: number): string {
  if (typeof opacity !== "number") {
    return color;
  }
  const alpha = clamp(opacity, 0, 1);
  if (alpha >= 0.999) {
    return color;
  }

  const normalized = color.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return color;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${alpha.toFixed(3)})`;
}

export function buildLockupDesignLayers(params: {
  layout: LockupLayout;
  palette: LockupTextPalette;
}): DesignLayer[] {
  const layers: DesignLayer[] = [];

  if (params.palette.autoScrim) {
    const mainScrim = params.palette.scrimTint === "#FFFFFF" ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.2)";
    const softScrim = params.palette.scrimTint === "#FFFFFF" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.13)";

    layers.push({
      type: "shape",
      x: 0,
      y: 0,
      w: params.layout.width,
      h: params.layout.height,
      shape: "rect",
      fill: mainScrim,
      stroke: mainScrim,
      strokeWidth: 0
    });
    layers.push({
      type: "shape",
      x: 0,
      y: 0,
      w: params.layout.width,
      h: params.layout.height,
      shape: "rect",
      fill: softScrim,
      stroke: softScrim,
      strokeWidth: 0
    });
  }

  for (const shape of params.layout.shapes) {
    if (shape.fillRole === "none" && shape.strokeRole && (shape.strokeWidth || 0) > 0) {
      const strokeColor = resolveColor(shape.strokeRole, params.palette);
      const stroke = Math.max(1, shape.strokeWidth || 1);
      layers.push({
        type: "shape",
        x: shape.x,
        y: shape.y,
        w: shape.w,
        h: stroke,
        shape: "rect",
        fill: strokeColor,
        stroke: strokeColor,
        strokeWidth: 0
      });
      layers.push({
        type: "shape",
        x: shape.x,
        y: shape.y + Math.max(0, shape.h - stroke),
        w: shape.w,
        h: stroke,
        shape: "rect",
        fill: strokeColor,
        stroke: strokeColor,
        strokeWidth: 0
      });
      layers.push({
        type: "shape",
        x: shape.x,
        y: shape.y,
        w: stroke,
        h: shape.h,
        shape: "rect",
        fill: strokeColor,
        stroke: strokeColor,
        strokeWidth: 0
      });
      layers.push({
        type: "shape",
        x: shape.x + Math.max(0, shape.w - stroke),
        y: shape.y,
        w: stroke,
        h: shape.h,
        shape: "rect",
        fill: strokeColor,
        stroke: strokeColor,
        strokeWidth: 0
      });
      continue;
    }

    const fill = shape.fillRole === "none" ? "rgba(0,0,0,0)" : applyOpacityToColor(resolveColor(shape.fillRole, params.palette), shape.opacity);
    const stroke = shape.strokeRole ? resolveColor(shape.strokeRole, params.palette) : fill;
    layers.push({
      type: "shape",
      x: shape.x,
      y: shape.y,
      w: shape.w,
      h: shape.h,
      shape: "rect",
      fill,
      stroke,
      strokeWidth: shape.strokeWidth || 0
    });
  }

  for (const block of params.layout.blocks) {
    const color = blockColorForLayer(block, params.palette);
    const textOpacityFloor = !block.isOverprint && !block.isOutline && !block.inlineStroke
      ? block.key === "title"
        ? 0.85
        : block.key === "subtitle"
          ? 0.8
          : 0
      : 0;
    const contentOpacity = textOpacityFloor > 0
      ? Math.max(typeof block.opacity === "number" ? block.opacity : 1, textOpacityFloor)
      : block.opacity;

    if (!block.isOverprint && block.key === "title" && params.palette.forceTitleShadow) {
      layers.push({
        type: "text",
        x: block.x + Math.max(1, Math.round(params.layout.width * 0.0028)),
        y: block.y + Math.max(1, Math.round(params.layout.height * 0.0022)),
        w: block.w,
        h: block.h,
        text: block.lines.join("\n"),
        fontSize: block.fontSize,
        fontFamily: block.fontFamily,
        fontWeight: block.fontWeight,
        letterSpacing: block.letterSpacing,
        color: params.palette.tertiary,
        align: block.align,
        opacity: 0.24
      });
    }

    if (!block.isOverprint && block.key === "subtitle" && params.palette.forceSubtitleShadow) {
      layers.push({
        type: "text",
        x: block.x,
        y: block.y + Math.max(1, Math.round(params.layout.height * 0.0018)),
        w: block.w,
        h: block.h,
        text: block.lines.join("\n"),
        fontSize: block.fontSize,
        fontFamily: block.fontFamily,
        fontWeight: block.fontWeight,
        letterSpacing: block.letterSpacing,
        color: params.palette.tertiary,
        align: block.align,
        opacity: 0.2
      });
    }

    if (!block.isOverprint && !block.isOutline && block.key === "title" && params.palette.forceTitleOutline) {
      const assistOutlineOffsets: Array<[number, number]> = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1]
      ];
      for (const [dx, dy] of assistOutlineOffsets) {
        layers.push({
          type: "text",
          x: block.x + dx,
          y: block.y + dy,
          w: block.w,
          h: block.h,
          text: block.lines.join("\n"),
          fontSize: block.fontSize,
          fontFamily: block.fontFamily,
          fontWeight: block.fontWeight,
          letterSpacing: block.letterSpacing,
          color: params.palette.rule,
          align: block.align,
          opacity: 0.92
        });
      }
    }

    if (block.isOutline) {
      const outlineOffsets: Array<[number, number]> = [
        [-1.5, 0],
        [1.5, 0],
        [0, -1.5],
        [0, 1.5]
      ];
      for (const [dx, dy] of outlineOffsets) {
        layers.push({
          type: "text",
          x: block.x + dx,
          y: block.y + dy,
          w: block.w,
          h: block.h,
          text: block.lines.join("\n"),
          fontSize: block.fontSize,
          fontFamily: block.fontFamily,
          fontWeight: block.fontWeight,
          letterSpacing: block.letterSpacing,
          color: params.palette.rule,
          align: block.align,
          opacity: block.inlineStroke ? 0.95 : contentOpacity
        });
      }
      if (block.inlineStroke) {
        layers.push({
          type: "text",
          x: block.x,
          y: block.y,
          w: block.w,
          h: block.h,
          text: block.lines.join("\n"),
          fontSize: block.fontSize,
          fontFamily: block.fontFamily,
          fontWeight: block.fontWeight,
          letterSpacing: block.letterSpacing,
          color: params.palette.accent,
          align: block.align,
          opacity: 0.92
        });
      }
    }

    if (block.lineWeights && block.lineWeights.length > 1) {
      block.lines.forEach((line, index) => {
        layers.push({
          type: "text",
          x: block.x,
          y: block.y + index * block.lineHeight,
          w: block.w,
          h: block.lineHeight + 8,
          text: line,
          fontSize: block.fontSize,
          fontFamily: block.fontFamily,
          fontWeight: block.lineWeights?.[index] || block.fontWeight,
          letterSpacing: block.letterSpacing,
          color,
          align: block.align,
          opacity: contentOpacity
        });
      });
      continue;
    }

    layers.push({
      type: "text",
      x: block.x,
      y: block.y,
      w: block.w,
      h: block.h,
      text: block.lines.join("\n"),
      fontSize: block.fontSize,
      fontFamily: block.fontFamily,
      fontWeight: block.fontWeight,
      letterSpacing: block.letterSpacing,
      color,
      align: block.align,
      opacity: contentOpacity
    });
  }

  return layers;
}
