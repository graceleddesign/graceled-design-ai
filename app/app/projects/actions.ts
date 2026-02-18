"use server";

import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sharp from "sharp";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { buildFallbackDesignDoc, buildFinalDesignDoc, type DesignDoc } from "@/lib/design-doc";
import { buildDesignBrief, type DesignBrief, validateDesignBrief } from "@/lib/design-brief";
import { buildFinalSvg } from "@/lib/final-deliverables";
import { computeDHashFromBuffer, hammingDistanceHash } from "@/lib/image-hash";
import { generatePngFromPrompt } from "@/lib/openai-image";
import { openai } from "@/lib/openai";
import { optionLabel } from "@/lib/option-label";
import { buildOverlayDisplayContent, normalizeLine } from "@/lib/overlay-lines";
import { ensureThree, filterToEnabledPresets, pickInitialPresetKeys, pickPresetKeysForStyle } from "@/lib/preset-picker";
import { prisma } from "@/lib/prisma";
import {
  loadIndex,
  resolveReferenceAbsolutePath,
  sampleRefsForOption,
  type ReferenceLibraryItem
} from "@/lib/referenceLibrary";
import { normalizeStyleDirection } from "@/lib/style-direction";
import {
  buildCleanMinimalDesignDoc,
  buildCleanMinimalOverlaySvg,
  chooseTextPaletteForBackground,
  computeCleanMinimalLayout
} from "@/lib/templates/type-clean-min";

export type ProjectActionState = {
  error?: string;
};

export type BrandKitActionState = {
  error?: string;
};

export type GenerationActionState = {
  error?: string;
};

export type RoundFeedbackActionState = {
  error?: string;
};

const createProjectSchema = z.object({
  series_title: z.string().trim().min(1),
  series_subtitle: z.string().trim().optional(),
  scripture_passages: z.string().trim().optional(),
  series_description: z.string().trim().optional()
});

const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const ALLOWED_LOGO_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".svg"]);
const ALLOWED_LOGO_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/svg+xml"]);
const WEBSITE_URL_ERROR_MESSAGE =
  "Please enter a valid website URL (example: https://www.restorationmandeville.com)";

const saveBrandKitSchema = z.object({
  websiteUrl: z.string().trim().min(1, WEBSITE_URL_ERROR_MESSAGE),
  typographyDirection: z.enum(["match_site", "graceled_defaults"]),
  palette: z.array(z.string().regex(HEX_COLOR_REGEX, "Palette colors must be valid hex values."))
});

const generateRoundTwoSchema = z.object({
  currentRound: z.coerce.number().int().min(1),
  chosenGenerationId: z.string().trim().optional(),
  feedbackText: z.string().trim().max(2000).optional(),
  emphasis: z.enum(["title", "quote"]),
  expressiveness: z.coerce.number().int().min(0).max(100),
  temperature: z.coerce.number().int().min(0).max(100),
  styleDirection: z.unknown().optional()
});
const ROUND_OPTION_COUNT = 3;
const PREVIEW_SHAPES = ["square", "wide", "tall"] as const;
type PreviewShape = (typeof PREVIEW_SHAPES)[number];
type BackgroundAssetSlot = "square_bg" | "wide_bg" | "tall_bg";
type FinalAssetSlot = "square" | "wide" | "tall";
type LegacyPreviewAssetSlot = "square_main" | "wide_main" | "tall_main" | "widescreen_main" | "vertical_main";

const PREVIEW_DIMENSIONS: Record<PreviewShape, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  wide: { width: 1920, height: 1080 },
  tall: { width: 1080, height: 1920 }
};
const FINAL_ASSET_SLOT_BY_SHAPE: Record<PreviewShape, FinalAssetSlot> = {
  square: "square",
  wide: "wide",
  tall: "tall"
};
const LEGACY_PREVIEW_ASSET_SLOTS: readonly LegacyPreviewAssetSlot[] = [
  "square_main",
  "wide_main",
  "tall_main",
  "widescreen_main",
  "vertical_main"
];
const BACKGROUND_ASSET_SLOT_BY_SHAPE: Record<PreviewShape, BackgroundAssetSlot> = {
  square: "square_bg",
  wide: "wide_bg",
  tall: "tall_bg"
};
const OPENAI_IMAGE_SIZE_BY_SHAPE: Record<PreviewShape, "1024x1024" | "1536x1024" | "1024x1536"> = {
  square: "1024x1024",
  wide: "1536x1024",
  tall: "1024x1536"
};
const OPTION_MASTER_BACKGROUND_SHAPE: PreviewShape = "wide";
const PREVIEW_ASSET_SLOTS_TO_CLEAR: readonly string[] = [
  ...LEGACY_PREVIEW_ASSET_SLOTS,
  ...PREVIEW_SHAPES,
  ...Object.values(BACKGROUND_ASSET_SLOT_BY_SHAPE)
];

function normalizeWebsiteUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const urlCandidate = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(urlCandidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || hostname.includes(" ") || !hostname.includes(".")) {
    return null;
  }

  if (hostname === "ww" || hostname === "ww." || hostname.startsWith("ww.")) {
    return null;
  }

  if (parsed.pathname === "/" && !parsed.search && !parsed.hash) {
    return parsed.origin;
  }

  return parsed.toString();
}

