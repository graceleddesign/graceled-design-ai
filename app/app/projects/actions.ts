"use server";

import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sharp from "sharp";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { buildFinalDesignDoc, type DesignDoc } from "@/lib/design-doc";
import {
  buildDesignBrief,
  type DesignBrief,
  type LockupRecipe,
  type ResolvedLockupPalette,
  type StyleFamily,
  validateDesignBrief
} from "@/lib/design-brief";
import {
  planDirectionSet,
  pickExplorationFallbackStyleFamily,
  type PlannedDirectionSpec,
  type StyleFamily as DirectionStyleFamily
} from "@/lib/direction-planner";
import { extractBibleCreativeBrief, type BibleCreativeBrief } from "@/lib/bible-creative-brief";
import { getMotifBankContext, type MotifBankContext } from "@/lib/bible-motif-bank";
import { buildFinalSvg } from "@/lib/final-deliverables";
import { resizeCoverWithFocalPoint, type FocalPoint } from "@/lib/image-cover";
import { computeDHashFromBuffer, hammingDistanceHash } from "@/lib/image-hash";
import { resolveRecipeFocalPoint } from "@/lib/lockups/renderer";
import { generatePngFromPrompt } from "@/lib/openai-image";
import { openai } from "@/lib/openai";
import { optionLabel } from "@/lib/option-label";
import { buildOverlayDisplayContent, normalizeLine } from "@/lib/overlay-lines";
import { GENERIC_CHRISTIAN_MOTIFS } from "@/lib/motif-guardrails";
import { resolveEffectiveBrandKit } from "@/lib/brand-kit";
import { prisma } from "@/lib/prisma";
import {
  loadIndex,
  resolveReferenceAbsolutePath,
  sampleRefsForOption,
  type ReferenceLibraryItem
} from "@/lib/referenceLibrary";
import { getCuratedReferences } from "@/lib/referenceCuration";
import {
  deriveRecentReferenceIds,
  getRound1VariationTemplateByKey
} from "@/lib/referenceSelector";
import { normalizeStyleDirection, type StyleDirection } from "@/lib/style-direction";
import {
  isStyleMediumKey,
  isStyleBucketKey,
  isStyleFamilyKey,
  isStyleToneKey,
  STYLE_FAMILY_BANK,
  type StyleMediumKey,
  type StyleBucketKey,
  type StyleToneKey,
  type StyleFamilyKey
} from "@/lib/style-family-bank";
import { buildBackgroundPrompt, renderTemplate, type TemplateBrief } from "@/lib/templates";
import {
  buildCleanMinimalOverlaySvg,
  chooseTextPaletteForBackground,
  computeCleanMinimalLayout,
  resolveLockupPaletteForBackground
} from "@/lib/templates/type-clean-min";
import {
  composeLockupOnBackground,
  LOCKUP_SAFE_REGION_RATIOS,
  type LockupIntegrationMode,
  PREVIEW_DIMENSIONS,
  PREVIEW_SHAPES,
  renderTrimmedLockupPngFromSvg,
  type PreviewShape
} from "@/lib/lockup-compositor";

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

type ProjectBrandMode = "brand" | "fresh";

const createProjectSchema = z.object({
  series_title: z.string().trim().min(1),
  series_subtitle: z.string().trim().optional(),
  scripture_passages: z.string().trim().optional(),
  series_description: z.string().trim().optional(),
  brandMode: z.enum(["brand", "fresh"]).default("fresh"),
  preferredAccentColors: z.string().trim().max(300).optional(),
  avoidColors: z.string().trim().max(300).optional(),
  designNotes: z.string().trim().max(300).optional()
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
  regenerateLockup: z.boolean().optional(),
  explicitNewTitleStyle: z.boolean().optional(),
  regenerateBackground: z.boolean().optional(),
  styleDirection: z.unknown().optional()
});
const ROUND_OPTION_COUNT = 3;
type BackgroundAssetSlot = "square_bg" | "wide_bg" | "tall_bg";
type FinalAssetSlot = "square" | "wide" | "tall";
type LegacyPreviewAssetSlot = "square_main" | "wide_main" | "tall_main" | "widescreen_main" | "vertical_main";

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
const BRAND_NEUTRAL_HEXES = ["#000000", "#111827", "#334155", "#64748B", "#CBD5E1", "#F8FAFC", "#FFFFFF"] as const;
const BRAND_PALETTE_SAMPLE_COLUMNS = 40;
const BRAND_PALETTE_SAMPLE_ROWS = 20;
const BRAND_PALETTE_DISTANCE_THRESHOLD = 58;
const BRAND_PALETTE_FAR_SAMPLE_RATIO_THRESHOLD = 0.15;
const BRAND_PALETTE_STRICT_RETRY_BOOST =
  "HARD CONSTRAINT RETRY: Use flat/vector-like color fields with only very subtle neutral monochrome texture. NO warm hues, NO orange/red/yellow, NO photographic color grading, and no hue shifts.";
const TONE_STATS_SAMPLE_SIZE = 64;
const LIGHT_TONE_MIN_LUMINANCE = 175;
const LIGHT_TONE_MAX_SEPIA_LIKELIHOOD = 0.35;
const VIVID_TONE_MIN_SATURATION = 120;
const VIVID_TONE_MIN_LUMINANCE = 115;
const DARK_MONO_TONE_MIN_LUMINANCE = 55;
const DARK_TONE_MAX_LUMINANCE = 125;
const MONO_TONE_MAX_SATURATION = 30;
const MONO_TONE_MAX_LUMINANCE = 125;
const DESIGN_PRESENCE_MIN_LUMINANCE_STD_DEV = 35;
const DESIGN_PRESENCE_MIN_EDGE_DENSITY = 0.012;
const DESIGN_PRESENCE_EDGE_MAGNITUDE_THRESHOLD = 68;
const ROUND1_RERANK_MIN_EDGES_FULL = 0.01;
const ROUND1_RERANK_MIN_STD_FULL = 20;
const ROUND1_RERANK_MIN_EDGES_NON_TITLE = 0.008;
const ROUND1_RERANK_MIN_ACCEPTABLE_SCORE = 180;
const LIGHT_TONE_OVERRIDE_RETRY_BOOST =
  "TONE OVERRIDE RETRY: Must satisfy tone targets. LIGHT must be high-key bright/clean (white or near-white background), NOT parchment/sepia/vintage. Avoid filmic grading, avoid desaturation, avoid heavy grain. Prioritize tone compliance over atmosphere.";
const VIVID_TONE_OVERRIDE_RETRY_BOOST =
  "TONE OVERRIDE RETRY: Must be high-chroma, bold palette, strong saturation. Avoid muted/dusty colors.";
const MONO_TONE_OVERRIDE_RETRY_BOOST =
  "TONE OVERRIDE RETRY: Strict monochrome/grayscale; near-zero saturation.";
const DARK_TONE_OVERRIDE_RETRY_BOOST =
  "DARK OVERRIDE RETRY: dark but readable; avoid pure black; include visible midtones and highlights; clear forms and structure; maintain strong contrast for title-safe area.";
const OPTION_MASTER_BACKGROUND_SHAPE: PreviewShape = "wide";
const ROUND1_EXPLORATION_BACKGROUND_CANDIDATE_COUNT = 4;
const ROUND1_EXPLORATION_LOCKUP_CANDIDATE_COUNT = 2;
const ROUND1_EXPLORATION_LOCKUP_SAFE_MARGIN_RATIO = 0.06;
const ROUND1_EXPLORATION_LOCKUP_MIN_HEIGHT_RATIO = 0.28;
const TITLE_SAFE_EDGE_SOFT_MAX = 0.085;
const TITLE_SAFE_VARIANCE_TARGET = 24;
const TITLE_SAFE_VARIANCE_TOLERANCE = 22;
const MIDTONE_CRUSHED_RATIO_FLOOR = 0.06;
const MIDTONE_CRUSHED_RATIO_CEILING = 0.42;
const LOCKUP_ASSET_SLOT = "series_lockup";
const LOCKUP_LAYOUT_ARCHETYPES = [
  "editorial_stack",
  "banner_strip",
  "seal_arc",
  "split_title",
  "framed_type",
  "monogram_mark",
  "vertical_spine",
  "centered_classic",
  "stepped_baseline",
  "offset_kicker"
] as const;
type LockupLayoutArchetype = (typeof LOCKUP_LAYOUT_ARCHETYPES)[number];
const LOCKUP_LAYOUT_ARCHETYPE_SET = new Set<string>(LOCKUP_LAYOUT_ARCHETYPES);
type LockupTypographicRecipe = {
  id: string;
  label: string;
  titleCase: LockupRecipe["hierarchy"]["case"];
  subtitleCase: LockupRecipe["hierarchy"]["case"];
  maxTitleLines: 1 | 2 | 3 | 4;
  forcedLineBreakRule: string;
  titleTrackingRange: {
    min: number;
    max: number;
  };
  subtitleTrackingRange: {
    min: number;
    max: number;
  };
  opticalAlignment: {
    alignment: LockupRecipe["alignment"];
    safeMarginPct: number;
    maxTitleWidthPct: number;
  };
  subtitleWidthRatio: number;
  dividerRule: "none" | "optional" | "required";
  titleTreatment: LockupRecipe["titleTreatment"];
};
const LOCKUP_TEXT_OVERRIDE_PROMPT = [
  "LOCKUP TEXT OVERRIDE: Use EXACT text only. Do not add any other words, letters, or decorative type.",
  "LOCKUP OVERRIDE: no shadows, no glows, no blur, no duplicate text layers. Clean, flat typography only."
].join("\n");
const LOCKUP_TYPOGRAPHIC_RECIPE_BY_LAYOUT: Record<LockupLayoutArchetype, LockupTypographicRecipe> = {
  editorial_stack: {
    id: "classic_stack",
    label: "Classic Stack",
    titleCase: "title_case",
    subtitleCase: "upper",
    maxTitleLines: 3,
    forcedLineBreakRule: "Break title into 2-3 balanced word groups; avoid orphan prepositions.",
    titleTrackingRange: { min: 0.01, max: 0.05 },
    subtitleTrackingRange: { min: 0.03, max: 0.08 },
    opticalAlignment: { alignment: "left", safeMarginPct: 0.076, maxTitleWidthPct: 0.56 },
    subtitleWidthRatio: 0.62,
    dividerRule: "optional",
    titleTreatment: "stacked"
  },
  banner_strip: {
    id: "banner_strip",
    label: "Banner Strip",
    titleCase: "upper",
    subtitleCase: "upper",
    maxTitleLines: 2,
    forcedLineBreakRule: "Split long titles into two compact bands by major phrase groups.",
    titleTrackingRange: { min: -0.02, max: 0.03 },
    subtitleTrackingRange: { min: 0.03, max: 0.08 },
    opticalAlignment: { alignment: "center", safeMarginPct: 0.06, maxTitleWidthPct: 0.7 },
    subtitleWidthRatio: 0.58,
    dividerRule: "required",
    titleTreatment: "split"
  },
  centered_classic: {
    id: "centered_classic",
    label: "Centered Classic",
    titleCase: "title_case",
    subtitleCase: "upper",
    maxTitleLines: 3,
    forcedLineBreakRule: "Center title on 2-3 optical lines with near-even line lengths.",
    titleTrackingRange: { min: 0.01, max: 0.05 },
    subtitleTrackingRange: { min: 0.04, max: 0.09 },
    opticalAlignment: { alignment: "center", safeMarginPct: 0.072, maxTitleWidthPct: 0.6 },
    subtitleWidthRatio: 0.55,
    dividerRule: "optional",
    titleTreatment: "stacked"
  },
  vertical_spine: {
    id: "vertical_spine",
    label: "Vertical Spine",
    titleCase: "upper",
    subtitleCase: "upper",
    maxTitleLines: 4,
    forcedLineBreakRule: "Use short stacked word groups that read cleanly along a vertical rail.",
    titleTrackingRange: { min: 0.02, max: 0.08 },
    subtitleTrackingRange: { min: 0.05, max: 0.1 },
    opticalAlignment: { alignment: "left", safeMarginPct: 0.084, maxTitleWidthPct: 0.46 },
    subtitleWidthRatio: 0.52,
    dividerRule: "required",
    titleTreatment: "stacked"
  },
  split_title: {
    id: "split_title",
    label: "Split Title",
    titleCase: "title_case",
    subtitleCase: "upper",
    maxTitleLines: 2,
    forcedLineBreakRule: "Force one intentional break at the strongest semantic pivot in the title.",
    titleTrackingRange: { min: -0.01, max: 0.03 },
    subtitleTrackingRange: { min: 0.03, max: 0.08 },
    opticalAlignment: { alignment: "left", safeMarginPct: 0.07, maxTitleWidthPct: 0.62 },
    subtitleWidthRatio: 0.6,
    dividerRule: "none",
    titleTreatment: "split"
  },
  framed_type: {
    id: "framed_type",
    label: "Framed Type",
    titleCase: "upper",
    subtitleCase: "upper",
    maxTitleLines: 2,
    forcedLineBreakRule: "Keep title to one strong line or two tightly grouped lines.",
    titleTrackingRange: { min: 0.02, max: 0.08 },
    subtitleTrackingRange: { min: 0.05, max: 0.11 },
    opticalAlignment: { alignment: "center", safeMarginPct: 0.064, maxTitleWidthPct: 0.66 },
    subtitleWidthRatio: 0.57,
    dividerRule: "required",
    titleTreatment: "boxed"
  },
  monogram_mark: {
    id: "monogram_mark",
    label: "Monogram + Wordmark",
    titleCase: "upper",
    subtitleCase: "upper",
    maxTitleLines: 2,
    forcedLineBreakRule: "Keep title compact beside mark; if wrapped, split into two equal word groups.",
    titleTrackingRange: { min: 0.01, max: 0.06 },
    subtitleTrackingRange: { min: 0.04, max: 0.09 },
    opticalAlignment: { alignment: "left", safeMarginPct: 0.072, maxTitleWidthPct: 0.58 },
    subtitleWidthRatio: 0.56,
    dividerRule: "optional",
    titleTreatment: "stacked"
  },
  seal_arc: {
    id: "seal_arc",
    label: "Seal Arc",
    titleCase: "upper",
    subtitleCase: "upper",
    maxTitleLines: 2,
    forcedLineBreakRule: "Use one arc title line; reserve subtitle for a straight secondary line.",
    titleTrackingRange: { min: 0.03, max: 0.1 },
    subtitleTrackingRange: { min: 0.05, max: 0.11 },
    opticalAlignment: { alignment: "center", safeMarginPct: 0.068, maxTitleWidthPct: 0.64 },
    subtitleWidthRatio: 0.55,
    dividerRule: "required",
    titleTreatment: "badge"
  },
  stepped_baseline: {
    id: "stepped_baseline",
    label: "Stepped Baseline",
    titleCase: "title_case",
    subtitleCase: "upper",
    maxTitleLines: 3,
    forcedLineBreakRule: "Break into 2-3 descending phrase groups with deliberate baseline offsets.",
    titleTrackingRange: { min: 0, max: 0.04 },
    subtitleTrackingRange: { min: 0.03, max: 0.08 },
    opticalAlignment: { alignment: "left", safeMarginPct: 0.078, maxTitleWidthPct: 0.59 },
    subtitleWidthRatio: 0.61,
    dividerRule: "optional",
    titleTreatment: "stacked"
  },
  offset_kicker: {
    id: "offset_kicker",
    label: "Offset Kicker",
    titleCase: "upper",
    subtitleCase: "title_case",
    maxTitleLines: 2,
    forcedLineBreakRule: "Keep title dominant; place subtitle as one short offset kicker line.",
    titleTrackingRange: { min: -0.02, max: 0.03 },
    subtitleTrackingRange: { min: 0.01, max: 0.05 },
    opticalAlignment: { alignment: "left", safeMarginPct: 0.07, maxTitleWidthPct: 0.63 },
    subtitleWidthRatio: 0.64,
    dividerRule: "none",
    titleTreatment: "singleline"
  }
};
const DIRECTION_LANE_FAMILIES = ["premium_modern", "editorial", "minimal", "photo_centric", "retro"] as const;
const DIRECTION_LANE_FAMILY_SET = new Set<string>(DIRECTION_LANE_FAMILIES);
const LOCKUP_LAYOUT_PREFERRED_BY_STYLE_MODE: Record<LockupStyleMode, readonly LockupLayoutArchetype[]> = {
  engraved_stamp: ["seal_arc", "centered_classic", "monogram_mark", "banner_strip", "stepped_baseline"],
  modern_editorial: ["editorial_stack", "split_title", "vertical_spine", "framed_type", "offset_kicker"]
};
const VINTAGE_REFERENCE_TAG_PATTERN =
  /engrav|etch|stamp|seal|badge|vintage|heritage|retro|antique|letterpress|victorian|ornate/i;
