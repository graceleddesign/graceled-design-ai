import { optionLabel } from "@/lib/option-label";
import type { DesignDoc, DesignLayer, DesignTextAlign, DesignTextLayer } from "@/lib/design-doc";

export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;
export type DesignDocShape = "square" | "wide" | "tall";
export type DesignDocByShape = Record<DesignDocShape, DesignDoc>;

export type PresetKey =
  | "mark_icon_abstract_v1"
  | "geo_shapes_negative_v1"
  | "abstract_flow_field_v1"
  | "abstract_gradient_modern_v1"
  | "texture_print_riso_v1"
  | "texture_stone_modern_v1"
  | "type_bw_high_contrast_v1"
  | "type_brutalist_v1"
  | "type_clean_min_v1"
  | "type_editorial_v1"
  | "type_swiss_grid_v1"
  | "type_text_system_v1"
  | "illus_engraved_v1"
  | "illus_flat_min_v1"
  | "photo_veil_cinematic_v1"
  | "photo_landscape_min_v1"
  | "photo_mono_accent_v1"
  | "photo_color_block_v1"
  | "photo_warm_film_v1"
  | "seasonal_liturgical_v1";

export type PresetProjectInput = {
  seriesTitle: string;
  seriesSubtitle: string | null;
  scripturePassages: string | null;
  seriesDescription: string | null;
  logoPath: string | null;
  palette: string[];
};

export type GenerateDesignDocForPresetParams = {
  projectId: string;
  presetKey: PresetKey;
  generationId?: string;
  round: number;
  optionIndex: number;
  input?: unknown;
  project: PresetProjectInput;
};

export type PresetGeneratorContext = {
  seed: number;
  rng: SeededRandom;
  palette: string[];
  projectId: string;
  generationId: string;
  presetKey: PresetKey;
  round: number;
  optionIndex: number;
  optionLabel: string;
  title: string;
  subtitle: string;
  scripture: string;
  description: string;
  logoSrc: string | null;
};

export type PresetGeneratorOutput = {
  designDoc: DesignDoc;
  designDocByShape?: DesignDocByShape;
  notes: string;
  preview?: {
    square_main?: string;
    widescreen_main?: string;
    vertical_main?: string;
  };
};

export type PresetGenerator = (context: PresetGeneratorContext) => PresetGeneratorOutput;

export type SeededRandom = {
  next: () => number;
  float: (min: number, max: number) => number;
  int: (min: number, max: number) => number;
  bool: (probability?: number) => boolean;
  pick: <T>(items: readonly T[]) => T;
};

const FALLBACK_PALETTE = ["#0F172A", "#1E293B", "#F8FAFC", "#0EA5E9", "#F97316", "#22C55E"];
const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normalizeHexColor(input: string): string {
  if (!HEX_COLOR_REGEX.test(input)) {
    return "";
  }

  if (input.length === 4) {
    const [_, r, g, b] = input;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  return input.toUpperCase();
}

function normalizePalette(input: string[]): string[] {
  const result: string[] = [];

  for (const value of input) {
    if (typeof value !== "string") {
      continue;
    }

    const normalized = normalizeHexColor(value.trim());
    if (!normalized || result.includes(normalized)) {
      continue;
    }

    result.push(normalized);
  }

  return result.length > 0 ? result : FALLBACK_PALETTE;
}

function normalizeLogoPath(input: string | null): string | null {
  if (!input || !input.trim()) {
    return null;
  }

  return input.startsWith("/") ? input : `/${input}`;
}

function hashToSeed(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

export function derivePresetSeed(params: GenerateDesignDocForPresetParams): number {
  const generationId = typeof params.generationId === "string" ? params.generationId.trim() : "";
  if (generationId) {
    return hashToSeed(`${params.projectId}|${params.presetKey}|${generationId}`);
  }

  return hashToSeed(`${params.projectId}|${params.presetKey}|${params.round}|${params.optionIndex}`);
}

export function createSeededRandom(seed: number): SeededRandom {
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
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new Error("Cannot pick from empty list.");
      }

      return items[Math.floor(next() * items.length)] as T;
    }
  };
}

export function createPresetContext(params: GenerateDesignDocForPresetParams): PresetGeneratorContext {
  const seed = derivePresetSeed(params);
  const rng = createSeededRandom(seed);
  const palette = normalizePalette(params.project.palette);

  return {
    seed,
    rng,
    palette,
    projectId: params.projectId,
    generationId: typeof params.generationId === "string" ? params.generationId : "",
    presetKey: params.presetKey,
    round: params.round,
    optionIndex: params.optionIndex,
    optionLabel: optionLabel(params.optionIndex),
    title: params.project.seriesTitle,
    subtitle:
      params.project.seriesSubtitle?.trim() ||
      `${optionLabel(params.optionIndex)} | Round ${params.round}`,
    scripture: params.project.scripturePassages?.trim() || "",
    description: params.project.seriesDescription?.trim() || "",
    logoSrc: normalizeLogoPath(params.project.logoPath)
  };
}