function parsePalette(raw: FormDataEntryValue | null): string[] | null {
  if (typeof raw !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function inferExtension(file: File): string {
  const ext = path.extname(file.name).toLowerCase();
  if (ALLOWED_LOGO_EXTENSIONS.has(ext)) {
    return ext;
  }

  if (file.type === "image/png") {
    return ".png";
  }
  if (file.type === "image/jpeg") {
    return ".jpg";
  }
  if (file.type === "image/svg+xml") {
    return ".svg";
  }

  return "";
}

function isAllowedLogoUpload(file: File): boolean {
  const ext = path.extname(file.name).toLowerCase();
  return ALLOWED_LOGO_EXTENSIONS.has(ext) || ALLOWED_LOGO_MIME_TYPES.has(file.type);
}

async function saveLogoUpload(file: File): Promise<string> {
  const uploadDirectory = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDirectory, { recursive: true });

  const extension = inferExtension(file) || ".png";
  const fileName = `${Date.now()}-${randomUUID()}${extension}`;
  const destination = path.join(uploadDirectory, fileName);

  await writeFile(destination, Buffer.from(await file.arrayBuffer()));

  return path.posix.join("uploads", fileName);
}

function parsePaletteJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function truncateForPrompt(value: string | null | undefined, maxLength: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return "";
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function shapeCompositionHint(shape: PreviewShape): string {
  if (shape === "wide") {
    return "Reserve at least the left 55% as clean negative space for typography; keep art interest mostly to the right.";
  }
  if (shape === "tall") {
    return "Reserve upper-middle area as clean negative space for typography; keep heavier art in the lower third.";
  }
  return "Reserve large left-center negative space for typography and keep accents subtle near edges.";
}

function readFeedbackRequest(input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return "";
  }

  const feedback = (input as { feedback?: unknown }).feedback;
  if (!feedback || typeof feedback !== "object" || Array.isArray(feedback)) {
    return "";
  }

  const request = (feedback as { request?: unknown }).request;
  return typeof request === "string" ? truncateForPrompt(request, 220) : "";
}

type StyleBrief = {
  layout: string;
  typography: {
    title: string;
    subtitle: string;
    passage: string;
  };
  motifs: string[];
  spacing: string;
  colorDirection: string;
  avoid: string[];
};

function optionLane(optionIndex: number): "A" | "B" | "C" {
  if (optionIndex === 0) {
    return "A";
  }
  if (optionIndex === 1) {
    return "B";
  }
  return "C";
}

function laneBriefHint(optionIndex: number): string {
  const lane = optionLane(optionIndex);
  if (lane === "A") {
    return "Minimal / typography-led lane with Swiss-grid restraint and generous negative space.";
  }
  if (lane === "B") {
    return "Illustration / ornament lane with tasteful decorative marks and controlled accents.";
  }
  return "Photo / texture lane with cinematic grain and tactile depth while preserving clarity.";
}

function safeArrayOfStrings(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : fallback;
}

function fallbackStyleBrief(optionIndex: number, palette: string[]): StyleBrief {
  const lane = optionLane(optionIndex);

  if (lane === "A") {
    return {
      layout: "Asymmetric editorial grid; keep left-center typography lane clean and uninterrupted.",
      typography: {
        title: "Large bold title with strong hierarchy and precise line breaks.",
        subtitle: "Smaller uppercase/semibold support line with tight tracking.",
        passage: "Subtle serif or book-style line; secondary emphasis."
      },
      motifs: ["thin rules", "small geometric marks", "soft paper grain"],
      spacing: "Generous outer margins; clear breathing room between title, subtitle, and passage.",
      colorDirection: palette.length > 0 ? `Restrained palette grounded in ${palette.join(", ")}.` : "Neutral off-white, slate, and one accent.",
      avoid: ["busy collage", "too many words", "large white text box", "centered everything"]
    };
  }

  if (lane === "B") {
    return {
      layout: "Balanced composition with one ornament cluster away from core typography lane.",
      typography: {
        title: "Strong headline with clean, non-decorative letterforms.",
        subtitle: "Compact supporting line that does not compete with title.",
        passage: "Quiet tertiary line with comfortable readability."
      },
      motifs: ["engraved lines", "minimal icon marks", "ornamental accents"],
      spacing: "Keep decorative motifs peripheral; protect typography area with negative space.",
      colorDirection: palette.length > 0 ? `Use palette accents from ${palette.join(", ")} without overfilling.` : "Warm neutrals with controlled accent.",
      avoid: ["dense illustrations behind title", "clip-art look", "heavy framing boxes"]
    };
  }

  return {
    layout: "Texture-led composition with clear typography lane and directional depth.",
    typography: {
      title: "Confident title with high contrast against textured background.",
      subtitle: "Secondary line with reduced weight and visual noise.",
      passage: "Tertiary line with readable contrast; never dominate title."
    },
    motifs: ["film grain", "subtle texture overlays", "soft photographic gradients"],
    spacing: "Leave meaningful negative space for text; avoid crowding central hierarchy.",
    colorDirection: palette.length > 0 ? `Use palette as tonal guidance: ${palette.join(", ")}.` : "Muted cinematic tones with one accent.",
    avoid: ["literal photo collage", "full-bleed clutter", "copying reference composition"]
  };
}

function parseStyleBriefFromText(text: string, optionIndex: number, palette: string[]): StyleBrief {
  if (!text.trim()) {
    return fallbackStyleBrief(optionIndex, palette);
  }

  const normalized = text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(normalized) as Record<string, unknown>;
    const typography = (parsed.typography || {}) as Record<string, unknown>;
    const fallback = fallbackStyleBrief(optionIndex, palette);

    return {
      layout: typeof parsed.layout === "string" && parsed.layout.trim() ? parsed.layout.trim() : fallback.layout,
      typography: {
        title:
          typeof typography.title === "string" && typography.title.trim() ? typography.title.trim() : fallback.typography.title,
        subtitle:
          typeof typography.subtitle === "string" && typography.subtitle.trim()
            ? typography.subtitle.trim()
            : fallback.typography.subtitle,
        passage:
          typeof typography.passage === "string" && typography.passage.trim()
            ? typography.passage.trim()
            : fallback.typography.passage
      },
      motifs: safeArrayOfStrings(parsed.motifs, fallback.motifs),
      spacing: typeof parsed.spacing === "string" && parsed.spacing.trim() ? parsed.spacing.trim() : fallback.spacing,
      colorDirection:
        typeof parsed.colorDirection === "string" && parsed.colorDirection.trim()
          ? parsed.colorDirection.trim()
          : fallback.colorDirection,
      avoid: safeArrayOfStrings(parsed.avoid, fallback.avoid)
    };
  } catch {
    return fallbackStyleBrief(optionIndex, palette);
  }
}

function parseResponseText(response: unknown): string {
  if (!response || typeof response !== "object") {
    return "";
  }

  const outputText = (response as { output_text?: unknown }).output_text;
  if (typeof outputText === "string" && outputText.trim()) {
    return outputText;
  }

  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return "";
  }

  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const segment of content) {
      if (!segment || typeof segment !== "object") {
        continue;
      }
      const textValue = (segment as { text?: unknown }).text;
      if (typeof textValue === "string" && textValue.trim()) {
        chunks.push(textValue.trim());
      }
    }
  }

  return chunks.join("\n").trim();
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  if (!text.trim()) {
    return null;
  }

  const normalized = text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(normalized);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function buildAvoidWords(project: GenerationProjectContext): string[] {
  const raw = [project.series_title, project.series_subtitle || ""]
    .map((value) => value.trim())
    .filter(Boolean);
  const tokens = raw
    .flatMap((value) => value.split(/\s+/))
    .map((value) => value.trim())
    .filter((value) => value.length >= 2);

  const dedupedByNormalized = new Map<string, string>();
  for (const item of [...raw, ...tokens]) {
    const normalized = normalizeLine(item);
    if (!normalized) {
      continue;
    }
    if (!dedupedByNormalized.has(normalized)) {
      dedupedByNormalized.set(normalized, item);
    }
  }

  return [...dedupedByNormalized.values()];
}

function removeAvoidWords(text: string, avoidWords: string[]): string {
  let result = text;
  for (const avoidWord of avoidWords) {
    const escaped = avoidWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`\\b${escaped}\\b`, "ig"), " ");
  }
  return result.replace(/\s+/g, " ").trim();
}

function buildCreativeBrief(params: {
  project: GenerationProjectContext;
  styleBrief: StyleBrief;
  avoidWords: string[];
}): string {
  const raw = [
    params.project.series_description || "",
    params.project.scripture_passages || "",
    params.styleBrief.layout,
    params.styleBrief.spacing,
    params.styleBrief.colorDirection,
    params.styleBrief.motifs.join(" ")
  ]
    .filter(Boolean)
    .join(" ");

  const sanitized = removeAvoidWords(raw, params.avoidWords)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!sanitized) {
    return "Providence, redemption, loyalty, mercy, harvest textures, and quiet sacred atmosphere.";
  }

  const stopwords = new Set([
    "and",
    "the",
    "for",
    "with",
    "that",
    "this",
    "from",
    "into",
    "only",
    "never",
    "must",
    "keep",
    "use",
    "tone",
    "tones",
    "color",
    "layout",
    "spacing",
    "title",
    "subtitle",
    "passage",
    "series",
    "scripture",
    "context",
    "prompt",
    "rendered",
    "render"
  ]);

  const words = sanitized
    .split(" ")
    .filter((word) => word.length >= 4)
    .filter((word) => !stopwords.has(word));
  const unique = [...new Set(words)].slice(0, 14);

  if (unique.length === 0) {
    return "Providence, redemption, loyalty, mercy, harvest textures, and quiet sacred atmosphere.";
  }

  return unique.join(", ");
}

function containsPhotoSceneRequest(input: string): boolean {
  const normalized = input.toLowerCase();
  if (!normalized.trim()) {
    return false;
  }
  if (/\b(no|avoid|without)\s+(photo|photography|photographic|scene|literal scene)\b/.test(normalized)) {
    return false;
  }
  return /\b(photo|photography|photographic|realistic|realism|literal scene|cityscape|landscape scene|street scene)\b/.test(
    normalized
  );
}

