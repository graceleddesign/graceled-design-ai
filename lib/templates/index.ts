import type { LockupRecipe, StyleFamily, TemplateStyleFamily } from "@/lib/design-brief";
import { canonicalizeStyleFamily } from "@/lib/design-brief";
import type { DesignDoc, DesignLayer } from "@/lib/design-doc";
import {
  buildCleanMinimalDesignDoc,
  type CleanMinimalShape,
  type CleanMinimalTextPalette
} from "@/lib/templates/type-clean-min";

export type TemplateAspect = CleanMinimalShape;

export type TemplateBrief = {
  title: string;
  subtitle?: string | null;
  scripture?: string | null;
  keywords?: string[] | null;
  palette?: string[];
  lockupRecipe?: LockupRecipe;
  lockupPresetId?: string | null;
};

export type RenderTemplateOptions = {
  backgroundImagePath?: string | null;
  textPalette?: CleanMinimalTextPalette;
};

type TemplateRenderer = (params: {
  brief: TemplateBrief;
  optionIndex: number;
  aspect: TemplateAspect;
  styleFamily: StyleFamily;
  options: RenderTemplateOptions;
}) => DesignDoc;

const DIMENSIONS: Record<TemplateAspect, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  wide: { width: 1920, height: 1080 },
  tall: { width: 1080, height: 1920 }
};

const DEFAULT_TEXT_PALETTE: CleanMinimalTextPalette = {
  primary: "#0F172A",
  secondary: "#334155",
  tertiary: "#475569",
  rule: "#334155",
  accent: "#0F172A",
  autoScrim: false,
  scrimTint: "#FFFFFF"
};

const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: string) {
  let state = hashString(seed || "template-seed") >>> 0;

  return {
    float(min: number, max: number): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      const normalized = ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      return min + (max - min) * normalized;
    },
    int(min: number, max: number): number {
      if (max <= min) {
        return min;
      }
      return Math.floor(this.float(min, max + 1));
    }
  };
}

function normalizeHexColor(value: string | undefined, fallback: string): string {
  if (!value || !HEX_COLOR_REGEX.test(value.trim())) {
    return fallback;
  }

  const trimmed = value.trim();
  if (trimmed.length === 4) {
    const [_, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  return trimmed.toUpperCase();
}

function parseHex(color: string): [number, number, number] {
  const normalized = normalizeHexColor(color, "#0F172A").slice(1);
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ];
}

function toHex(rgb: [number, number, number]): string {
  const [r, g, b] = rgb;
  return `#${Math.round(clamp(r, 0, 255))
    .toString(16)
    .padStart(2, "0")}${Math.round(clamp(g, 0, 255))
    .toString(16)
    .padStart(2, "0")}${Math.round(clamp(b, 0, 255))
    .toString(16)
    .padStart(2, "0")}`.toUpperCase();
}

function mixHex(a: string, b: string, amount: number): string {
  const t = clamp(amount, 0, 1);
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);

  return toHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
}

function paletteColor(brief: TemplateBrief, index: number, fallback: string): string {
  if (!brief.palette || !brief.palette[index]) {
    return fallback;
  }
  return normalizeHexColor(brief.palette[index], fallback);
}

function normalizedContent(brief: TemplateBrief): { title: string; subtitle: string; scripture: string } {
  const title = brief.title.trim() || "Untitled Series";
  const subtitle = typeof brief.subtitle === "string" ? brief.subtitle.trim() : "";
  const scripture = typeof brief.scripture === "string" ? brief.scripture.trim() : "";
  return {
    title,
    subtitle,
    scripture
  };
}

function buildBaseDesignDoc(params: {
  brief: TemplateBrief;
  optionIndex: number;
  aspect: TemplateAspect;
  styleFamily: StyleFamily;
  options: RenderTemplateOptions;
}): DesignDoc {
  const dimensions = DIMENSIONS[params.aspect];
  const content = normalizedContent(params.brief);
  const fontSeed = [content.title.trim().toLowerCase(), params.brief.lockupPresetId || "auto-preset", params.styleFamily].join(
    "|"
  );

  return buildCleanMinimalDesignDoc({
    width: dimensions.width,
    height: dimensions.height,
    content: {
      title: content.title,
      subtitle: content.subtitle,
      passage: content.scripture
    },
    palette: params.options.textPalette || DEFAULT_TEXT_PALETTE,
    backgroundImagePath: params.options.backgroundImagePath ?? null,
    lockupRecipe: params.brief.lockupRecipe,
    lockupPresetId: params.brief.lockupPresetId,
    styleFamily: params.styleFamily,
    fontSeed
  });
}

