import { optionLabel } from "@/lib/option-label";

export type DesignTextAlign = "left" | "center" | "right";

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
  color: string;
  align: DesignTextAlign;
};

export type DesignImageLayer = {
  type: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  src: string;
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
};

export type DesignLayer = DesignTextLayer | DesignImageLayer | DesignShapeLayer;

export type DesignDoc = {
  width: number;
  height: number;
  background: DesignDocBackground;
  layers: DesignLayer[];
};

type BuildFinalDesignDocParams = {
  output: unknown;
  input: unknown;
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

function normalizeAlign(input: unknown, fallback: DesignTextAlign): DesignTextAlign {
  if (input === "left" || input === "center" || input === "right") {
    return input;
  }

  return fallback;
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
    color: normalizeColor(input.color, "#FFFFFF"),
    align: normalizeAlign(input.align, "left")
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
    src
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
    fill: normalizeColor(input.fill, "#FFFFFF"),
    stroke: normalizeColor(input.stroke, "#000000"),
    strokeWidth: clampNumber(input.strokeWidth, 0)
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

  return {
    width,
    height,
    background: {
      color: normalizeColor(background?.color, "#0F172A")
    },
    layers
  };
}

function parseFeedbackText(input: unknown): string {
  if (!isRecord(input)) {
    return "";
  }

  const feedback = input.feedback;
  if (!isRecord(feedback)) {
    return "";
  }

  return typeof feedback.request === "string" ? feedback.request : "";
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

export function buildFallbackDesignDoc(params: BuildFinalDesignDocParams): DesignDoc {
  const primary = normalizeColor(params.project.palette[0], "#0F172A");
  const accent = normalizeColor(params.project.palette[1], "#1E293B");
  const panel = normalizeColor(params.project.palette[2], "#F8FAFC");
  const logoSrc = normalizeLogoPath(params.project.logoPath);
  const previewAsset = parsePreviewAsset(params.output);
  const feedbackText = parseFeedbackText(params.input);

  const bodyParts = [
    params.project.seriesDescription,
    params.project.scripturePassages,
    feedbackText
  ].filter((value): value is string => typeof value === "string" && Boolean(value.trim()));

  const body = bodyParts.length > 0 ? bodyParts.join("\n\n") : "Approved final concept for production use.";

  const layers: DesignLayer[] = [
    {
      type: "shape",
      x: 84,
      y: 84,
      w: 1752,
      h: 912,
      shape: "rect",
      fill: panel,
      stroke: accent,
      strokeWidth: 2
    },
    {
      type: "text",
      x: 140,
      y: 160,
      w: 980,
      h: 180,
      text: params.project.seriesTitle,
      fontSize: 72,
      fontFamily: "Arial",
      fontWeight: 700,
      color: primary,
      align: "left"
    },
    {
      type: "text",
      x: 140,
      y: 340,
      w: 980,
      h: 90,
      text:
        params.project.seriesSubtitle && params.project.seriesSubtitle.trim()
          ? params.project.seriesSubtitle
          : `${optionLabel(params.optionIndex)} approved in round ${params.round}`,
      fontSize: 36,
      fontFamily: "Arial",
      fontWeight: 500,
      color: accent,
      align: "left"
    },
    {
      type: "text",
      x: 140,
      y: 470,
      w: 980,
      h: 360,
      text: body,
      fontSize: 30,
      fontFamily: "Arial",
      fontWeight: 400,
      color: "#1F2937",
      align: "left"
    }
  ];

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

  return {
    width: 1920,
    height: 1080,
    background: {
      color: "#FFFFFF"
    },
    layers
  };
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