const PREVIEW_ASSET_SLOTS_TO_CLEAR: readonly string[] = [
  ...LEGACY_PREVIEW_ASSET_SLOTS,
  ...PREVIEW_SHAPES,
  ...Object.values(BACKGROUND_ASSET_SLOT_BY_SHAPE),
  LOCKUP_ASSET_SLOT
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

function parseOptionalBooleanFormValue(raw: FormDataEntryValue | null): boolean | undefined {
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  return undefined;
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

function normalizeHexColorToken(value: string): string | null {
  const trimmed = value.trim();
  if (!HEX_COLOR_REGEX.test(trimmed)) {
    return null;
  }
  if (trimmed.length === 4) {
    const [_, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return trimmed.toUpperCase();
}

function normalizeHexPalette(values: string[]): string[] {
  const normalized = values.map(normalizeHexColorToken).filter((value): value is string => Boolean(value));
  return [...new Set(normalized)];
}

function parseAllowedPaletteFromOrgBrandKit(brandKit: {
  paletteJson: string;
  source: "organization" | "project" | "project_fallback";
} | null): string[] {
  if (!brandKit || brandKit.source !== "organization") {
    return [];
  }
  return normalizeHexPalette(parsePaletteJson(brandKit.paletteJson));
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = normalizeHexColorToken(hex) || "#000000";
  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16)
  ];
}

function mixRgb(a: [number, number, number], b: [number, number, number], amount: number): [number, number, number] {
  const t = clampNumber(amount, 0, 1);
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
}

function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb[0].toString(16).padStart(2, "0")}${rgb[1].toString(16).padStart(2, "0")}${rgb[2]
    .toString(16)
    .padStart(2, "0")}`.toUpperCase();
}

function expandTintShadePalette(hexes: string[]): string[] {
  const expanded = new Set<string>();
  for (const hex of normalizeHexPalette(hexes)) {
    const base = hexToRgb(hex);
    expanded.add(hex);
    expanded.add(rgbToHex(mixRgb(base, [255, 255, 255], 0.22)));
    expanded.add(rgbToHex(mixRgb(base, [255, 255, 255], 0.4)));
    expanded.add(rgbToHex(mixRgb(base, [0, 0, 0], 0.18)));
    expanded.add(rgbToHex(mixRgb(base, [0, 0, 0], 0.35)));
  }
  return [...expanded];
}

function buildBrandPaletteHardConstraintPrompt(allowedBrandHexes: string[]): string {
  if (allowedBrandHexes.length === 0) {
    return "";
  }

  return [
    `HARD CONSTRAINT: Use ONLY these HEX colors + neutrals. Allowed brand HEX: ${allowedBrandHexes.join(", ")}.`,
    `Allowed neutrals: ${BRAND_NEUTRAL_HEXES.join(", ")}.`,
    "Forbid any other hues. Especially NO orange/red/yellow unless one of those hues is explicitly present in the allowed brand HEX set.",
    "Only tints/shades (lighter/darker variants) of allowed colors are permitted. No hue shifts."
  ].join(" ");
}

type PaletteComplianceScore = {
  sampleCount: number;
  farSampleCount: number;
  farSampleRatio: number;
  distanceThreshold: number;
  farSampleRatioThreshold: number;
  averageNearestDistance: number;
  isCompliant: boolean;
};

type ImageToneStats = {
  sampleCount: number;
  meanLuminance: number;
  meanSaturation: number;
  sepiaLikelihood: number;
  luminanceStdDev: number;
  edgeDensity: number;
};

type ToneCheckSummary = {
  attempted: boolean;
  passed: boolean;
  statsBefore: ImageToneStats | null;
  statsAfter: ImageToneStats | null;
  retried: boolean;
  failuresBefore: string[];
  failuresAfter: string[];
};

type BackgroundTextCheckSummary = {
  attempted: boolean;
  detected: boolean;
  retried: boolean;
};

async function scorePaletteCompliance(
  imagePathOrBuffer: string | Buffer,
  allowedHexes: string[]
): Promise<PaletteComplianceScore | null> {
  const allowedPalette = normalizeHexPalette(allowedHexes);
  if (allowedPalette.length === 0) {
    return null;
  }

  const scoredPalette = expandTintShadePalette(allowedPalette).map(hexToRgb);
  const sourceBuffer = typeof imagePathOrBuffer === "string" ? await readFile(imagePathOrBuffer) : imagePathOrBuffer;
  const raster = await sharp(sourceBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = raster;
  const width = Math.max(1, info.width || 1);
  const height = Math.max(1, info.height || 1);
  const channels = Math.max(3, info.channels || 4);

  let sampleCount = 0;
  let farSampleCount = 0;
  let distanceSum = 0;

  for (let yIndex = 0; yIndex < BRAND_PALETTE_SAMPLE_ROWS; yIndex += 1) {
    for (let xIndex = 0; xIndex < BRAND_PALETTE_SAMPLE_COLUMNS; xIndex += 1) {
      const x = Math.min(width - 1, Math.max(0, Math.round(((xIndex + 0.5) / BRAND_PALETTE_SAMPLE_COLUMNS) * (width - 1))));
      const y = Math.min(height - 1, Math.max(0, Math.round(((yIndex + 0.5) / BRAND_PALETTE_SAMPLE_ROWS) * (height - 1))));
      const offset = (y * width + x) * channels;
      const alpha = channels > 3 ? data[offset + 3] : 255;
      if (alpha <= 10) {
        continue;
      }

      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      let nearestDistance = Number.POSITIVE_INFINITY;

      for (const [allowedR, allowedG, allowedB] of scoredPalette) {
        const dr = r - allowedR;
        const dg = g - allowedG;
        const db = b - allowedB;
        const distance = Math.sqrt(dr * dr + dg * dg + db * db);
        if (distance < nearestDistance) {
          nearestDistance = distance;
        }
      }

      sampleCount += 1;
      distanceSum += nearestDistance;
      if (nearestDistance > BRAND_PALETTE_DISTANCE_THRESHOLD) {
        farSampleCount += 1;
      }
    }
  }

  const farSampleRatio = sampleCount > 0 ? farSampleCount / sampleCount : 0;
  const averageNearestDistance = sampleCount > 0 ? distanceSum / sampleCount : 0;

  return {
    sampleCount,
    farSampleCount,
    farSampleRatio,
    distanceThreshold: BRAND_PALETTE_DISTANCE_THRESHOLD,
    farSampleRatioThreshold: BRAND_PALETTE_FAR_SAMPLE_RATIO_THRESHOLD,
    averageNearestDistance,
    isCompliant: farSampleRatio <= BRAND_PALETTE_FAR_SAMPLE_RATIO_THRESHOLD
  };
}

function rgbToHueAndSaturation(r: number, g: number, b: number): { hue: number; saturation: number } {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;
  const saturation = max <= 0 ? 0 : (delta / max) * 255;

  if (delta <= 0) {
    return { hue: 0, saturation };
  }

  let hue = 0;
  if (max === rNorm) {
    hue = 60 * (((gNorm - bNorm) / delta) % 6);
  } else if (max === gNorm) {
    hue = 60 * ((bNorm - rNorm) / delta + 2);
  } else {
    hue = 60 * ((rNorm - gNorm) / delta + 4);
  }

  if (hue < 0) {
    hue += 360;
  }

  return { hue, saturation };
}

async function computeImageToneStatsFromBuffer(imageBuffer: Buffer): Promise<ImageToneStats | null> {
  try {
    const raster = await sharp(imageBuffer, { failOn: "none" })
      .resize({
        width: TONE_STATS_SAMPLE_SIZE,
        height: TONE_STATS_SAMPLE_SIZE,
        fit: "fill"
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { data, info } = raster;
    const width = Math.max(1, info.width || TONE_STATS_SAMPLE_SIZE);
    const height = Math.max(1, info.height || TONE_STATS_SAMPLE_SIZE);
    const channels = Math.max(4, info.channels || 4);
    const totalPixels = width * height;
    const luminanceByPixel = new Float32Array(totalPixels);
    const opaqueMask = new Uint8Array(totalPixels);

    let sampleCount = 0;
    let luminanceSum = 0;
    let saturationSum = 0;
    let sepiaLikeCount = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixelIndex = y * width + x;
        const offset = pixelIndex * channels;
        const alpha = data[offset + 3];
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        luminanceByPixel[pixelIndex] = luminance;

        if (alpha <= 10) {
          continue;
        }

        opaqueMask[pixelIndex] = 1;
        const { hue, saturation } = rgbToHueAndSaturation(r, g, b);
        sampleCount += 1;
        luminanceSum += luminance;
        saturationSum += saturation;
        if (hue >= 15 && hue <= 55 && saturation >= 20 && saturation <= 120 && luminance > 120) {
          sepiaLikeCount += 1;
        }
      }
    }

    if (sampleCount === 0) {
      return null;
    }

    const meanLuminance = luminanceSum / sampleCount;
    let luminanceVarianceSum = 0;
    for (let index = 0; index < totalPixels; index += 1) {
      if (!opaqueMask[index]) {
        continue;
      }
      const delta = luminanceByPixel[index] - meanLuminance;
      luminanceVarianceSum += delta * delta;
    }
    const luminanceStdDev = Math.sqrt(luminanceVarianceSum / sampleCount);

    let edgeCount = 0;
    let edgeSampleCount = 0;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const idx = y * width + x;
        const left = idx - 1;
        const right = idx + 1;
        const up = idx - width;
        const down = idx + width;
        if (!opaqueMask[idx] || !opaqueMask[left] || !opaqueMask[right] || !opaqueMask[up] || !opaqueMask[down]) {
          continue;
        }

        edgeSampleCount += 1;
        const gx = Math.abs(luminanceByPixel[right] - luminanceByPixel[left]);
        const gy = Math.abs(luminanceByPixel[down] - luminanceByPixel[up]);
        if (gx + gy >= DESIGN_PRESENCE_EDGE_MAGNITUDE_THRESHOLD) {
          edgeCount += 1;
        }
      }
    }
    const edgeDensity = edgeSampleCount > 0 ? edgeCount / edgeSampleCount : 0;

    return {
      sampleCount,
      meanLuminance,
      meanSaturation: saturationSum / sampleCount,
      sepiaLikelihood: sepiaLikeCount / sampleCount,
      luminanceStdDev,
      edgeDensity
    };
  } catch {
    return null;
  }
}

type ToneComplianceResult = {
  passed: boolean;
  failures: string[];
};

function evaluateToneCompliance(tone: "light" | "vivid" | "dark" | "mono", stats: ImageToneStats): ToneComplianceResult {
  const failures: string[] = [];
  if (stats.meanLuminance < DARK_MONO_TONE_MIN_LUMINANCE) {
    failures.push("too-dark");
  }

  if (tone === "light") {
    if (stats.meanLuminance < LIGHT_TONE_MIN_LUMINANCE) {
      failures.push("light-luminance-low");
    }
    if (stats.sepiaLikelihood > LIGHT_TONE_MAX_SEPIA_LIKELIHOOD) {
      failures.push("light-sepia-too-high");
    }
    return { passed: failures.length === 0, failures };
  }

  if (tone === "vivid") {
    if (stats.meanSaturation < VIVID_TONE_MIN_SATURATION) {
      failures.push("vivid-saturation-low");
    }
    if (stats.meanLuminance < VIVID_TONE_MIN_LUMINANCE) {
      failures.push("vivid-luminance-low");
    }
    return { passed: failures.length === 0, failures };
  }

  if (tone === "dark") {
    if (stats.meanLuminance > DARK_TONE_MAX_LUMINANCE) {
      failures.push("dark-luminance-high");
    }
  } else {
    if (stats.meanSaturation > MONO_TONE_MAX_SATURATION) {
      failures.push("mono-saturation-high");
    }
    if (stats.meanLuminance > MONO_TONE_MAX_LUMINANCE) {
      failures.push("mono-luminance-high");
    }
  }

  if (stats.luminanceStdDev < DESIGN_PRESENCE_MIN_LUMINANCE_STD_DEV) {
    failures.push("design-presence-low-luminance-stddev");
  }
  if (stats.edgeDensity < DESIGN_PRESENCE_MIN_EDGE_DENSITY) {
    failures.push("design-presence-low-edge-density");
  }

  return { passed: failures.length === 0, failures };
}

function passesDesignPresence(stats: ImageToneStats | null): boolean {
  if (!stats) {
    return false;
  }
  return stats.luminanceStdDev >= DESIGN_PRESENCE_MIN_LUMINANCE_STD_DEV && stats.edgeDensity >= DESIGN_PRESENCE_MIN_EDGE_DENSITY;
}

function shouldCheckToneCompliance(tone: StyleToneKey | null): tone is "light" | "vivid" | "dark" | "mono" {
  return tone === "light" || tone === "vivid" || tone === "dark" || tone === "mono";
}

function toneOverrideRetryBoost(tone: "light" | "vivid" | "dark" | "mono"): string {
  if (tone === "light") {
    return LIGHT_TONE_OVERRIDE_RETRY_BOOST;
  }
  if (tone === "vivid") {
    return VIVID_TONE_OVERRIDE_RETRY_BOOST;
  }
  if (tone === "dark") {
    return DARK_TONE_OVERRIDE_RETRY_BOOST;
  }
  return `${MONO_TONE_OVERRIDE_RETRY_BOOST} ${DARK_TONE_OVERRIDE_RETRY_BOOST}`;
}
async function computeImageToneStatsFromUrl(url: string): Promise<ImageToneStats | null> {
  const source = url.trim();
  if (!source) {
    return null;
  }

  try {
    const response = await fetch(source);
    if (!response.ok) {
      return null;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    return computeImageToneStatsFromBuffer(bytes);
  } catch {
    return null;
  }
}

type TitleSafeBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type TitleSafeRegionScore = {
  sampleCount: number;
  edgeDensity: number;
  luminanceStdDev: number;
  edgeSimplicity: number;
  varianceModeration: number;
  score: number;
};

async function scoreTitleSafeRegion(imageUrl: string, titleSafeBox: TitleSafeBox): Promise<TitleSafeRegionScore | null> {
  const source = imageUrl.trim();
  if (!source) {
    return null;
  }

  try {
    const response = await fetch(source);
    if (!response.ok) {
      return null;
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const raster = await sharp(bytes, { failOn: "none" })
      .resize({
        width: TONE_STATS_SAMPLE_SIZE,
        height: TONE_STATS_SAMPLE_SIZE,
        fit: "fill"
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { data, info } = raster;
    const width = Math.max(1, info.width || TONE_STATS_SAMPLE_SIZE);
    const height = Math.max(1, info.height || TONE_STATS_SAMPLE_SIZE);
    const channels = Math.max(4, info.channels || 4);
    const leftRatio = clampNumber(titleSafeBox.left, 0, 0.95);
    const topRatio = clampNumber(titleSafeBox.top, 0, 0.95);
    const widthRatio = clampNumber(titleSafeBox.width, 0.05, 1);
    const heightRatio = clampNumber(titleSafeBox.height, 0.05, 1);
    const left = clampNumber(Math.round(width * leftRatio), 0, Math.max(0, width - 2));
    const top = clampNumber(Math.round(height * topRatio), 0, Math.max(0, height - 2));
    const regionWidth = clampNumber(Math.round(width * widthRatio), 2, Math.max(2, width - left));
    const regionHeight = clampNumber(Math.round(height * heightRatio), 2, Math.max(2, height - top));
    const right = clampNumber(left + regionWidth, left + 1, width);
    const bottom = clampNumber(top + regionHeight, top + 1, height);
    const regionPixelCount = Math.max(1, (right - left) * (bottom - top));
    const luminanceByPixel = new Float32Array(regionPixelCount);
    const opaqueMask = new Uint8Array(regionPixelCount);

    let sampleCount = 0;
    let luminanceSum = 0;
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const index = (y - top) * (right - left) + (x - left);
        const offset = (y * width + x) * channels;
        const alpha = data[offset + 3];
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        luminanceByPixel[index] = luminance;
        if (alpha <= 10) {
          continue;
        }
        opaqueMask[index] = 1;
        sampleCount += 1;
        luminanceSum += luminance;
      }
    }

    if (sampleCount <= 0) {
      return null;
    }

    const regionWidthPx = right - left;
    const regionHeightPx = bottom - top;
    const meanLuminance = luminanceSum / sampleCount;
    let varianceSum = 0;
    for (let index = 0; index < regionPixelCount; index += 1) {
      if (!opaqueMask[index]) {
        continue;
      }
      const delta = luminanceByPixel[index] - meanLuminance;
      varianceSum += delta * delta;
    }
    const luminanceStdDev = Math.sqrt(varianceSum / sampleCount);

    let edgeCount = 0;
    let edgeSampleCount = 0;
    for (let y = 1; y < regionHeightPx - 1; y += 1) {
      for (let x = 1; x < regionWidthPx - 1; x += 1) {
        const idx = y * regionWidthPx + x;
        const leftIdx = idx - 1;
        const rightIdx = idx + 1;
        const upIdx = idx - regionWidthPx;
        const downIdx = idx + regionWidthPx;
        if (!opaqueMask[idx] || !opaqueMask[leftIdx] || !opaqueMask[rightIdx] || !opaqueMask[upIdx] || !opaqueMask[downIdx]) {
          continue;
        }
        edgeSampleCount += 1;
        const gx = Math.abs(luminanceByPixel[rightIdx] - luminanceByPixel[leftIdx]);
        const gy = Math.abs(luminanceByPixel[downIdx] - luminanceByPixel[upIdx]);
        if (gx + gy >= DESIGN_PRESENCE_EDGE_MAGNITUDE_THRESHOLD) {
          edgeCount += 1;
        }
      }
    }

    const edgeDensity = edgeSampleCount > 0 ? edgeCount / edgeSampleCount : 0;
    const edgeSimplicity = 1 - clampNumber(edgeDensity / TITLE_SAFE_EDGE_SOFT_MAX, 0, 1);
    const varianceModeration =
      1 - clampNumber(Math.abs(luminanceStdDev - TITLE_SAFE_VARIANCE_TARGET) / TITLE_SAFE_VARIANCE_TOLERANCE, 0, 1);
    const score = clampNumber(edgeSimplicity * 0.68 + varianceModeration * 0.32, 0, 1);

    return {
      sampleCount,
      edgeDensity,
      luminanceStdDev,
      edgeSimplicity,
      varianceModeration,
      score
    };
  } catch {
    return null;
  }
}

type MidtoneRangeScore = {
  sampleCount: number;
  shadowClippedRatio: number;
  highlightClippedRatio: number;
  score: number;
};

type BackgroundHardFailStats = {
  edgeDensityFull: number;
  luminanceStdFull: number;
  edgeDensityNonTitle: number;
  passes: boolean;
};

async function computeBackgroundHardFailStatsFromBuffer(
  imageBuffer: Buffer,
  titleSafeBox: TitleSafeBox
): Promise<BackgroundHardFailStats | null> {
  try {
    const raster = await sharp(imageBuffer, { failOn: "none" })
      .resize({
        width: TONE_STATS_SAMPLE_SIZE,
        height: TONE_STATS_SAMPLE_SIZE,
        fit: "fill"
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { data, info } = raster;
    const width = Math.max(1, info.width || TONE_STATS_SAMPLE_SIZE);
    const height = Math.max(1, info.height || TONE_STATS_SAMPLE_SIZE);
    const channels = Math.max(4, info.channels || 4);
    const totalPixels = width * height;
    const luminanceByPixel = new Float32Array(totalPixels);
    const opaqueMask = new Uint8Array(totalPixels);

    const safeLeft = clampNumber(Math.round(width * clampNumber(titleSafeBox.left, 0, 0.95)), 0, Math.max(0, width - 1));
    const safeTop = clampNumber(Math.round(height * clampNumber(titleSafeBox.top, 0, 0.95)), 0, Math.max(0, height - 1));
    const safeWidth = clampNumber(Math.round(width * clampNumber(titleSafeBox.width, 0.05, 1)), 1, width);
    const safeHeight = clampNumber(Math.round(height * clampNumber(titleSafeBox.height, 0.05, 1)), 1, height);
    const safeRight = clampNumber(safeLeft + safeWidth, safeLeft + 1, width);
    const safeBottom = clampNumber(safeTop + safeHeight, safeTop + 1, height);

    let sampleCount = 0;
    let luminanceSum = 0;
    for (let index = 0; index < totalPixels; index += 1) {
      const offset = index * channels;
      const alpha = data[offset + 3];
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      luminanceByPixel[index] = luminance;
      if (alpha <= 10) {
        continue;
      }
      opaqueMask[index] = 1;
      sampleCount += 1;
      luminanceSum += luminance;
    }

    if (sampleCount <= 0) {
      return null;
    }

    const meanLuminance = luminanceSum / sampleCount;
    let varianceSum = 0;
    for (let index = 0; index < totalPixels; index += 1) {
      if (!opaqueMask[index]) {
        continue;
      }
      const delta = luminanceByPixel[index] - meanLuminance;
      varianceSum += delta * delta;
    }
    const luminanceStdFull = Math.sqrt(varianceSum / sampleCount);

    let fullEdgeCount = 0;
    let fullEdgeSamples = 0;
    let nonTitleEdgeCount = 0;
    let nonTitleEdgeSamples = 0;

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const idx = y * width + x;
        const leftIdx = idx - 1;
        const rightIdx = idx + 1;
        const upIdx = idx - width;
        const downIdx = idx + width;
        if (!opaqueMask[idx] || !opaqueMask[leftIdx] || !opaqueMask[rightIdx] || !opaqueMask[upIdx] || !opaqueMask[downIdx]) {
          continue;
        }

        const gx = Math.abs(luminanceByPixel[rightIdx] - luminanceByPixel[leftIdx]);
        const gy = Math.abs(luminanceByPixel[downIdx] - luminanceByPixel[upIdx]);
        const isEdge = gx + gy >= DESIGN_PRESENCE_EDGE_MAGNITUDE_THRESHOLD;
        fullEdgeSamples += 1;
        if (isEdge) {
          fullEdgeCount += 1;
        }

        const insideSafe = x >= safeLeft && x < safeRight && y >= safeTop && y < safeBottom;
        if (!insideSafe) {
          nonTitleEdgeSamples += 1;
          if (isEdge) {
            nonTitleEdgeCount += 1;
          }
        }
      }
    }

    const edgeDensityFull = fullEdgeSamples > 0 ? fullEdgeCount / fullEdgeSamples : 0;
    const edgeDensityNonTitle = nonTitleEdgeSamples > 0 ? nonTitleEdgeCount / nonTitleEdgeSamples : 0;
    const passes =
      (edgeDensityFull >= ROUND1_RERANK_MIN_EDGES_FULL && luminanceStdFull >= ROUND1_RERANK_MIN_STD_FULL) &&
      edgeDensityNonTitle >= ROUND1_RERANK_MIN_EDGES_NON_TITLE;

    return {
      edgeDensityFull,
      luminanceStdFull,
      edgeDensityNonTitle,
      passes
    };
  } catch {
    return null;
  }
}

async function scoreMidtoneRangeFromBuffer(imageBuffer: Buffer): Promise<MidtoneRangeScore | null> {
  try {
    const raster = await sharp(imageBuffer, { failOn: "none" })
      .resize({
        width: TONE_STATS_SAMPLE_SIZE,
        height: TONE_STATS_SAMPLE_SIZE,
        fit: "fill"
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { data, info } = raster;
    const width = Math.max(1, info.width || TONE_STATS_SAMPLE_SIZE);
    const height = Math.max(1, info.height || TONE_STATS_SAMPLE_SIZE);
    const channels = Math.max(4, info.channels || 4);
    const totalPixels = width * height;

    let sampleCount = 0;
    let shadowClippedCount = 0;
    let highlightClippedCount = 0;
    for (let index = 0; index < totalPixels; index += 1) {
      const offset = index * channels;
      const alpha = data[offset + 3];
      if (alpha <= 10) {
        continue;
      }
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sampleCount += 1;
      if (luminance <= 18) {
        shadowClippedCount += 1;
      }
      if (luminance >= 237) {
        highlightClippedCount += 1;
      }
    }

    if (sampleCount <= 0) {
      return null;
    }

    const shadowClippedRatio = shadowClippedCount / sampleCount;
    const highlightClippedRatio = highlightClippedCount / sampleCount;
    const crushedRatio = shadowClippedRatio + highlightClippedRatio;
    const score =
      1 -
      clampNumber(
        (crushedRatio - MIDTONE_CRUSHED_RATIO_FLOOR) / (MIDTONE_CRUSHED_RATIO_CEILING - MIDTONE_CRUSHED_RATIO_FLOOR),
        0,
        1
      );

    return {
      sampleCount,
      shadowClippedRatio,
      highlightClippedRatio,
      score
    };
  } catch {
    return null;
  }
}

type LockupFitCheck = {
  fitPass: boolean;
  insideTitleSafeWithMargin: boolean;
  notTooSmall: boolean;
  fittedWidth: number;
  fittedHeight: number;
  safeHeightRatio: number;
  safeCoverage: number;
  score: number;
};

function evaluateLockupFit(params: {
  lockupWidth: number;
  lockupHeight: number;
  shape: PreviewShape;
  canvasWidth: number;
  canvasHeight: number;
  marginRatio: number;
}): LockupFitCheck {
  const safeRatio = LOCKUP_SAFE_REGION_RATIOS[params.shape];
  const safeWidth = Math.max(1, Math.round(params.canvasWidth * safeRatio.width));
  const safeHeight = Math.max(1, Math.round(params.canvasHeight * safeRatio.height));
  const marginX = Math.max(1, Math.round(safeWidth * clampNumber(params.marginRatio, 0, 0.2)));
  const marginY = Math.max(1, Math.round(safeHeight * clampNumber(params.marginRatio, 0, 0.2)));
  const innerWidth = Math.max(1, safeWidth - marginX * 2);
  const innerHeight = Math.max(1, safeHeight - marginY * 2);
  const lockupWidth = Math.max(1, params.lockupWidth);
  const lockupHeight = Math.max(1, params.lockupHeight);
  const scale = Math.min(innerWidth / lockupWidth, innerHeight / lockupHeight);
  const fittedWidth = Math.max(1, Math.round(lockupWidth * scale));
  const fittedHeight = Math.max(1, Math.round(lockupHeight * scale));
  const insideTitleSafeWithMargin = fittedWidth <= innerWidth && fittedHeight <= innerHeight;
  const safeHeightRatio = fittedHeight / safeHeight;
  const notTooSmall = safeHeightRatio >= ROUND1_EXPLORATION_LOCKUP_MIN_HEIGHT_RATIO;
  const safeCoverage = (fittedWidth * fittedHeight) / Math.max(1, innerWidth * innerHeight);
  const heightTarget = 0.44;
  const coverageTarget = 0.52;
  const heightScore = 1 - clampNumber(Math.abs(safeHeightRatio - heightTarget) / 0.28, 0, 1);
  const coverageScore = 1 - clampNumber(Math.abs(safeCoverage - coverageTarget) / 0.44, 0, 1);
  const score = clampNumber(heightScore * 0.6 + coverageScore * 0.4, 0, 1);

  return {
    fitPass: insideTitleSafeWithMargin && notTooSmall,
    insideTitleSafeWithMargin,
    notTooSmall,
    fittedWidth,
    fittedHeight,
    safeHeightRatio,
    safeCoverage,
    score
  };
}

async function padLockupForSafeMargin(lockupPng: Buffer, marginRatio: number): Promise<Buffer> {
  const margin = clampNumber(marginRatio, 0, 0.2);
  if (margin <= 0) {
    return lockupPng;
  }

  const metadata = await sharp(lockupPng, { failOn: "none" }).metadata();
  const sourceWidth = Math.max(1, Math.round(metadata.width || 1));
  const sourceHeight = Math.max(1, Math.round(metadata.height || 1));
  const denom = Math.max(0.2, 1 - margin * 2);
  const padX = Math.max(1, Math.round((sourceWidth * margin) / denom));
  const padY = Math.max(1, Math.round((sourceHeight * margin) / denom));
  const canvasWidth = sourceWidth + padX * 2;
  const canvasHeight = sourceHeight + padY * 2;

  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([
      {
        input: lockupPng,
        left: padX,
        top: padY
      }
    ])
    .png()
    .toBuffer();
}

function pngBufferToDataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString("base64")}`;
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

type SafeAreaAnchor = "upper-left" | "upper-center";

function resolveSafeAreaAnchor(directionSpec?: PlannedDirectionSpec | null): SafeAreaAnchor {
  if (!directionSpec) {
    return "upper-left";
  }

  if (
    directionSpec.compositionType === "centered_stack" ||
    directionSpec.compositionType === "badge_emblem" ||
    directionSpec.compositionType === "monumental_overprint"
  ) {
    return "upper-center";
  }

  return "upper-left";
}

function describeLockupSafeArea(shape: PreviewShape, anchor: SafeAreaAnchor): string {
  const ratios = LOCKUP_SAFE_REGION_RATIOS[shape];
  const leftPct = Math.round(ratios.left * 100);
  const topPct = Math.round(ratios.top * 100);
  const widthPct = Math.round(ratios.width * 100);
  const heightPct = Math.round(ratios.height * 100);
  const rightPct = clampNumber(leftPct + widthPct, 0, 100);
  const bottomPct = clampNumber(topPct + heightPct, 0, 100);
  const anchorHint =
    anchor === "upper-center"
      ? "Prioritize the upper-center of this safe area for the cleanest negative space."
      : "Prioritize the upper-left of this safe area for the cleanest negative space.";

  return `${shape.toUpperCase()}: reserve lockup safe area at x ${leftPct}-${rightPct}% and y ${topPct}-${bottomPct}%. ${anchorHint} Keep this region clean, low texture, low contrast, no focal elements, no strong lines, no scanline/banding artifacts, no moire.`;
}

function buildLockupSafeAreaInstructions(directionSpec?: PlannedDirectionSpec | null): string {
  const anchor = resolveSafeAreaAnchor(directionSpec);
  const directionLine = directionSpec
    ? `Direction-aware lockup reservation: ${directionSpec.compositionType} should protect the ${anchor} lockup lane.`
    : "Direction-aware lockup reservation: default to upper-left lockup lane.";

  return [
    directionLine,
    describeLockupSafeArea("wide", anchor),
    describeLockupSafeArea("square", anchor),
    describeLockupSafeArea("tall", anchor)
  ].join(" ");
}

function describeTitleStageFocusBounds(shape: PreviewShape, placementHint: SafeAreaAnchor): string {
  const ratios = LOCKUP_SAFE_REGION_RATIOS[shape];
  const leftPct = Math.round(ratios.left * 100);
  const topPct = Math.round(ratios.top * 100);
  const widthPct = Math.round(ratios.width * 100);
  const heightPct = Math.round(ratios.height * 100);
  const rightPct = clampNumber(leftPct + widthPct, 0, 100);
  const bottomPct = clampNumber(topPct + heightPct, 0, 100);
  const placementNote =
    placementHint === "upper-center"
      ? "bias the cleanest negative space to the upper-center."
      : "bias the cleanest negative space to the upper-left.";
  return `${shape.toUpperCase()} composition support zone (planning coordinates only, never a drawn frame): x ${leftPct}-${rightPct}% and y ${topPct}-${bottomPct}%; ${placementNote}`;
}

function describeFormatStagePlacement(shape: PreviewShape, placementHint: SafeAreaAnchor): string {
  const stageArea = describeTitleStageFocusBounds(shape, placementHint);
  if (shape === "wide") {
    return `WIDE guidance: ${stageArea} Build this zone through negative-space gradients, lower texture density, and gentle tonal easing; let arcs, diagonals, or cropped forms taper toward it without drawing borders.`;
  }
  if (shape === "square") {
    return `SQUARE guidance: ${stageArea} Keep the stage compact in the top third using soft gradients, calmer texture, and cropped form rhythm; avoid framing that depends on wide side margins.`;
  }
  return `TALL guidance: ${stageArea} Keep stage in the upper third with vertical breathing room, tonal texture shifts, and shape-led framing; avoid long horizontal framing that crops awkwardly.`;
}

function buildTitleStageInstructions(params: {
  format: PreviewShape;
  placementHint: SafeAreaAnchor;
  mode: ProjectBrandMode;
}): string {
  const formatOrder = [params.format, ...PREVIEW_SHAPES].filter(
    (shape, index, items): shape is PreviewShape => items.indexOf(shape) === index
  );
  const modeLine =
    params.mode === "brand"
      ? "Brand mode discipline: keep the stage minimal, controlled, and palette-safe while preserving clear hierarchy."
      : "Fresh mode discipline: expressive motifs are allowed outside the stage, but keep stage calm and clean.";

  return [
    "Title-stage objective: create an integrated stage that feels native to the artwork, never a separate panel.",
    "Do NOT draw any visible rectangle/frame to indicate the stage.",
    "Do NOT add faint rectangles, frames, guide boxes, UI overlays, wireframes, or thin outline borders anywhere (even subtly).",
    "Do NOT use obvious spotlight cones, rays, or beam effects to fake stage lighting.",
    ...formatOrder.map((shape) => describeFormatStagePlacement(shape, params.placementHint)),
    "Build the stage through composition: negative-space gradients, lower texture density, lower local contrast, controlled tonal transitions, and shape-led framing via arcs/diagonals/cropped forms.",
    "Use subtle surrounding composition to point toward the lockup area; composition should support the lockup zone rather than mark it with a container.",
    "Keep a clear foreground/background hierarchy with the title stage as the quietest area, and make it feel native to the artwork.",
    "Stage region should be calm/low-contrast, but NOT blank; use tasteful texture/tonal shift only.",
    modeLine,
    "The stage must look like part of the artwork, not an overlay or detached panel.",
    "FORBID: thin outline rectangles, wireframe frames, guide boxes, overlay borders, corner brackets, UI-like frames, grids, safe-area outlines, semi-transparent rectangles, bounding boxes.",
    "Soft framing only; never a literal panel or boxed region.",
    "Forbid tight linear pinstripes, scanline banding, or moire patterns.",
    "Forbid busy high-contrast texture in the stage region.",
    "The stage must look intentional in all three aspect ratios, not only widescreen.",
    "Do not place key motif elements inside the safe region."
  ].join(" ");
}

type LockupStyleMode = "engraved_stamp" | "modern_editorial";

const LOCKUP_DISALLOWED_DECORATIONS =
  "random thin lines, corner brackets, label pills, text boxes or frames, white outline boxes, decorative underlines that are not part of one cohesive typographic system";
const SERIES_MARK_REQUEST_PATTERN = /\b(mark|logo|icon|emblem|brand\s*mark|brandmark)\b/i;
const SERIES_MARK_NEGATION_PATTERN =
  /\b(no|avoid|without|exclude|skip)\s+(?:a\s+)?(?:series\s+)?(?:mark|logo|icon|emblem|brand\s*mark|brandmark)s?\b/i;

function clampNumber(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function summarizeReferenceTags(references: ReferenceLibraryItem[]): string {
  const tags = references
    .flatMap((reference) => reference.styleTags)
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(tags)].slice(0, 10);
  return unique.join(", ");
}

function resolveLockupStyleMode(params: {
  directionSpec?: PlannedDirectionSpec | null;
  styleFamily: StyleFamily;
  lockupPresetId?: string | null;
  references: ReferenceLibraryItem[];
  brandMode?: ProjectBrandMode;
  typographyDirection?: "match_site" | "graceled_defaults" | null;
}): LockupStyleMode {
  const tagText = summarizeReferenceTags(params.references);
  const styleFamily = params.styleFamily.toLowerCase();
  const preset = (params.lockupPresetId || "").toLowerCase();
  const directionText = [
    params.directionSpec?.styleFamily || "",
    params.directionSpec?.laneFamily || "",
    params.directionSpec?.compositionType || "",
    params.directionSpec?.backgroundMode || "",
    params.directionSpec?.lanePrompt || ""
  ]
    .join(" ")
    .toLowerCase();

  const engravedSignal =
    styleFamily === "illustrated-heritage" ||
    /engrav|etch|stamp|seal|badge|inscript|vintage|heritage|line-art/.test(`${tagText} ${preset} ${directionText}`);

  if (params.brandMode === "brand" && params.typographyDirection === "match_site") {
    return "modern_editorial";
  }

  return engravedSignal ? "engraved_stamp" : "modern_editorial";
}

function chooseLockupIntegrationMode(styleMode: LockupStyleMode): LockupIntegrationMode {
  return styleMode === "engraved_stamp" ? "stamp" : "clean";
}

function isLockupLayoutArchetype(value: unknown): value is LockupLayoutArchetype {
  return typeof value === "string" && LOCKUP_LAYOUT_ARCHETYPE_SET.has(value);
}

function isDirectionLaneFamily(value: unknown): value is DirectionStyleFamily {
  return typeof value === "string" && DIRECTION_LANE_FAMILY_SET.has(value);
}

function hashForDeterministicOrdering(seed: string, value: string): string {
  return createHash("sha256")
    .update(`${seed}:${value}`)
    .digest("hex");
}

function deterministicOrder<T extends string>(items: readonly T[], seed: string): T[] {
  return [...items].sort((a, b) => hashForDeterministicOrdering(seed, a).localeCompare(hashForDeterministicOrdering(seed, b)));
}

function referencesSignalVintageDemand(references: ReferenceLibraryItem[]): boolean {
  return references.some((reference) => reference.styleTags.some((tag) => VINTAGE_REFERENCE_TAG_PATTERN.test(tag)));
}

function defaultLockupLayoutForStyleMode(styleMode: LockupStyleMode): LockupLayoutArchetype {
  return styleMode === "engraved_stamp" ? "seal_arc" : "editorial_stack";
}

function lockupLayoutInstructionForArchetype(archetype: LockupLayoutArchetype): string {
  if (archetype === "seal_arc") {
    return "seal_arc: arched title, subtitle on a straight baseline below, crest-friendly geometry, high-contrast single-ink behavior, and no faint emboss/deboss fade.";
  }
  if (archetype === "editorial_stack") {
    return "editorial_stack: tight hierarchy, assertive kerning decisions, subtitle with disciplined tracking, subtle divider rules allowed, and no boxes.";
  }
  if (archetype === "banner_strip") {
    return "banner_strip: dominant horizontal title strip logic with a secondary subtitle lane, no pill labels, no pasted banner stickers, and no boxed UI blocks.";
  }
  if (archetype === "split_title") {
    return "split_title: intentional two-part title break with controlled contrast between lines/weights and a clearly subordinate subtitle.";
  }
  if (archetype === "framed_type") {
    return "framed_type: use only a subtle typographic rule system for structure; never use a boxed label, panel, or outlined container around text.";
  }
  if (archetype === "monogram_mark") {
    return "monogram_mark: small supporting monogram or emblem integrated with title rhythm, never overpowering the title/subtitle hierarchy.";
  }
  if (archetype === "vertical_spine") {
    return "vertical_spine: vertical spine/rail logic that stays legible when scaled or cropped, especially for tall placements.";
  }
  if (archetype === "centered_classic") {
    return "centered_classic: centered formal hierarchy with balanced vertical spacing and restrained ornament discipline.";
  }
  if (archetype === "stepped_baseline") {
    return "stepped_baseline: staggered baseline progression for title lines with measured spacing and a stable subtitle anchor.";
  }
  return "offset_kicker: primary title anchored with a smaller offset kicker/subtitle accent that sharpens hierarchy without decorative clutter.";
}

function lockupTypographicRecipeForArchetype(archetype: LockupLayoutArchetype): LockupTypographicRecipe {
  return LOCKUP_TYPOGRAPHIC_RECIPE_BY_LAYOUT[archetype];
}

function lockupTypographicRecipeInstructionForArchetype(archetype: LockupLayoutArchetype): string {
  const recipe = lockupTypographicRecipeForArchetype(archetype);
  return `Typographic recipe (HARD) ${recipe.label}: casing title=${recipe.titleCase}, subtitle=${recipe.subtitleCase}; max title lines=${recipe.maxTitleLines}; forced line breaks=${recipe.forcedLineBreakRule}; tracking title=${recipe.titleTrackingRange.min.toFixed(
    2
  )}..${recipe.titleTrackingRange.max.toFixed(2)}em, subtitle=${recipe.subtitleTrackingRange.min.toFixed(2)}..${recipe.subtitleTrackingRange.max.toFixed(
    2
  )}em; optical alignment=${recipe.opticalAlignment.alignment} with safe margin ${recipe.opticalAlignment.safeMarginPct.toFixed(
    3
  )} and max title width ${recipe.opticalAlignment.maxTitleWidthPct.toFixed(3)}; subtitle width target=${recipe.subtitleWidthRatio.toFixed(
    2
  )}x title width; divider usage=${recipe.dividerRule}.`;
}

function chooseDistinctLockupLayouts(params: {
  seed: string;
  styleModes: LockupStyleMode[];
  exclude?: LockupLayoutArchetype[];
  recentRecipeRanks?: Map<string, number>;
}): [LockupLayoutArchetype, LockupLayoutArchetype, LockupLayoutArchetype] {
  const excludeSet = new Set(params.exclude || []);
  const filteredPool = deterministicOrder(LOCKUP_LAYOUT_ARCHETYPES, `${params.seed}:pool`).filter((item) => !excludeSet.has(item));
  const basePool = filteredPool.length > 0 ? filteredPool : deterministicOrder(LOCKUP_LAYOUT_ARCHETYPES, `${params.seed}:fallback`);
  const used = new Set<LockupLayoutArchetype>();
  const usedRecipeIds = new Set<string>();
  const recentRecipeRanks = params.recentRecipeRanks || new Map<string, number>();

  const recipeRecencyScore = (recipeId: string): number => {
    const rank = recentRecipeRanks.get(recipeId);
    if (rank === undefined) {
      return 4;
    }
    return Math.min(0, -8 + rank);
  };

  const picks = Array.from({ length: ROUND_OPTION_COUNT }, (_, index) => {
    const styleMode = params.styleModes[index] || "modern_editorial";
    const preferredSet = new Set(LOCKUP_LAYOUT_PREFERRED_BY_STYLE_MODE[styleMode]);
    const rankedCandidates = basePool
      .filter((item) => !used.has(item))
      .map((layout) => {
        const recipeId = lockupTypographicRecipeForArchetype(layout).id;
        let score = 0;
        score += preferredSet.has(layout) ? 9 : 2;
        score += usedRecipeIds.has(recipeId) ? -24 : 5;
        score += recipeRecencyScore(recipeId);
        score += parseInt(hashForDeterministicOrdering(`${params.seed}:${styleMode}:${index}:layout-score`, layout).slice(0, 8), 16) / 0xffffffff;
        return {
          layout,
          recipeId,
          score
        };
      })
      .sort((a, b) => b.score - a.score);
    const chosen =
      rankedCandidates[0]?.layout ||
      basePool.find((item) => !used.has(item)) ||
      defaultLockupLayoutForStyleMode(styleMode);
    used.add(chosen);
    usedRecipeIds.add(lockupTypographicRecipeForArchetype(chosen).id);
    return chosen;
  });

  return [
    picks[0] || defaultLockupLayoutForStyleMode(params.styleModes[0] || "modern_editorial"),
    picks[1] || defaultLockupLayoutForStyleMode(params.styleModes[1] || "modern_editorial"),
    picks[2] || defaultLockupLayoutForStyleMode(params.styleModes[2] || "modern_editorial")
  ];
}

function resolvePlannedLockupLayouts(params: {
  seed: string;
  directionPlan: PlannedDirectionSpec[];
  styleFamilies: readonly StyleFamily[];
  lockupPresetIds: readonly (string | null | undefined)[];
  referencesByOption: readonly ReferenceLibraryItem[][];
  keepLayout?: LockupLayoutArchetype | null;
  forceNewLayout?: boolean;
  forceDistinctRecipes?: boolean;
  recentRecipeIds?: readonly string[];
  brandMode?: ProjectBrandMode;
  typographyDirection?: "match_site" | "graceled_defaults" | null;
  round?: number;
  hasDesignNotes?: boolean;
}): [LockupLayoutArchetype, LockupLayoutArchetype, LockupLayoutArchetype] {
  if (params.keepLayout && !params.forceNewLayout) {
    return [params.keepLayout, params.keepLayout, params.keepLayout];
  }

  const styleModes = Array.from({ length: ROUND_OPTION_COUNT }, (_, index) => {
    const explicitStyleFamily = (params.styleFamilies[index] || params.styleFamilies[0] || null) as StyleFamily | null;
    const resolvedStyleFamily = (explicitStyleFamily || "clean-min") as StyleFamily;
    const usedCleanMinFallback = resolvedStyleFamily === "clean-min" && !explicitStyleFamily;
    console.warn("[STYLEFAMILY FALLBACK]", {
      resolvedStyleFamily,
      usedCleanMinFallback,
      optionIndex: index,
      hasDesignNotes: params.hasDesignNotes ?? null,
      round: params.round ?? null
    });

    return resolveLockupStyleMode({
      directionSpec: params.directionPlan[index] || null,
      styleFamily: resolvedStyleFamily,
      lockupPresetId: params.lockupPresetIds[index] || null,
      references: params.referencesByOption[index] || [],
      brandMode: params.brandMode,
      typographyDirection: params.typographyDirection
    });
  });

  const recentRecipeRanks = new Map(
    (params.recentRecipeIds || [])
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .map((recipeId, index) => [recipeId, index] as const)
  );

  const chosenLayouts = chooseDistinctLockupLayouts({
    seed: params.seed,
    styleModes,
    exclude: params.forceNewLayout && params.keepLayout ? [params.keepLayout] : undefined,
    recentRecipeRanks
  });

  if (!params.forceDistinctRecipes) {
    return chosenLayouts;
  }

  const recipeIds = chosenLayouts.map((layout) => lockupTypographicRecipeForArchetype(layout).id);
  if (new Set(recipeIds).size >= ROUND_OPTION_COUNT) {
    return chosenLayouts;
  }

  return chooseDistinctLockupLayouts({
    seed: `${params.seed}:distinct-recipes`,
    styleModes,
    exclude: params.forceNewLayout && params.keepLayout ? [params.keepLayout] : undefined,
    recentRecipeRanks
  });
}

const STYLE_FAMILY_LOCKUP_LAYOUT_BIAS: Partial<Record<StyleFamilyKey, readonly LockupLayoutArchetype[]>> = {
  modern_geometric_blocks: ["editorial_stack", "split_title", "framed_type", "offset_kicker"],
  abstract_organic_papercut: ["centered_classic", "editorial_stack", "stepped_baseline"],
  editorial_grid_minimal: ["editorial_stack", "split_title", "vertical_spine", "offset_kicker"],
  typographic_only_statement: ["editorial_stack", "split_title", "stepped_baseline", "vertical_spine"],
  monoline_icon_system: ["monogram_mark", "editorial_stack", "centered_classic", "banner_strip"],
  blueprint_diagram: ["vertical_spine", "framed_type", "editorial_stack", "monogram_mark"],
  light_gradient_stage: ["editorial_stack", "split_title", "offset_kicker"],
  engraved_heritage: ["seal_arc", "centered_classic", "monogram_mark", "banner_strip"],
  emblem_seal_system: ["monogram_mark", "seal_arc", "centered_classic", "banner_strip"]
};

const PLAYFUL_STYLE_FAMILY_KEYS = new Set<StyleFamilyKey>([
  "playful_neon_pool",
  "comic_storyboard",
  "bubbly_3d_clay",
  "sticker_pack_pop",
  "paper_cut_collage_playful"
]);

function resolveDirectionStyleFamily(directionSpec?: PlannedDirectionSpec | null): {
  key: StyleFamilyKey;
  bucket: StyleBucketKey;
  bucketRules: string;
  tone: StyleToneKey;
  medium: StyleMediumKey;
  toneRules: string;
  mediumRules: string;
  name: string;
  backgroundRules: string[];
  lockupRules: string[];
  forbids: string[];
} | null {
  const styleFamily = directionSpec?.styleFamily;
  if (!isStyleFamilyKey(styleFamily)) {
    return null;
  }
  const family = STYLE_FAMILY_BANK[styleFamily];
  return {
    key: styleFamily,
    bucket: family.bucket,
    bucketRules: family.bucketRules,
    tone: family.tone,
    medium: family.medium,
    toneRules: family.toneRules,
    mediumRules: family.mediumRules,
    name: family.name,
    backgroundRules: family.backgroundRules,
    lockupRules: family.lockupRules,
    forbids: family.forbids
  };
}

function resolveDirectionStyleFields(directionSpec?: PlannedDirectionSpec | null): {
  styleFamily: StyleFamilyKey | null;
  styleBucket: StyleBucketKey | null;
  styleTone: StyleToneKey | null;
  styleMedium: StyleMediumKey | null;
  explorationSetKey: string | null;
  explorationLaneKey: string | null;
} {
  const styleFamily = isStyleFamilyKey(directionSpec?.styleFamily) ? directionSpec.styleFamily : null;
  const familyRecord = styleFamily ? STYLE_FAMILY_BANK[styleFamily] : null;
  const styleBucket = isStyleBucketKey(directionSpec?.styleBucket)
    ? directionSpec.styleBucket
    : familyRecord
      ? familyRecord.bucket
      : null;
  const styleTone = isStyleToneKey(directionSpec?.styleTone)
    ? directionSpec.styleTone
    : familyRecord
      ? familyRecord.tone
      : null;
  const styleMedium = isStyleMediumKey(directionSpec?.styleMedium)
    ? directionSpec.styleMedium
    : familyRecord
      ? familyRecord.medium
      : null;
  const explorationSetKey =
    typeof directionSpec?.explorationSetKey === "string" && directionSpec.explorationSetKey.trim()
      ? directionSpec.explorationSetKey.trim()
      : null;
  const explorationLaneKey =
    typeof directionSpec?.explorationLaneKey === "string" && directionSpec.explorationLaneKey.trim()
      ? directionSpec.explorationLaneKey.trim()
      : null;

  return {
    styleFamily,
    styleBucket,
    styleTone,
    styleMedium,
    explorationSetKey,
    explorationLaneKey
  };
}

function applyFallbackStyleFamilyToDirectionSpec(params: {
  directionSpec?: PlannedDirectionSpec | null;
  styleFamily: StyleFamilyKey;
  explorationSetKey?: string;
  explorationLaneKey?: string;
}): PlannedDirectionSpec | null {
  if (!params.directionSpec) {
    return null;
  }

  const record = STYLE_FAMILY_BANK[params.styleFamily];
  const nextDirectionSpec: PlannedDirectionSpec = {
    ...params.directionSpec,
    styleFamily: params.styleFamily,
    styleBucket: record.bucket,
    styleTone: record.tone,
    styleMedium: record.medium
  };
  if (params.explorationSetKey) {
    nextDirectionSpec.explorationSetKey = params.explorationSetKey;
  }
  if (params.explorationLaneKey) {
    nextDirectionSpec.explorationLaneKey = params.explorationLaneKey;
  }
  return nextDirectionSpec;
}

function buildLockupGenerationPrompt(params: {
  title: string;
  subtitle: string;
  styleMode: LockupStyleMode;
  lockupLayout: LockupLayoutArchetype;
  directionSpec?: PlannedDirectionSpec | null;
  references: ReferenceLibraryItem[];
  bibleCreativeBrief?: BibleCreativeBrief | null;
  wantsSeriesMark?: boolean;
  brandMode?: ProjectBrandMode;
  typographyDirection?: "match_site" | "graceled_defaults" | null;
  optionalMarkAccentHexes?: string[];
}): string {
  const subtitleLine = params.subtitle
    ? `Series subtitle (must be secondary): ${truncateForPrompt(params.subtitle, 140)}`
    : "Series subtitle: none (render only the title).";
  const styleFamily = resolveDirectionStyleFamily(params.directionSpec);
  const directionLine = params.directionSpec
    ? `Direction context: ${params.directionSpec.styleFamily || "unassigned"} / ${params.directionSpec.laneFamily} / ${
        params.directionSpec.compositionType
      } / ${params.directionSpec.backgroundMode}.`
    : "";
  const hardStyleConstraintLine = styleFamily
    ? `HARD STYLE CONSTRAINT: Bucket = ${styleFamily.bucket}. Follow bucket rules strictly.`
    : "";
  const bucketRulesLine = styleFamily ? `Bucket rules: ${styleFamily.bucketRules}` : "";
  const hardToneConstraintLine = styleFamily ? `HARD STYLE CONSTRAINT: Tone = ${styleFamily.tone}.` : "";
  const toneRulesLine = styleFamily ? `Tone rules: ${styleFamily.toneRules}` : "";
  const hardMediumConstraintLine = styleFamily ? `HARD STYLE CONSTRAINT: Medium = ${styleFamily.medium}.` : "";
  const mediumRulesLine = styleFamily ? `Medium rules: ${styleFamily.mediumRules}` : "";
  const styleFamilyLockupRulesLine = styleFamily
    ? `Style family: ${styleFamily.name}. Follow these rules strongly: ${styleFamily.lockupRules.join(" ")}`
    : "";
  const styleFamilyForbidsLine = styleFamily ? `Style family forbids: ${styleFamily.forbids.join("; ")}.` : "";
  const compatibleLayouts = styleFamily ? STYLE_FAMILY_LOCKUP_LAYOUT_BIAS[styleFamily.key] : null;
  const styleFamilyLayoutBiasLine =
    styleFamily && compatibleLayouts && !compatibleLayouts.includes(params.lockupLayout)
      ? `Style family/layout bias note: keep ${params.lockupLayout} authoritative, but use ${styleFamily.name} detailing with restraint because this family usually fits ${compatibleLayouts.join(
          ", "
        )}.`
      : "";
  const referenceTags = summarizeReferenceTags(params.references);
  const referenceLine = referenceTags
    ? `Style reference tags: ${referenceTags}.`
    : "";
  const variationTemplate =
    typeof params.directionSpec?.variationTemplateKey === "string" && params.directionSpec.variationTemplateKey.trim()
      ? getRound1VariationTemplateByKey(params.directionSpec.variationTemplateKey)
      : null;
  const variationTemplateLine = variationTemplate
    ? `Variation template (${variationTemplate.key}): ${variationTemplate.lockupLayoutInstruction}`
    : "";
  const referenceAnchorContextLine = params.directionSpec?.referenceId
    ? `Reference anchor: ${params.directionSpec.referenceId} (${params.directionSpec.referenceCluster || "other"}, ${
        params.directionSpec.referenceTier || "unknown"
      }).`
    : "";
  const referenceAnchorDirectiveLine = params.directionSpec?.referenceId
    ? "REFERENCE ANCHOR: match palette logic, texture, typographic energy, composition style."
    : "";
  const originalityRuleLine = params.directionSpec?.referenceId
    ? "ORIGINALITY RULE: do NOT copy the reference layout; do NOT reuse the same motif; recomposition required."
    : "";
  const motifRecompositionLine = params.directionSpec?.referenceId
    ? "Use the sermon motif/themes (from our motif system) to create a new focal element."
    : "";
  const referenceLockupLayoutFamilyLine = params.directionSpec?.lockupLayoutFamily
    ? `Reference cluster lockup family: ${params.directionSpec.lockupLayoutFamily}.`
    : "";
  const referenceToneMediumLine =
    params.directionSpec?.referenceToneHint || params.directionSpec?.referenceMediumHint
      ? `Reference cluster style map: tone=${params.directionSpec?.referenceToneHint || "auto"}, medium=${
          params.directionSpec?.referenceMediumHint || "auto"
        }.`
      : "";
  const styleAuthorityOverrideLine =
    "If any style refs conflict with bucket/family/tone/medium rules, IGNORE the refs and follow bucket/family/tone/medium.";
  const styleSpecificLine =
    params.styleMode === "engraved_stamp"
      ? "Style mode: engraved/stamped treatment. Mimic engraved, stamped, debossed, or etched print behavior with tactile ink-like edges. Use a one-ink print look at high opacity (85-100%). Do not use faint emboss/deboss effects where title/subtitle disappear."
      : "Style mode: abstract/modern/geometric treatment. Use modern editorial typography and avoid faux scripts.";
  const vintageDemand = referencesSignalVintageDemand(params.references);
  const styleModeLayoutBiasLine =
    params.styleMode === "engraved_stamp"
      ? "Style/archetype pairing bias: engraved_stamp should commonly land like seal_arc or similarly crest-disciplined structure."
      : vintageDemand
        ? "Modern style mode with heritage signals from references: keep modern editorial structure first, and only borrow restrained vintage cues where the references clearly justify it."
        : "Modern style mode bias: favor editorial_stack or split_title pacing and avoid faux vintage cues when references do not demand them.";
  const archetypeLine = `Lockup layout archetype: ${params.lockupLayout}. Follow this layout strongly.`;
  const archetypeInstructionLine = lockupLayoutInstructionForArchetype(params.lockupLayout);
  const typographicRecipeLine = lockupTypographicRecipeInstructionForArchetype(params.lockupLayout);
  // Bible brief motifs/markIdeas provide symbolic lockup accents without introducing extra copy.
  const motifsLine =
    params.bibleCreativeBrief && params.bibleCreativeBrief.motifs.length > 0
      ? `Motif cues (symbolic): ${params.bibleCreativeBrief.motifs.slice(0, 6).join(", ")}.`
      : "";
  const typographyMoodLine =
    params.bibleCreativeBrief && params.bibleCreativeBrief.typographyMood.length > 0
      ? `Typography mood: ${params.bibleCreativeBrief.typographyMood.join(", ")}.`
      : "";
  const markIdeasLine =
    params.wantsSeriesMark && params.bibleCreativeBrief && params.bibleCreativeBrief.markIdeas.length > 0
      ? `Series mark ideas (choose one): ${params.bibleCreativeBrief.markIdeas.slice(0, 4).join(" | ")}.`
      : "";
  const markIntentLine = params.wantsSeriesMark
    ? "Series mark requested for this direction: include one small reusable secondary emblem derived from motifs. Keep it single-color, monoline or geometric, clearly secondary, and never add extra words."
    : "Do not create a standalone series mark for this option; keep any ornament secondary to the title lockup.";
  const brandTypographyLine =
    params.brandMode === "brand" && params.typographyDirection === "match_site"
      ? "Brand typography directive (HARD): match_site means modern editorial type, clean hierarchy, disciplined spacing, and no decorative scripts."
      : params.brandMode === "brand" && params.typographyDirection === "graceled_defaults"
        ? "Brand typography directive (HARD): graceled_defaults means clean, contemporary church typography with disciplined hierarchy and no decorative scripts."
        : "";
  const brandInkContrastLine =
    params.brandMode === "brand"
      ? "Brand lockup ink/contrast behavior: prefer high-contrast single-ink readability (dark ink on light zones or light ink on dark zones), never low-opacity or muddy contrast."
      : "";
  const optionalMarkAccentLine =
    params.brandMode === "brand" && (params.optionalMarkAccentHexes || []).length > 0
      ? `Optional mark accents may use brand palette sparingly: ${(params.optionalMarkAccentHexes || []).join(", ")}. Do not force the full lockup palette to match brand colors.`
      : "";
  const titleStageLockupLine = params.directionSpec?.wantsTitleStage
    ? "Assume the background will provide a clean title stage; do not add panels/frames behind the text."
    : "";

  return [
    "Generate ONLY the SERIES TITLE and optional SERIES SUBTITLE as a crafted typographic lockup.",
    `Series title (required): ${truncateForPrompt(params.title, 140)}`,
    subtitleLine,
    directionLine,
    brandTypographyLine,
    brandInkContrastLine,
    optionalMarkAccentLine,
    hardStyleConstraintLine,
    bucketRulesLine,
    hardToneConstraintLine,
    toneRulesLine,
    hardMediumConstraintLine,
    mediumRulesLine,
    styleFamilyLockupRulesLine,
    styleFamilyForbidsLine,
    styleFamilyLayoutBiasLine,
    styleAuthorityOverrideLine,
    referenceAnchorContextLine,
    referenceAnchorDirectiveLine,
    originalityRuleLine,
    motifRecompositionLine,
    referenceLockupLayoutFamilyLine,
    referenceToneMediumLine,
    variationTemplateLine,
    referenceLine,
    styleSpecificLine,
    archetypeLine,
    archetypeInstructionLine,
    typographicRecipeLine,
    styleModeLayoutBiasLine,
    motifsLine,
    typographyMoodLine,
    markIdeasLine,
    markIntentLine,
    titleStageLockupLine,
    "Output must be a transparent PNG with alpha. No solid background panels or opaque blocks.",
    "No border boxes, no frames, no white outline boxes, and no UI-like labels.",
    "No extra words, no scripture text, no logos, and no watermarks.",
    "Lockup MUST be clearly readable at a glance; do not render at low opacity.",
    "Typography must feel designed: intentional hierarchy, disciplined kerning/tracking, clean alignment, and subtle texture only when it matches the background style.",
    "Optional emblem or mark is allowed only when it clearly supports the theme, stays small, and remains secondary to the title.",
    "Subtitle must support the title: smaller scale, calmer weight, and harmonious style.",
    "Maintain legibility at small sizes and preserve clean edge quality.",
    `Explicitly ban: ${LOCKUP_DISALLOWED_DECORATIONS}.`
  ]
    .filter(Boolean)
    .join("\n");
}

function applyLockupRecipeGuardrails(params: {
  lockupRecipe: LockupRecipe;
  styleMode: LockupStyleMode;
  lockupLayout: LockupLayoutArchetype;
}): LockupRecipe {
  const source = params.lockupRecipe;
  const modernMode = params.styleMode === "modern_editorial";
  const typographicRecipe = lockupTypographicRecipeForArchetype(params.lockupLayout);

  const recipeTreatment =
    typographicRecipe.maxTitleLines <= 1
      ? "singleline"
      : typographicRecipe.maxTitleLines === 2
        ? typographicRecipe.titleTreatment === "singleline"
          ? "split"
          : typographicRecipe.titleTreatment
        : typographicRecipe.titleTreatment === "singleline"
          ? "stacked"
          : typographicRecipe.titleTreatment;
  const titleTreatment = recipeTreatment === "badge" && modernMode ? "split" : recipeTreatment;

  let ornament: NonNullable<LockupRecipe["ornament"]>;
  if (typographicRecipe.dividerRule === "none") {
    ornament = {
      kind: "none",
      weight: source.ornament?.weight || "med"
    };
  } else if (typographicRecipe.dividerRule === "required") {
    ornament = {
      kind: "rule_dot",
      weight: source.ornament?.weight || "thin"
    };
  } else if (modernMode) {
    ornament = {
      kind: "none",
      weight: source.ornament?.weight || "med"
    };
  } else if (source.ornament?.kind === "frame" || source.ornament?.kind === "rule_dot") {
    ornament = {
      kind: "grain",
      weight: source.ornament?.weight || "thin"
    };
  } else if (source.ornament) {
    ornament = source.ornament;
  } else {
    ornament = {
      kind: "grain",
      weight: "thin"
    };
  }

  const trackingMin = modernMode
    ? clampNumber(Math.max(-0.05, typographicRecipe.titleTrackingRange.min), -0.05, 0.08)
    : clampNumber(Math.max(0.01, typographicRecipe.titleTrackingRange.min), 0.01, 0.08);
  const trackingMax = modernMode
    ? clampNumber(Math.min(0.08, typographicRecipe.titleTrackingRange.max), trackingMin, 0.08)
    : clampNumber(Math.min(0.08, typographicRecipe.titleTrackingRange.max), trackingMin, 0.08);
  const recipeCase = modernMode && typographicRecipe.titleCase === "title_case" ? "upper" : typographicRecipe.titleCase;
  const subtitleScaleTarget = clampNumber(typographicRecipe.subtitleWidthRatio * 0.9, 0.42, 0.62);

  return {
    ...source,
    layoutIntent: modernMode
      ? source.layoutIntent === "classic_serif" || source.layoutIntent === "handmade_organic"
        ? "editorial"
        : source.layoutIntent
      : source.layoutIntent === "bold_modern" || source.layoutIntent === "minimal_clean"
        ? "classic_serif"
        : source.layoutIntent,
    titleTreatment,
    alignment: typographicRecipe.opticalAlignment.alignment,
    placement: {
      ...source.placement,
      safeMarginPct: clampNumber(typographicRecipe.opticalAlignment.safeMarginPct, 0.04, 0.12),
      maxTitleWidthPct: clampNumber(typographicRecipe.opticalAlignment.maxTitleWidthPct, 0.35, 0.75)
    },
    hierarchy: {
      ...source.hierarchy,
      subtitleScale: clampNumber((source.hierarchy.subtitleScale + subtitleScaleTarget) / 2, 0.42, 0.62),
      tracking: clampNumber(source.hierarchy.tracking, trackingMin, trackingMax),
      case: recipeCase
    },
    ornament
  };
}

type LockupSvgTextValidation = {
  valid: boolean;
  expected: string[];
  extracted: string[];
  unexpected: string[];
  missing: string[];
  titleOccurrences: number;
  subtitleOccurrences: number;
  reasons: string[];
};

function decodeXmlEntity(entity: string): string {
  const normalized = entity.toLowerCase();
  if (normalized === "&amp;") {
    return "&";
  }
  if (normalized === "&lt;") {
    return "<";
  }
  if (normalized === "&gt;") {
    return ">";
  }
  if (normalized === "&quot;") {
    return '"';
  }
  if (normalized === "&apos;") {
    return "'";
  }
  const hexMatch = normalized.match(/^&#x([0-9a-f]+);$/);
  if (hexMatch) {
    const codepoint = Number.parseInt(hexMatch[1], 16);
    return Number.isFinite(codepoint) ? String.fromCodePoint(codepoint) : "";
  }
  const decMatch = normalized.match(/^&#([0-9]+);$/);
  if (decMatch) {
    const codepoint = Number.parseInt(decMatch[1], 10);
    return Number.isFinite(codepoint) ? String.fromCodePoint(codepoint) : "";
  }
  return entity;
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos|#x[0-9a-fA-F]+|#[0-9]+);/g, (entity) => decodeXmlEntity(entity));
}

type SvgTextNode = {
  openingTag: string;
  normalizedText: string;
};

function extractSvgAttribute(tag: string, attributeName: string): string | null {
  const escapedName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b${escapedName}\\s*=\\s*(\"([^\"]*)\"|'([^']*)')`, "i");
  const match = tag.match(pattern);
  if (!match) {
    return null;
  }
  return (match[2] ?? match[3] ?? "").trim();
}

function parseCssValue(style: string, propertyName: string): string | null {
  const segments = style.split(";");
  for (const segment of segments) {
    const [rawKey, rawValue] = segment.split(":");
    if (!rawKey || !rawValue) {
      continue;
    }
    if (rawKey.trim().toLowerCase() === propertyName.toLowerCase()) {
      return rawValue.trim();
    }
  }
  return null;
}

function parseOpacityValue(rawValue: string | null): number | null {
  if (!rawValue) {
    return null;
  }
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.endsWith("%")) {
    const percentage = Number.parseFloat(trimmed.slice(0, -1));
    return Number.isFinite(percentage) ? percentage / 100 : null;
  }
  const numeric = Number.parseFloat(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

function resolveTextNodeOpacity(openingTag: string): number | null {
  const directOpacity = parseOpacityValue(extractSvgAttribute(openingTag, "opacity"));
  if (typeof directOpacity === "number") {
    return directOpacity;
  }

  const fillOpacity = parseOpacityValue(extractSvgAttribute(openingTag, "fill-opacity"));
  if (typeof fillOpacity === "number") {
    return fillOpacity;
  }

  const styleAttr = extractSvgAttribute(openingTag, "style");
  if (!styleAttr) {
    return null;
  }

  const styleOpacity = parseOpacityValue(parseCssValue(styleAttr, "opacity"));
  if (typeof styleOpacity === "number") {
    return styleOpacity;
  }

  return parseOpacityValue(parseCssValue(styleAttr, "fill-opacity"));
}

function extractSvgTextNodes(svg: string): SvgTextNode[] {
  const textMatches = svg.match(/<text\b[\s\S]*?<\/text>/gi) || [];
  return textMatches
    .map((node) => {
      const openingTag = node.match(/^<text\b[^>]*>/i)?.[0] || "";
      const text = decodeXmlEntities(node.replace(/<[^>]+>/g, " "));
      return {
        openingTag,
        normalizedText: normalizeLine(text)
      };
    })
    .filter((node) => Boolean(node.normalizedText));
}

function makeFlatLockupRetryRecipe(lockupRecipe: LockupRecipe): LockupRecipe {
  return {
    ...lockupRecipe,
    titleTreatment: lockupRecipe.titleTreatment === "outline" || lockupRecipe.titleTreatment === "overprint"
      ? "stacked"
      : lockupRecipe.titleTreatment,
    titleEcho: lockupRecipe.titleEcho
      ? {
          ...lockupRecipe.titleEcho,
          enabled: false,
          opacity: 0,
          dxPct: 0,
          dyPct: 0,
          blur: 0
        }
      : undefined
  };
}

function makeFlatLockupRetryPalette(
  palette: Awaited<ReturnType<typeof chooseTextPaletteForBackground>>
): Awaited<ReturnType<typeof chooseTextPaletteForBackground>> {
  return {
    ...palette,
    forceTitleShadow: false,
    forceSubtitleShadow: false,
    forceTitleOutline: false
  };
}

function validateLockupSvgTextIntegrity(params: {
  svg: string;
  seriesTitle: string;
  subtitle?: string | null;
}): LockupSvgTextValidation {
  const expectedTitle = normalizeLine(params.seriesTitle);
  const expectedSubtitle = normalizeLine(params.subtitle || "");
  const expected = [expectedTitle, expectedSubtitle].filter(Boolean);
  const expectedSet = new Set(expected);
  const textNodes = extractSvgTextNodes(params.svg);
  const extracted = textNodes.map((node) => node.normalizedText).filter(Boolean);
  const uniqueExtracted = [...new Set(extracted)];
  const unexpected = [...new Set(uniqueExtracted.filter((value) => !expectedSet.has(value)))];
  const missing = expected.filter((value) => !extracted.includes(value));
  const titleOccurrences = expectedTitle ? extracted.filter((value) => value === expectedTitle).length : 0;
  const subtitleOccurrences = expectedSubtitle ? extracted.filter((value) => value === expectedSubtitle).length : 0;
  const reasons: string[] = [];

  if (unexpected.length > 0) {
    reasons.push(`unexpected text: ${unexpected.join(", ")}`);
  }
  if (missing.length > 0) {
    reasons.push(`missing expected text: ${missing.join(", ")}`);
  }
  if (expectedTitle && titleOccurrences > 1) {
    reasons.push(`title appears ${titleOccurrences} times (max 1)`);
  }
  if (expectedSubtitle && subtitleOccurrences > 1) {
    reasons.push(`subtitle appears ${subtitleOccurrences} times (max 1)`);
  }
  if (/<\s*filter\b/i.test(params.svg)) {
    reasons.push("svg contains <filter> node");
  }
  if (/\bfilter\s*=\s*["'][^"']*url\(#/i.test(params.svg)) {
    reasons.push("svg contains filter reference url(#...)");
  }
  if (/<\s*feGaussianBlur\b/i.test(params.svg)) {
    reasons.push("svg contains feGaussianBlur");
  }
  if (/<\s*feDropShadow\b/i.test(params.svg)) {
    reasons.push("svg contains feDropShadow");
  }
  if (/<\s*feColorMatrix\b/i.test(params.svg)) {
    reasons.push("svg contains feColorMatrix");
  }

  const transformedDuplicateText = new Set<string>();
  const textCountByContent = new Map<string, number>();
  for (const node of textNodes) {
    textCountByContent.set(node.normalizedText, (textCountByContent.get(node.normalizedText) || 0) + 1);
  }

  textNodes.forEach((node, index) => {
    const opacity = resolveTextNodeOpacity(node.openingTag);
    if (typeof opacity === "number" && opacity < 0.999) {
      reasons.push(`text node ${index + 1} has opacity ${opacity.toFixed(3)} (< 1)`);
    }

    const hasTransform = Boolean(extractSvgAttribute(node.openingTag, "transform"));
    if (hasTransform && (textCountByContent.get(node.normalizedText) || 0) > 1) {
      transformedDuplicateText.add(node.normalizedText);
    }
  });

  if (transformedDuplicateText.size > 0) {
    reasons.push(`duplicated transformed text layers detected: ${[...transformedDuplicateText].join(", ")}`);
  }

  const dedupedReasons = [...new Set(reasons)];

  return {
    valid: dedupedReasons.length === 0,
    expected,
    extracted: uniqueExtracted,
    unexpected,
    missing,
    titleOccurrences,
    subtitleOccurrences,
    reasons: dedupedReasons
  };
}

async function renderValidatedLockupPng(params: {
  width: number;
  height: number;
  content: {
    title: string;
    subtitle: string;
  };
  palette: Awaited<ReturnType<typeof chooseTextPaletteForBackground>>;
  lockupRecipe: LockupRecipe;
  lockupPresetId?: string | null;
  styleFamily: StyleFamily;
  fontSeed: string;
  lockupPrompt: string;
}): Promise<{
  renderResult: { png: Buffer; width: number; height: number };
  effectivePrompt: string;
  textValidation: LockupSvgTextValidation;
  textOverrideRetried: boolean;
}> {
  let effectivePrompt = params.lockupPrompt;
  let textOverrideRetried = false;
  let finalValidation: LockupSvgTextValidation | null = null;
  let finalSvg = "";

  for (let attempt = 0; attempt <= 1; attempt += 1) {
    const usesFlatOverride = attempt === 1;
    if (attempt === 1) {
      textOverrideRetried = true;
      effectivePrompt = `${params.lockupPrompt}\n${LOCKUP_TEXT_OVERRIDE_PROMPT}`;
    }

    const lockupRecipeForAttempt = usesFlatOverride ? makeFlatLockupRetryRecipe(params.lockupRecipe) : params.lockupRecipe;
    const lockupPaletteForAttempt = usesFlatOverride ? makeFlatLockupRetryPalette(params.palette) : params.palette;
    const lockupPresetIdForAttempt = usesFlatOverride ? undefined : params.lockupPresetId;
    const svg = buildCleanMinimalOverlaySvg({
      width: params.width,
      height: params.height,
      content: {
        title: params.content.title,
        subtitle: params.content.subtitle
      },
      palette: lockupPaletteForAttempt,
      lockupRecipe: lockupRecipeForAttempt,
      lockupPresetId: lockupPresetIdForAttempt,
      styleFamily: params.styleFamily,
      fontSeed: params.fontSeed
    });
    const validation = validateLockupSvgTextIntegrity({
      svg,
      seriesTitle: params.content.title,
      subtitle: params.content.subtitle
    });
    finalValidation = validation;
    finalSvg = svg;
    if (validation.valid) {
      break;
    }
  }

  if (finalValidation && !finalValidation.valid) {
    console.warn(
      `[lockup-text-validation] failed after override retry reasons=${finalValidation.reasons.join(" | ") || "none"} unexpected=${
        finalValidation.unexpected.join(",") || "none"
      } missing=${finalValidation.missing.join(",") || "none"}`
    );
  }

  const renderResult = await renderTrimmedLockupPngFromSvg(finalSvg);
  return {
    renderResult,
    effectivePrompt,
    textValidation: finalValidation || {
      valid: true,
      expected: [],
      extracted: [],
      unexpected: [],
      missing: [],
      titleOccurrences: 0,
      subtitleOccurrences: 0,
      reasons: []
    },
    textOverrideRetried
  };
}

type FeedbackGenerationControls = {
  chosenGenerationId: string | null;
  regenerateLockup?: boolean;
  explicitNewTitleStyle?: boolean;
  regenerateBackground?: boolean;
};

function readLockupLayoutFromInput(input: unknown): LockupLayoutArchetype | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const rawLayout = (input as { lockupLayout?: unknown }).lockupLayout;
  return isLockupLayoutArchetype(rawLayout) ? rawLayout : null;
}

function readLockupLayoutFromOutput(output: unknown): LockupLayoutArchetype | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }

  const meta = (output as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return null;
  }

  const designSpec = (meta as { designSpec?: unknown }).designSpec;
  if (!designSpec || typeof designSpec !== "object" || Array.isArray(designSpec)) {
    return null;
  }

  const rawLayout = (designSpec as { lockupLayout?: unknown }).lockupLayout;
  return isLockupLayoutArchetype(rawLayout) ? rawLayout : null;
}

function readLockupLayoutFromGenerationPayload(input: unknown, output: unknown): LockupLayoutArchetype | null {
  return readLockupLayoutFromInput(input) || readLockupLayoutFromOutput(output);
}

function readFeedbackGenerationControls(input: unknown): FeedbackGenerationControls {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      chosenGenerationId: null
    };
  }

  const feedback = (input as { feedback?: unknown }).feedback;
  if (!feedback || typeof feedback !== "object" || Array.isArray(feedback)) {
    return {
      chosenGenerationId: null
    };
  }

  const typedFeedback = feedback as {
    chosenGenerationId?: unknown;
    regenerateLockup?: unknown;
    explicitNewTitleStyle?: unknown;
    regenerateBackground?: unknown;
  };
  const chosenGenerationId =
    typeof typedFeedback.chosenGenerationId === "string" && typedFeedback.chosenGenerationId.trim()
      ? typedFeedback.chosenGenerationId.trim()
      : null;

  return {
    chosenGenerationId,
    regenerateLockup: typeof typedFeedback.regenerateLockup === "boolean" ? typedFeedback.regenerateLockup : undefined,
    explicitNewTitleStyle:
      typeof typedFeedback.explicitNewTitleStyle === "boolean" ? typedFeedback.explicitNewTitleStyle : undefined,
    regenerateBackground:
      typeof typedFeedback.regenerateBackground === "boolean" ? typedFeedback.regenerateBackground : undefined
  };
}

function shouldRequestSeriesMarkFromNotes(notes: Array<string | null | undefined>): boolean {
  const combined = notes
    .filter((note): note is string => typeof note === "string" && Boolean(note.trim()))
    .join(" ")
    .toLowerCase();
  if (!combined) {
    return false;
  }
  if (SERIES_MARK_NEGATION_PATTERN.test(combined)) {
    return false;
  }
  return SERIES_MARK_REQUEST_PATTERN.test(combined);
}

function buildSeriesPreferenceGuidance(project: {
  preferredAccentColors: string | null;
  avoidColors: string | null;
  designNotes: string | null;
}): string {
  const guidance: string[] = [];

  const preferredAccentColors = truncateForPrompt(project.preferredAccentColors, 180);
  const avoidColors = truncateForPrompt(project.avoidColors, 180);
  const designNotes = truncateForPrompt(project.designNotes, 260);

  if (preferredAccentColors) {
    guidance.push(`Preferred accent colors: ${preferredAccentColors}.`);
  }
  if (avoidColors) {
    guidance.push(`Avoid these colors: ${avoidColors}.`);
  }
  if (designNotes) {
    guidance.push(`Design notes: ${designNotes}.`);
  }

  return guidance.join(" ");
}

function readSeriesPreferencesDesignNotesFromInput(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const seriesPreferences = (input as { seriesPreferences?: unknown }).seriesPreferences;
  if (!seriesPreferences || typeof seriesPreferences !== "object" || Array.isArray(seriesPreferences)) {
    return null;
  }

  const designNotes = (seriesPreferences as { designNotes?: unknown }).designNotes;
  if (typeof designNotes !== "string") {
    return null;
  }

  const trimmed = designNotes.trim();
  return trimmed || null;
}

function hasDesignDirection(projectDesignNotes?: string | null, briefDesignNotes?: string | null): boolean {
  return Boolean(projectDesignNotes?.trim()) || Boolean(briefDesignNotes?.trim());
}

function resolvePublicAssetAbsolutePath(filePath: string): string | null {
  if (!filePath.trim() || /^https?:\/\//i.test(filePath) || /^data:/i.test(filePath)) {
    return null;
  }

  const publicRoot = path.join(process.cwd(), "public");
  const relativePath = filePath.replace(/^\/+/, "");
  const absolutePath = path.resolve(publicRoot, relativePath);
  const publicPrefix = `${publicRoot}${path.sep}`;

  if (absolutePath !== publicRoot && !absolutePath.startsWith(publicPrefix)) {
    return null;
  }

  return absolutePath;
}

async function readAssetBufferFromPublicPath(filePath: string): Promise<Buffer | null> {
  const absolutePath = resolvePublicAssetAbsolutePath(filePath);
  if (!absolutePath) {
    return null;
  }

  try {
    return await readFile(absolutePath);
  } catch {
    return null;
  }
}

type ReusableGenerationAssets = {
  sourceGenerationId: string;
  masterBackgroundPng: Buffer | null;
  lockupPng: Buffer | null;
  styleFamily: StyleFamilyKey | null;
  styleBucket: StyleBucketKey | null;
  styleTone: StyleToneKey | null;
  styleMedium: StyleMediumKey | null;
};

function pickAssetPathBySlots(
  assets: Array<{ kind: string; slot: string | null; file_path: string }>,
  slots: string[],
  allowedKinds?: string[]
): string | null {
  const normalizedSlots = slots.map((slot) => slot.trim().toLowerCase());
  const normalizedKinds = allowedKinds?.map((kind) => kind.trim().toUpperCase());

  for (const asset of assets) {
    const slot = (asset.slot || "").trim().toLowerCase();
    const kind = asset.kind.trim().toUpperCase();
    if (!slot || !asset.file_path?.trim()) {
      continue;
    }
    if (!normalizedSlots.includes(slot)) {
      continue;
    }
    if (normalizedKinds && !normalizedKinds.includes(kind)) {
      continue;
    }
    return asset.file_path;
  }

  return null;
}

async function loadReusableAssetsFromGeneration(params: {
  projectId: string;
  generationId: string;
}): Promise<ReusableGenerationAssets | null> {
  const generation = await prisma.generation.findFirst({
    where: {
      id: params.generationId,
      projectId: params.projectId
    },
    select: {
      id: true,
      output: true,
      assets: {
        select: {
          kind: true,
          slot: true,
          file_path: true
        }
      }
    }
  });

  if (!generation) {
    return null;
  }

  const backgroundPath =
    pickAssetPathBySlots(generation.assets, ["wide_bg", "widescreen_bg", "square_bg", "tall_bg", "vertical_bg"], [
      "BACKGROUND",
      "IMAGE"
    ]) || null;
  const lockupPath =
    pickAssetPathBySlots(generation.assets, [LOCKUP_ASSET_SLOT], ["LOCKUP", "IMAGE"]) ||
    pickAssetPathBySlots(generation.assets, [LOCKUP_ASSET_SLOT]) ||
    null;
  const [masterBackgroundPng, lockupPng] = await Promise.all([
    backgroundPath ? readAssetBufferFromPublicPath(backgroundPath) : Promise.resolve(null),
    lockupPath ? readAssetBufferFromPublicPath(lockupPath) : Promise.resolve(null)
  ]);

  return {
    sourceGenerationId: generation.id,
    masterBackgroundPng,
    lockupPng,
    styleFamily: readStyleFamilyFromGenerationOutput(generation.output),
    styleBucket: readStyleBucketFromGenerationOutput(generation.output),
    styleTone: readStyleToneFromGenerationOutput(generation.output),
    styleMedium: readStyleMediumFromGenerationOutput(generation.output)
  };
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

function laneBriefHint(optionIndex: number, directionSpec?: PlannedDirectionSpec | null): string {
  if (directionSpec?.explorationLaneKey) {
    const readableLane = directionSpec.explorationLaneKey
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return `Exploration lane: ${readableLane}. Keep this direction clearly distinct from the other two options.`;
  }
  const lane = optionLane(optionIndex);
  if (lane === "A") {
    return "Minimal / typography-led lane with Swiss-grid restraint and generous negative space.";
  }
  if (lane === "B") {
    return "Illustration / ornament lane with tasteful decorative marks and controlled accents.";
  }
  return "Photo / texture lane with cinematic grain and tactile depth while preserving clarity.";
}

function preferredDirectionFamiliesForStyleDirection(styleDirection: StyleDirection): DirectionStyleFamily[] {
  if (styleDirection === "MINIMAL") {
    return ["minimal", "premium_modern"];
  }
  if (styleDirection === "PHOTO") {
    return ["photo_centric", "editorial"];
  }
  if (styleDirection === "ILLUSTRATION") {
    return ["retro", "editorial"];
  }
  if (styleDirection === "ABSTRACT" || styleDirection === "BOLD_TYPE") {
    return ["premium_modern", "minimal"];
  }
  if (styleDirection === "SEASONAL") {
    return ["retro", "photo_centric"];
  }
  return [];
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

function normalizeMotifToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function readMotifFocusFromGenerationOutput(output: unknown): string[] {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return [];
  }
  const meta = (output as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return [];
  }
  const designSpec = (meta as { designSpec?: unknown }).designSpec;
  if (!designSpec || typeof designSpec !== "object" || Array.isArray(designSpec)) {
    return [];
  }
  return safeArrayOfStrings((designSpec as { motifFocus?: unknown }).motifFocus, []);
}

function readStyleFamilyFromGenerationOutput(output: unknown): StyleFamilyKey | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }
  const meta = (output as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return null;
  }
  const designSpec = (meta as { designSpec?: unknown }).designSpec;
  if (!designSpec || typeof designSpec !== "object" || Array.isArray(designSpec)) {
    return null;
  }
  const directStyleFamily = (designSpec as { styleFamily?: unknown }).styleFamily;
  if (isStyleFamilyKey(directStyleFamily)) {
    return directStyleFamily;
  }
  const nestedDirectionSpec = (designSpec as { directionSpec?: { styleFamily?: unknown } | null }).directionSpec;
  if (nestedDirectionSpec && isStyleFamilyKey(nestedDirectionSpec.styleFamily)) {
    return nestedDirectionSpec.styleFamily;
  }
  return null;
}