function addLayers(designDoc: DesignDoc, before: DesignLayer[], after: DesignLayer[] = []): DesignDoc {
  return {
    ...designDoc,
    layers: [...before, ...designDoc.layers, ...after]
  };
}

function editorialPhotoTemplate(params: {
  brief: TemplateBrief;
  optionIndex: number;
  aspect: TemplateAspect;
  styleFamily: StyleFamily;
  options: RenderTemplateOptions;
}): DesignDoc {
  const doc = buildBaseDesignDoc(params);
  const width = doc.width;
  const height = doc.height;
  const ink = paletteColor(params.brief, 0, "#111827");
  const accent = paletteColor(params.brief, 3, "#D97706");
  const frame = mixHex(ink, "#FFFFFF", 0.68);
  const overlayBand = mixHex(ink, "#FFFFFF", 0.84);

  const before: DesignLayer[] = [
    {
      type: "shape",
      x: 0,
      y: 0,
      w: width,
      h: height,
      shape: "rect",
      fill: params.aspect === "tall" ? "url(#scrimTall)" : "url(#scrim)",
      stroke: "none",
      strokeWidth: 0
    },
    {
      type: "shape",
      x: 0,
      y: Math.round(height * 0.08),
      w: Math.round(width * (params.aspect === "wide" ? 0.6 : 0.72)),
      h: Math.round(height * (params.aspect === "wide" ? 0.62 : 0.56)),
      shape: "rect",
      fill: overlayBand,
      stroke: "none",
      strokeWidth: 0
    },
    {
      type: "shape",
      x: 28,
      y: 28,
      w: width - 56,
      h: height - 56,
      shape: "rect",
      fill: "none",
      stroke: frame,
      strokeWidth: 3
    },
    {
      type: "shape",
      x: 42,
      y: 42,
      w: width - 84,
      h: height - 84,
      shape: "rect",
      fill: "none",
      stroke: mixHex(frame, accent, 0.25),
      strokeWidth: 2
    }
  ];

  const rng = createSeededRandom(`editorial-photo:${params.optionIndex}:${width}:${height}:${params.brief.title}`);
  for (let index = 0; index < (params.aspect === "wide" ? 46 : 38); index += 1) {
    const size = rng.int(1, 2);
    before.push({
      type: "shape",
      x: rng.float(0, width - size),
      y: rng.float(0, height - size),
      w: size,
      h: size,
      shape: "rect",
      fill: mixHex(frame, accent, rng.float(0.05, 0.18)),
      stroke: "none",
      strokeWidth: 0
    });
  }

  return addLayers(doc, before);
}

function modernCollageTemplate(params: {
  brief: TemplateBrief;
  optionIndex: number;
  aspect: TemplateAspect;
  styleFamily: StyleFamily;
  options: RenderTemplateOptions;
}): DesignDoc {
  const doc = buildBaseDesignDoc(params);
  const width = doc.width;
  const height = doc.height;
  const base = paletteColor(params.brief, 0, "#0F172A");
  const accentA = paletteColor(params.brief, 3, "#06B6D4");
  const accentB = paletteColor(params.brief, 4, "#F97316");
  const accentC = paletteColor(params.brief, 5, "#22C55E");
  const paper = mixHex("#FFFFFF", base, 0.88);
  const grid = mixHex(base, "#FFFFFF", 0.8);

  const rightBlockW = Math.round(width * (params.aspect === "wide" ? 0.34 : 0.42));
  const rightBlockX = width - rightBlockW - Math.round(width * 0.06);

  const before: DesignLayer[] = [
    {
      type: "shape",
      x: rightBlockX,
      y: Math.round(height * 0.1),
      w: rightBlockW,
      h: Math.round(height * 0.26),
      shape: "rect",
      fill: mixHex(accentA, paper, 0.2),
      stroke: mixHex(accentA, base, 0.12),
      strokeWidth: 2,
      rotation: -5
    },
    {
      type: "shape",
      x: rightBlockX + Math.round(rightBlockW * 0.1),
      y: Math.round(height * 0.42),
      w: Math.round(rightBlockW * 0.86),
      h: Math.round(height * 0.22),
      shape: "rect",
      fill: mixHex(accentB, paper, 0.25),
      stroke: mixHex(accentB, base, 0.12),
      strokeWidth: 2,
      rotation: 4
    },
    {
      type: "shape",
      x: rightBlockX - Math.round(rightBlockW * 0.08),
      y: Math.round(height * 0.72),
      w: Math.round(rightBlockW * 0.78),
      h: Math.round(height * 0.12),
      shape: "rect",
      fill: mixHex(accentC, paper, 0.28),
      stroke: "none",
      strokeWidth: 0,
      rotation: -2
    }
  ];

  // Use anchored structural bars instead of guide-like line+dot ornaments.
  const gridX = rightBlockX - Math.round(width * 0.04);
  const gridY = Math.round(height * 0.08);
  const gridW = rightBlockW + Math.round(width * 0.05);
  const gridH = Math.round(height * 0.8);
  const barRows = params.aspect === "wide" ? 5 : 6;
  for (let row = 0; row < barRows; row += 1) {
    const y = gridY + Math.round((gridH / Math.max(1, barRows - 1)) * row);
    before.push({
      type: "shape",
      x: gridX,
      y,
      w: gridW,
      h: 3,
      shape: "rect",
      fill: mixHex(grid, accentA, row % 2 === 0 ? 0.06 : 0.12),
      stroke: "none",
      strokeWidth: 0
    });
  }
  const barCols = params.aspect === "wide" ? 4 : 3;
  for (let col = 0; col < barCols; col += 1) {
    const x = gridX + Math.round((gridW / Math.max(1, barCols - 1)) * col);
    before.push({
      type: "shape",
      x,
      y: gridY,
      w: 3,
      h: gridH,
      shape: "rect",
      fill: mixHex(grid, accentB, col % 2 === 0 ? 0.08 : 0.16),
      stroke: "none",
      strokeWidth: 0
    });
  }

  const rng = createSeededRandom(`modern-collage:${params.optionIndex}:${params.brief.title}:${width}x${height}`);
  for (let index = 0; index < (params.aspect === "wide" ? 54 : 42); index += 1) {
    const stripW = rng.int(12, 42);
    const stripH = rng.int(2, 4);
    before.push({
      type: "shape",
      x: rng.float(gridX, Math.min(width - stripW - 8, gridX + gridW - stripW)),
      y: rng.float(gridY, Math.min(height - stripH - 8, gridY + gridH - stripH)),
      w: stripW,
      h: stripH,
      shape: "rect",
      fill: mixHex(paper, base, rng.float(0.06, 0.2)),
      stroke: "none",
      strokeWidth: 0
    });
  }

  return addLayers(doc, before);
}