function hasExplicitPhotoRequest(params: {
  project: GenerationProjectContext;
  feedbackRequest: string;
}): boolean {
  const source = [
    params.project.series_title,
    params.project.series_subtitle || "",
    params.project.series_description || "",
    params.project.scripture_passages || "",
    params.feedbackRequest
  ]
    .filter(Boolean)
    .join(" ");
  return containsPhotoSceneRequest(source);
}

function buildTopicMotifHint(project: GenerationProjectContext): string {
  const source = [
    project.series_title,
    project.series_subtitle || "",
    project.scripture_passages || "",
    project.series_description || ""
  ]
    .join(" ")
    .toLowerCase();

  if (/\bruth\b/.test(source)) {
    return "Subtle topic motifs: wheat, barley, gleaning fields, harvest texture, and quiet Bethlehem-era atmosphere.";
  }
  if (/\b(psalm|psalms)\b/.test(source)) {
    return "Subtle topic motifs: layered light rays, gentle gradients, and contemplative abstract rhythm.";
  }

  return "Keep motif language symbolic and understated for church contexts.";
}

async function hasTextLikeRasterPattern(image: Buffer): Promise<boolean> {
  const downscaled = await sharp(image, { failOn: "none" })
    .resize({ width: 320, fit: "inside" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .catch(() => null);

  if (!downscaled || !downscaled.info.width || !downscaled.info.height) {
    return false;
  }

  const width = downscaled.info.width;
  const height = downscaled.info.height;
  const pixels = downscaled.data;
  if (width < 32 || height < 32) {
    return false;
  }

  const edgeMask = new Uint8Array(width * height);
  let edgeCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const gx = Math.abs(pixels[idx + 1] - pixels[idx - 1]);
      const gy = Math.abs(pixels[idx + width] - pixels[idx - width]);
      const magnitude = gx + gy;
      if (magnitude > 72) {
        edgeMask[idx] = 1;
        edgeCount += 1;
      }
    }
  }

  const edgeRatio = edgeCount / (width * height);
  if (edgeRatio < 0.012 || edgeRatio > 0.34) {
    return false;
  }

  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let textLikeComponents = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const start = y * width + x;
      if (!edgeMask[start] || visited[start]) {
        continue;
      }

      let head = 0;
      let tail = 0;
      visited[start] = 1;
      queue[tail++] = start;
      let area = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;

      while (head < tail) {
        const current = queue[head++];
        const cy = Math.floor(current / width);
        const cx = current - cy * width;
        area += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [current - 1, current + 1, current - width, current + width];
        for (const neighbor of neighbors) {
          if (neighbor <= 0 || neighbor >= edgeMask.length - 1) {
            continue;
          }
          if (!edgeMask[neighbor] || visited[neighbor]) {
            continue;
          }
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }

      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      if (boxWidth < 5 || boxHeight < 4) {
        continue;
      }

      const boxArea = boxWidth * boxHeight;
      const density = area / boxArea;
      const aspect = boxWidth / boxHeight;
      const textLike =
        area >= 12 &&
        area <= 2200 &&
        boxArea <= 4600 &&
        aspect >= 1.15 &&
        aspect <= 15 &&
        density >= 0.07 &&
        density <= 0.62;

      if (textLike) {
        textLikeComponents += 1;
        if (textLikeComponents >= 10) {
          return true;
        }
      }
    }
  }

  return false;
}

async function imageHasReadableText(image: Buffer): Promise<boolean> {
  if (await hasTextLikeRasterPattern(image)) {
    return true;
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return false;
  }

  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MAIN_MODEL?.trim() || "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: 'Detect readable text in this image. Return JSON only: {"hasText": true|false}.'
            },
            {
              type: "input_image",
              image_url: `data:image/png;base64,${image.toString("base64")}`,
              detail: "low"
            }
          ]
        }
      ]
    });

    const parsed = parseJsonObject(parseResponseText(response));
    return parsed?.hasText === true;
  } catch {
    return false;
  }
}

type GenerationProjectContext = {
  series_title: string;
  series_subtitle: string | null;
  scripture_passages: string | null;
  series_description: string | null;
  brandKit: {
    paletteJson: string;
    logoPath: string | null;
  } | null;
};

type BuildGenerationOutputParams = {
  projectId: string;
  presetKey: string;
  project: GenerationProjectContext;
  input: unknown;
  round: number;
  optionIndex: number;
  referenceItems?: ReferenceLibraryItem[];
  revisedPrompt?: string;
};

type GenerationOutputPayload = {
  designDoc: DesignDoc;
  designDocByShape: Record<PreviewShape, DesignDoc>;
  notes: string;
  promptUsed?: string;
  meta: {
    styleRefCount: number;
    usedStylePaths: string[];
    revisedPrompt?: string;
    designSpec?: Record<string, unknown>;
  };
  preview?: {
    square_main: string;
    widescreen_main: string;
    vertical_main: string;
  };
};

function adaptDesignDocToDimensions(designDoc: DesignDoc, targetWidth: number, targetHeight: number): DesignDoc {
  if (designDoc.width <= 0 || designDoc.height <= 0) {
    return designDoc;
  }

  const scaleX = targetWidth / designDoc.width;
  const scaleY = targetHeight / designDoc.height;
  const textScale = Math.min(scaleX, scaleY);

  const layers = designDoc.layers.map((layer) => {
    if (layer.type === "text") {
      return {
        ...layer,
        x: layer.x * scaleX,
        y: layer.y * scaleY,
        w: layer.w * scaleX,
        h: layer.h * scaleY,
        fontSize: Math.max(8, layer.fontSize * textScale)
      };
    }

    return {
      ...layer,
      x: layer.x * scaleX,
      y: layer.y * scaleY,
      w: layer.w * scaleX,
      h: layer.h * scaleY
    };
  });

  return {
    width: targetWidth,
    height: targetHeight,
    backgroundImagePath: designDoc.backgroundImagePath,
    background: designDoc.background,
    layers
  };
}

function buildFallbackGenerationOutput(params: BuildGenerationOutputParams): GenerationOutputPayload {
  const palette = params.project.brandKit ? parsePaletteJson(params.project.brandKit.paletteJson) : [];

  const buildDocForShape = (shape?: PreviewShape) =>
    buildFallbackDesignDoc({
      output: null,
      input: params.input,
      presetKey: params.presetKey,
      shape,
      round: params.round,
      optionIndex: params.optionIndex,
      project: {
        seriesTitle: params.project.series_title,
        seriesSubtitle: params.project.series_subtitle,
        scripturePassages: params.project.scripture_passages,
        seriesDescription: params.project.series_description,
        logoPath: params.project.brandKit?.logoPath || null,
        palette
      }
    });

  const designDocByShape = {} as Record<PreviewShape, DesignDoc>;
  if (params.presetKey === "type_clean_min_v1") {
    for (const shape of PREVIEW_SHAPES) {
      designDocByShape[shape] = buildDocForShape(shape);
    }
  } else {
    const fallbackDesignDoc = buildDocForShape();
    for (const shape of PREVIEW_SHAPES) {
      const shapeDimensions = PREVIEW_DIMENSIONS[shape];
      designDocByShape[shape] = adaptDesignDocToDimensions(
        fallbackDesignDoc,
        shapeDimensions.width,
        shapeDimensions.height
      );
    }
  }

  return {
    designDoc: designDocByShape.square,
    designDocByShape,
    notes: `Fallback layout: ${params.presetKey} | variant ${params.optionIndex % 3}`,
    meta: {
      styleRefCount: params.referenceItems?.length || 0,
      usedStylePaths: (params.referenceItems || []).map((ref) => ref.path || ref.thumbPath),
      revisedPrompt: params.revisedPrompt
    }
  };
}

