import { buildOverlayDisplayContent } from "@/lib/overlay-lines";

export type DesignTextAlign = "left" | "center" | "right";
export type DesignLayerPurpose = "content" | "guide";

export type DesignDocBackground = {
  color: string;
};

export type DesignTextLayer = {
  type: "text";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  letterSpacing?: number;
  color: string;
  align: DesignTextAlign;
  purpose?: DesignLayerPurpose;
};

export type DesignImageLayer = {
  type: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  src: string;
  purpose?: DesignLayerPurpose;
};

export type DesignShapeLayer = {
  type: "shape";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  shape: "rect";
  fill: string;
  stroke: string;
  strokeWidth: number;
  purpose?: DesignLayerPurpose;
};

export type DesignLayer = DesignTextLayer | DesignImageLayer | DesignShapeLayer;

export type DesignDoc = {
  width: number;
  height: number;
  backgroundImagePath?: string | null;
  background: DesignDocBackground;
  layers: DesignLayer[];
};

type DesignDocShape = "square" | "wide" | "tall";

type BuildFinalDesignDocParams = {
  output: unknown;
  input: unknown;
  presetKey?: string | null;
  shape?: DesignDocShape;
  project: {
    seriesTitle: string;
    seriesSubtitle: string | null;
    scripturePassages: string | null;
    seriesDescription: string | null;
    logoPath: string | null;
    palette: string[];
  };
  round: number;
  optionIndex: number;
  backgroundImagePath?: string | null;
};

function isRecord(input: unknown): input is Record<string, unknown> {
  return Boolean(input) && typeof input === "object" && !Array.isArray(input);
}

function clampNumber(input: unknown, fallback: number): number {
  if (typeof input !== "number" || Number.isNaN(input) || !Number.isFinite(input)) {
    return fallback;
  }

  if (input < 0) {
    return 0;
  }

  return input;
}

function normalizeRotation(input: unknown): number {
  if (typeof input !== "number" || Number.isNaN(input) || !Number.isFinite(input)) {
    return 0;
  }

  if (input > 360) {
    return 360;
  }

  if (input < -360) {
    return -360;
  }

  return input;
}

function normalizeColor(input: unknown, fallback: string): string {
  if (typeof input !== "string") {
    return fallback;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return fallback;
  }

  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return fallback;
}