function illustratedHeritageTemplate(params: {
  brief: TemplateBrief;
  optionIndex: number;
  aspect: TemplateAspect;
  styleFamily: StyleFamily;
  options: RenderTemplateOptions;
}): DesignDoc {
  const doc = buildBaseDesignDoc(params);
  const width = doc.width;
  const height = doc.height;
  const ink = paletteColor(params.brief, 0, "#1F2937");
  const paper = mixHex("#FFFFFF", paletteColor(params.brief, 2, "#F8F6EE"), 0.25);
  const accent = paletteColor(params.brief, 3, "#B45309");
  const frameA = mixHex(ink, paper, 0.62);
  const frameB = mixHex(ink, accent, 0.38);

  const before: DesignLayer[] = [
    {
      type: "shape",
      x: 0,
      y: 0,
      w: width,
      h: height,
      shape: "rect",
      fill: mixHex(paper, "#FFFFFF", 0.16),
      stroke: "none",
      strokeWidth: 0
    },
    {
      type: "shape",
      x: 28,
      y: 28,
      w: width - 56,
      h: height - 56,
      shape: "rect",
      fill: "none",
      stroke: frameA,
      strokeWidth: 2
    },
    {
      type: "shape",
      x: 42,
      y: 42,
      w: width - 84,
      h: height - 84,
      shape: "rect",
      fill: "none",
      stroke: frameB,
      strokeWidth: 2
    }
  ];

  const stemX = Math.round(width * (params.aspect === "wide" ? 0.86 : 0.83));
  const stemY = Math.round(height * 0.2);
  const stemH = Math.round(height * 0.62);
  before.push({
    type: "shape",
    x: stemX,
    y: stemY,
    w: 2,
    h: stemH,
    shape: "rect",
    fill: frameB,
    stroke: "none",
    strokeWidth: 0
  });

  for (let index = 0; index < 14; index += 1) {
    const y = stemY + Math.round((stemH / 14) * index);
    const side = index % 2 === 0 ? -1 : 1;
    before.push({
      type: "shape",
      x: stemX + (side < 0 ? -14 : 2),
      y,
      w: 12,
      h: 2,
      shape: "rect",
      fill: mixHex(frameB, accent, 0.2),
      stroke: "none",
      strokeWidth: 0,
      rotation: side < 0 ? -24 : 24
    });
  }

  const lineColor = mixHex(frameA, "#FFFFFF", 0.35);
  const hatchRows = params.aspect === "wide" ? 26 : 32;
  for (let row = 0; row < hatchRows; row += 1) {
    const y = Math.round((height / hatchRows) * row);
    before.push({
      type: "shape",
      x: 0,
      y,
      w: width,
      h: 1,
      shape: "rect",
      fill: lineColor,
      stroke: "none",
      strokeWidth: 0
    });
  }

  return addLayers(doc, before);
}