async function getProjectForGeneration(projectId: string, organizationId: string) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId
    },
    select: {
      id: true,
      series_title: true,
      series_subtitle: true,
      scripture_passages: true,
      series_description: true,
      brandKit: {
        select: {
          websiteUrl: true,
          typographyDirection: true,
          paletteJson: true,
          logoPath: true
        }
      }
    }
  });
}

function buildGenerationInput(
  project: {
    series_title: string;
    series_subtitle: string | null;
    scripture_passages: string | null;
    series_description: string | null;
  },
  brandKit: {
    websiteUrl: string;
    typographyDirection: "match_site" | "graceled_defaults";
    paletteJson: string;
  },
  selectedPresetKeys: string[] = [],
  lockupRecipe?: unknown
) {
  const designBrief = buildDesignBrief({
    seriesTitle: project.series_title,
    seriesSubtitle: project.series_subtitle,
    passage: project.scripture_passages,
    backgroundPrompt: project.series_description,
    selectedPresetKeys,
    lockupRecipe
  });

  return {
    series_title: project.series_title,
    series_subtitle: project.series_subtitle,
    scripture_passages: project.scripture_passages,
    series_description: project.series_description,
    websiteUrl: brandKit.websiteUrl,
    typographyDirection: brandKit.typographyDirection,
    palette: parsePaletteJson(brandKit.paletteJson),
    selectedPresetKeys,
    designBrief
  };
}

function readLockupRecipeFromInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const designBrief = (input as { designBrief?: unknown }).designBrief;
  if (!designBrief || typeof designBrief !== "object" || Array.isArray(designBrief)) {
    return undefined;
  }

  return (designBrief as { lockupRecipe?: unknown }).lockupRecipe;
}

function readDesignBriefFromInput(input: unknown): DesignBrief | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const designBrief = (input as { designBrief?: unknown }).designBrief;
  const validated = validateDesignBrief(designBrief);
  return validated.ok ? validated.data : null;
}

type EnabledPresetRecord = {
  id: string;
  key: string;
};

async function findEnabledPresetsForOrganization(organizationId: string): Promise<EnabledPresetRecord[]> {
  return prisma.preset.findMany({
    where: {
      enabled: true,
      OR: [{ organizationId: null }, { organizationId }]
    },
    select: {
      id: true,
      key: true
    },
    orderBy: [{ createdAt: "asc" }]
  });
}

async function pickReferenceSetsForRound(projectId: string, round: number, optionCount: number): Promise<ReferenceLibraryItem[][]> {
  const refs = await loadIndex();
  if (refs.length === 0) {
    return Array.from({ length: optionCount }, () => []);
  }

  return Promise.all(
    Array.from({ length: optionCount }, (_, optionIndex) =>
      sampleRefsForOption({
        projectId,
        round,
        optionIndex,
        n: 3
      })
    )
  );
}

type PlannedGeneration = {
  id: string;
  presetId: string | null;
  presetKey: string;
  round: number;
  optionIndex: number;
  references: ReferenceLibraryItem[];
  input: Prisma.InputJsonValue;
  fallbackOutput: GenerationOutputPayload;
};

function isOpenAiPreviewGenerationEnabled(): boolean {
  const raw = process.env.OPENAI_IMAGE_PREVIEWS_ENABLED?.trim().toLowerCase();
  if (!raw) {
    return true;
  }

  return !["0", "false", "off", "no"].includes(raw);
}

async function writeGenerationPreviewFiles(params: {
  fileName: string;
  png: Buffer;
}): Promise<string> {
  const uploadDirectory = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDirectory, { recursive: true });
  await writeFile(path.join(uploadDirectory, params.fileName), params.png);
  return path.posix.join("uploads", params.fileName);
}

async function normalizePngToShape(png: Buffer, shape: PreviewShape): Promise<Buffer> {
  const dimensions = PREVIEW_DIMENSIONS[shape];
  return sharp(png)
    .resize({
      width: dimensions.width,
      height: dimensions.height,
      fit: "cover",
      position: "center"
    })
    .png()
    .toBuffer();
}

function mimeTypeFromPath(filePath: string): string | null {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  return null;
}

async function buildReferenceDataUrls(references: ReferenceLibraryItem[]): Promise<string[]> {
  const dataUrls = await Promise.all(
    references.map(async (reference) => {
      const relativePath = reference.path || reference.thumbPath;
      const absolutePath = resolveReferenceAbsolutePath(relativePath);
      const mime = mimeTypeFromPath(relativePath);
      if (!mime) {
        return null;
      }

      const bytes = await readFile(absolutePath).catch(() => null);
      if (!bytes) {
        return null;
      }

      return `data:${mime};base64,${bytes.toString("base64")}`;
    })
  );

  return dataUrls.filter((value): value is string => Boolean(value));
}

async function createStyleBrief(params: {
  optionIndex: number;
  project: GenerationProjectContext;
  references: ReferenceLibraryItem[];
  feedbackRequest: string;
  palette: string[];
}): Promise<StyleBrief> {
  const fallback = fallbackStyleBrief(params.optionIndex, params.palette);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return fallback;
  }

  const title = truncateForPrompt(params.project.series_title, 120);
  const subtitle = truncateForPrompt(params.project.series_subtitle, 120);
  const scripture = truncateForPrompt(params.project.scripture_passages, 140);
  const description = truncateForPrompt(params.project.series_description, 360);
  const referenceSummary = params.references
    .slice(0, 6)
    .map((reference) => {
      const tags = reference.styleTags.length > 0 ? reference.styleTags.join(", ") : "untagged";
      return `${reference.id} (${reference.aspect.toFixed(2)}): ${tags}`;
    })
    .join("\n");

  const prompt = [
    "You are an art director for premium church sermon graphics.",
    "Generate one JSON object only. No markdown.",
    'Schema: {"layout":"...","typography":{"title":"...","subtitle":"...","passage":"..."},"motifs":["..."],"spacing":"...","colorDirection":"...","avoid":["..."]}',
    "Keep guidance concise and practical.",
    `Lane target: ${laneBriefHint(params.optionIndex)}`,
    title ? `Series title: ${title}` : "",
    subtitle ? `Series subtitle: ${subtitle}` : "",
    scripture ? `Scripture passages: ${scripture}` : "",
    description ? `Series description mood context (PROMPT-ONLY, never rendered): ${description}` : "",
    params.feedbackRequest ? `User refinement request: ${params.feedbackRequest}` : "",
    params.palette.length > 0 ? `Brand palette: ${params.palette.join(", ")}` : "",
    referenceSummary ? `Reference summaries:\n${referenceSummary}` : "",
    "Hard rule: final rendered text must contain only series title + optional series subtitle.",
    "Hard rule: series description is context only and must never be rendered as text."
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MAIN_MODEL?.trim() || "gpt-4.1-mini",
      input: prompt
    });
    const text = parseResponseText(response);
    return parseStyleBriefFromText(text, params.optionIndex, params.palette);
  } catch {
    return fallback;
  }
}