function readStyleBucketFromGenerationOutput(output: unknown): StyleBucketKey | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }
  const meta = (output as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return null;
  }
  const designSpec = (meta as { designSpec?: unknown }).designSpec;
  if (!designSpec || typeof designSpec !== "object" || Array.isArray(designSpec)) {
    return null;
  }
  const directStyleBucket = (designSpec as { styleBucket?: unknown }).styleBucket;
  if (isStyleBucketKey(directStyleBucket)) {
    return directStyleBucket;
  }
  const directStyleFamily = (designSpec as { styleFamily?: unknown }).styleFamily;
  if (isStyleFamilyKey(directStyleFamily)) {
    return STYLE_FAMILY_BANK[directStyleFamily].bucket;
  }
  const nestedDirectionSpec = (
    designSpec as {
      directionSpec?: { styleBucket?: unknown; styleFamily?: unknown } | null;
    }
  ).directionSpec;
  if (nestedDirectionSpec) {
    if (isStyleBucketKey(nestedDirectionSpec.styleBucket)) {
      return nestedDirectionSpec.styleBucket;
    }
    if (isStyleFamilyKey(nestedDirectionSpec.styleFamily)) {
      return STYLE_FAMILY_BANK[nestedDirectionSpec.styleFamily].bucket;
    }
  }
  return null;
}