const TEMPLATE_REGISTRY: Record<TemplateStyleFamily, TemplateRenderer> = {
  "clean-min": (params) => buildBaseDesignDoc(params),
  "editorial-photo": editorialPhotoTemplate,
  "modern-collage": modernCollageTemplate,
  "illustrated-heritage": illustratedHeritageTemplate
};

function normalizeKeywords(keywords: string[] | null | undefined): string[] {
  if (!Array.isArray(keywords)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of keywords) {
    if (typeof raw !== "string") {
      continue;
    }
    const keyword = raw
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!keyword || seen.has(keyword)) {
      continue;
    }
    seen.add(keyword);
    normalized.push(keyword);
    if (normalized.length >= 14) {
      break;
    }
  }

  return normalized;
}

const SCENE_WORDS = new Set([
  "wheat",
  "barley",
  "harvest",
  "field",
  "vine",
  "river",
  "mountain",
  "valley",
  "desert",
  "light",
  "water",
  "stone",
  "flock",
  "shepherd",
  "bread",
  "scroll",
  "crown",
  "olive",
  "tree",
  "fire",
  "wind",
  "rain",
  "dove",
  "home",
  "path",
  "grain"
]);

const TOKEN_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "series",
  "sermon",
  "church",
  "title",
  "subtitle",
  "verse",
  "chapter",
  "from",
  "into",
  "your",
  "our",
  "you"
]);

function extractSceneTerms(brief: TemplateBrief): string[] {
  const source = [
    brief.title,
    typeof brief.subtitle === "string" ? brief.subtitle : "",
    typeof brief.scripture === "string" ? brief.scripture : "",
    ...normalizeKeywords(brief.keywords)
  ]
    .join(" ")
    .toLowerCase();

  const tokens = source
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .filter((token) => !TOKEN_STOP_WORDS.has(token));

  const seen = new Set<string>();
  const sceneTerms: string[] = [];

  for (const token of tokens) {
    if (!SCENE_WORDS.has(token) || seen.has(token)) {
      continue;
    }
    seen.add(token);
    sceneTerms.push(token);
    if (sceneTerms.length >= 8) {
      break;
    }
  }

  return sceneTerms;
}

export function buildBackgroundPrompt(brief: TemplateBrief, styleFamily: StyleFamily): string {
  const templateFamily = canonicalizeStyleFamily(styleFamily);
  const content = normalizedContent(brief);
  const keywords = normalizeKeywords(brief.keywords);
  const sceneTerms = extractSceneTerms(brief);

  const styleLine =
    templateFamily === "editorial-photo"
      ? "Style direction: cinematic editorial-photo, moody color grading, painterly photographic depth, tactile texture, subtle overlays."
      : templateFamily === "modern-collage"
        ? "Style direction: modern collage with bold cut-paper geometry, layered composition, paper fibers, and tasteful grain."
        : templateFamily === "illustrated-heritage"
          ? "Style direction: illustrated heritage with hand-inked etched linework, archival texture, restrained ornamental rhythm."
          : "Style direction: clean minimal with disciplined hierarchy, quiet texture, and generous negative space.";

  const motifLine =
    sceneTerms.length > 0
      ? `Concrete motif vocabulary: ${sceneTerms.join(", ")}. Use only these concrete nouns for any literal motif.`
      : "No concrete scene vocabulary is present. Use abstract textures, patterns, and tonal forms instead of literal scenery.";

  const sourceTerms = [content.title, content.subtitle, content.scripture, ...keywords].filter(Boolean).join(" | ");

  return [
    "Create ORIGINAL background artwork only.",
    "No text, no letters, no words, no logos, no watermarks, no signage.",
    "Do not introduce concrete scene objects that are absent from the source terms.",
    styleLine,
    motifLine,
    sourceTerms ? `Source terms: ${sourceTerms}.` : "Source terms are minimal; keep treatment abstract.",
    "Preserve clear negative space for lockup typography overlays."
  ].join(" ");
}

export function renderTemplate(
  styleFamily: StyleFamily,
  brief: TemplateBrief,
  optionIndex: number,
  aspect: TemplateAspect,
  options: RenderTemplateOptions = {}
): DesignDoc {
  const templateStyleFamily = canonicalizeStyleFamily(styleFamily);
  const renderer = TEMPLATE_REGISTRY[templateStyleFamily] || TEMPLATE_REGISTRY["clean-min"];

  return renderer({
    brief,
    optionIndex,
    aspect,
    styleFamily: templateStyleFamily,
    options
  });
}