function buildCleanMinimalBackgroundPrompt(params: {
  project: GenerationProjectContext;
  palette: string[];
  shape: PreviewShape;
  generationId: string;
  optionIndex: number;
  feedbackRequest?: string;
  styleBrief: StyleBrief;
  creativeBrief: string;
  avoidWords: string[];
  originalityBoost?: string;
  noTextBoost?: string;
}): string {
  const description = truncateForPrompt(params.project.series_description, 360);
  const photoRequested = hasExplicitPhotoRequest({
    project: params.project,
    feedbackRequest: params.feedbackRequest || ""
  });
  const topicMotifHint = buildTopicMotifHint(params.project);
  const paletteHint =
    params.palette.length > 0
      ? `Use restrained tones influenced by this palette: ${params.palette.join(", ")}.`
      : "Use a neutral clean-minimal palette with soft whites, warm grays, slate, and one subtle accent.";
  const avoidWordList = params.avoidWords.slice(0, 16).join(", ");
  const minimalNegativeList = "highway, road, cars, city, skyscraper, traffic, intersections, street signs, billboards";

  return [
    "Create an ORIGINAL premium sermon-series BACKGROUND only.",
    "Background only. no text, no letters, no words, no typography, no signage, no watermarks.",
    "No logos and no symbols that resemble letters.",
    "Do not include any readable characters in any language.",
    "Create an ORIGINAL design; do not copy reference images; use them only for inspiration.",
    "Use strong hierarchy principles: disciplined grid, intentional negative space, restrained accents.",
    photoRequested
      ? "Photo scene was requested by user context, but keep imagery restrained and topic-relevant with clean negative space."
      : "Default to abstract textures, subtle paper grain, geometric motifs, and minimal illustration accents. Avoid literal scene photography unless explicitly requested.",
    topicMotifHint,
    !photoRequested ? `Negative scene list: ${minimalNegativeList}.` : "",
    "Leave intentional negative space for a text overlay in the upper-left area.",
    shapeCompositionHint(params.shape),
    laneBriefHint(params.optionIndex),
    `Creative brief: ${params.creativeBrief}`,
    `Layout brief: ${params.styleBrief.layout}`,
    `Typography intent for later overlay: title=${params.styleBrief.typography.title} | subtitle=${params.styleBrief.typography.subtitle} | passage=${params.styleBrief.typography.passage}.`,
    params.styleBrief.motifs.length > 0 ? `Motifs: ${params.styleBrief.motifs.join(", ")}.` : "",
    `Spacing: ${params.styleBrief.spacing}`,
    `Color direction: ${params.styleBrief.colorDirection}`,
    params.styleBrief.avoid.length > 0 ? `Avoid: ${params.styleBrief.avoid.join(", ")}.` : "",
    avoidWordList ? `Avoid words (never render these as text): ${avoidWordList}.` : "",
    description ? `Series description mood context (prompt-only, never render): ${description}.` : "",
    paletteHint,
    params.feedbackRequest ? `Refinement cues: ${params.feedbackRequest}.` : "",
    params.noTextBoost || "",
    params.originalityBoost || "",
    "Final text policy reminder: title/subtitle are overlay-only and must NOT appear in the background art.",
    `Variation seed: ${params.generationId}.`
  ]
    .filter(Boolean)
    .join(" ");
}