function normalizeShapePaint(input: unknown, fallback: string): string {
  if (typeof input !== "string") {
    return fallback;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return fallback;
  }

  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  const gradientMatch = /^url\(\s*#([a-zA-Z][\w-]*)\s*\)$/.exec(trimmed);
  if (gradientMatch) {
    return `url(#${gradientMatch[1]})`;
  }

  return fallback;
}

function normalizeAlign(input: unknown, fallback: DesignTextAlign): DesignTextAlign {
  if (input === "left" || input === "center" || input === "right") {
    return input;
  }

  return fallback;
}

function normalizePurpose(input: unknown): DesignLayerPurpose | undefined {
  if (input === "guide") {
    return "guide";
  }
  if (input === "content") {
    return "content";
  }
  return undefined;
}

function normalizeLetterSpacing(input: unknown): number | undefined {
  if (typeof input !== "number" || Number.isNaN(input) || !Number.isFinite(input)) {
    return undefined;
  }

  if (input < -24) {
    return -24;
  }
  if (input > 24) {
    return 24;
  }
  return input;
}

function normalizeImageSource(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed;
}

function normalizeTextLayer(input: Record<string, unknown>): DesignTextLayer | null {
  const text = typeof input.text === "string" ? input.text : "";
  if (!text.trim()) {
    return null;
  }

  return {
    type: "text",
    x: clampNumber(input.x, 0),
    y: clampNumber(input.y, 0),
    w: clampNumber(input.w, 400),
    h: clampNumber(input.h, 120),
    rotation: normalizeRotation(input.rotation),
    text,
    fontSize: clampNumber(input.fontSize, 42),
    fontFamily: typeof input.fontFamily === "string" && input.fontFamily.trim() ? input.fontFamily.trim() : "Arial",
    fontWeight: clampNumber(input.fontWeight, 700),
    letterSpacing: normalizeLetterSpacing(input.letterSpacing),
    color: normalizeColor(input.color, "#FFFFFF"),
    align: normalizeAlign(input.align, "left"),
    purpose: normalizePurpose(input.purpose)
  };
}

function normalizeImageLayer(input: Record<string, unknown>): DesignImageLayer | null {
  const src = normalizeImageSource(input.src);
  if (!src) {
    return null;
  }

  return {
    type: "image",
    x: clampNumber(input.x, 0),
    y: clampNumber(input.y, 0),
    w: clampNumber(input.w, 320),
    h: clampNumber(input.h, 320),
    rotation: normalizeRotation(input.rotation),
    src,
    purpose: normalizePurpose(input.purpose)
  };
}

function normalizeShapeLayer(input: Record<string, unknown>): DesignShapeLayer {
  return {
    type: "shape",
    x: clampNumber(input.x, 0),
    y: clampNumber(input.y, 0),
    w: clampNumber(input.w, 320),
    h: clampNumber(input.h, 200),
    rotation: normalizeRotation(input.rotation),
    shape: "rect",
    fill: normalizeShapePaint(input.fill, "#FFFFFF"),
    stroke: normalizeShapePaint(input.stroke, "#000000"),
    strokeWidth: clampNumber(input.strokeWidth, 0),
    purpose: normalizePurpose(input.purpose)
  };
}

export function normalizeDesignDoc(input: unknown): DesignDoc | null {
  if (!isRecord(input)) {
    return null;
  }

  const width = clampNumber(input.width, 1920);
  const height = clampNumber(input.height, 1080);
  const layersInput = Array.isArray(input.layers) ? input.layers : [];
  const background = isRecord(input.background) ? input.background : null;
  const hasBackgroundImagePath = Object.prototype.hasOwnProperty.call(input, "backgroundImagePath");
  const backgroundImagePath =
    input.backgroundImagePath === null
      ? null
      : typeof input.backgroundImagePath === "string" && input.backgroundImagePath.trim()
        ? input.backgroundImagePath.trim()
        : undefined;

  const layers: DesignLayer[] = [];

  for (const layerInput of layersInput) {
    if (!isRecord(layerInput)) {
      continue;
    }

    const type = layerInput.type;
    if (type === "text") {
      const layer = normalizeTextLayer(layerInput);
      if (layer) {
        layers.push(layer);
      }
      continue;
    }

    if (type === "image") {
      const layer = normalizeImageLayer(layerInput);
      if (layer) {
        layers.push(layer);
      }
      continue;
    }

    if (type === "shape") {
      layers.push(normalizeShapeLayer(layerInput));
    }
  }

  if (layers.length === 0) {
    return null;
  }

  const normalized: DesignDoc = {
    width,
    height,
    background: {
      color: normalizeColor(background?.color, "#0F172A")
    },
    layers
  };

  if (hasBackgroundImagePath) {
    normalized.backgroundImagePath = backgroundImagePath ?? null;
  }

  return normalized;
}

function parsePreviewAsset(output: unknown): string {
  if (!isRecord(output)) {
    return "";
  }

  const preview = output.preview;
  if (!isRecord(preview)) {
    return "";
  }

  const widescreen = typeof preview.widescreen_main === "string" ? preview.widescreen_main : "";
  const square = typeof preview.square_main === "string" ? preview.square_main : "";
  const vertical = typeof preview.vertical_main === "string" ? preview.vertical_main : "";
  return widescreen || square || vertical || "";
}

function normalizeLogoPath(logoPath: string | null): string | null {
  if (!logoPath || !logoPath.trim()) {
    return null;
  }

  return logoPath.startsWith("/") ? logoPath : `/${logoPath}`;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toWords(value: string): string[] {
  const normalized = normalizeWhitespace(value);
  return normalized ? normalized.split(" ") : [];
}

function wrapText(value: string, maxChars: number, maxLines: number): string {
  const words = toWords(value);
  if (words.length === 0) {
    return "";
  }

  const lines: string[] = [];
  let lineWords: string[] = [];

  for (const word of words) {
    const candidate = lineWords.length === 0 ? word : `${lineWords.join(" ")} ${word}`;
    if (candidate.length <= maxChars || lineWords.length === 0) {
      lineWords.push(word);
      continue;
    }

    lines.push(lineWords.join(" "));
    lineWords = [word];
  }

  if (lineWords.length > 0) {
    lines.push(lineWords.join(" "));
  }

  if (lines.length <= maxLines) {
    return lines.join("\n");
  }

  const clamped = lines.slice(0, maxLines);
  const lastIndex = clamped.length - 1;
  let lastLine = clamped[lastIndex];
  while (lastLine.length > maxChars - 1 && lastLine.includes(" ")) {
    lastLine = lastLine.slice(0, lastLine.lastIndexOf(" "));
  }
  clamped[lastIndex] = `${lastLine.replace(/[.,;:!?-]+$/, "")}…`;
  return clamped.join("\n");
}

function shapeDimensions(shape: DesignDocShape): { width: number; height: number } {
  if (shape === "square") {
    return { width: 1080, height: 1080 };
  }
  if (shape === "tall") {
    return { width: 1080, height: 1920 };
  }
  return { width: 1920, height: 1080 };
}

function buildDefaultFallbackDesignDoc(params: BuildFinalDesignDocParams): DesignDoc {
  const primary = normalizeColor(params.project.palette[0], "#0F172A");
  const accent = normalizeColor(params.project.palette[1], "#1E293B");
  const logoSrc = normalizeLogoPath(params.project.logoPath);
  const previewAsset = parsePreviewAsset(params.output);
  const displayContent = buildOverlayDisplayContent({
    title: params.project.seriesTitle,
    subtitle: params.project.seriesSubtitle,
    scripturePassages: params.project.scripturePassages
  });
  const subtitle = displayContent.subtitle;

  const layers: DesignLayer[] = [
    {
      type: "shape",
      x: 0,
      y: 0,
      w: 1920,
      h: 1080,
      shape: "rect",
      fill: "url(#scrim)",
      stroke: "#000000",
      strokeWidth: 0
    },
    {
      type: "shape",
      x: 140,
      y: 142,
      w: 260,
      h: 2,
      shape: "rect",
      fill: accent,
      stroke: accent,
      strokeWidth: 0
    },
    {
      type: "text",
      x: 140,
      y: 160,
      w: 980,
      h: 180,
      text: displayContent.title,
      fontSize: 72,
      fontFamily: "Arial",
      fontWeight: 700,
      color: primary,
      align: "left"
    }
  ];

  if (subtitle) {
    layers.push({
      type: "text",
      x: 140,
      y: 340,
      w: 980,
      h: 90,
      text: subtitle,
      fontSize: 36,
      fontFamily: "Arial",
      fontWeight: 500,
      color: accent,
      align: "left"
    });
  }

  if (logoSrc) {
    layers.push({
      type: "image",
      x: 1570,
      y: 130,
      w: 220,
      h: 120,
      src: logoSrc
    });
  }

  if (previewAsset) {
    layers.push({
      type: "image",
      x: 1190,
      y: 290,
      w: 600,
      h: 520,
      src: previewAsset
    });
  }

  const designDoc: DesignDoc = {
    width: 1920,
    height: 1080,
    background: {
      color: "#FFFFFF"
    },
    layers
  };

  if (typeof params.backgroundImagePath === "string" || params.backgroundImagePath === null) {
    designDoc.backgroundImagePath = params.backgroundImagePath;
  }

  return designDoc;
}

function buildCleanMinimalFallbackDesignDoc(params: BuildFinalDesignDocParams): DesignDoc {
  const shape = params.shape || "wide";
  const { width, height } = shapeDimensions(shape);
  const logoSrc = normalizeLogoPath(params.project.logoPath);
  const displayContent = buildOverlayDisplayContent({
    title: params.project.seriesTitle,
    subtitle: params.project.seriesSubtitle,
    scripturePassages: params.project.scripturePassages
  });

  const marginX = shape === "wide" ? 138 : shape === "square" ? 102 : 146;
  const marginY = shape === "tall" ? 168 : 112;
  const textX = shape === "tall" ? Math.round(width * 0.14) : marginX;
  const textW = shape === "wide" ? Math.round(width * 0.42) : shape === "square" ? Math.round(width * 0.5) : Math.round(width * 0.72);

  const titleText = wrapText(displayContent.title, shape === "wide" ? 16 : shape === "square" ? 13 : 14, 3);
  const subtitleText = displayContent.subtitle
    ? wrapText(normalizeWhitespace(displayContent.subtitle).toUpperCase(), shape === "wide" ? 32 : 24, 2)
    : "";

  const titleFontSize = shape === "wide" ? 136 : shape === "square" ? 108 : 122;
  const subtitleFontSize = shape === "wide" ? 39 : shape === "square" ? 33 : 36;
  const optionVariant = ((params.optionIndex % 3) + 3) % 3;
  const accentColor = normalizeColor(params.project.palette[1], "#334155");
  const softAccent = normalizeColor(params.project.palette[2], "#E2E8F0");

  const titleLineCount = titleText ? titleText.split("\n").length : 1;
  const subtitleLineCount = subtitleText ? subtitleText.split("\n").length : 0;

  const layers: DesignLayer[] = [
    {
      type: "shape",
      x: 0,
      y: 0,
      w: width,
      h: height,
      shape: "rect",
      fill: shape === "tall" ? "url(#scrimTall)" : "url(#scrim)",
      stroke: "#000000",
      strokeWidth: 0
    },
    {
      type: "shape",
      x: textX,
      y: shape === "tall" ? marginY - 52 : marginY - 44,
      w: shape === "wide" ? 240 : shape === "square" ? 170 : 210,
      h: 2,
      shape: "rect",
      fill: "#CBD5E1",
      stroke: "#CBD5E1",
      strokeWidth: 0
    },
    {
      type: "text",
      x: textX,
      y: marginY,
      w: textW,
      h: Math.max(180, Math.round(titleLineCount * titleFontSize * 1.16)),
      text: titleText,
      fontSize: titleFontSize,
      fontFamily: "Arial",
      fontWeight: 800,
      color: "#0F172A",
      align: "left"
    }
  ];

  if (optionVariant === 1) {
    layers.push({
      type: "shape",
      x: shape === "wide" ? Math.round(width * 0.77) : Math.round(width * 0.8),
      y: shape === "tall" ? Math.round(height * 0.34) : Math.round(height * 0.2),
      w: shape === "tall" ? 12 : 14,
      h: shape === "tall" ? Math.round(height * 0.42) : Math.round(height * 0.56),
      shape: "rect",
      fill: accentColor,
      stroke: accentColor,
      strokeWidth: 0
    });
    layers.push({
      type: "shape",
      x: shape === "wide" ? Math.round(width * 0.74) : Math.round(width * 0.74),
      y: shape === "tall" ? Math.round(height * 0.74) : Math.round(height * 0.69),
      w: shape === "wide" ? 240 : shape === "square" ? 200 : 160,
      h: 6,
      shape: "rect",
      fill: accentColor,
      stroke: accentColor,
      strokeWidth: 0
    });
  }

  if (optionVariant === 2) {
    layers.push({
      type: "shape",
      x: shape === "wide" ? Math.round(width * 0.63) : Math.round(width * 0.58),
      y: shape === "tall" ? Math.round(height * 0.68) : Math.round(height * 0.56),
      w: shape === "wide" ? Math.round(width * 0.3) : Math.round(width * 0.34),
      h: shape === "wide" ? Math.round(height * 0.3) : Math.round(height * 0.26),
      shape: "rect",
      fill: softAccent,
      stroke: accentColor,
      strokeWidth: 1
    });
  }

  let currentY = marginY + titleLineCount * titleFontSize * 1.16 + (shape === "tall" ? 56 : 42);

  if (subtitleText) {
    layers.push({
      type: "text",
      x: textX,
      y: currentY,
      w: textW,
      h: Math.max(64, Math.round(subtitleLineCount * subtitleFontSize * 1.3)),
      text: subtitleText,
      fontSize: subtitleFontSize,
      fontFamily: "Arial",
      fontWeight: 600,
      color: "#334155",
      align: "left"
    });
    currentY += subtitleLineCount * subtitleFontSize * 1.3 + 24;
  }

  if (logoSrc) {
    layers.push({
      type: "image",
      x: textX,
      y: height - marginY + (shape === "tall" ? 4 : 8),
      w: shape === "tall" ? 170 : 184,
      h: shape === "tall" ? 66 : 70,
      src: logoSrc
    });
  }

  const designDoc: DesignDoc = {
    width,
    height,
    background: {
      color: "#F8F6F1"
    },
    layers
  };

  if (typeof params.backgroundImagePath === "string" || params.backgroundImagePath === null) {
    designDoc.backgroundImagePath = params.backgroundImagePath;
  }

  return designDoc;
}

export function buildFallbackDesignDoc(params: BuildFinalDesignDocParams): DesignDoc {
  if (params.presetKey === "type_clean_min_v1") {
    return buildCleanMinimalFallbackDesignDoc(params);
  }

  return buildDefaultFallbackDesignDoc(params);
}

export function buildFinalDesignDoc(params: BuildFinalDesignDocParams): DesignDoc {
  if (isRecord(params.output)) {
    const nestedDoc = normalizeDesignDoc(params.output.designDoc);
    if (nestedDoc) {
      return nestedDoc;
    }
  }

  const directDoc = normalizeDesignDoc(params.output);
  if (directDoc) {
    return directDoc;
  }

  return buildFallbackDesignDoc(params);
}