function readStyleToneFromGenerationOutput(output: unknown): StyleToneKey | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }
  const meta = (output as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return null;
  }
  const designSpec = (meta as { designSpec?: unknown }).designSpec;
  if (!designSpec || typeof designSpec !== "object" || Array.isArray(designSpec)) {
    return null;
  }
  const directStyleTone = (designSpec as { styleTone?: unknown }).styleTone;
  if (isStyleToneKey(directStyleTone)) {
    return directStyleTone;
  }
  const nestedDirectionSpec = (designSpec as { directionSpec?: { styleTone?: unknown } | null }).directionSpec;
  if (nestedDirectionSpec && isStyleToneKey(nestedDirectionSpec.styleTone)) {
    return nestedDirectionSpec.styleTone;
  }
  const styleFamily = readStyleFamilyFromGenerationOutput(output);
  return styleFamily ? STYLE_FAMILY_BANK[styleFamily].tone : null;
}

function readStyleMediumFromGenerationOutput(output: unknown): StyleMediumKey | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }
  const meta = (output as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return null;
  }
  const designSpec = (meta as { designSpec?: unknown }).designSpec;
  if (!designSpec || typeof designSpec !== "object" || Array.isArray(designSpec)) {
    return null;
  }
  const directStyleMedium = (designSpec as { styleMedium?: unknown }).styleMedium;
  if (isStyleMediumKey(directStyleMedium)) {
    return directStyleMedium;
  }
  const nestedDirectionSpec = (designSpec as { directionSpec?: { styleMedium?: unknown } | null }).directionSpec;
  if (nestedDirectionSpec && isStyleMediumKey(nestedDirectionSpec.styleMedium)) {
    return nestedDirectionSpec.styleMedium;
  }
  const styleFamily = readStyleFamilyFromGenerationOutput(output);
  return styleFamily ? STYLE_FAMILY_BANK[styleFamily].medium : null;
}