async function generateCleanMinimalBackgroundPng(params: {
  prompt: string;
  shape: PreviewShape;
  referenceDataUrls: string[];
}): Promise<Buffer> {
  const size = OPENAI_IMAGE_SIZE_BY_SHAPE[params.shape];

  if (params.referenceDataUrls.length > 0) {
    try {
      return await generatePngFromPrompt({
        prompt: params.prompt,
        size,
        references: params.referenceDataUrls.map((dataUrl) => ({ dataUrl }))
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown reference-guided generation error";
      console.warn(`Reference-guided generation failed for ${params.shape}; retrying prompt-only. ${message}`);
    }
  }

  return generatePngFromPrompt({
    prompt: params.prompt,
    size
  });
}

const NO_TEXT_RETRY_BOOSTS = [
  "Hard requirement: absolutely no letterforms. If any characters appear, regenerate a fully abstract scene.",
  "CRITICAL NO-TEXT RETRY: zero readable text, zero glyphs, zero typographic marks. Produce pure image textures and shapes only."
] as const;

async function generateValidatedBackgroundPng(params: {
  project: GenerationProjectContext;
  palette: string[];
  shape: PreviewShape;
  generationId: string;
  optionIndex: number;
  feedbackRequest: string;
  styleBrief: StyleBrief;
  creativeBrief: string;
  avoidWords: string[];
  referenceDataUrls: string[];
  originalityBoost?: string;
}): Promise<{ backgroundPng: Buffer; prompt: string; textRetryCount: number }> {
  let lastPrompt = "";
  let lastBackgroundPng: Buffer | null = null;

  for (let attempt = 0; attempt <= 2; attempt += 1) {
    const noTextBoost = attempt === 0 ? undefined : NO_TEXT_RETRY_BOOSTS[attempt - 1];
    const prompt = buildCleanMinimalBackgroundPrompt({
      project: params.project,
      palette: params.palette,
      shape: params.shape,
      generationId: params.generationId,
      optionIndex: params.optionIndex,
      feedbackRequest: params.feedbackRequest,
      styleBrief: params.styleBrief,
      creativeBrief: params.creativeBrief,
      avoidWords: params.avoidWords,
      originalityBoost: params.originalityBoost,
      noTextBoost
    });

    const backgroundSource = await generateCleanMinimalBackgroundPng({
      prompt,
      shape: params.shape,
      referenceDataUrls: params.referenceDataUrls
    });
    const backgroundPng = await normalizePngToShape(backgroundSource, params.shape);
    const hasText = await imageHasReadableText(backgroundPng);
    if (!hasText) {
      return {
        backgroundPng,
        prompt,
        textRetryCount: attempt
      };
    }

    lastPrompt = prompt;
    lastBackgroundPng = backgroundPng;
  }

  return {
    backgroundPng: lastBackgroundPng as Buffer,
    prompt: lastPrompt,
    textRetryCount: 2
  };
}

function findClosestReferenceDistance(hash: string, references: ReferenceLibraryItem[]): number {
  let closest = Number.POSITIVE_INFINITY;
  for (const reference of references) {
    if (!reference.dHash) {
      continue;
    }
    const distance = hammingDistanceHash(hash, reference.dHash);
    if (distance < closest) {
      closest = distance;
    }
  }
  return closest;
}

async function renderCompositedPreviewPng(designDoc: DesignDoc): Promise<Buffer> {
  const svg = await buildFinalSvg(designDoc);
  return sharp(Buffer.from(svg))
    .resize({
      width: designDoc.width,
      height: designDoc.height,
      fit: "fill",
      position: "center"
    })
    .png()
    .toBuffer();
}

async function completeGenerationWithFallbackOutput(params: {
  projectId: string;
  generationId: string;
  output: GenerationOutputPayload;
}): Promise<void> {
  const designDocByShape = params.output.designDocByShape;
  const [squarePng, widePng, tallPng] = await Promise.all([
    renderCompositedPreviewPng(designDocByShape.square),
    renderCompositedPreviewPng(designDocByShape.wide),
    renderCompositedPreviewPng(designDocByShape.tall)
  ]);
  const [squarePath, widePath, tallPath] = await Promise.all([
    writeGenerationPreviewFiles({
      fileName: `${params.generationId}-square.png`,
      png: squarePng
    }),
    writeGenerationPreviewFiles({
      fileName: `${params.generationId}-wide.png`,
      png: widePng
    }),
    writeGenerationPreviewFiles({
      fileName: `${params.generationId}-tall.png`,
      png: tallPng
    })
  ]);
  const finalAssetRows: Prisma.AssetCreateManyInput[] = PREVIEW_SHAPES.map((shape) => ({
    projectId: params.projectId,
    generationId: params.generationId,
    kind: "IMAGE",
    slot: FINAL_ASSET_SLOT_BY_SHAPE[shape],
    file_path: shape === "square" ? squarePath : shape === "wide" ? widePath : tallPath,
    mime_type: "image/png",
    width: PREVIEW_DIMENSIONS[shape].width,
    height: PREVIEW_DIMENSIONS[shape].height
  }));

  const completedOutput: GenerationOutputPayload = {
    ...params.output,
    preview: {
      square_main: squarePath,
      widescreen_main: widePath,
      vertical_main: tallPath
    }
  };

  await prisma.$transaction([
    prisma.asset.deleteMany({
      where: {
        generationId: params.generationId,
        slot: {
          in: [...PREVIEW_ASSET_SLOTS_TO_CLEAR]
        }
      }
    }),
    prisma.asset.createMany({
      data: finalAssetRows
    }),
    prisma.generation.update({
      where: { id: params.generationId },
      data: {
        status: "COMPLETED",
        output: completedOutput as Prisma.InputJsonValue
      }
    })
  ]);
}

async function createOpenAiPreviewAssetsForPlannedGenerations(params: {
  project: GenerationProjectContext & { id: string };
  plannedGenerations: PlannedGeneration[];
}): Promise<void> {
  const openAiEnabled = isOpenAiPreviewGenerationEnabled() && Boolean(process.env.OPENAI_API_KEY?.trim());
  const referenceIndex = await loadIndex();

  for (const plannedGeneration of params.plannedGenerations) {
    const fallbackOutput = plannedGeneration.fallbackOutput;

    if (!openAiEnabled) {
      await completeGenerationWithFallbackOutput({
        projectId: params.project.id,
        generationId: plannedGeneration.id,
        output: fallbackOutput
      });
      continue;
    }

    try {
      const palette = params.project.brandKit ? parsePaletteJson(params.project.brandKit.paletteJson) : [];
      const feedbackRequest = readFeedbackRequest(plannedGeneration.input);
      const designBrief = readDesignBriefFromInput(plannedGeneration.input);
      if (!designBrief) {
        throw new Error("Generation input is missing a valid designBrief payload.");
      }
      const displayContent = buildOverlayDisplayContent({
        title: designBrief.seriesTitle || params.project.series_title,
        subtitle: designBrief.seriesSubtitle || params.project.series_subtitle,
        scripturePassages: designBrief.passage || params.project.scripture_passages
      });
      const content = {
        title: displayContent.title,
        subtitle: displayContent.subtitle
      };
      const lockupRecipe = designBrief.lockupRecipe;
      const references =
        plannedGeneration.references.length > 0
          ? plannedGeneration.references.slice(0, 3)
          : referenceIndex.length > 0
            ? await sampleRefsForOption({
                projectId: params.project.id,
                round: plannedGeneration.round,
                optionIndex: plannedGeneration.optionIndex,
                n: 3
              })
            : [];
      const referenceDataUrls = await buildReferenceDataUrls(references);
      const styleBrief = await createStyleBrief({
        optionIndex: plannedGeneration.optionIndex,
        project: params.project,
        references,
        feedbackRequest,
        palette
      });
      const avoidWords = buildAvoidWords(params.project);
      const creativeBrief = buildCreativeBrief({
        project: params.project,
        styleBrief,
        avoidWords
      });
      const masterDimensions = PREVIEW_DIMENSIONS[OPTION_MASTER_BACKGROUND_SHAPE];
      const renderMasterAttempt = async (originalityBoost?: string) => {
        const validatedBackground = await generateValidatedBackgroundPng({
          project: params.project,
          palette,
          shape: OPTION_MASTER_BACKGROUND_SHAPE,
          generationId: plannedGeneration.id,
          optionIndex: plannedGeneration.optionIndex,
          feedbackRequest,
          styleBrief,
          creativeBrief,
          avoidWords,
          referenceDataUrls,
          originalityBoost
        });
        const backgroundPng = validatedBackground.backgroundPng;
        const layout = computeCleanMinimalLayout({
          width: masterDimensions.width,
          height: masterDimensions.height,
          content,
          lockupRecipe
        });
        const textPalette = await chooseTextPaletteForBackground({
          backgroundPng,
          sampleRegion: layout.textRegion,
          width: masterDimensions.width,
          height: masterDimensions.height
        });
        const overlaySvg = buildCleanMinimalOverlaySvg({
          width: masterDimensions.width,
          height: masterDimensions.height,
          content,
          palette: textPalette,
          lockupRecipe
        });
        const finalPng = await sharp(backgroundPng)
          .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
          .png()
          .toBuffer();
        const hash = await computeDHashFromBuffer(finalPng);
        const closestDistance = findClosestReferenceDistance(hash, references);

        return {
          prompt: validatedBackground.prompt,
          textRetryCount: validatedBackground.textRetryCount,
          backgroundPng,
          closestDistance
        };
      };

      let masterAttempt = await renderMasterAttempt();
      let originalityRetried = false;
      if (Number.isFinite(masterAttempt.closestDistance) && masterAttempt.closestDistance < 6) {
        originalityRetried = true;
        masterAttempt = await renderMasterAttempt(
          "Originality guard: alter composition strongly from references. Change focal geometry, spacing rhythm, and tonal distribution while preserving the same overall mood."
        );
      }

      const shapeResults = await Promise.all(
        PREVIEW_SHAPES.map(async (shape) => {
          const dimensions = PREVIEW_DIMENSIONS[shape];
          const backgroundPng =
            shape === OPTION_MASTER_BACKGROUND_SHAPE
              ? masterAttempt.backgroundPng
              : await normalizePngToShape(masterAttempt.backgroundPng, shape);
          const layout = computeCleanMinimalLayout({
            width: dimensions.width,
            height: dimensions.height,
            content,
            lockupRecipe
          });
          const textPalette = await chooseTextPaletteForBackground({
            backgroundPng,
            sampleRegion: layout.textRegion,
            width: dimensions.width,
            height: dimensions.height
          });
          const overlaySvg = buildCleanMinimalOverlaySvg({
            width: dimensions.width,
            height: dimensions.height,
            content,
            palette: textPalette,
            lockupRecipe
          });
          const finalPng = await sharp(backgroundPng)
            .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
            .png()
            .toBuffer();
          const backgroundPath = await writeGenerationPreviewFiles({
            fileName: `${plannedGeneration.id}-${shape}-bg.png`,
            png: backgroundPng
          });
          const finalPath = await writeGenerationPreviewFiles({
            fileName: `${plannedGeneration.id}-${shape}.png`,
            png: finalPng
          });

          return {
            shape,
            backgroundPath,
            finalPath,
            designDoc: buildCleanMinimalDesignDoc({
              width: dimensions.width,
              height: dimensions.height,
              content,
              palette: textPalette,
              backgroundImagePath: backgroundPath,
              lockupRecipe
            })
          };
        })
      );

      const promptUsed = [
        `master(${OPTION_MASTER_BACKGROUND_SHAPE}): ${masterAttempt.prompt}`,
        originalityRetried ? "[retry: originality-guard]" : "",
        masterAttempt.textRetryCount > 0 ? `[retry: no-text x${masterAttempt.textRetryCount}]` : "",
        "derived variants: square/wide/tall reframed from one master background."
      ]
        .filter(Boolean)
        .join(" ");
      const byShape = Object.fromEntries(shapeResults.map((result) => [result.shape, result])) as Record<
        PreviewShape,
        (typeof shapeResults)[number]
      >;
      const designDocByShape: Record<PreviewShape, DesignDoc> = {
        square: byShape.square.designDoc,
        wide: byShape.wide.designDoc,
        tall: byShape.tall.designDoc
      };

      const backgroundAssetRows: Prisma.AssetCreateManyInput[] = PREVIEW_SHAPES.map((shape) => ({
        projectId: params.project.id,
        generationId: plannedGeneration.id,
        kind: "IMAGE",
        slot: BACKGROUND_ASSET_SLOT_BY_SHAPE[shape],
        file_path: byShape[shape].backgroundPath,
        mime_type: "image/png",
        width: PREVIEW_DIMENSIONS[shape].width,
        height: PREVIEW_DIMENSIONS[shape].height
      }));
      const finalAssetRows: Prisma.AssetCreateManyInput[] = PREVIEW_SHAPES.map((shape) => ({
        projectId: params.project.id,
        generationId: plannedGeneration.id,
        kind: "IMAGE",
        slot: FINAL_ASSET_SLOT_BY_SHAPE[shape],
        file_path: byShape[shape].finalPath,
        mime_type: "image/png",
        width: PREVIEW_DIMENSIONS[shape].width,
        height: PREVIEW_DIMENSIONS[shape].height
      }));

      const completedOutput: GenerationOutputPayload = {
        ...fallbackOutput,
        designDoc: designDocByShape.square,
        designDocByShape,
        notes: "ai+clean-min-overlay",
        promptUsed,
        meta: {
          styleRefCount: references.length,
          usedStylePaths: references.map((reference) => reference.path || reference.thumbPath),
          designSpec: {
            seed: plannedGeneration.id,
            optionLane: optionLane(plannedGeneration.optionIndex),
            masterBackgroundShape: OPTION_MASTER_BACKGROUND_SHAPE,
            palette,
            motifs: styleBrief.motifs,
            layout: styleBrief.layout,
            styleFamilies: designBrief.styleFamilies,
            lockupRecipe: designBrief.lockupRecipe
          }
        },
        preview: {
          square_main: byShape.square.finalPath,
          widescreen_main: byShape.wide.finalPath,
          vertical_main: byShape.tall.finalPath
        }
      };

      await prisma.$transaction([
        prisma.asset.deleteMany({
          where: {
            generationId: plannedGeneration.id,
            slot: {
              in: [...PREVIEW_ASSET_SLOTS_TO_CLEAR]
            }
          }
        }),
        prisma.asset.createMany({
          data: [...backgroundAssetRows, ...finalAssetRows]
        }),
        prisma.generation.update({
          where: {
            id: plannedGeneration.id
          },
          data: {
            status: "COMPLETED",
            output: completedOutput as Prisma.InputJsonValue
          }
        })
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `OpenAI preview generation failed for generation ${plannedGeneration.id} (${plannedGeneration.presetKey}). Falling back to layout-only output. ${message}`
      );

      await completeGenerationWithFallbackOutput({
        projectId: params.project.id,
        generationId: plannedGeneration.id,
        output: fallbackOutput
      });
    }
  }
}

export async function createProjectAction(
  _: ProjectActionState,
  formData: FormData
): Promise<ProjectActionState> {
  const session = await requireSession();

  const parsed = createProjectSchema.safeParse({
    series_title: formData.get("series_title"),
    series_subtitle: formData.get("series_subtitle") || undefined,
    scripture_passages: formData.get("scripture_passages") || undefined,
    series_description: formData.get("series_description") || undefined
  });

  if (!parsed.success) {
    return { error: "Series title is required." };
  }

  const project = await prisma.project.create({
    data: {
      organizationId: session.organizationId,
      createdById: session.userId,
      series_title: parsed.data.series_title,
      series_subtitle: parsed.data.series_subtitle || null,
      scripture_passages: parsed.data.scripture_passages || null,
      series_description: parsed.data.series_description || null
    }
  });

  redirect(`/app/projects/${project.id}/brand`);
}

export async function deleteProjectAction(projectId: string): Promise<void> {
  const session = await requireSession();

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId: session.organizationId
    },
    select: {
      id: true
    }
  });

  if (!project) {
    redirect("/app/projects");
  }

  await prisma.$transaction(async (tx) => {
    await tx.asset.deleteMany({
      where: {
        projectId: project.id
      }
    });

    await tx.finalDesign.deleteMany({
      where: {
        projectId: project.id
      }
    });

    await tx.generation.deleteMany({
      where: {
        projectId: project.id
      }
    });

    await tx.brandKit.deleteMany({
      where: {
        projectId: project.id
      }
    });

    await tx.project.delete({
      where: {
        id: project.id
      }
    });
  });

  revalidatePath("/app/projects");
  redirect("/app/projects");
}

