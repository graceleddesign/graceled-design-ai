import sharp from "sharp";
import type { DesignDoc, DesignLayer } from "@/lib/design-doc";

export type CleanMinimalShape = "square" | "wide" | "tall";

export type CleanMinimalTextContent = {
  title: string;
  subtitle?: string | null;
  passage?: string | null;
  description?: string | null;
};

type TextBlockLayout = {
  key: "title" | "subtitle" | "passage" | "description";
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  fontFamily: string;
  lines: string[];
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
  backingFill: string;
  backingStroke: string;
  rule: string;
  accent: string;
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
  descriptionWasTruncated: boolean;
};

const TITLE_STACK = "'Inter','Helvetica','Arial',sans-serif";
const BODY_STACK = "'Inter','Helvetica','Arial',sans-serif";
const SERIF_STACK = "'Georgia','Times New Roman',serif";

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function normalizeText(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

function truncateWithEllipsis(value: string, maxChars: number): { text: string; truncated: boolean } {
  if (value.length <= maxChars) {
    return { text: value, truncated: false };
  }
  return {
    text: `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`,
    truncated: true
  };
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
  const lineParts = block.lines.map((line, index) => {
    const y = firstBaseline + index * block.lineHeight;
    return `<tspan x="${block.x}" y="${y}">${escapeXml(line)}</tspan>`;
  });

  return `<text x="${block.x}" y="${firstBaseline}" fill="${color}" font-family="${block.fontFamily}" font-size="${block.fontSize}" font-weight="${block.fontWeight}" text-anchor="start">${lineParts.join("")}</text>`;
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

export function computeCleanMinimalLayout(params: {
  width: number;
  height: number;
  content: CleanMinimalTextContent;
}): CleanMinimalLayout {
  const shape = shapeFromDimensions(params.width, params.height);
  const width = params.width;
  const height = params.height;
  const marginX = Math.round(width * (shape === "wide" ? 0.072 : 0.085));
  const marginY = Math.round(height * (shape === "tall" ? 0.078 : 0.09));

  const textWidth = Math.round(width * (shape === "wide" ? 0.46 : shape === "tall" ? 0.74 : 0.7));
  const title = normalizeText(params.content.title) || "Untitled Series";
  const subtitle = normalizeText(params.content.subtitle);
  const passage = normalizeText(params.content.passage);
  const descriptionSource = normalizeText(params.content.description);
  const truncatedDescription = truncateWithEllipsis(descriptionSource, 140);

  const titleFontSize = clamp(chooseTitleFontSizeByLength(title.length, shape, width, height), 52, shape === "tall" ? 150 : 132);
  const subtitleFontSize = clamp(Math.round(titleFontSize * 0.42), 22, 52);
  const passageFontSize = clamp(Math.round(subtitleFontSize * 0.82), 18, 40);
  const descriptionFontSize = clamp(Math.round(subtitleFontSize * 0.7), 16, 30);

  const titleLines = wrapText(title, estimateCharsPerLine(textWidth, titleFontSize), shape === "tall" ? 4 : 3);
  const subtitleLines = wrapText(subtitle, estimateCharsPerLine(textWidth, subtitleFontSize), 2);
  const passageLines = wrapText(passage, estimateCharsPerLine(textWidth, passageFontSize), 2);
  const descriptionLines = wrapText(
    truncatedDescription.text,
    estimateCharsPerLine(Math.round(textWidth * 0.96), descriptionFontSize),
    3
  );

  const blocks: TextBlockLayout[] = [];
  const titleLineHeight = Math.round(titleFontSize * 1.08);
  const subtitleLineHeight = Math.round(subtitleFontSize * 1.2);
  const passageLineHeight = Math.round(passageFontSize * 1.24);
  const descriptionLineHeight = Math.round(descriptionFontSize * 1.28);

  let currentY = marginY + Math.round(height * (shape === "tall" ? 0.03 : 0.02));

  blocks.push({
    key: "title",
    x: marginX,
    y: currentY,
    w: textWidth,
    h: Math.max(titleFontSize + 10, titleLines.length * titleLineHeight),
    fontSize: titleFontSize,
    fontWeight: 720,
    lineHeight: titleLineHeight,
    fontFamily: TITLE_STACK,
    lines: titleLines
  });

  currentY += Math.max(titleFontSize + 10, titleLines.length * titleLineHeight) + Math.round(height * 0.02);

  if (subtitleLines.length > 0) {
    blocks.push({
      key: "subtitle",
      x: marginX,
      y: currentY,
      w: textWidth,
      h: Math.max(subtitleFontSize + 8, subtitleLines.length * subtitleLineHeight),
      fontSize: subtitleFontSize,
      fontWeight: 540,
      lineHeight: subtitleLineHeight,
      fontFamily: BODY_STACK,
      lines: subtitleLines
    });
    currentY += Math.max(subtitleFontSize + 8, subtitleLines.length * subtitleLineHeight) + Math.round(height * 0.013);
  }

  if (passageLines.length > 0) {
    blocks.push({
      key: "passage",
      x: marginX,
      y: currentY,
      w: textWidth,
      h: Math.max(passageFontSize + 6, passageLines.length * passageLineHeight),
      fontSize: passageFontSize,
      fontWeight: 430,
      lineHeight: passageLineHeight,
      fontFamily: SERIF_STACK,
      lines: passageLines
    });
  }

  if (descriptionLines.length > 0) {
    blocks.push({
      key: "description",
      x: marginX,
      y: height - marginY - Math.max(descriptionFontSize + 6, descriptionLines.length * descriptionLineHeight),
      w: Math.round(textWidth * 0.96),
      h: Math.max(descriptionFontSize + 6, descriptionLines.length * descriptionLineHeight),
      fontSize: descriptionFontSize,
      fontWeight: 460,
      lineHeight: descriptionLineHeight,
      fontFamily: BODY_STACK,
      lines: descriptionLines
    });
  }

  const textRegionHeight = Math.round(height * (shape === "tall" ? 0.56 : 0.48));
  const textRegion: CleanMinimalTextRegion = {
    left: marginX,
    top: marginY,
    width: textWidth,
    height: textRegionHeight
  };

  const backingRegion: CleanMinimalTextRegion = {
    left: Math.max(0, marginX - Math.round(width * 0.025)),
    top: Math.max(0, marginY - Math.round(height * 0.02)),
    width: Math.min(width - marginX, textWidth + Math.round(width * 0.07)),
    height: Math.min(height - marginY, Math.round(height * (shape === "tall" ? 0.68 : 0.58)))
  };

  return {
    width,
    height,
    shape,
    marginX,
    marginY,
    textRegion,
    backingRegion,
    blocks,
    descriptionWasTruncated: truncatedDescription.truncated
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
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;

  if (luminance >= 0.57) {
    return {
      primary: "#0F172A",
      secondary: "#334155",
      tertiary: "#475569",
      backingFill: "rgba(255,255,255,0.22)",
      backingStroke: "rgba(255,255,255,0.34)",
      rule: "rgba(15,23,42,0.46)",
      accent: "rgba(15,23,42,0.64)"
    };
  }

  return {
    primary: "#F8FAFC",
    secondary: "#E2E8F0",
    tertiary: "#CBD5E1",
    backingFill: "rgba(2,6,23,0.3)",
    backingStroke: "rgba(148,163,184,0.3)",
    rule: "rgba(226,232,240,0.56)",
    accent: "rgba(248,250,252,0.72)"
  };
}

export function buildCleanMinimalOverlaySvg(params: {
  width: number;
  height: number;
  content: CleanMinimalTextContent;
  palette: CleanMinimalTextPalette;
}): string {
  const layout = computeCleanMinimalLayout({
    width: params.width,
    height: params.height,
    content: params.content
  });

  const titleBlock = layout.blocks.find((block) => block.key === "title");
  const subtitleBlock = layout.blocks.find((block) => block.key === "subtitle");
  const passageBlock = layout.blocks.find((block) => block.key === "passage");
  const descriptionBlock = layout.blocks.find((block) => block.key === "description");

  const topRuleY = layout.marginY - Math.round(layout.height * 0.03);
  const topRuleWidth = Math.round(layout.textRegion.width * 0.58);

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">`);
  parts.push("<defs>");
  parts.push("<filter id=\"cm-soft\" x=\"-15%\" y=\"-15%\" width=\"130%\" height=\"130%\">\n<feGaussianBlur stdDeviation=\"10\" />\n</filter>");
  parts.push(
    `<linearGradient id="cm-desc-fade" x1="0" y1="0" x2="1" y2="0"><stop offset="78%" stop-color="${params.palette.tertiary}" stop-opacity="1" /><stop offset="100%" stop-color="${params.palette.tertiary}" stop-opacity="0.6" /></linearGradient>`
  );
  parts.push("</defs>");

  parts.push(
    `<rect x="${layout.backingRegion.left}" y="${layout.backingRegion.top}" width="${layout.backingRegion.width}" height="${layout.backingRegion.height}" rx="22" fill="${params.palette.backingFill}" stroke="${params.palette.backingStroke}" stroke-width="1" filter="url(#cm-soft)" />`
  );

  parts.push(
    `<line x1="${layout.marginX}" y1="${topRuleY}" x2="${layout.marginX + topRuleWidth}" y2="${topRuleY}" stroke="${params.palette.rule}" stroke-width="2" stroke-linecap="round" />`
  );
  parts.push(
    `<circle cx="${layout.marginX + topRuleWidth + 20}" cy="${topRuleY}" r="5" fill="${params.palette.accent}" />`
  );

  if (titleBlock) {
    parts.push(renderTextBlockSvg(titleBlock, params.palette.primary));
  }
  if (subtitleBlock) {
    parts.push(renderTextBlockSvg(subtitleBlock, params.palette.secondary));
  }
  if (passageBlock) {
    parts.push(renderTextBlockSvg(passageBlock, params.palette.secondary));
  }
  if (descriptionBlock) {
    const descColor = layout.descriptionWasTruncated ? "url(#cm-desc-fade)" : params.palette.tertiary;
    parts.push(renderTextBlockSvg(descriptionBlock, descColor));
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
}): DesignDoc {
  const layout = computeCleanMinimalLayout({
    width: params.width,
    height: params.height,
    content: params.content
  });

  const layers: DesignLayer[] = [];

  for (const block of layout.blocks) {
    const color =
      block.key === "title"
        ? params.palette.primary
        : block.key === "description"
          ? params.palette.tertiary
          : params.palette.secondary;

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
      align: "left"
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