function readLockupTypographicRecipeIdFromGenerationOutput(output: unknown): string | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }
  const meta = (output as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return null;
  }
  const designSpec = (meta as { designSpec?: unknown }).designSpec;
  if (!designSpec || typeof designSpec !== "object" || Array.isArray(designSpec)) {
    return null;
  }
  const rawRecipe = (designSpec as { lockupTypographicRecipe?: unknown }).lockupTypographicRecipe;
  if (rawRecipe && typeof rawRecipe === "object" && !Array.isArray(rawRecipe)) {
    const id = (rawRecipe as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) {
      return id.trim();
    }
  }
  const rawLayout = (designSpec as { lockupLayout?: unknown }).lockupLayout;
  if (isLockupLayoutArchetype(rawLayout)) {
    return lockupTypographicRecipeForArchetype(rawLayout).id;
  }
  return null;
}

function readExplorationSetKeyFromGenerationOutput(output: unknown): string | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }
  const meta = (output as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return null;
  }
  const designSpec = (meta as { designSpec?: unknown }).designSpec;
  if (!designSpec || typeof designSpec !== "object" || Array.isArray(designSpec)) {
    return null;
  }
  const directSetKey = (designSpec as { explorationSetKey?: unknown }).explorationSetKey;
  if (typeof directSetKey === "string" && directSetKey.trim()) {
    return directSetKey.trim();
  }
  const directionSpec = (designSpec as { directionSpec?: unknown }).directionSpec;
  if (!directionSpec || typeof directionSpec !== "object" || Array.isArray(directionSpec)) {
    return null;
  }
  const nestedSetKey = (directionSpec as { explorationSetKey?: unknown }).explorationSetKey;
  if (typeof nestedSetKey === "string" && nestedSetKey.trim()) {
    return nestedSetKey.trim();
  }
  return null;
}

function deriveRecentStyleBuckets(recentStyleFamilies: readonly StyleFamilyKey[]): StyleBucketKey[] {
  const seen = new Set<StyleBucketKey>();
  const buckets: StyleBucketKey[] = [];
  for (const family of recentStyleFamilies) {
    const bucket = STYLE_FAMILY_BANK[family].bucket;
    if (seen.has(bucket)) {
      continue;
    }
    seen.add(bucket);
    buckets.push(bucket);
  }
  return buckets;
}

async function loadRecentProjectMotifs(projectId: string): Promise<string[]> {
  const recentGenerations = await prisma.generation.findMany({
    where: {
      projectId
    },
    orderBy: [{ round: "desc" }, { createdAt: "desc" }],
    take: 12,
    select: {
      round: true,
      output: true
    }
  });

  if (recentGenerations.length === 0) {
    return [];
  }

  const newestRound = recentGenerations[0]?.round || 1;
  const minimumRound = Math.max(1, newestRound - 1);
  const recent = new Set<string>();

  for (const generation of recentGenerations) {
    if (generation.round < minimumRound) {
      continue;
    }
    const motifFocus = readMotifFocusFromGenerationOutput(generation.output);
    for (const motif of motifFocus) {
      const normalized = normalizeMotifToken(motif);
      if (normalized) {
        recent.add(normalized);
      }
    }
  }

  return [...recent];
}

async function loadRecentStyleFamilies(params: {
  organizationId: string;
  projectId: string;
  limit?: number;
}): Promise<StyleFamilyKey[]> {
  const target = Math.max(1, Math.min(params.limit || 20, 40));
  const [projectGenerations, organizationGenerations] = await Promise.all([
    prisma.generation.findMany({
      where: {
        projectId: params.projectId
      },
      orderBy: [{ round: "desc" }, { createdAt: "desc" }],
      take: 24,
      select: {
        output: true
      }
    }),
    prisma.generation.findMany({
      where: {
        project: {
          organizationId: params.organizationId,
          id: {
            not: params.projectId
          }
        }
      },
      orderBy: [{ createdAt: "desc" }],
      take: 60,
      select: {
        output: true
      }
    })
  ]);

  const ordered = [...projectGenerations, ...organizationGenerations];
  const seen = new Set<StyleFamilyKey>();
  const recent: StyleFamilyKey[] = [];

  for (const generation of ordered) {
    const styleFamily = readStyleFamilyFromGenerationOutput(generation.output);
    if (!styleFamily || seen.has(styleFamily)) {
      continue;
    }
    seen.add(styleFamily);
    recent.push(styleFamily);
    if (recent.length >= target) {
      break;
    }
  }

  return recent;
}

async function loadRecentReferenceIds(params: {
  organizationId: string;
  projectId: string;
  projectLimit?: number;
  globalLimit?: number;
}): Promise<{
  projectRecent: string[];
  globalRecent: string[];
}> {
  const projectLimit = Math.max(1, Math.min(params.projectLimit || 12, 30));
  const globalLimit = Math.max(1, Math.min(params.globalLimit || 30, 80));

  const [projectGenerations, organizationGenerations] = await Promise.all([
    prisma.generation.findMany({
      where: {
        projectId: params.projectId
      },
      orderBy: [{ round: "desc" }, { createdAt: "desc" }],
      take: 40,
      select: {
        output: true
      }
    }),
    prisma.generation.findMany({
      where: {
        project: {
          organizationId: params.organizationId,
          id: {
            not: params.projectId
          }
        }
      },
      orderBy: [{ createdAt: "desc" }],
      take: 100,
      select: {
        output: true
      }
    })
  ]);

  const projectRecent = deriveRecentReferenceIds(projectGenerations, { limit: projectLimit });
  const globalRecent = deriveRecentReferenceIds([...projectGenerations, ...organizationGenerations], { limit: globalLimit });

  return {
    projectRecent,
    globalRecent
  };
}

async function loadRecentLockupRecipeIds(params: {
  organizationId: string;
  projectId: string;
  limit?: number;
}): Promise<string[]> {
  const target = Math.max(1, Math.min(params.limit || 18, 40));
  const [projectGenerations, organizationGenerations] = await Promise.all([
    prisma.generation.findMany({
      where: {
        projectId: params.projectId
      },
      orderBy: [{ round: "desc" }, { createdAt: "desc" }],
      take: 24,
      select: {
        output: true
      }
    }),
    prisma.generation.findMany({
      where: {
        project: {
          organizationId: params.organizationId,
          id: {
            not: params.projectId
          }
        }
      },
      orderBy: [{ createdAt: "desc" }],
      take: 60,
      select: {
        output: true
      }
    })
  ]);

  const ordered = [...projectGenerations, ...organizationGenerations];
  const seen = new Set<string>();
  const recent: string[] = [];
  for (const generation of ordered) {
    const recipeId = readLockupTypographicRecipeIdFromGenerationOutput(generation.output);
    if (!recipeId || seen.has(recipeId)) {
      continue;
    }
    seen.add(recipeId);
    recent.push(recipeId);
    if (recent.length >= target) {
      break;
    }
  }
  return recent;
}

async function loadRecentExplorationSetKeys(params: {
  projectId: string;
  limit?: number;
}): Promise<string[]> {
  const target = Math.max(1, Math.min(params.limit || 8, 20));
  const recentGenerations = await prisma.generation.findMany({
    where: {
      projectId: params.projectId
    },
    orderBy: [{ round: "desc" }, { createdAt: "desc" }],
    take: 24,
    select: {
      output: true
    }
  });

  const seen = new Set<string>();
  const recent: string[] = [];
  for (const generation of recentGenerations) {
    const setKey = readExplorationSetKeyFromGenerationOutput(generation.output);
    if (!setKey || seen.has(setKey)) {
      continue;
    }
    seen.add(setKey);
    recent.push(setKey);
    if (recent.length >= target) {
      break;
    }
  }
  return recent;
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

async function detectTextArtifactsHeuristic(image: Buffer): Promise<boolean> {
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

  const totalPixels = width * height;
  let nearBlackCount = 0;
  for (let index = 0; index < totalPixels; index += 1) {
    if (pixels[index] <= 46) {
      nearBlackCount += 1;
    }
  }
  const nearBlackRatio = nearBlackCount / totalPixels;
  if (nearBlackRatio < 0.004 || nearBlackRatio > 0.28) {
    return false;
  }

  const edgeMask = new Uint8Array(totalPixels);
  let edgeCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const gx = Math.abs(pixels[idx + 1] - pixels[idx - 1]);
      const gy = Math.abs(pixels[idx + width] - pixels[idx - width]);
      const magnitude = gx + gy;
      if (magnitude > 68) {
        edgeMask[idx] = 1;
        edgeCount += 1;
      }
    }
  }

  const edgeRatio = edgeCount / totalPixels;
  if (edgeRatio < 0.01 || edgeRatio > 0.36) {
    return false;
  }

  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let textLikeComponents = 0;
  let smallComponentEdgeArea = 0;

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
      if (boxWidth < 2 || boxHeight < 2) {
        continue;
      }

      const boxArea = boxWidth * boxHeight;
      const density = area / boxArea;
      const smallComponent = boxWidth <= 36 && boxHeight <= 24 && boxArea <= 700;
      if (!smallComponent) {
        continue;
      }

      smallComponentEdgeArea += area;
      const aspect = boxWidth / boxHeight;
      const textLike =
        area >= 7 && area <= 320 && aspect >= 0.2 && aspect <= 8 && density >= 0.08 && density <= 0.78;

      if (textLike) {
        textLikeComponents += 1;
      }
    }
  }

  const smallEdgeDensity = smallComponentEdgeArea / totalPixels;
  if (smallEdgeDensity < 0.004 || smallEdgeDensity > 0.22) {
    return false;
  }

  return textLikeComponents >= 8;
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
  brandMode: ProjectBrandMode;
  preferredAccentColors: string | null;
  avoidColors: string | null;
  designNotes: string | null;
  brandKit: {
    paletteJson: string;
    logoPath: string | null;
    typographyDirection: "match_site" | "graceled_defaults";
    source: "organization" | "project" | "project_fallback";
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
  motifBankContext?: MotifBankContext;
};

type BackgroundRerankCandidateDebug = {
  url: string;
  stage: "primary" | "fallback_family" | "fallback_set";
  attempt: number;
  styleFamily: StyleFamilyKey | null;
  explorationSetKey: string | null;
  score: number;
  checks: {
    textFree: boolean;
    tonePass: boolean;
    designPresencePass: boolean;
    hardFailBlankDesign: boolean;
  };
  stats: {
    textRetryCount: number;
    toneRetryCount: number;
    closestDistance: number;
    tone: ImageToneStats | null;
    titleSafe: {
      sampleCount: number;
      edgeDensity: number;
      luminanceStdDev: number;
      edgeSimplicity: number;
      varianceModeration: number;
      score: number;
    } | null;
    midtoneRange: {
      sampleCount: number;
      shadowClippedRatio: number;
      highlightClippedRatio: number;
      score: number;
    } | null;
    hardFail: {
      edgeDensityFull: number;
      luminanceStdFull: number;
      edgeDensityNonTitle: number;
      passes: boolean;
    } | null;
  };
};

type BackgroundRerankWinnerDebug = {
  index: number;
  url: string;
  stage: "primary" | "fallback_family" | "fallback_set";
  attempt: number;
  styleFamily: StyleFamilyKey | null;
  explorationSetKey: string | null;
  score: number;
};

type BackgroundRerankFallbackDebug = {
  usedAltFamily: boolean;
  usedAltSet: boolean;
  attempts: number;
};

type LockupRerankCandidateDebug = {
  url: string;
  score: number;
  checks: {
    textIntegrity: boolean;
    fitPass: boolean;
    insideTitleSafeWithMargin: boolean;
    notTooSmall: boolean;
  };
  stats: {
    width: number;
    height: number;
    fittedWidth: number;
    fittedHeight: number;
    safeHeightRatio: number;
    safeCoverage: number;
    textOverrideRetried: boolean;
  };
};

type RerankDebugMeta = {
  backgroundCandidates?: BackgroundRerankCandidateDebug[];
  backgroundWinner?: BackgroundRerankWinnerDebug;
  laneFailed?: boolean;
  fallback?: BackgroundRerankFallbackDebug;
  backgroundWinnerIndex?: number;
  lockupCandidates?: LockupRerankCandidateDebug[];
  lockupWinnerIndex?: number;
};