export async function saveBrandKitAction(
  projectId: string,
  _: BrandKitActionState,
  formData: FormData
): Promise<BrandKitActionState> {
  const session = await requireSession();

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId: session.organizationId
    },
    select: { id: true }
  });

  if (!project) {
    return { error: "Project not found." };
  }

  const rawPalette = parsePalette(formData.get("palette_json"));
  if (!rawPalette) {
    return { error: "Palette data is invalid. Please re-add your colors." };
  }

  const parsed = saveBrandKitSchema.safeParse({
    websiteUrl: formData.get("website_url"),
    typographyDirection: formData.get("typography_direction"),
    palette: rawPalette
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Please correct the brand kit fields and try again." };
  }

  const normalizedWebsiteUrl = normalizeWebsiteUrl(parsed.data.websiteUrl);
  if (!normalizedWebsiteUrl) {
    return { error: WEBSITE_URL_ERROR_MESSAGE };
  }

  const logoUpload = formData.get("logo_upload");
  if (logoUpload && logoUpload instanceof File && logoUpload.size > 0 && !isAllowedLogoUpload(logoUpload)) {
    return { error: "Logo must be a PNG, JPG, or SVG file." };
  }

  const existingBrandKit = await prisma.brandKit.findUnique({
    where: { projectId },
    select: { logoPath: true }
  });

  let logoPath = existingBrandKit?.logoPath || null;
  if (logoUpload && logoUpload instanceof File && logoUpload.size > 0) {
    logoPath = await saveLogoUpload(logoUpload);
  }

  await prisma.brandKit.upsert({
    where: { projectId },
    create: {
      organizationId: session.organizationId,
      projectId,
      websiteUrl: normalizedWebsiteUrl,
      logoPath,
      paletteJson: JSON.stringify(parsed.data.palette),
      typographyDirection: parsed.data.typographyDirection
    },
    update: {
      organizationId: session.organizationId,
      websiteUrl: normalizedWebsiteUrl,
      logoPath,
      paletteJson: JSON.stringify(parsed.data.palette),
      typographyDirection: parsed.data.typographyDirection
    }
  });

  redirect(`/app/projects/${projectId}`);
}