function clampByte(input: number): number {
  if (!Number.isFinite(input) || Number.isNaN(input)) {
    return 0;
  }

  if (input < 0) {
    return 0;
  }

  if (input > 255) {
    return 255;
  }

  return Math.round(input);
}

function parseHex(input: string): [number, number, number] {
  const normalized = normalizeHexColor(input);
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

function toHex(input: [number, number, number]): string {
  const [r, g, b] = input;
  return `#${clampByte(r).toString(16).padStart(2, "0")}${clampByte(g).toString(16).padStart(2, "0")}${clampByte(b).toString(16).padStart(2, "0")}`.toUpperCase();
}

export function mixHex(a: string, b: string, amount: number): string {
  const factor = Math.max(0, Math.min(1, amount));
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);

  return toHex([
    ar + (br - ar) * factor,
    ag + (bg - ag) * factor,
    ab + (bb - ab) * factor
  ]);
}

export function lightenHex(color: string, amount: number): string {
  return mixHex(color, "#FFFFFF", amount);
}

export function darkenHex(color: string, amount: number): string {
  return mixHex(color, "#000000", amount);
}

export function getPaletteColor(context: PresetGeneratorContext, index: number, fallback: string): string {
  const color = context.palette[index];
  return color || fallback;
}

export function createBaseDoc(backgroundColor: string, layers: DesignLayer[]): DesignDoc {
  return {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    background: {
      color: backgroundColor
    },
    layers
  };
}

export function createTitleLayer(params: {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  align?: DesignTextAlign;
  rotation?: number;
}): DesignTextLayer {
  return {
    type: "text",
    x: params.x,
    y: params.y,
    w: params.w,
    h: params.h,
    text: params.text,
    fontSize: params.fontSize ?? 94,
    fontFamily: params.fontFamily ?? "Arial",
    fontWeight: params.fontWeight ?? 700,
    color: params.color,
    align: params.align ?? "left",
    rotation: params.rotation ?? 0
  };
}

export function createSubtitleLayer(params: {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  align?: DesignTextAlign;
}): DesignTextLayer {
  return {
    type: "text",
    x: params.x,
    y: params.y,
    w: params.w,
    h: params.h,
    text: params.text,
    fontSize: params.fontSize ?? 34,
    fontFamily: params.fontFamily ?? "Arial",
    fontWeight: params.fontWeight ?? 500,
    color: params.color,
    align: params.align ?? "left"
  };
}

export function createLogoLayers(context: PresetGeneratorContext, x: number, y: number, w = 180, h = 90): DesignLayer[] {
  if (!context.logoSrc) {
    return [];
  }

  return [
    {
      type: "image",
      x,
      y,
      w,
      h,
      src: context.logoSrc
    }
  ];
}

export function createGradientBandLayers(params: {
  from: string;
  to: string;
  bandCount: number;
  direction: "horizontal" | "vertical";
  rotation?: number;
}): DesignLayer[] {
  const layers: DesignLayer[] = [];

  for (let index = 0; index < params.bandCount; index += 1) {
    const t = params.bandCount <= 1 ? 0 : index / (params.bandCount - 1);
    const color = mixHex(params.from, params.to, t);

    if (params.direction === "horizontal") {
      const h = CANVAS_HEIGHT / params.bandCount;
      layers.push({
        type: "shape",
        x: 0,
        y: h * index,
        w: CANVAS_WIDTH,
        h,
        shape: "rect",
        fill: color,
        stroke: color,
        strokeWidth: 0,
        rotation: params.rotation ?? 0
      });
      continue;
    }

    const w = CANVAS_WIDTH / params.bandCount;
    layers.push({
      type: "shape",
      x: w * index,
      y: 0,
      w,
      h: CANVAS_HEIGHT,
      shape: "rect",
      fill: color,
      stroke: color,
      strokeWidth: 0,
      rotation: params.rotation ?? 0
    });
  }

  return layers;
}

export function createNoiseLayers(params: {
  rng: SeededRandom;
  count: number;
  colorA: string;
  colorB: string;
  minSize: number;
  maxSize: number;
  area?: { x: number; y: number; w: number; h: number };
}): DesignLayer[] {
  const area = params.area ?? { x: 0, y: 0, w: CANVAS_WIDTH, h: CANVAS_HEIGHT };
  const layers: DesignLayer[] = [];

  for (let index = 0; index < params.count; index += 1) {
    const size = params.rng.float(params.minSize, params.maxSize);
    const color = params.rng.bool(0.5) ? params.colorA : params.colorB;
    layers.push({
      type: "shape",
      x: params.rng.float(area.x, area.x + area.w - size),
      y: params.rng.float(area.y, area.y + area.h - size),
      w: size,
      h: size,
      shape: "rect",
      fill: color,
      stroke: color,
      strokeWidth: 0,
      rotation: params.rng.float(-12, 12)
    });
  }

  return layers;
}

export function buildSupportingCopy(context: PresetGeneratorContext): string {
  const parts = [context.subtitle, context.scripture, context.description].filter((value) => Boolean(value && value.trim()));
  return parts.join("\n");
}