type GenerationOutputPayload = {
  designDoc: DesignDoc;
  designDocByShape: Record<PreviewShape, DesignDoc>;
  notes: string;
  promptUsed?: string;
  meta: {
    styleRefCount: number;
    usedStylePaths: string[];
    usedReferenceIds?: string[];
    revisedPrompt?: string;
    debug?: {
      styleFamilyFallback?: {
        usedCleanMinFallback: boolean;
        resolvedStyleFamily: StyleFamily;
      };
    };
    toneCheck?: ToneCheckSummary;
    backgroundTextCheck?: BackgroundTextCheckSummary;
    lockupValidation?: {
      ok: boolean;
      reasons: string[];
      retried: boolean;
    };
    rerank?: RerankDebugMeta;
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

const DEFAULT_FALLBACK_TEXT_PALETTE = {
  primary: "#0F172A",
  secondary: "#334155",
  tertiary: "#475569",
  rule: "#334155",
  accent: "#0F172A",
  autoScrim: false,
  scrimTint: "#FFFFFF" as const
};

function buildFallbackGenerationOutput(params: BuildGenerationOutputParams): GenerationOutputPayload {
  const palette = params.project.brandKit ? parsePaletteJson(params.project.brandKit.paletteJson) : [];
  const validatedDesignBrief = validateDesignBrief((params.input as { designBrief?: unknown }).designBrief);
  const designBrief = validatedDesignBrief.ok ? validatedDesignBrief.data : null;
  const lockupLayout = readLockupLayoutFromInput(params.input);
  const directionSpec = readDirectionSpecFromInput(params.input, params.optionIndex);
  const inputSeriesDesignNotes = readSeriesPreferencesDesignNotesFromInput(params.input);
  const hasDesignNotes = hasDesignDirection(params.project.designNotes, inputSeriesDesignNotes);
  const wantsTitleStage = directionSpec?.wantsTitleStage === true;
  const lockupRecipe = designBrief?.lockupRecipe;
  const lockupPresetId = designBrief?.lockupPresetId;
  const explicitStyleFamily = (designBrief?.styleFamilies[params.optionIndex] || designBrief?.styleFamilies[0] || null) as
    | StyleFamily
    | null;
  const resolvedStyleFamily = (explicitStyleFamily || "clean-min") as StyleFamily;
  const usedCleanMinFallback = resolvedStyleFamily === "clean-min" && !explicitStyleFamily;
  console.warn("[STYLEFAMILY FALLBACK]", {
    resolvedStyleFamily,
    usedCleanMinFallback,
    optionIndex: params.optionIndex,
    hasDesignNotes,
    round: params.round
  });
  const optionStyleFamily = resolvedStyleFamily;
  const displayContent = buildOverlayDisplayContent({
    title: params.project.series_title,
    subtitle: params.project.series_subtitle,
    scripturePassages: params.project.scripture_passages
  });

  const designDocByShape = {} as Record<PreviewShape, DesignDoc>;

  const templateBrief: TemplateBrief = {
    title: displayContent.title,
    subtitle: displayContent.subtitle,
    scripture: designBrief?.passage || params.project.scripture_passages || "",
    keywords: designBrief?.keywords || [],
    palette,
    lockupRecipe,
    lockupPresetId
  };

  for (const shape of PREVIEW_SHAPES) {
    designDocByShape[shape] = renderTemplate(optionStyleFamily, templateBrief, params.optionIndex, shape, {
      backgroundImagePath: null,
      textPalette: DEFAULT_FALLBACK_TEXT_PALETTE
    });
  }
  const fallbackDesignSpec: Record<string, unknown> = {
    styleFamily: directionSpec?.styleFamily || null,
    styleBucket: directionSpec?.styleBucket || null,
    styleTone: directionSpec?.styleTone || null,
    styleMedium: directionSpec?.styleMedium || null,
    motifScope: directionSpec?.motifScope || params.motifBankContext?.scriptureScope || null,
    wantsTitleStage,
    wantsSeriesMark: directionSpec?.wantsSeriesMark === true,
    referenceIds: dedupeReferencesById(params.referenceItems || []).map((reference) => reference.id),
    referenceId: directionSpec?.referenceId || params.referenceItems?.[0]?.id || null,
    referenceCluster: directionSpec?.referenceCluster || null,
    referenceTier: directionSpec?.referenceTier || null,
    variationTemplateKey: directionSpec?.variationTemplateKey || null,
    motifFocus: directionSpec?.motifFocus || [],
    bookKeys: params.motifBankContext?.bookKeys || [],
    bookNames: params.motifBankContext?.bookNames || [],
    topicKeys: params.motifBankContext?.topicKeys || [],
    topicNames: params.motifBankContext?.topicNames || []
  };
  if (lockupLayout) {
    fallbackDesignSpec.lockupLayout = lockupLayout;
  }

  return {
    designDoc: designDocByShape.square,
    designDocByShape,
    notes: `Fallback layout: ${params.presetKey} | variant ${params.optionIndex % 3}`,
    meta: {
      styleRefCount: params.referenceItems?.length || 0,
      usedStylePaths: (params.referenceItems || []).map((ref) => ref.path || ref.thumbPath),
      usedReferenceIds: dedupeReferencesById(params.referenceItems || []).map((reference) => reference.id),
      revisedPrompt: params.revisedPrompt,
      ...(!hasDesignNotes
        ? {
            debug: {
              styleFamilyFallback: {
                usedCleanMinFallback,
                resolvedStyleFamily
              }
            }
          }
        : {}),
      designSpec: fallbackDesignSpec
    }
  };
}

async function getProjectForGeneration(projectId: string, organizationId: string) {
  const project = await prisma.project.findFirst({
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
      brandMode: true,
      preferredAccentColors: true,
      avoidColors: true,
      designNotes: true,
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

  if (!project) {
    return null;
  }

  const brandMode: ProjectBrandMode = project.brandMode === "brand" ? "brand" : "fresh";
  const effectiveBrandKit =
    brandMode === "brand"
      ? await resolveEffectiveBrandKit({
          organizationId,
          projectId: project.id,
          projectBrandKit: project.brandKit
        })
      : null;

  return {
    ...project,
    brandMode,
    brandKit: effectiveBrandKit
  };
}

function buildGenerationInput(
  project: {
    series_title: string;
    series_subtitle: string | null;
    scripture_passages: string | null;
    series_description: string | null;
    brandMode: ProjectBrandMode;
    preferredAccentColors: string | null;
    avoidColors: string | null;
    designNotes: string | null;
  },
  brandKit: {
    websiteUrl: string;
    typographyDirection: "match_site" | "graceled_defaults";
    paletteJson: string;
  } | null,
  selectedPresetKeys: string[] = [],
  lockupRecipe?: unknown,
  lockupPresetId?: string | null,
  styleFamilySeed?: string,
  plannedStyleFamilies?: [StyleFamily, StyleFamily, StyleFamily],
  runSeed?: string,
  directionPlan?: PlannedDirectionSpec[],
  lockupLayout?: LockupLayoutArchetype
) {
  const palette = brandKit ? parsePaletteJson(brandKit.paletteJson) : [];

  const designBrief = buildDesignBrief({
    seriesTitle: project.series_title,
    seriesSubtitle: project.series_subtitle,
    passage: project.scripture_passages,
    backgroundPrompt: project.series_description,
    selectedPresetKeys,
    lockupPresetId,
    lockupRecipe,
    styleFamilySeed,
    styleFamilies: plannedStyleFamilies
  });

  return {
    series_title: project.series_title,
    series_subtitle: project.series_subtitle,
    scripture_passages: project.scripture_passages,
    series_description: project.series_description,
    brandMode: project.brandMode,
    generationMode: "background_lockup_split",
    assetModes: ["background", "lockup"],
    seriesPreferences: {
      preferredAccentColors: project.preferredAccentColors,
      avoidColors: project.avoidColors,
      designNotes: project.designNotes
    },
    websiteUrl: brandKit?.websiteUrl || null,
    typographyDirection: brandKit?.typographyDirection || null,
    palette,
    selectedPresetKeys,
    runSeed: runSeed || styleFamilySeed || randomUUID(),
    directionPlan: directionPlan || [],
    lockupLayout: lockupLayout || null,
    designBrief
  };
}

function readDesignBriefFromInput(input: unknown): DesignBrief | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const designBrief = (input as { designBrief?: unknown }).designBrief;
  const validated = validateDesignBrief(designBrief);
  return validated.ok ? validated.data : null;
}

function readRunSeedFromInput(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const runSeed = (input as { runSeed?: unknown }).runSeed;
  if (typeof runSeed !== "string") {
    return null;
  }

  const trimmed = runSeed.trim();
  return trimmed || null;
}

function readDirectionSpecFromInput(input: unknown, optionIndex: number): PlannedDirectionSpec | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const directionPlan = (input as { directionPlan?: unknown }).directionPlan;
  if (!Array.isArray(directionPlan)) {
    return null;
  }

  const candidate = directionPlan[optionIndex];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const parsed = candidate as Partial<PlannedDirectionSpec>;
  const legacyLaneCandidate = (candidate as { styleFamily?: unknown }).styleFamily;
  const laneFamilyCandidate = isDirectionLaneFamily(parsed.laneFamily)
    ? parsed.laneFamily
    : isDirectionLaneFamily(legacyLaneCandidate)
      ? legacyLaneCandidate
      : null;
  if (
    typeof parsed.presetKey !== "string" ||
    typeof parsed.lockupPresetId !== "string" ||
    !laneFamilyCandidate ||
    typeof parsed.compositionType !== "string" ||
    typeof parsed.backgroundMode !== "string" ||
    typeof parsed.typeProfile !== "string" ||
    typeof parsed.ornamentProfile !== "string" ||
    typeof parsed.templateStyleFamily !== "string" ||
    typeof parsed.lanePrompt !== "string"
  ) {
    return null;
  }

  return {
    ...(candidate as PlannedDirectionSpec),
    optionIndex,
    optionLabel: optionLane(optionIndex),
    laneFamily: laneFamilyCandidate,
    wantsSeriesMark: parsed.wantsSeriesMark === true,
    wantsTitleStage: parsed.wantsTitleStage === true,
    styleFamily: isStyleFamilyKey(parsed.styleFamily) ? parsed.styleFamily : undefined,
    styleBucket: isStyleBucketKey(parsed.styleBucket)
      ? parsed.styleBucket
      : isStyleFamilyKey(parsed.styleFamily)
        ? STYLE_FAMILY_BANK[parsed.styleFamily].bucket
        : undefined,
    styleTone: isStyleToneKey(parsed.styleTone)
      ? parsed.styleTone
      : isStyleFamilyKey(parsed.styleFamily)
        ? STYLE_FAMILY_BANK[parsed.styleFamily].tone
        : undefined,
    styleMedium: isStyleMediumKey(parsed.styleMedium)
      ? parsed.styleMedium
      : isStyleFamilyKey(parsed.styleFamily)
        ? STYLE_FAMILY_BANK[parsed.styleFamily].medium
        : undefined,
    motifFocus: safeArrayOfStrings(parsed.motifFocus, []).slice(0, 2),
    motifScope:
      parsed.motifScope === "whole_book" || parsed.motifScope === "multi_passage" || parsed.motifScope === "specific_passage"
        ? parsed.motifScope
        : undefined
  };
}

function withResolvedLockupPaletteInput(
  input: Prisma.InputJsonValue,
  designBrief: DesignBrief,
  resolvedPalette: ResolvedLockupPalette
): Prisma.InputJsonValue {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      designBrief: {
        ...designBrief,
        resolvedLockupPalette: resolvedPalette
      }
    } as Prisma.InputJsonValue;
  }

  return {
    ...(input as Record<string, unknown>),
    designBrief: {
      ...designBrief,
      resolvedLockupPalette: resolvedPalette
    }
  } as Prisma.InputJsonValue;
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

function dedupeReferencesById(references: ReferenceLibraryItem[]): ReferenceLibraryItem[] {
  const deduped: ReferenceLibraryItem[] = [];
  const seen = new Set<string>();
  for (const reference of references) {
    const normalizedId = reference.id.trim().toLowerCase();
    if (!normalizedId || seen.has(normalizedId)) {
      continue;
    }
    seen.add(normalizedId);
    deduped.push(reference);
  }
  return deduped;
}

async function pickReferenceSetsForRound(
  projectId: string,
  round: number,
  optionCount: number,
  directionPlan?: readonly PlannedDirectionSpec[]
): Promise<ReferenceLibraryItem[][]> {
  const refs = await loadIndex();
  if (refs.length === 0) {
    return Array.from({ length: optionCount }, () => []);
  }

  const fallbackSets = await Promise.all(
    Array.from({ length: optionCount }, (_, optionIndex) =>
      sampleRefsForOption({
        projectId,
        round,
        optionIndex,
        n: 3
      })
    )
  );
  if (!directionPlan || round !== 1) {
    return fallbackSets;
  }

  const referenceById = new Map(refs.map((reference) => [reference.id.trim().toLowerCase(), reference] as const));
  return fallbackSets.map((fallbackRefs, optionIndex) => {
    const anchorId = directionPlan[optionIndex]?.referenceId?.trim().toLowerCase() || "";
    const anchorReference = anchorId ? referenceById.get(anchorId) || null : null;
    if (!anchorReference) {
      return fallbackRefs;
    }

    const merged = dedupeReferencesById([anchorReference, ...fallbackRefs]);
    return merged.slice(0, 3);
  });
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

async function normalizePngToShape(png: Buffer, shape: PreviewShape, focalPoint?: FocalPoint): Promise<Buffer> {
  const dimensions = PREVIEW_DIMENSIONS[shape];
  return resizeCoverWithFocalPoint({
    input: png,
    width: dimensions.width,
    height: dimensions.height,
    focalPoint
  });
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
  directionSpec?: PlannedDirectionSpec | null;
  styleFamily?: StyleFamily;
  lockupPresetId?: string | null;
  round?: number | null;
  hasDesignNotes?: boolean;
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
  const organizationTypographyDirection =
    params.project.brandMode === "brand" && params.project.brandKit?.source === "organization"
      ? params.project.brandKit.typographyDirection
      : null;
  const explicitStyleFamily = (params.styleFamily || null) as StyleFamily | null;
  const resolvedStyleFamily = (explicitStyleFamily || "clean-min") as StyleFamily;
  const usedCleanMinFallback = resolvedStyleFamily === "clean-min" && !explicitStyleFamily;
  const hasDesignNotes = params.hasDesignNotes ?? hasDesignDirection(params.project.designNotes, null);
  console.warn("[STYLEFAMILY FALLBACK]", {
    resolvedStyleFamily,
    usedCleanMinFallback,
    optionIndex: params.optionIndex,
    hasDesignNotes,
    round: params.round ?? null
  });
  const lockupStyleMode = resolveLockupStyleMode({
    directionSpec: params.directionSpec,
    styleFamily: resolvedStyleFamily,
    lockupPresetId: params.lockupPresetId,
    references: params.references,
    brandMode: params.project.brandMode,
    typographyDirection: organizationTypographyDirection
  });
  const lockupAccentPalette = params.project.brandKit ? normalizeHexPalette(parsePaletteJson(params.project.brandKit.paletteJson)) : [];
  const lockupPrompt = buildLockupGenerationPrompt({
    title: params.project.series_title,
    subtitle: params.project.series_subtitle || "",
    styleMode: lockupStyleMode,
    lockupLayout: defaultLockupLayoutForStyleMode(lockupStyleMode),
    directionSpec: params.directionSpec,
    references: params.references,
    brandMode: params.project.brandMode,
    typographyDirection: organizationTypographyDirection,
    optionalMarkAccentHexes: lockupAccentPalette
  });
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
    `Lane target: ${laneBriefHint(params.optionIndex, params.directionSpec)}`,
    title ? `Series title: ${title}` : "",
    subtitle ? `Series subtitle: ${subtitle}` : "",
    scripture ? `Scripture passages: ${scripture}` : "",
    description ? `Series description mood context (PROMPT-ONLY, never rendered): ${description}` : "",
    params.project.preferredAccentColors
      ? `Preferred accent colors: ${truncateForPrompt(params.project.preferredAccentColors, 180)}`
      : "",
    params.project.avoidColors ? `Avoid colors: ${truncateForPrompt(params.project.avoidColors, 180)}` : "",
    params.project.designNotes ? `Series design notes: ${truncateForPrompt(params.project.designNotes, 240)}` : "",
    params.feedbackRequest ? `User refinement request: ${params.feedbackRequest}` : "",
    params.palette.length > 0 ? `Brand palette: ${params.palette.join(", ")}` : "",
    referenceSummary ? `Reference summaries:\n${referenceSummary}` : "",
    `Lockup generation brief:\n${lockupPrompt}`,
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

function buildTemplateBackgroundPrompt(params: {
  brief: TemplateBrief;
  styleFamily: StyleFamily;
  shape: PreviewShape;
  generationId: string;
  directionSpec?: PlannedDirectionSpec | null;
  brandMode?: ProjectBrandMode;
  explorationMode?: boolean;
  seriesPreferenceGuidance?: string;
  bibleCreativeBrief?: BibleCreativeBrief | null;
  noTextBoost?: string;
  textArtifactRetryBoost?: string;
  originalityBoost?: string;
  brandPaletteHardConstraint?: string;
  paletteComplianceBoost?: string;
  toneComplianceBoost?: string;
}): string {
  const styleFamily = resolveDirectionStyleFamily(params.directionSpec);
  const directionHint = params.directionSpec
    ? [
        `Direction family: ${params.directionSpec.styleFamily || "unassigned"}.`,
        `Direction lane: ${params.directionSpec.laneFamily}.`,
        `Composition: ${params.directionSpec.compositionType}.`,
        `Background mode: ${params.directionSpec.backgroundMode}.`,
        `Type profile: ${params.directionSpec.typeProfile}.`,
        `Ornament profile: ${params.directionSpec.ornamentProfile}.`,
        params.directionSpec.lanePrompt
      ].join(" ")
    : "";
  const hardStyleConstraintLine = styleFamily
    ? `HARD STYLE CONSTRAINT: Bucket = ${styleFamily.bucket}. Follow bucket rules strictly.`
    : "";
  const bucketRulesLine = styleFamily ? `Bucket rules: ${styleFamily.bucketRules}` : "";
  const hardToneConstraintLine = styleFamily ? `HARD STYLE CONSTRAINT: Tone = ${styleFamily.tone}.` : "";
  const toneRulesLine = styleFamily ? `Tone rules: ${styleFamily.toneRules}` : "";
  const hardMediumConstraintLine = styleFamily ? `HARD STYLE CONSTRAINT: Medium = ${styleFamily.medium}.` : "";
  const mediumRulesLine = styleFamily ? `Medium rules: ${styleFamily.mediumRules}` : "";
  const styleFamilyBackgroundRulesLine = styleFamily
    ? `Style family: ${styleFamily.name}. Follow these rules strongly: ${styleFamily.backgroundRules.join(
        " "
      )} Forbids: ${styleFamily.forbids.join("; ")}.`
    : "";
  const variationTemplate =
    typeof params.directionSpec?.variationTemplateKey === "string" && params.directionSpec.variationTemplateKey.trim()
      ? getRound1VariationTemplateByKey(params.directionSpec.variationTemplateKey)
      : null;
  const variationTemplateLine = variationTemplate
    ? `Variation template (${variationTemplate.key}): ${variationTemplate.backgroundLayoutInstruction}`
    : "";
  const referenceAnchorContextLine = params.directionSpec?.referenceId
    ? `Reference anchor: ${params.directionSpec.referenceId} (${params.directionSpec.referenceCluster || "other"}, ${
        params.directionSpec.referenceTier || "unknown"
      }).`
    : "";
  const referenceAnchorDirectiveLine = params.directionSpec?.referenceId
    ? "REFERENCE ANCHOR: match palette logic, texture, typographic energy, composition style."
    : "";
  const originalityRuleLine = params.directionSpec?.referenceId
    ? "ORIGINALITY RULE: do NOT copy the reference layout; do NOT reuse the same motif; recomposition required."
    : "";
  const motifRecompositionLine = params.directionSpec?.referenceId
    ? "Use the sermon motif/themes (from our motif system) to create a new focal element."
    : "";
  const styleAuthorityOverrideLine =
    "If any style refs conflict with bucket/family/tone/medium rules, IGNORE the refs and follow bucket/family/tone/medium.";
  const backgroundTextFreeRuleLine =
    "BACKGROUND MUST BE TEXT-FREE: absolutely no words, letters, numbers, symbols resembling typography, watermarks, logos.";
  const ignoreTypographyRefLine =
    "If style refs show typography, ignore it completely and output only the graphical background style.";
  const explorationTextInvalidLine = params.explorationMode
    ? "If ANY text appears, the result is invalid. Prioritize removing/avoiding text over all other style cues."
    : "";
  const playfulBrandModeLine =
    params.brandMode === "brand" && styleFamily && PLAYFUL_STYLE_FAMILY_KEYS.has(styleFamily.key)
      ? "If brand mode, express playfulness via shapes/composition/texture only; DO NOT introduce forbidden hues."
      : "";
  // Bible creative brief fields are used as symbolic visual guidance for background generation.
  const bibleSummaryLine = params.bibleCreativeBrief ? `Bible brief summary: ${params.bibleCreativeBrief.summary}` : "";
  const bibleThemeLine =
    params.bibleCreativeBrief && params.bibleCreativeBrief.themes.length > 0
      ? `Themes: ${params.bibleCreativeBrief.themes.join(", ")}.`
      : "";
  const bibleMotifLine =
    params.bibleCreativeBrief && params.bibleCreativeBrief.motifs.length > 0
      ? `Motifs (symbolic cues): ${params.bibleCreativeBrief.motifs.slice(0, 8).join(", ")}.`
      : "";
  const motifFocus = safeArrayOfStrings(params.directionSpec?.motifFocus, []).slice(0, 2);
  const motifFocusLine =
    motifFocus.length > 0 ? `Primary motifs for this direction: ${motifFocus.join(", ")}. Incorporate these subtly.` : "";
  const motifScopeLine = params.directionSpec?.motifScope
    ? `Motif scope: ${params.directionSpec.motifScope}.`
    : "";
  const motifScopeRuleLine =
    params.directionSpec?.motifScope === "whole_book"
      ? "MOTIF SCOPE RULE: If this is a whole-book series, use book-wide themes as symbols. Do NOT pick a single story scene as the main symbol unless notes request it."
      : "";
  const allowedGenericMotifs = safeArrayOfStrings(params.bibleCreativeBrief?.allowedGenericMotifs, []);
  const allowedGenericForDirection = [...new Set([...allowedGenericMotifs, ...motifFocus])];
  const allowedGenericLine =
    allowedGenericForDirection.length > 0
      ? `Allowed generic motifs for this direction (if context truly demands): ${allowedGenericForDirection.join(", ")}.`
      : "Allowed generic motifs for this direction: none.";
  const genericMotifBanLine = `Do NOT use generic Christian icons (${GENERIC_CHRISTIAN_MOTIFS.join(
    ", "
  )}) unless explicitly listed in allowedGenericMotifs or motifFocus.`;
  const bibleDoNotUseLine =
    params.bibleCreativeBrief && params.bibleCreativeBrief.doNotUse.length > 0
      ? `Do not use: ${params.bibleCreativeBrief.doNotUse.join("; ")}.`
      : "";
  const titleStageInstructions =
    params.directionSpec?.wantsTitleStage === true
      ? buildTitleStageInstructions({
          format: params.shape,
          placementHint: resolveSafeAreaAnchor(params.directionSpec),
          mode: params.brandMode || "fresh"
        })
      : "";

  return [
    params.brandPaletteHardConstraint || "",
    hardStyleConstraintLine,
    bucketRulesLine,
    hardToneConstraintLine,
    toneRulesLine,
    hardMediumConstraintLine,
    mediumRulesLine,
    styleFamilyBackgroundRulesLine,
    referenceAnchorContextLine,
    referenceAnchorDirectiveLine,
    originalityRuleLine,
    motifRecompositionLine,
    variationTemplateLine,
    styleAuthorityOverrideLine,
    backgroundTextFreeRuleLine,
    ignoreTypographyRefLine,
    explorationTextInvalidLine,
    buildBackgroundPrompt(params.brief, params.styleFamily),
    directionHint,
    playfulBrandModeLine,
    bibleSummaryLine,
    bibleThemeLine,
    bibleMotifLine,
    motifScopeLine,
    motifScopeRuleLine,
    motifFocusLine,
    allowedGenericLine,
    genericMotifBanLine,
    params.seriesPreferenceGuidance || "",
    shapeCompositionHint(params.shape),
    "Incorporate 1-2 motifs subtly and symbolically; avoid literal portraits or face-centric depictions.",
    buildLockupSafeAreaInstructions(params.directionSpec),
    titleStageInstructions,
    "Avoid busy details in the lockup safe area; keep that region low-detail and low-contrast.",
    bibleDoNotUseLine,
    "Keep hierarchy disciplined and leave the lockup lane clean.",
    params.paletteComplianceBoost || "",
    params.toneComplianceBoost || "",
    params.noTextBoost || "",
    params.textArtifactRetryBoost || "",
    params.originalityBoost || "",
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
const TEXT_ARTIFACT_RETRY_OVERRIDE =
  "TEXT REMOVAL RETRY OVERRIDE: remove all typography artifacts; regenerate as pure background only; no letters/words at all.";

async function generateValidatedBackgroundPng(params: {
  brief: TemplateBrief;
  styleFamily: StyleFamily;
  shape: PreviewShape;
  generationId: string;
  directionSpec?: PlannedDirectionSpec | null;
  brandMode?: ProjectBrandMode;
  explorationMode?: boolean;
  seriesPreferenceGuidance?: string;
  bibleCreativeBrief?: BibleCreativeBrief | null;
  referenceDataUrls: string[];
  focalPoint?: FocalPoint;
  originalityBoost?: string;
  brandPaletteHardConstraint?: string;
  paletteComplianceBoost?: string;
  toneComplianceBoost?: string;
  textArtifactRetryBoost?: string;
}): Promise<{ backgroundPng: Buffer; prompt: string; textRetryCount: number; textCheckPassed: boolean }> {
  let lastPrompt = "";
  let lastBackgroundPng: Buffer | null = null;

  for (let attempt = 0; attempt <= 2; attempt += 1) {
    const noTextBoost = attempt === 0 ? undefined : NO_TEXT_RETRY_BOOSTS[attempt - 1];
    const prompt = buildTemplateBackgroundPrompt({
      brief: params.brief,
      styleFamily: params.styleFamily,
      shape: params.shape,
      generationId: params.generationId,
      directionSpec: params.directionSpec,
      brandMode: params.brandMode,
      explorationMode: params.explorationMode,
      seriesPreferenceGuidance: params.seriesPreferenceGuidance,
      bibleCreativeBrief: params.bibleCreativeBrief,
      originalityBoost: params.originalityBoost,
      brandPaletteHardConstraint: params.brandPaletteHardConstraint,
      paletteComplianceBoost: params.paletteComplianceBoost,
      toneComplianceBoost: params.toneComplianceBoost,
      textArtifactRetryBoost: params.textArtifactRetryBoost,
      noTextBoost
    });

    const backgroundSource = await generateCleanMinimalBackgroundPng({
      prompt,
      shape: params.shape,
      referenceDataUrls: params.referenceDataUrls
    });
    const backgroundPng = await normalizePngToShape(backgroundSource, params.shape, params.focalPoint);
    const hasText = await imageHasReadableText(backgroundPng);
    if (!hasText) {
      return {
        backgroundPng,
        prompt,
        textRetryCount: attempt,
        textCheckPassed: true
      };
    }

    lastPrompt = prompt;
    lastBackgroundPng = backgroundPng;
  }

  return {
    backgroundPng: lastBackgroundPng as Buffer,
    prompt: lastPrompt,
    textRetryCount: 2,
    textCheckPassed: false
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

function toBackgroundOnlyDesignDoc(designDoc: DesignDoc): DesignDoc {
  return {
    ...designDoc,
    layers: designDoc.layers.filter((layer) => layer.type !== "text")
  };
}

async function renderBackgroundOnlyPreviewPng(designDoc: DesignDoc): Promise<Buffer> {
  const svg = await buildFinalSvg(toBackgroundOnlyDesignDoc(designDoc));
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
  const [squarePng, widePng, tallPng, squareBackgroundPng, wideBackgroundPng, tallBackgroundPng, lockupResult] = await Promise.all([
    renderCompositedPreviewPng(designDocByShape.square),
    renderCompositedPreviewPng(designDocByShape.wide),
    renderCompositedPreviewPng(designDocByShape.tall),
    renderBackgroundOnlyPreviewPng(designDocByShape.square),
    renderBackgroundOnlyPreviewPng(designDocByShape.wide),
    renderBackgroundOnlyPreviewPng(designDocByShape.tall),
    (async () =>
      renderTrimmedLockupPngFromSvg(
        await buildFinalSvg(designDocByShape.wide, {
          includeBackground: false,
          includeImages: false
        })
      ))()
  ]);
  const [squarePath, widePath, tallPath, squareBackgroundPath, wideBackgroundPath, tallBackgroundPath, lockupPath] =
    await Promise.all([
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
      }),
      writeGenerationPreviewFiles({
        fileName: `${params.generationId}-square-bg.png`,
        png: squareBackgroundPng
      }),
      writeGenerationPreviewFiles({
        fileName: `${params.generationId}-wide-bg.png`,
        png: wideBackgroundPng
      }),
      writeGenerationPreviewFiles({
        fileName: `${params.generationId}-tall-bg.png`,
        png: tallBackgroundPng
      }),
      writeGenerationPreviewFiles({
        fileName: `${params.generationId}-lockup.png`,
        png: lockupResult.png
      })
    ]);
  const backgroundAssetRows: Prisma.AssetCreateManyInput[] = PREVIEW_SHAPES.map((shape) => ({
    projectId: params.projectId,
    generationId: params.generationId,
    kind: "BACKGROUND",
    slot: BACKGROUND_ASSET_SLOT_BY_SHAPE[shape],
    file_path:
      shape === "square" ? squareBackgroundPath : shape === "wide" ? wideBackgroundPath : tallBackgroundPath,
    mime_type: "image/png",
    width: PREVIEW_DIMENSIONS[shape].width,
    height: PREVIEW_DIMENSIONS[shape].height
  }));
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
  const lockupAssetRow: Prisma.AssetCreateManyInput = {
    projectId: params.projectId,
    generationId: params.generationId,
    kind: "LOCKUP",
    slot: LOCKUP_ASSET_SLOT,
    file_path: lockupPath,
    mime_type: "image/png",
    width: lockupResult.width,
    height: lockupResult.height
  };

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
      data: [...backgroundAssetRows, lockupAssetRow, ...finalAssetRows]
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
  organizationId: string;
  project: GenerationProjectContext & { id: string };
  plannedGenerations: PlannedGeneration[];
  bibleCreativeBrief?: BibleCreativeBrief | null;
  motifBankContext?: MotifBankContext;
}): Promise<void> {
  const openAiEnabled = isOpenAiPreviewGenerationEnabled() && Boolean(process.env.OPENAI_API_KEY?.trim());
  const referenceIndex = await loadIndex();
  const reusableAssetsByGenerationId = new Map<string, ReusableGenerationAssets | null>();
  const initialGenerationInput = params.plannedGenerations[0]?.input;
  const seriesPreferenceNotes = readSeriesPreferencesDesignNotesFromInput(initialGenerationInput);
  const motifBankContext =
    params.motifBankContext ||
    getMotifBankContext({
      title: params.project.series_title,
      subtitle: params.project.series_subtitle,
      scripturePassages: params.project.scripture_passages,
      description: params.project.series_description,
      designNotes: params.project.designNotes || seriesPreferenceNotes || null
    });
  const bibleCreativeBrief =
    params.bibleCreativeBrief ||
    (await extractBibleCreativeBrief({
      title: params.project.series_title,
      subtitle: params.project.series_subtitle,
      scripturePassages: params.project.scripture_passages,
      description: params.project.series_description,
      designNotes: params.project.designNotes || seriesPreferenceNotes || null,
      motifBankContext
    }));
  const orgAllowedBrandPalette =
    params.project.brandMode === "brand" ? parseAllowedPaletteFromOrgBrandKit(params.project.brandKit) : [];
  const brandPaletteHardConstraintPrompt =
    params.project.brandMode === "brand" ? buildBrandPaletteHardConstraintPrompt(orgAllowedBrandPalette) : "";
  const brandPaletteComplianceHexes =
    params.project.brandMode === "brand" && orgAllowedBrandPalette.length > 0
      ? [...new Set([...orgAllowedBrandPalette, ...BRAND_NEUTRAL_HEXES])]
      : [];
  const organizationTypographyDirection =
    params.project.brandMode === "brand" && params.project.brandKit?.source === "organization"
      ? params.project.brandKit.typographyDirection
      : null;
  let cachedRecentStyleFamiliesForFallback: StyleFamilyKey[] | null = null;
  const getRecentStyleFamiliesForFallback = async (): Promise<StyleFamilyKey[]> => {
    if (cachedRecentStyleFamiliesForFallback) {
      return cachedRecentStyleFamiliesForFallback;
    }
    cachedRecentStyleFamiliesForFallback = await loadRecentStyleFamilies({
      organizationId: params.organizationId,
      projectId: params.project.id,
      limit: 24
    });
    return cachedRecentStyleFamiliesForFallback;
  };

  for (const plannedGeneration of params.plannedGenerations) {
    const fallbackOutput = plannedGeneration.fallbackOutput;
    const fallbackStyleFamilyDebug = fallbackOutput.meta.debug?.styleFamilyFallback;

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
      const feedbackControls = readFeedbackGenerationControls(plannedGeneration.input);
      const seriesPreferenceGuidance = buildSeriesPreferenceGuidance(params.project);
      const designBrief = readDesignBriefFromInput(plannedGeneration.input);
      if (!designBrief) {
        throw new Error("Generation input is missing a valid designBrief payload.");
      }
      const runSeed = readRunSeedFromInput(plannedGeneration.input) || plannedGeneration.id;
      const directionSpec = readDirectionSpecFromInput(plannedGeneration.input, plannedGeneration.optionIndex);
      const inputSeriesDesignNotes = readSeriesPreferencesDesignNotesFromInput(plannedGeneration.input);
      const hasDesignNotes = hasDesignDirection(params.project.designNotes, inputSeriesDesignNotes);
      const shouldRunExplorationToneCheck = plannedGeneration.round === 1 && !hasDesignNotes;
      const displayContent = buildOverlayDisplayContent({
        title: designBrief.seriesTitle || params.project.series_title,
        subtitle: designBrief.seriesSubtitle || params.project.series_subtitle,
        scripturePassages: designBrief.passage || params.project.scripture_passages
      });
      const content = {
        title: displayContent.title,
        subtitle: displayContent.subtitle
      };
      const sourceLockupRecipe = designBrief.lockupRecipe;
      const lockupPresetId = designBrief.lockupPresetId || directionSpec?.lockupPresetId;
      const optionStyleFamily = ((directionSpec?.templateStyleFamily ||
        designBrief.styleFamilies[plannedGeneration.optionIndex] ||
        designBrief.styleFamilies[0]) as StyleFamily);
      const sampledReferences =
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
      const anchorReferenceId = directionSpec?.referenceId?.trim().toLowerCase() || "";
      const anchorReference =
        anchorReferenceId.length > 0
          ? sampledReferences.find((reference) => reference.id.trim().toLowerCase() === anchorReferenceId) ||
            referenceIndex.find((reference) => reference.id.trim().toLowerCase() === anchorReferenceId) ||
            null
          : null;
      const references = anchorReference
        ? dedupeReferencesById([anchorReference, ...sampledReferences]).slice(0, 3)
        : sampledReferences;
      const lockupStyleMode = resolveLockupStyleMode({
        directionSpec,
        styleFamily: optionStyleFamily,
        lockupPresetId,
        references,
        brandMode: params.project.brandMode,
        typographyDirection: organizationTypographyDirection
      });
      const plannedLockupLayout = readLockupLayoutFromInput(plannedGeneration.input);
      const lockupLayout = plannedLockupLayout || defaultLockupLayoutForStyleMode(lockupStyleMode);
      const lockupPrompt = buildLockupGenerationPrompt({
        title: content.title,
        subtitle: content.subtitle,
        styleMode: lockupStyleMode,
        lockupLayout,
        directionSpec,
        references,
        bibleCreativeBrief,
        wantsSeriesMark: directionSpec?.wantsSeriesMark || false,
        brandMode: params.project.brandMode,
        typographyDirection: organizationTypographyDirection,
        optionalMarkAccentHexes: palette
      });
      const lockupIntegrationMode = chooseLockupIntegrationMode(lockupStyleMode);
      const referenceDataUrls = await buildReferenceDataUrls(references);
      const templateBrief: TemplateBrief = {
        title: content.title,
        subtitle: content.subtitle,
        scripture: designBrief.passage || params.project.scripture_passages || "",
        keywords: designBrief.keywords || [],
        palette,
        lockupRecipe: sourceLockupRecipe,
        lockupPresetId
      };
      const fontSeedBase = [
        runSeed,
        String(plannedGeneration.optionIndex),
        lockupPresetId || "auto-preset",
        optionStyleFamily
      ].join("|");
      const masterDimensions = PREVIEW_DIMENSIONS[OPTION_MASTER_BACKGROUND_SHAPE];
      let reusableAssets: ReusableGenerationAssets | null = null;
      if (
        feedbackControls.chosenGenerationId &&
        (feedbackControls.regenerateBackground === false || feedbackControls.regenerateLockup === false)
      ) {
        if (!reusableAssetsByGenerationId.has(feedbackControls.chosenGenerationId)) {
          reusableAssetsByGenerationId.set(
            feedbackControls.chosenGenerationId,
            await loadReusableAssetsFromGeneration({
              projectId: params.project.id,
              generationId: feedbackControls.chosenGenerationId
            })
          );
        }
        reusableAssets = reusableAssetsByGenerationId.get(feedbackControls.chosenGenerationId) || null;
      }
      const shouldReuseBackground =
        feedbackControls.regenerateBackground === false && Boolean(reusableAssets?.masterBackgroundPng);
      const shouldReuseLockup = feedbackControls.regenerateLockup === false && Boolean(reusableAssets?.lockupPng);
      const initialDirectionStyleFields = resolveDirectionStyleFields(directionSpec);
      let effectiveDirectionStyleFamily =
        (shouldReuseBackground || shouldReuseLockup) && reusableAssets?.styleFamily
          ? reusableAssets.styleFamily
          : initialDirectionStyleFields.styleFamily;
      let effectiveDirectionStyleBucket =
        (shouldReuseBackground || shouldReuseLockup) && reusableAssets?.styleBucket
          ? reusableAssets.styleBucket
          : initialDirectionStyleFields.styleBucket ||
            (effectiveDirectionStyleFamily ? STYLE_FAMILY_BANK[effectiveDirectionStyleFamily].bucket : null);
      let effectiveDirectionStyleTone =
        (shouldReuseBackground || shouldReuseLockup) && reusableAssets?.styleTone
          ? reusableAssets.styleTone
          : initialDirectionStyleFields.styleTone ||
            (effectiveDirectionStyleFamily ? STYLE_FAMILY_BANK[effectiveDirectionStyleFamily].tone : null);
      let effectiveDirectionStyleMedium =
        (shouldReuseBackground || shouldReuseLockup) && reusableAssets?.styleMedium
          ? reusableAssets.styleMedium
          : initialDirectionStyleFields.styleMedium ||
            (effectiveDirectionStyleFamily ? STYLE_FAMILY_BANK[effectiveDirectionStyleFamily].medium : null);
      let backgroundDirectionSpec = directionSpec;
      const lockupRecipeForRender = shouldReuseLockup
        ? sourceLockupRecipe
        : applyLockupRecipeGuardrails({
            lockupRecipe: sourceLockupRecipe,
            styleMode: lockupStyleMode,
            lockupLayout
          });
      const typographicRecipe = lockupTypographicRecipeForArchetype(lockupLayout);
      const titleSafeBox: TitleSafeBox = LOCKUP_SAFE_REGION_RATIOS[OPTION_MASTER_BACKGROUND_SHAPE];
      let rerankMeta: RerankDebugMeta = {};

      const resolveToneTargetFromDirectionSpec = (targetDirectionSpec?: PlannedDirectionSpec | null) => {
        const styleTone = resolveDirectionStyleFields(targetDirectionSpec).styleTone;
        return shouldCheckToneCompliance(styleTone) ? styleTone : null;
      };

      const renderMasterAttempt = async (attemptParams: {
        directionSpecOverride?: PlannedDirectionSpec | null;
        originalityBoost?: string;
        candidateSuffix?: string;
      } = {}) => {
        if (shouldReuseBackground && reusableAssets?.masterBackgroundPng) {
          const backgroundPng = await normalizePngToShape(
            reusableAssets.masterBackgroundPng,
            OPTION_MASTER_BACKGROUND_SHAPE,
            resolveRecipeFocalPoint(lockupRecipeForRender, OPTION_MASTER_BACKGROUND_SHAPE)
          );
          const hash = await computeDHashFromBuffer(backgroundPng);
          return {
            prompt: `reused background from generation ${reusableAssets.sourceGenerationId}`,
            textRetryCount: 0,
            backgroundPng,
            closestDistance: findClosestReferenceDistance(hash, references),
            paletteRetryCount: 0,
            paletteComplianceScore: null as PaletteComplianceScore | null,
            toneRetryCount: 0,
            toneCheck: null as ToneCheckSummary | null,
            textArtifactRetryCount: 0,
            backgroundTextCheck: null as BackgroundTextCheckSummary | null,
            textCheckPassed: true
          };
        }

        const activeDirectionSpec =
          attemptParams.directionSpecOverride === undefined ? backgroundDirectionSpec : attemptParams.directionSpecOverride;
        const toneTargetForCompliance = shouldRunExplorationToneCheck
          ? resolveToneTargetFromDirectionSpec(activeDirectionSpec)
          : null;
        const generationSeedPrefix = `${runSeed}|${plannedGeneration.optionIndex}${attemptParams.candidateSuffix || ""}`;
        const initialBackground = await generateValidatedBackgroundPng({
          brief: templateBrief,
          styleFamily: optionStyleFamily,
          shape: OPTION_MASTER_BACKGROUND_SHAPE,
          generationId: generationSeedPrefix,
          directionSpec: activeDirectionSpec,
          brandMode: params.project.brandMode,
          explorationMode: shouldRunExplorationToneCheck,
          seriesPreferenceGuidance,
          bibleCreativeBrief,
          referenceDataUrls,
          focalPoint: resolveRecipeFocalPoint(lockupRecipeForRender, OPTION_MASTER_BACKGROUND_SHAPE),
          originalityBoost: attemptParams.originalityBoost,
          brandPaletteHardConstraint: brandPaletteHardConstraintPrompt
        });

        let validatedBackground = initialBackground;
        let paletteRetryCount = 0;
        let paletteComplianceScore: PaletteComplianceScore | null = null;
        let toneRetryCount = 0;
        let textArtifactRetryCount = 0;
        let toneCheck: ToneCheckSummary | null = shouldRunExplorationToneCheck
          ? {
              attempted: false,
              passed: true,
              statsBefore: null,
              statsAfter: null,
              retried: false,
              failuresBefore: [],
              failuresAfter: []
            }
          : null;
        let backgroundTextCheck: BackgroundTextCheckSummary | null = shouldRunExplorationToneCheck
          ? {
              attempted: false,
              detected: false,
              retried: false
            }
          : null;

        if (brandPaletteComplianceHexes.length > 0) {
          try {
            paletteComplianceScore = await scorePaletteCompliance(validatedBackground.backgroundPng, brandPaletteComplianceHexes);
            if (paletteComplianceScore && !paletteComplianceScore.isCompliant) {
              console.warn(
                `[brand-palette-retry] generation=${plannedGeneration.id} option=${plannedGeneration.optionIndex} farRatio=${(
                  paletteComplianceScore.farSampleRatio * 100
                ).toFixed(1)}% farSamples=${paletteComplianceScore.farSampleCount}/${paletteComplianceScore.sampleCount} avgDistance=${paletteComplianceScore.averageNearestDistance.toFixed(
                  1
                )}`
              );
              paletteRetryCount = 1;
              validatedBackground = await generateValidatedBackgroundPng({
                brief: templateBrief,
                styleFamily: optionStyleFamily,
                shape: OPTION_MASTER_BACKGROUND_SHAPE,
                generationId: `${generationSeedPrefix}|palette-retry`,
                directionSpec: activeDirectionSpec,
                brandMode: params.project.brandMode,
                explorationMode: shouldRunExplorationToneCheck,
                seriesPreferenceGuidance,
                bibleCreativeBrief,
                referenceDataUrls,
                focalPoint: resolveRecipeFocalPoint(lockupRecipeForRender, OPTION_MASTER_BACKGROUND_SHAPE),
                originalityBoost: attemptParams.originalityBoost,
                brandPaletteHardConstraint: brandPaletteHardConstraintPrompt,
                paletteComplianceBoost: BRAND_PALETTE_STRICT_RETRY_BOOST
              });
              paletteComplianceScore = await scorePaletteCompliance(validatedBackground.backgroundPng, brandPaletteComplianceHexes);
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown palette compliance scoring error";
            console.warn(
              `[brand-palette-compliance] scoring failed for generation=${plannedGeneration.id} option=${plannedGeneration.optionIndex}: ${message}`
            );
          }
        }

        if (shouldRunExplorationToneCheck && toneTargetForCompliance) {
          toneCheck = {
            attempted: true,
            passed: true,
            statsBefore: null,
            statsAfter: null,
            retried: false,
            failuresBefore: [],
            failuresAfter: []
          };
          const statsBefore =
            (await computeImageToneStatsFromUrl(pngBufferToDataUrl(validatedBackground.backgroundPng))) ||
            (await computeImageToneStatsFromBuffer(validatedBackground.backgroundPng));
          toneCheck.statsBefore = statsBefore;
          toneCheck.statsAfter = statsBefore;
          const toneEvaluationBefore = statsBefore
            ? evaluateToneCompliance(toneTargetForCompliance, statsBefore)
            : { passed: false, failures: ["stats-unavailable"] };
          toneCheck.failuresBefore = toneEvaluationBefore.failures;
          toneCheck.failuresAfter = toneEvaluationBefore.failures;
          toneCheck.passed = toneEvaluationBefore.passed;

          if (!toneEvaluationBefore.passed) {
            console.warn(
              `[tone-compliance-retry] generation=${plannedGeneration.id} option=${plannedGeneration.optionIndex} tone=${toneTargetForCompliance} reasons=${toneEvaluationBefore.failures.join(",")}`
            );
            toneRetryCount = 1;
            toneCheck.retried = true;

            validatedBackground = await generateValidatedBackgroundPng({
                brief: templateBrief,
                styleFamily: optionStyleFamily,
                shape: OPTION_MASTER_BACKGROUND_SHAPE,
                generationId: `${generationSeedPrefix}|tone-retry`,
                directionSpec: activeDirectionSpec,
                brandMode: params.project.brandMode,
                explorationMode: shouldRunExplorationToneCheck,
                seriesPreferenceGuidance,
                bibleCreativeBrief,
                referenceDataUrls,
                focalPoint: resolveRecipeFocalPoint(lockupRecipeForRender, OPTION_MASTER_BACKGROUND_SHAPE),
                originalityBoost: attemptParams.originalityBoost,
                brandPaletteHardConstraint: brandPaletteHardConstraintPrompt,
                paletteComplianceBoost: paletteRetryCount > 0 ? BRAND_PALETTE_STRICT_RETRY_BOOST : undefined,
                toneComplianceBoost: toneOverrideRetryBoost(toneTargetForCompliance)
            });

            if (brandPaletteComplianceHexes.length > 0) {
              try {
                paletteComplianceScore = await scorePaletteCompliance(validatedBackground.backgroundPng, brandPaletteComplianceHexes);
              } catch (error) {
                const message = error instanceof Error ? error.message : "Unknown palette compliance scoring error";
                console.warn(
                  `[brand-palette-compliance] scoring failed for generation=${plannedGeneration.id} option=${plannedGeneration.optionIndex}: ${message}`
                );
              }
            }

            const statsAfter =
              (await computeImageToneStatsFromUrl(pngBufferToDataUrl(validatedBackground.backgroundPng))) ||
              (await computeImageToneStatsFromBuffer(validatedBackground.backgroundPng));
            toneCheck.statsAfter = statsAfter;
            const toneEvaluationAfter = statsAfter
              ? evaluateToneCompliance(toneTargetForCompliance, statsAfter)
              : { passed: false, failures: ["stats-unavailable"] };
            toneCheck.failuresAfter = toneEvaluationAfter.failures;
            toneCheck.passed = toneEvaluationAfter.passed;
          }
        }

        if (shouldRunExplorationToneCheck) {
          backgroundTextCheck = {
            attempted: true,
            detected: false,
            retried: false
          };
          const textArtifactsDetected = await detectTextArtifactsHeuristic(validatedBackground.backgroundPng);
          backgroundTextCheck.detected = textArtifactsDetected;

          if (textArtifactsDetected) {
            console.warn(
              `[text-artifact-retry] generation=${plannedGeneration.id} option=${plannedGeneration.optionIndex} detected=true`
            );
            textArtifactRetryCount = 1;
            backgroundTextCheck.retried = true;

            validatedBackground = await generateValidatedBackgroundPng({
                brief: templateBrief,
                styleFamily: optionStyleFamily,
                shape: OPTION_MASTER_BACKGROUND_SHAPE,
                generationId: `${generationSeedPrefix}|text-artifact-retry`,
                directionSpec: activeDirectionSpec,
                brandMode: params.project.brandMode,
                explorationMode: shouldRunExplorationToneCheck,
                seriesPreferenceGuidance,
                bibleCreativeBrief,
                referenceDataUrls,
                focalPoint: resolveRecipeFocalPoint(lockupRecipeForRender, OPTION_MASTER_BACKGROUND_SHAPE),
                originalityBoost: attemptParams.originalityBoost,
                brandPaletteHardConstraint: brandPaletteHardConstraintPrompt,
                paletteComplianceBoost: paletteRetryCount > 0 ? BRAND_PALETTE_STRICT_RETRY_BOOST : undefined,
                toneComplianceBoost: toneTargetForCompliance ? toneOverrideRetryBoost(toneTargetForCompliance) : undefined,
                textArtifactRetryBoost: TEXT_ARTIFACT_RETRY_OVERRIDE
            });

            if (brandPaletteComplianceHexes.length > 0) {
              try {
                paletteComplianceScore = await scorePaletteCompliance(validatedBackground.backgroundPng, brandPaletteComplianceHexes);
              } catch (error) {
                const message = error instanceof Error ? error.message : "Unknown palette compliance scoring error";
                console.warn(
                  `[brand-palette-compliance] scoring failed for generation=${plannedGeneration.id} option=${plannedGeneration.optionIndex}: ${message}`
                );
              }
            }

            if (toneTargetForCompliance && toneCheck) {
              const statsAfterTextRetry =
                (await computeImageToneStatsFromUrl(pngBufferToDataUrl(validatedBackground.backgroundPng))) ||
                (await computeImageToneStatsFromBuffer(validatedBackground.backgroundPng));
              toneCheck.statsAfter = statsAfterTextRetry;
              const toneEvaluationAfterTextRetry = statsAfterTextRetry
                ? evaluateToneCompliance(toneTargetForCompliance, statsAfterTextRetry)
                : { passed: false, failures: ["stats-unavailable"] };
              toneCheck.failuresAfter = toneEvaluationAfterTextRetry.failures;
              toneCheck.passed = toneEvaluationAfterTextRetry.passed;
            }
          }
        }

        const backgroundPng = validatedBackground.backgroundPng;
        const hash = await computeDHashFromBuffer(backgroundPng);
        const closestDistance = findClosestReferenceDistance(hash, references);

        return {
          prompt: validatedBackground.prompt,
          textRetryCount: validatedBackground.textRetryCount,
          backgroundPng,
          closestDistance,
          paletteRetryCount,
          paletteComplianceScore,
          toneRetryCount,
          toneCheck,
          textArtifactRetryCount,
          backgroundTextCheck,
          textCheckPassed: validatedBackground.textCheckPassed
        };
      };

      const runBackgroundRerankAttempt = async (params: {
        stage: "primary" | "fallback_family" | "fallback_set";
        attemptNumber: number;
        directionSpecOverride?: PlannedDirectionSpec | null;
        originalityBoost?: string;
      }) => {
        if (!shouldRunExplorationToneCheck || shouldReuseBackground) {
          const attempt = await renderMasterAttempt({
            directionSpecOverride: params.directionSpecOverride,
            originalityBoost: params.originalityBoost
          });
          return {
            attempt,
            winnerIndex: 0,
            bestScore: Number.POSITIVE_INFINITY,
            laneFailed: false,
            candidates: [] as BackgroundRerankCandidateDebug[],
            winner: null as BackgroundRerankWinnerDebug | null
          };
        }

        const activeDirectionSpec =
          params.directionSpecOverride === undefined ? backgroundDirectionSpec : params.directionSpecOverride;
        const candidateTag = params.originalityBoost ? `${params.stage}-orig` : `${params.stage}-base`;
        const toneTargetForCompliance = resolveToneTargetFromDirectionSpec(activeDirectionSpec);
        const styleFields = resolveDirectionStyleFields(activeDirectionSpec);
        const candidates: Array<{
          attempt: Awaited<ReturnType<typeof renderMasterAttempt>>;
          score: number;
          checks: {
            textFree: boolean;
            tonePass: boolean;
            designPresencePass: boolean;
            hardFailBlankDesign: boolean;
          };
          stats: {
            tone: ImageToneStats | null;
            titleSafe: TitleSafeRegionScore | null;
            midtoneRange: MidtoneRangeScore | null;
            hardFail: BackgroundHardFailStats | null;
          };
          debugUrl: string;
        }> = [];

        for (let candidateIndex = 0; candidateIndex < ROUND1_EXPLORATION_BACKGROUND_CANDIDATE_COUNT; candidateIndex += 1) {
          const attempt = await renderMasterAttempt({
            directionSpecOverride: activeDirectionSpec,
            originalityBoost: params.originalityBoost,
            candidateSuffix: `|${candidateTag}-bg-candidate-${candidateIndex}`
          });
          const toneStats = attempt.toneCheck?.statsAfter || (await computeImageToneStatsFromBuffer(attempt.backgroundPng));
          const tonePass = toneTargetForCompliance
            ? toneStats
              ? evaluateToneCompliance(toneTargetForCompliance, toneStats).passed
              : false
            : true;
          const textArtifactDetected = await detectTextArtifactsHeuristic(attempt.backgroundPng);
          const textFree = attempt.textCheckPassed && !textArtifactDetected;
          const designPresencePass = passesDesignPresence(toneStats);
          const hardFail = await computeBackgroundHardFailStatsFromBuffer(attempt.backgroundPng, titleSafeBox);
          const hardFailBlankDesign = !hardFail || !hardFail.passes;
          const titleSafe = await scoreTitleSafeRegion(pngBufferToDataUrl(attempt.backgroundPng), titleSafeBox);
          const midtoneRange = await scoreMidtoneRangeFromBuffer(attempt.backgroundPng);
          let score = 0;
          score += tonePass ? 140 : -140;
          score += textFree ? 140 : -140;
          score += designPresencePass ? 90 : -90;
          score += hardFailBlankDesign ? -240 : 120;
          score += (titleSafe?.score || 0) * 30;
          score += (midtoneRange?.score || 0) * 35;
          score -= attempt.textRetryCount * 2;
          score -= attempt.textArtifactRetryCount * 4;
          const debugUrl = await writeGenerationPreviewFiles({
            fileName: `${plannedGeneration.id}-${candidateTag}-bg-candidate-${candidateIndex}.png`,
            png: attempt.backgroundPng
          });

          candidates.push({
            attempt,
            score,
            checks: {
              textFree,
              tonePass,
              designPresencePass,
              hardFailBlankDesign
            },
            stats: {
              tone: toneStats,
              titleSafe,
              midtoneRange,
              hardFail
            },
            debugUrl
          });
        }

        const eligible = candidates
          .map((candidate, index) => ({ candidate, index }))
          .filter(
            (entry) =>
              entry.candidate.checks.textFree &&
              entry.candidate.checks.tonePass &&
              entry.candidate.checks.designPresencePass &&
              !entry.candidate.checks.hardFailBlankDesign
          );
        const pool = eligible.length > 0 ? eligible : candidates.map((candidate, index) => ({ candidate, index }));
        const winner = pool.reduce((best, current) => (current.candidate.score > best.candidate.score ? current : best), pool[0]);
        const bestScore = winner.candidate.score;
        const laneFailed = eligible.length <= 0 || bestScore < ROUND1_RERANK_MIN_ACCEPTABLE_SCORE;

        return {
          attempt: winner.candidate.attempt,
          winnerIndex: winner.index,
          bestScore,
          laneFailed,
          candidates: candidates.map((candidate) => ({
            url: candidate.debugUrl,
            stage: params.stage,
            attempt: params.attemptNumber,
            styleFamily: styleFields.styleFamily,
            explorationSetKey: styleFields.explorationSetKey,
            score: candidate.score,
            checks: candidate.checks,
            stats: {
              textRetryCount: candidate.attempt.textRetryCount,
              toneRetryCount: candidate.attempt.toneRetryCount,
              closestDistance: candidate.attempt.closestDistance,
              tone: candidate.stats.tone,
              titleSafe: candidate.stats.titleSafe,
              midtoneRange: candidate.stats.midtoneRange,
              hardFail: candidate.stats.hardFail
            }
          })),
          winner: {
            index: winner.index,
            url: winner.candidate.debugUrl,
            stage: params.stage,
            attempt: params.attemptNumber,
            styleFamily: styleFields.styleFamily,
            explorationSetKey: styleFields.explorationSetKey,
            score: winner.candidate.score
          }
        };
      };

      const selectBackgroundWinner = async (originalityBoost?: string) => {
        if (!shouldRunExplorationToneCheck || shouldReuseBackground) {
          return {
            attempt: await renderMasterAttempt({ originalityBoost }),
            winnerIndex: 0,
            laneFailed: false
          };
        }

        const fallback: BackgroundRerankFallbackDebug = {
          usedAltFamily: false,
          usedAltSet: false,
          attempts: 1
        };
        const aggregatedCandidates: BackgroundRerankCandidateDebug[] = [];
        let globalWinnerIndex = 0;
        let winner: BackgroundRerankWinnerDebug | null = null;

        const appendAttempt = (result: Awaited<ReturnType<typeof runBackgroundRerankAttempt>>) => {
          const startIndex = aggregatedCandidates.length;
          aggregatedCandidates.push(...result.candidates);
          globalWinnerIndex = startIndex + result.winnerIndex;
          winner = result.winner
            ? {
                ...result.winner,
                index: globalWinnerIndex
              }
            : null;
        };

        let activeDirectionSpec = backgroundDirectionSpec;
        let selection = await runBackgroundRerankAttempt({
          stage: "primary",
          attemptNumber: fallback.attempts,
          directionSpecOverride: activeDirectionSpec,
          originalityBoost
        });
        appendAttempt(selection);

        const laneFamily = directionSpec?.laneFamily;
        const laneTone = initialDirectionStyleFields.styleTone;
        const laneMedium = initialDirectionStyleFields.styleMedium;
        const baseStyleFamily = initialDirectionStyleFields.styleFamily;
        const baseSetKey = initialDirectionStyleFields.explorationSetKey;
        const recentFamiliesForFallback = await getRecentStyleFamiliesForFallback();

        if (selection.laneFailed && laneFamily && laneTone && laneMedium && baseStyleFamily) {
          const currentStyleFields = resolveDirectionStyleFields(activeDirectionSpec);
          const currentFamilyForFallback = currentStyleFields.styleFamily || baseStyleFamily;
          const currentSetForFallback = currentStyleFields.explorationSetKey || baseSetKey;
          const altFamilyFallback = pickExplorationFallbackStyleFamily({
            runSeed: `${runSeed}|${plannedGeneration.optionIndex}|fallback-family`,
            laneFamily,
            currentStyleFamily: currentFamilyForFallback,
            currentExplorationSetKey: currentSetForFallback,
            tone: laneTone,
            medium: laneMedium,
            recentStyleFamilies: recentFamiliesForFallback,
            setConstraint: "same"
          });
          if (altFamilyFallback && altFamilyFallback.family !== currentFamilyForFallback) {
            activeDirectionSpec = applyFallbackStyleFamilyToDirectionSpec({
              directionSpec: activeDirectionSpec,
              styleFamily: altFamilyFallback.family,
              explorationSetKey: altFamilyFallback.explorationSetKey,
              explorationLaneKey: altFamilyFallback.explorationLaneKey
            });
            fallback.usedAltFamily = true;
            fallback.attempts += 1;
            selection = await runBackgroundRerankAttempt({
              stage: "fallback_family",
              attemptNumber: fallback.attempts,
              directionSpecOverride: activeDirectionSpec,
              originalityBoost
            });
            appendAttempt(selection);
          }
        }

        if (selection.laneFailed && laneFamily && laneTone && laneMedium && baseStyleFamily) {
          const currentStyleFields = resolveDirectionStyleFields(activeDirectionSpec);
          const currentSetKey = currentStyleFields.explorationSetKey || baseSetKey;
          const currentFamily = currentStyleFields.styleFamily || baseStyleFamily;
          const altSetFallback = pickExplorationFallbackStyleFamily({
            runSeed: `${runSeed}|${plannedGeneration.optionIndex}|fallback-set`,
            laneFamily,
            currentStyleFamily: currentFamily,
            currentExplorationSetKey: currentSetKey,
            tone: laneTone,
            medium: laneMedium,
            recentStyleFamilies: recentFamiliesForFallback,
            avoidFamilies: [currentFamily],
            setConstraint: "different"
          });
          const switchedSet = altSetFallback
            ? !currentSetKey || altSetFallback.explorationSetKey !== currentSetKey
            : false;
          if (altSetFallback && switchedSet) {
            activeDirectionSpec = applyFallbackStyleFamilyToDirectionSpec({
              directionSpec: activeDirectionSpec,
              styleFamily: altSetFallback.family,
              explorationSetKey: altSetFallback.explorationSetKey,
              explorationLaneKey: altSetFallback.explorationLaneKey
            });
            fallback.usedAltSet = true;
            fallback.attempts += 1;
            selection = await runBackgroundRerankAttempt({
              stage: "fallback_set",
              attemptNumber: fallback.attempts,
              directionSpecOverride: activeDirectionSpec,
              originalityBoost
            });
            appendAttempt(selection);
          }
        }

        backgroundDirectionSpec = activeDirectionSpec;
        if (!shouldReuseBackground) {
          const finalStyleFields = resolveDirectionStyleFields(backgroundDirectionSpec);
          effectiveDirectionStyleFamily = finalStyleFields.styleFamily;
          effectiveDirectionStyleBucket = finalStyleFields.styleBucket;
          effectiveDirectionStyleTone = finalStyleFields.styleTone;
          effectiveDirectionStyleMedium = finalStyleFields.styleMedium;
        }

        rerankMeta = {
          ...rerankMeta,
          backgroundCandidates: aggregatedCandidates,
          backgroundWinner: winner || undefined,
          laneFailed: selection.laneFailed,
          fallback,
          backgroundWinnerIndex: globalWinnerIndex
        };

        return {
          attempt: selection.attempt,
          winnerIndex: selection.winnerIndex,
          laneFailed: selection.laneFailed
        };
      };

      const initialMasterSelection = await selectBackgroundWinner();
      let masterAttempt = initialMasterSelection.attempt;
      let originalityRetried = false;
      if (!shouldReuseBackground && Number.isFinite(masterAttempt.closestDistance) && masterAttempt.closestDistance < 6) {
        originalityRetried = true;
        const originalityMasterSelection = await selectBackgroundWinner(
          "Originality guard: alter composition strongly from references. Change focal geometry, spacing rhythm, and tonal distribution while preserving the same overall mood."
        );
        masterAttempt = originalityMasterSelection.attempt;
      }
      const masterLayout = computeCleanMinimalLayout({
        width: masterDimensions.width,
        height: masterDimensions.height,
        content,
        lockupRecipe: lockupRecipeForRender,
        lockupPresetId,
        styleFamily: optionStyleFamily,
        fontSeed: fontSeedBase
      });
      const resolvedLockupPalette =
        designBrief.resolvedLockupPalette ||
        (await resolveLockupPaletteForBackground({
          backgroundPng: masterAttempt.backgroundPng,
          sampleRegion: masterLayout.textRegion,
          width: masterDimensions.width,
          height: masterDimensions.height
        }));
      const lockupPaletteForMaster = await chooseTextPaletteForBackground({
        backgroundPng: masterAttempt.backgroundPng,
        sampleRegion: masterLayout.textRegion,
        width: masterDimensions.width,
        height: masterDimensions.height,
        resolvedPalette: resolvedLockupPalette
      });
      const lockupPaletteForRender = {
        ...lockupPaletteForMaster,
        autoScrim: false
      };
      const renderLockupAttempt = async (fontSeed: string) =>
        renderValidatedLockupPng({
          width: masterDimensions.width,
          height: masterDimensions.height,
          content,
          palette: lockupPaletteForRender,
          lockupRecipe: lockupRecipeForRender,
          lockupPresetId,
          styleFamily: optionStyleFamily,
          fontSeed,
          lockupPrompt
        });
      const lockupRenderComputation = shouldReuseLockup && reusableAssets?.lockupPng
        ? {
            renderResult: {
              png: reusableAssets.lockupPng,
              width: Math.max(1, Math.round((await sharp(reusableAssets.lockupPng).metadata()).width || 1)),
              height: Math.max(1, Math.round((await sharp(reusableAssets.lockupPng).metadata()).height || 1))
            },
            effectivePrompt: lockupPrompt,
            textValidation: null as LockupSvgTextValidation | null,
            textOverrideRetried: false
          }
        : shouldRunExplorationToneCheck
          ? await (async () => {
              const candidates: Array<{
                computation: Awaited<ReturnType<typeof renderLockupAttempt>>;
                score: number;
                checks: {
                  textIntegrity: boolean;
                  fitPass: boolean;
                  insideTitleSafeWithMargin: boolean;
                  notTooSmall: boolean;
                };
                fit: LockupFitCheck;
                debugUrl: string;
              }> = [];

              for (let candidateIndex = 0; candidateIndex < ROUND1_EXPLORATION_LOCKUP_CANDIDATE_COUNT; candidateIndex += 1) {
                const computation = await renderLockupAttempt(`${fontSeedBase}|lockup-candidate-${candidateIndex}`);
                const validation = computation.textValidation;
                const textIntegrity = validation.valid && validation.unexpected.length === 0 && validation.missing.length === 0;
                const fit = evaluateLockupFit({
                  lockupWidth: computation.renderResult.width,
                  lockupHeight: computation.renderResult.height,
                  shape: OPTION_MASTER_BACKGROUND_SHAPE,
                  canvasWidth: masterDimensions.width,
                  canvasHeight: masterDimensions.height,
                  marginRatio: ROUND1_EXPLORATION_LOCKUP_SAFE_MARGIN_RATIO
                });
                let score = 0;
                score += textIntegrity ? 130 : -130;
                score += fit.fitPass ? 95 : -95;
                score += fit.notTooSmall ? 26 : -26;
                score += fit.score * 28;
                score -= computation.textOverrideRetried ? 4 : 0;
                const debugUrl = await writeGenerationPreviewFiles({
                  fileName: `${plannedGeneration.id}-lockup-candidate-${candidateIndex}.png`,
                  png: computation.renderResult.png
                });

                candidates.push({
                  computation,
                  score,
                  checks: {
                    textIntegrity,
                    fitPass: fit.fitPass,
                    insideTitleSafeWithMargin: fit.insideTitleSafeWithMargin,
                    notTooSmall: fit.notTooSmall
                  },
                  fit,
                  debugUrl
                });
              }

              const eligible = candidates
                .map((candidate, index) => ({ candidate, index }))
                .filter((entry) => entry.candidate.checks.textIntegrity && entry.candidate.checks.fitPass);
              const pool = eligible.length > 0 ? eligible : candidates.map((candidate, index) => ({ candidate, index }));
              const winner = pool.reduce((best, current) => (current.candidate.score > best.candidate.score ? current : best), pool[0]);

              rerankMeta = {
                ...rerankMeta,
                lockupCandidates: candidates.map((candidate) => ({
                  url: candidate.debugUrl,
                  score: candidate.score,
                  checks: candidate.checks,
                  stats: {
                    width: candidate.computation.renderResult.width,
                    height: candidate.computation.renderResult.height,
                    fittedWidth: candidate.fit.fittedWidth,
                    fittedHeight: candidate.fit.fittedHeight,
                    safeHeightRatio: candidate.fit.safeHeightRatio,
                    safeCoverage: candidate.fit.safeCoverage,
                    textOverrideRetried: candidate.computation.textOverrideRetried
                  }
                })),
                lockupWinnerIndex: winner.index
              };

              return winner.candidate.computation;
            })()
          : await renderLockupAttempt(fontSeedBase);
      const lockupRenderResult = lockupRenderComputation.renderResult;
      const effectiveLockupPrompt = lockupRenderComputation.effectivePrompt;
      const lockupTextValidation = lockupRenderComputation.textValidation;
      const lockupTextOverrideRetried = lockupRenderComputation.textOverrideRetried;
      const lockupPngForComposite =
        shouldRunExplorationToneCheck && !shouldReuseLockup
          ? await padLockupForSafeMargin(lockupRenderResult.png, ROUND1_EXPLORATION_LOCKUP_SAFE_MARGIN_RATIO)
          : lockupRenderResult.png;
      const lockupPath = await writeGenerationPreviewFiles({
        fileName: `${plannedGeneration.id}-lockup.png`,
        png: lockupRenderResult.png
      });

      const shapeResults = await Promise.all(
        PREVIEW_SHAPES.map(async (shape) => {
          const dimensions = PREVIEW_DIMENSIONS[shape];
          const backgroundPng =
            shape === OPTION_MASTER_BACKGROUND_SHAPE
              ? masterAttempt.backgroundPng
              : await normalizePngToShape(
                  masterAttempt.backgroundPng,
                  shape,
                  resolveRecipeFocalPoint(lockupRecipeForRender, shape)
                );
          const layout = computeCleanMinimalLayout({
            width: dimensions.width,
            height: dimensions.height,
            content,
            lockupRecipe: lockupRecipeForRender,
            lockupPresetId,
            styleFamily: optionStyleFamily,
            fontSeed: fontSeedBase
          });
          const textPalette = await chooseTextPaletteForBackground({
            backgroundPng,
            sampleRegion: layout.textRegion,
            width: dimensions.width,
            height: dimensions.height,
            resolvedPalette: resolvedLockupPalette
          });
          const titleBlock = layout.blocks.find((block) => block.key === "title");
          const finalPng = await composeLockupOnBackground({
            backgroundPng,
            lockupPng: lockupPngForComposite,
            shape,
            width: dimensions.width,
            height: dimensions.height,
            align: titleBlock?.align || "left",
            integrationMode: lockupIntegrationMode
          });
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
            designDoc: renderTemplate(optionStyleFamily, templateBrief, plannedGeneration.optionIndex, shape, {
              backgroundImagePath: backgroundPath,
              textPalette
            })
          };
        })
      );

      const promptUsed = [
        `master(${OPTION_MASTER_BACKGROUND_SHAPE}): ${masterAttempt.prompt}`,
        directionSpec
          ? `[direction: ${directionSpec.optionLabel} ${directionSpec.styleFamily || "unassigned"} / ${directionSpec.laneFamily} / ${directionSpec.compositionType}]`
          : "",
        directionSpec?.referenceId
          ? `[reference-anchor: ${directionSpec.referenceId}${directionSpec.referenceCluster ? `/${directionSpec.referenceCluster}` : ""}]`
          : "",
        directionSpec?.variationTemplateKey ? `[variation-template: ${directionSpec.variationTemplateKey}]` : "",
        effectiveDirectionStyleFamily ? `[style-family: ${effectiveDirectionStyleFamily}]` : "",
        effectiveDirectionStyleBucket ? `[style-bucket: ${effectiveDirectionStyleBucket}]` : "",
        effectiveDirectionStyleTone ? `[style-tone: ${effectiveDirectionStyleTone}]` : "",
        effectiveDirectionStyleMedium ? `[style-medium: ${effectiveDirectionStyleMedium}]` : "",
        shouldReuseBackground && reusableAssets ? `[reuse: background from ${reusableAssets.sourceGenerationId}]` : "",
        shouldReuseLockup && reusableAssets ? `[reuse: lockup from ${reusableAssets.sourceGenerationId}]` : "",
        `[lockup-style-mode: ${lockupStyleMode}]`,
        `[lockup-layout: ${lockupLayout}]`,
        `[lockup-integration: ${lockupIntegrationMode}]`,
        directionSpec?.wantsSeriesMark ? "[series-mark: requested]" : "[series-mark: not-requested]",
        directionSpec?.wantsTitleStage ? "[title-stage: requested]" : "[title-stage: not-requested]",
        directionSpec?.motifFocus && directionSpec.motifFocus.length > 0
          ? `[motif-focus: ${directionSpec.motifFocus.join(" + ")}]`
          : "",
        `[lockup-typography-recipe: ${typographicRecipe.id}]`,
        `[lockup-prompt: ${effectiveLockupPrompt}]`,
        lockupTextOverrideRetried ? "[retry: lockup-text-override x1]" : "",
        lockupTextValidation && !lockupTextValidation.valid
          ? `[lockup-text-validation: failed reasons=${lockupTextValidation.reasons.join("|") || "none"} unexpected=${
              lockupTextValidation.unexpected.join(",") || "none"
            } missing=${lockupTextValidation.missing.join(",") || "none"}]`
          : lockupTextValidation
            ? "[lockup-text-validation: passed]"
            : "",
        rerankMeta.backgroundCandidates
          ? `[rerank-background: winner=${(rerankMeta.backgroundWinnerIndex ?? 0) + 1}/${rerankMeta.backgroundCandidates.length}]`
          : "",
        rerankMeta.lockupCandidates
          ? `[rerank-lockup: winner=${(rerankMeta.lockupWinnerIndex ?? 0) + 1}/${rerankMeta.lockupCandidates.length}]`
          : "",
        originalityRetried ? "[retry: originality-guard]" : "",
        masterAttempt.textRetryCount > 0 ? `[retry: no-text x${masterAttempt.textRetryCount}]` : "",
        masterAttempt.paletteRetryCount > 0 ? `[retry: brand-palette x${masterAttempt.paletteRetryCount}]` : "",
        masterAttempt.toneRetryCount > 0 ? `[retry: tone-compliance x${masterAttempt.toneRetryCount}]` : "",
        masterAttempt.textArtifactRetryCount > 0 ? `[retry: text-artifact x${masterAttempt.textArtifactRetryCount}]` : "",
        "derived variants: square/wide/tall from one shared background + one shared lockup."
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
        kind: "BACKGROUND",
        slot: BACKGROUND_ASSET_SLOT_BY_SHAPE[shape],
        file_path: byShape[shape].backgroundPath,
        mime_type: "image/png",
        width: PREVIEW_DIMENSIONS[shape].width,
        height: PREVIEW_DIMENSIONS[shape].height
      }));
      const lockupAssetRow: Prisma.AssetCreateManyInput = {
        projectId: params.project.id,
        generationId: plannedGeneration.id,
        kind: "LOCKUP",
        slot: LOCKUP_ASSET_SLOT,
        file_path: lockupPath,
        mime_type: "image/png",
        width: lockupRenderResult.width,
        height: lockupRenderResult.height
      };
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
        notes: "ai+split-background-lockup",
        promptUsed,
        meta: {
          styleRefCount: references.length,
          usedStylePaths: references.map((reference) => reference.path || reference.thumbPath),
          usedReferenceIds: dedupeReferencesById(references).map((reference) => reference.id),
          lockupValidation: {
            ok: lockupTextValidation?.valid ?? true,
            reasons: lockupTextValidation?.reasons || [],
            retried: lockupTextOverrideRetried
          },
          ...(!hasDesignNotes && fallbackStyleFamilyDebug
            ? {
                debug: {
                  styleFamilyFallback: fallbackStyleFamilyDebug
                }
              }
            : {}),
          ...(shouldRunExplorationToneCheck
            ? {
                toneCheck: masterAttempt.toneCheck || {
                  attempted: false,
                  passed: true,
                  statsBefore: null,
                  statsAfter: null,
                  retried: false,
                  failuresBefore: [],
                  failuresAfter: []
                },
                backgroundTextCheck: masterAttempt.backgroundTextCheck || {
                  attempted: false,
                  detected: false,
                  retried: false
                },
                ...(rerankMeta.backgroundCandidates || rerankMeta.lockupCandidates
                  ? {
                      rerank: rerankMeta
                    }
                  : {})
              }
            : {}),
          designSpec: {
            seed: `${runSeed}|${plannedGeneration.optionIndex}`,
            runSeed,
            optionLane: optionLane(plannedGeneration.optionIndex),
            masterBackgroundShape: OPTION_MASTER_BACKGROUND_SHAPE,
            palette,
            directionSpec,
            templateStyleFamily: optionStyleFamily,
            styleFamilies: designBrief.styleFamilies,
            styleFamily: effectiveDirectionStyleFamily || null,
            styleBucket: effectiveDirectionStyleBucket || null,
            styleTone: effectiveDirectionStyleTone || null,
            styleMedium: effectiveDirectionStyleMedium || null,
            referenceIds: dedupeReferencesById(references).map((reference) => reference.id),
            referenceId: directionSpec?.referenceId || references[0]?.id || null,
            referenceCluster: directionSpec?.referenceCluster || null,
            referenceTier: directionSpec?.referenceTier || null,
            variationTemplateKey: directionSpec?.variationTemplateKey || null,
            motifScope: directionSpec?.motifScope || motifBankContext.scriptureScope,
            lockupPresetId,
            lockupLayout,
            wantsTitleStage: directionSpec?.wantsTitleStage === true,
            wantsSeriesMark: directionSpec?.wantsSeriesMark === true,
            motifFocus: directionSpec?.motifFocus || [],
            bookKeys: motifBankContext.bookKeys,
            bookNames: motifBankContext.bookNames,
            topicKeys: motifBankContext.topicKeys,
            topicNames: motifBankContext.topicNames,
            lockupRecipe: lockupRecipeForRender,
            lockupTypographicRecipe: typographicRecipe,
            lockupStyleMode,
            lockupIntegrationMode,
            lockupPrompt: effectiveLockupPrompt,
            lockupTextValidation,
            lockupTextOverrideRetried,
            resolvedLockupPalette,
            lockupAssetPath: lockupPath,
            paletteComplianceScore: masterAttempt.paletteComplianceScore,
            reusedBackgroundFromGenerationId:
              shouldReuseBackground && reusableAssets ? reusableAssets.sourceGenerationId : null,
            reusedLockupFromGenerationId: shouldReuseLockup && reusableAssets ? reusableAssets.sourceGenerationId : null
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
          data: [...backgroundAssetRows, lockupAssetRow, ...finalAssetRows]
        }),
        prisma.generation.update({
          where: {
            id: plannedGeneration.id
          },
          data: {
            status: "COMPLETED",
            output: completedOutput as Prisma.InputJsonValue,
            input: withResolvedLockupPaletteInput(
              plannedGeneration.input,
              {
                ...designBrief,
                lockupRecipe: lockupRecipeForRender
              },
              resolvedLockupPalette
            )
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
    series_description: formData.get("series_description") || undefined,
    brandMode: formData.get("brandMode") || undefined,
    preferredAccentColors: formData.get("preferredAccentColors") || undefined,
    avoidColors: formData.get("avoidColors") || undefined,
    designNotes: formData.get("designNotes") || undefined
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
      series_description: parsed.data.series_description || null,
      brandMode: parsed.data.brandMode,
      preferredAccentColors: parsed.data.preferredAccentColors || null,
      avoidColors: parsed.data.avoidColors || null,
      designNotes: parsed.data.designNotes || null
    }
  });

  redirect(`/app/projects/${project.id}`);
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

  const brandKit = project.brandKit;

  const enabledPresets = await findEnabledPresetsForOrganization(session.organizationId);
  const presetIdByKey = new Map(enabledPresets.map((preset) => [preset.key, preset.id] as const));
  const runSeed = randomUUID();
  const seriesMarkRequested = shouldRequestSeriesMarkFromNotes([project.designNotes]);
  const motifBankContext = getMotifBankContext({
    title: project.series_title,
    subtitle: project.series_subtitle,
    scripturePassages: project.scripture_passages,
    description: project.series_description,
    designNotes: project.designNotes
  });
  const hasDesignNotes = hasDesignDirection(project.designNotes, null);
  const explorationMode = !hasDesignNotes;
  const [recentMotifs, recentStyleFamilies, recentRecipeIds, recentExplorationSetKeys, recentReferenceIds, curatedRefs] =
    await Promise.all([
    loadRecentProjectMotifs(project.id),
    loadRecentStyleFamilies({
      organizationId: session.organizationId,
      projectId: project.id,
      limit: 20
    }),
    explorationMode
      ? loadRecentLockupRecipeIds({
          organizationId: session.organizationId,
          projectId: project.id,
          limit: 20
        })
      : Promise.resolve([]),
    explorationMode
      ? loadRecentExplorationSetKeys({
          projectId: project.id,
          limit: 8
        })
      : Promise.resolve([]),
    explorationMode
      ? loadRecentReferenceIds({
          organizationId: session.organizationId,
          projectId: project.id,
          projectLimit: 12,
          globalLimit: 30
        })
      : Promise.resolve({
          projectRecent: [],
          globalRecent: []
        }),
    explorationMode ? getCuratedReferences() : Promise.resolve([])
  ]);
  const recentStyleBuckets = deriveRecentStyleBuckets(recentStyleFamilies);
  const bibleCreativeBrief = await extractBibleCreativeBrief({
    title: project.series_title,
    subtitle: project.series_subtitle,
    scripturePassages: project.scripture_passages,
    description: project.series_description,
    designNotes: project.designNotes,
    motifBankContext
  });
  const directionPlan = planDirectionSet({
    runSeed,
    projectId: project.id,
    round: 1,
    explorationSetSeed: `${project.id}|round-1|${runSeed}`,
    enabledPresetKeys: enabledPresets.map((preset) => preset.key),
    optionCount: ROUND_OPTION_COUNT,
    seriesMarkRequested,
    wantsSeriesMarkLane: seriesMarkRequested,
    motifs: bibleCreativeBrief.motifs,
    allowedGenericMotifs: bibleCreativeBrief.allowedGenericMotifs,
    markIdeas: bibleCreativeBrief.markIdeas,
    recentMotifs,
    recentStyleFamilies,
    recentStyleBuckets,
    recentExplorationSetKeys,
    recentRecipeIds,
    explorationMode,
    brandMode: project.brandMode,
    seriesTitle: project.series_title,
    seriesSubtitle: project.series_subtitle,
    seriesDescription: project.series_description,
    designNotes: project.designNotes,
    topicNames: motifBankContext.topicNames,
    motifScope: motifBankContext.scriptureScope,
    primaryThemes: motifBankContext.primaryThemeCandidates,
    secondaryThemes: motifBankContext.secondaryThemeCandidates,
    sceneMotifs: motifBankContext.sceneMotifCandidates,
    sceneMotifRequested: motifBankContext.sceneMotifRequested,
    curatedRefs,
    recentReferenceIdsProject: recentReferenceIds.projectRecent,
    recentReferenceIdsGlobal: recentReferenceIds.globalRecent
  });
  const selectedPresetKeys = directionPlan.map((spec) => spec.presetKey);
  const lockupPresetIds = directionPlan.map((spec) => spec.lockupPresetId);
  const plannedStyleFamilies = directionPlan.map((spec) => spec.templateStyleFamily) as [StyleFamily, StyleFamily, StyleFamily];

  if (selectedPresetKeys.length < ROUND_OPTION_COUNT || lockupPresetIds.length < ROUND_OPTION_COUNT) {
    return { error: "At least three presets are required to generate options." };
  }

  const refsForOptions = await pickReferenceSetsForRound(project.id, 1, ROUND_OPTION_COUNT, directionPlan);
  const lockupLayoutsForOptions = resolvePlannedLockupLayouts({
    seed: `${runSeed}:round-1`,
    directionPlan,
    styleFamilies: plannedStyleFamilies,
    lockupPresetIds,
    referencesByOption: refsForOptions,
    forceDistinctRecipes: explorationMode,
    recentRecipeIds: explorationMode ? recentRecipeIds : undefined,
    brandMode: project.brandMode,
    typographyDirection: brandKit?.source === "organization" ? brandKit.typographyDirection : null,
    round: 1,
    hasDesignNotes
  });
  const inputsByOption = selectedPresetKeys.map((_, index) =>
    buildGenerationInput(
      project,
      brandKit,
      selectedPresetKeys,
      undefined,
      lockupPresetIds[index],
      runSeed,
      plannedStyleFamilies,
      runSeed,
      directionPlan,
      lockupLayoutsForOptions[index]
    )
  );
  for (const input of inputsByOption) {
    const validatedDesignBrief = validateDesignBrief((input as { designBrief?: unknown }).designBrief);
    if (!validatedDesignBrief.ok) {
      return {
        error: `Design brief is invalid: ${validatedDesignBrief.issues.slice(0, 2).join(" | ")}`
      };
    }
  }

  const plannedGenerations: PlannedGeneration[] = selectedPresetKeys.map((presetKey, index) => {
    const generationId = randomUUID();
    const references = refsForOptions[index] || [];
    const input = inputsByOption[index];

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
        referenceItems: references,
        motifBankContext
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
    organizationId: session.organizationId,
    project,
    plannedGenerations,
    bibleCreativeBrief,
    motifBankContext
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

  const brandKit = project.brandKit;

  const parsed = generateRoundTwoSchema.safeParse({
    currentRound: formData.get("currentRound"),
    chosenGenerationId: formData.get("chosenGenerationId") || undefined,
    feedbackText: formData.get("feedbackText") || undefined,
    emphasis: formData.get("emphasis"),
    expressiveness: formData.get("expressiveness"),
    temperature: formData.get("temperature"),
    regenerateLockup: parseOptionalBooleanFormValue(formData.get("regenerateLockup")),
    explicitNewTitleStyle: parseOptionalBooleanFormValue(formData.get("explicitNewTitleStyle")),
    regenerateBackground: parseOptionalBooleanFormValue(formData.get("regenerateBackground")),
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
  const presetIdByKey = new Map(enabledPresets.map((preset) => [preset.key, preset.id] as const));
  const round = parsed.data.currentRound + 1;
  const runSeed = randomUUID();
  const chosenInputSeriesNotes = chosenGeneration ? readSeriesPreferencesDesignNotesFromInput(chosenGeneration.input) : null;
  const seriesMarkRequested = shouldRequestSeriesMarkFromNotes([project.designNotes, chosenInputSeriesNotes]);
  const motifBankContext = getMotifBankContext({
    title: project.series_title,
    subtitle: project.series_subtitle,
    scripturePassages: project.scripture_passages,
    description: project.series_description,
    designNotes: project.designNotes || chosenInputSeriesNotes || null
  });
  const hasDesignNotes = hasDesignDirection(project.designNotes, chosenInputSeriesNotes);
  const explorationMode = !hasDesignNotes;
  const [recentMotifs, recentStyleFamilies, recentRecipeIds, recentExplorationSetKeys] = await Promise.all([
    loadRecentProjectMotifs(project.id),
    loadRecentStyleFamilies({
      organizationId: session.organizationId,
      projectId: project.id,
      limit: 20
    }),
    explorationMode
      ? loadRecentLockupRecipeIds({
          organizationId: session.organizationId,
          projectId: project.id,
          limit: 20
        })
      : Promise.resolve([]),
    explorationMode
      ? loadRecentExplorationSetKeys({
          projectId: project.id,
          limit: 8
        })
      : Promise.resolve([])
  ]);
  const recentStyleBuckets = deriveRecentStyleBuckets(recentStyleFamilies);
  const bibleCreativeBrief = await extractBibleCreativeBrief({
    title: project.series_title,
    subtitle: project.series_subtitle,
    scripturePassages: project.scripture_passages,
    description: project.series_description,
    designNotes: project.designNotes || chosenInputSeriesNotes || null,
    motifBankContext
  });
  const directionPlan = planDirectionSet({
    runSeed,
    projectId: project.id,
    round,
    explorationSetSeed: `${project.id}|round-${round}|${runSeed}`,
    enabledPresetKeys: enabledPresets.map((preset) => preset.key),
    optionCount: ROUND_OPTION_COUNT,
    preferredFamilies: preferredDirectionFamiliesForStyleDirection(styleDirection),
    seriesMarkRequested,
    wantsSeriesMarkLane: seriesMarkRequested,
    motifs: bibleCreativeBrief.motifs,
    allowedGenericMotifs: bibleCreativeBrief.allowedGenericMotifs,
    markIdeas: bibleCreativeBrief.markIdeas,
    recentMotifs,
    recentStyleFamilies,
    recentStyleBuckets,
    recentExplorationSetKeys,
    recentRecipeIds,
    explorationMode,
    brandMode: project.brandMode,
    seriesTitle: project.series_title,
    seriesSubtitle: project.series_subtitle,
    seriesDescription: project.series_description,
    designNotes: project.designNotes || chosenInputSeriesNotes || null,
    topicNames: motifBankContext.topicNames,
    motifScope: motifBankContext.scriptureScope,
    primaryThemes: motifBankContext.primaryThemeCandidates,
    secondaryThemes: motifBankContext.secondaryThemeCandidates,
    sceneMotifs: motifBankContext.sceneMotifCandidates,
    sceneMotifRequested: motifBankContext.sceneMotifRequested
  });
  const selectedPresetKeys = directionPlan.map((spec) => spec.presetKey);
  const lockupPresetIds = directionPlan.map((spec) => spec.lockupPresetId);
  const plannedStyleFamilies = directionPlan.map((spec) => spec.templateStyleFamily) as [StyleFamily, StyleFamily, StyleFamily];

  if (selectedPresetKeys.length < ROUND_OPTION_COUNT || lockupPresetIds.length < ROUND_OPTION_COUNT) {
    return { error: "At least three presets are required to generate options." };
  }

  const refsForOptions = await pickReferenceSetsForRound(project.id, round, ROUND_OPTION_COUNT);
  const chosenLockupLayout = chosenGeneration ? readLockupLayoutFromGenerationPayload(chosenGeneration.input, chosenGeneration.output) : null;
  const shouldRequestNewLockupLayout =
    parsed.data.regenerateLockup === true && parsed.data.explicitNewTitleStyle === true;
  const lockupLayoutsForOptions = resolvePlannedLockupLayouts({
    seed: `${runSeed}:round-${round}`,
    directionPlan,
    styleFamilies: plannedStyleFamilies,
    lockupPresetIds,
    referencesByOption: refsForOptions,
    keepLayout: chosenLockupLayout,
    forceNewLayout: shouldRequestNewLockupLayout,
    forceDistinctRecipes: explorationMode,
    recentRecipeIds: explorationMode ? recentRecipeIds : undefined,
    brandMode: project.brandMode,
    typographyDirection: brandKit?.source === "organization" ? brandKit.typographyDirection : null,
    round,
    hasDesignNotes
  });

  const inputsByOption = selectedPresetKeys.map((_, index) => ({
    ...buildGenerationInput(
      project,
      brandKit,
      selectedPresetKeys,
      undefined,
      lockupPresetIds[index],
      runSeed,
      plannedStyleFamilies,
      runSeed,
      directionPlan,
      lockupLayoutsForOptions[index]
    ),
    feedback: {
      sourceRound: parsed.data.currentRound,
      chosenGenerationId,
      request: parsed.data.feedbackText || "",
      emphasis: parsed.data.emphasis,
      expressiveness: parsed.data.expressiveness,
      temperature: parsed.data.temperature,
      regenerateLockup: parsed.data.regenerateLockup,
      explicitNewTitleStyle: parsed.data.explicitNewTitleStyle,
      regenerateBackground: parsed.data.regenerateBackground,
      styleDirection
    }
  }));
  for (const input of inputsByOption) {
    const validatedDesignBrief = validateDesignBrief((input as { designBrief?: unknown }).designBrief);
    if (!validatedDesignBrief.ok) {
      return {
        error: `Design brief is invalid: ${validatedDesignBrief.issues.slice(0, 2).join(" | ")}`
      };
    }
  }

  const plannedGenerations: PlannedGeneration[] = selectedPresetKeys.map((presetKey, index) => {
    const generationId = randomUUID();
    const references = refsForOptions[index] || [];
    const input = inputsByOption[index];

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
        referenceItems: references,
        motifBankContext
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
    organizationId: session.organizationId,
    project,
    plannedGenerations,
    bibleCreativeBrief,
    motifBankContext
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
          websiteUrl: true,
          typographyDirection: true,
          logoPath: true,
          paletteJson: true
        }
      }
    }
  });

  if (!project) {
    return;
  }

  const effectiveBrandKit = await resolveEffectiveBrandKit({
    organizationId: session.organizationId,
    projectId: project.id,
    projectBrandKit: project.brandKit
  });

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
  const palette = effectiveBrandKit ? parsePaletteJson(effectiveBrandKit.paletteJson) : [];
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
      logoPath: effectiveBrandKit?.logoPath || null,
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