export async function generateRoundOneAction(
  projectId: string,
  _: GenerationActionState,
  _formData: FormData
): Promise<GenerationActionState> {
  const session = await requireSession();

  const project = await getProjectForGeneration(projectId, session.organizationId);
  if (!project) {
    return { error: "Project not found." };
  }

  if (!project.brandKit) {
    return { error: "Set up the brand kit before generating directions." };
  }

  const enabledPresets = await findEnabledPresetsForOrganization(session.organizationId);
  const enabledPresetKeySet = new Set(enabledPresets.map((preset) => preset.key));
  const presetIdByKey = new Map(enabledPresets.map((preset) => [preset.key, preset.id] as const));
  const selectedPresetKeys = ensureThree(
    filterToEnabledPresets(pickInitialPresetKeys(), enabledPresetKeySet),
    enabledPresetKeySet,
    [...enabledPresets.map((preset) => preset.key), ...pickInitialPresetKeys()]
  );
  if (selectedPresetKeys.length < ROUND_OPTION_COUNT) {
    return { error: "At least three presets are required to generate options." };
  }

  const refsForOptions = await pickReferenceSetsForRound(project.id, 1, ROUND_OPTION_COUNT);
  const input = buildGenerationInput(project, project.brandKit, selectedPresetKeys);
  const validatedDesignBrief = validateDesignBrief((input as { designBrief?: unknown }).designBrief);
  if (!validatedDesignBrief.ok) {
    return {
      error: `Design brief is invalid: ${validatedDesignBrief.issues.slice(0, 2).join(" | ")}`
    };
  }

  const plannedGenerations: PlannedGeneration[] = selectedPresetKeys.map((presetKey, index) => {
    const generationId = randomUUID();
    const references = refsForOptions[index] || [];

    return {
      id: generationId,
      presetId: presetIdByKey.get(presetKey) || null,
      presetKey,
      round: 1,
      optionIndex: index,
      references,
      input: input as Prisma.InputJsonValue,
      fallbackOutput: buildFallbackGenerationOutput({
        projectId: project.id,
        presetKey,
        project,
        input,
        round: 1,
        optionIndex: index,
        referenceItems: references
      })
    };
  });

  await prisma.$transaction(
    plannedGenerations.map(({ id: generationId, presetId: generationPresetId, input: generationInput }) =>
      prisma.generation.create({
        data: {
          id: generationId,
          projectId: project.id,
          presetId: generationPresetId,
          round: 1,
          status: "RUNNING",
          input: generationInput
        }
      })
    )
  );

  await createOpenAiPreviewAssetsForPlannedGenerations({
    project,
    plannedGenerations
  });

  redirect(`/app/projects/${projectId}/generations`);
}

export async function generateRoundTwoAction(
  projectId: string,
  _: RoundFeedbackActionState,
  formData: FormData
): Promise<RoundFeedbackActionState> {
  const session = await requireSession();

  const project = await getProjectForGeneration(projectId, session.organizationId);
  if (!project) {
    return { error: "Project not found." };
  }

  if (!project.brandKit) {
    return { error: "Set up the brand kit before generating directions." };
  }

  const parsed = generateRoundTwoSchema.safeParse({
    currentRound: formData.get("currentRound"),
    chosenGenerationId: formData.get("chosenGenerationId") || undefined,
    feedbackText: formData.get("feedbackText") || undefined,
    emphasis: formData.get("emphasis"),
    expressiveness: formData.get("expressiveness"),
    temperature: formData.get("temperature"),
    styleDirection: formData.get("styleDirection")
  });

  if (!parsed.success) {
    return { error: "Please review your feedback inputs and try again." };
  }

  const chosenGenerationId = parsed.data.chosenGenerationId || null;
  const chosenGeneration = chosenGenerationId
    ? await prisma.generation.findFirst({
        where: {
          id: chosenGenerationId,
          projectId: project.id
        },
        select: {
          id: true,
          input: true,
          output: true
        }
      })
    : null;

  if (chosenGenerationId && !chosenGeneration) {
    return { error: "Selected direction was not found for this project." };
  }

  const styleDirection = normalizeStyleDirection(parsed.data.styleDirection);
  const enabledPresets = await findEnabledPresetsForOrganization(session.organizationId);
  const enabledPresetKeySet = new Set(enabledPresets.map((preset) => preset.key));
  const presetIdByKey = new Map(enabledPresets.map((preset) => [preset.key, preset.id] as const));
  const selectedPresetKeys = ensureThree(
    filterToEnabledPresets(pickPresetKeysForStyle(styleDirection), enabledPresetKeySet),
    enabledPresetKeySet,
    [...enabledPresets.map((preset) => preset.key), ...pickPresetKeysForStyle(styleDirection), ...pickInitialPresetKeys()]
  );
  if (selectedPresetKeys.length < ROUND_OPTION_COUNT) {
    return { error: "At least three presets are required to generate options." };
  }

  const input = {
    ...buildGenerationInput(
      project,
      project.brandKit,
      selectedPresetKeys,
      chosenGeneration ? readLockupRecipeFromInput(chosenGeneration.input) : undefined
    ),
    feedback: {
      sourceRound: parsed.data.currentRound,
      chosenGenerationId,
      request: parsed.data.feedbackText || "",
      emphasis: parsed.data.emphasis,
      expressiveness: parsed.data.expressiveness,
      temperature: parsed.data.temperature,
      styleDirection
    }
  };
  const validatedDesignBrief = validateDesignBrief((input as { designBrief?: unknown }).designBrief);
  if (!validatedDesignBrief.ok) {
    return {
      error: `Design brief is invalid: ${validatedDesignBrief.issues.slice(0, 2).join(" | ")}`
    };
  }

  const round = parsed.data.currentRound + 1;
  const refsForOptions = await pickReferenceSetsForRound(project.id, round, ROUND_OPTION_COUNT);

  const plannedGenerations: PlannedGeneration[] = selectedPresetKeys.map((presetKey, index) => {
    const generationId = randomUUID();
    const references = refsForOptions[index] || [];

    return {
      id: generationId,
      presetId: presetIdByKey.get(presetKey) || null,
      presetKey,
      round,
      optionIndex: index,
      references,
      input: input as Prisma.InputJsonValue,
      fallbackOutput: buildFallbackGenerationOutput({
        projectId: project.id,
        presetKey,
        project,
        input,
        round,
        optionIndex: index,
        referenceItems: references
      })
    };
  });

  await prisma.$transaction(
    plannedGenerations.map(({ id: generationId, presetId: generationPresetId, input: generationInput }) =>
      prisma.generation.create({
        data: {
          id: generationId,
          projectId: project.id,
          presetId: generationPresetId,
          round,
          status: "RUNNING",
          input: generationInput
        }
      })
    )
  );

  await createOpenAiPreviewAssetsForPlannedGenerations({
    project,
    plannedGenerations
  });

  redirect(`/app/projects/${projectId}/generations`);
}

export async function approveFinalDesignAction(projectId: string, generationId: string, optionKeyRaw: string): Promise<void> {
  const session = await requireSession();
  const normalizedOptionKey = optionKeyRaw.trim().toUpperCase().slice(0, 1);

  if (!/^[A-Z]$/.test(normalizedOptionKey)) {
    return;
  }

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId: session.organizationId
    },
    select: {
      id: true,
      series_title: true,
      series_subtitle: true,
      scripture_passages: true,
      series_description: true,
      brandKit: {
        select: {
          logoPath: true,
          paletteJson: true
        }
      }
    }
  });

  if (!project) {
    return;
  }

  const generation = await prisma.generation.findFirst({
    where: {
      id: generationId,
      projectId: project.id
    },
    select: {
      id: true,
      round: true,
      input: true,
      output: true
    }
  });

  if (!generation) {
    return;
  }

  const optionIndex = Math.max(0, normalizedOptionKey.charCodeAt(0) - 65);
  const palette = project.brandKit ? parsePaletteJson(project.brandKit.paletteJson) : [];
  const designDoc = buildFinalDesignDoc({
    output: generation.output,
    input: generation.input,
    round: generation.round,
    optionIndex,
    project: {
      seriesTitle: project.series_title,
      seriesSubtitle: project.series_subtitle,
      scripturePassages: project.scripture_passages,
      seriesDescription: project.series_description,
      logoPath: project.brandKit?.logoPath || null,
      palette
    }
  });

  await prisma.finalDesign.upsert({
    where: {
      projectId: project.id
    },
    create: {
      projectId: project.id,
      generationId: generation.id,
      round: generation.round,
      optionKey: normalizedOptionKey,
      optionLabel: optionLabel(optionIndex),
      designJson: designDoc as Prisma.InputJsonValue
    },
    update: {
      generationId: generation.id,
      round: generation.round,
      optionKey: normalizedOptionKey,
      optionLabel: optionLabel(optionIndex),
      designJson: designDoc as Prisma.InputJsonValue
    }
  });

  revalidatePath(`/app/projects/${project.id}/generations`);
}
