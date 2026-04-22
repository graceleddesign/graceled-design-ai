"use server";

import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import sharp from "sharp";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { readAiErrorClass } from "@/lib/ai-harness/core/errors";
import { normalizeDesignDoc, type DesignDoc } from "@/lib/design-doc";
import {
  mapLegacyTitleIntegrationToDesignSpec,
  normalizeBackgroundTitleIntegrationMode,
  type DesignSpec,
  type DesignSpecTitleIntegrationMode
} from "@/lib/design-spec";
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
  planRefinementDirectionSet,
  createRefinementVariantFingerprint,
  type PlannedDirectionSpec,
  type PlannedRefinementVariant,
  type RefinementLockedStyleInvariants,
  type RefinementMutationAxis,
  type TitleIntegrationMode,
  type StyleFamily as DirectionStyleFamily
} from "@/lib/direction-planner";
import { extractBibleCreativeBrief, type BibleCreativeBrief } from "@/lib/bible-creative-brief";
import { generateDesignSpec, readSymbolDirectives } from "@/lib/design-spec-generator";
import { getMotifBankContext, type MotifBankContext } from "@/lib/bible-motif-bank";
import { buildFinalSvg } from "@/lib/final-deliverables";
import { resizeCoverWithFocalPoint, type FocalPoint } from "@/lib/image-cover";
import { computeDHashFromBuffer, hammingDistanceHash } from "@/lib/image-hash";
import { isOpenAiRateLimitError } from "@/lib/gptImageRateLimit";
import {
  abandonGraphicsBackgroundAiRuns,
  createGraphicsBackgroundAiRun,
  finalizeGraphicsBackgroundAiRun,
  runGraphicsBackgroundImageGeneration,
  type GraphicsBackgroundAiAttemptTrace,
  type GraphicsBackgroundAiRunHandle
} from "@/lib/graphics-domain/generation";
import { resolveClaimedGenerationExecutionTimeoutMs } from "@/lib/graphics-domain/claim-timeout";
import { settleUnexpectedClaimedGenerationFailure } from "@/lib/graphics-domain/claimed-generation-failure-settlement";
import {
  acquireRoundOneLaunchSingleFlight,
  attachRoundOneLaunchGenerationIds,
  finalizeRoundOneLaunchSingleFlight
} from "@/lib/graphics-domain/round1-launch-single-flight";
import {
  assertGenerationAttemptStillActive,
  finalizeRoundOneAuthoritativeSettlement,
  withSettledGenerationExecutionOutput,
  type RoundOneGenerationTerminalization
} from "@/lib/graphics-domain/round1-authoritative-settlement";
import { resolveRound1LiveWorkBudget } from "@/lib/graphics-domain/round1-live-work-budget";
import {
  GRAPHICS_BACKGROUND_PROMPT_VERSION,
  buildGraphicsBackgroundRunMetadata
} from "@/lib/graphics-domain/prompts";
import { persistGraphicsBackgroundEvalResults } from "@/lib/graphics-evals/background-eligibility";
import {
  type GenerationFailureReason,
  type GenerationLifecycleState,
  type GenerationOptionStatus,
  type GenerationRoundFailureReason,
  type GenerationRoundStatus,
  type PersistedGenerationExecutionState,
  type ProviderFailureReason,
  isProviderFailureReason,
  readPersistedGenerationExecutionState
} from "@/lib/generation-state";
import { preflightImageProvider, resolveImageProviderConfig, type ImageProviderPreflightResult } from "@/lib/image-provider";
import { resolveRecipeFocalPoint } from "@/lib/lockups/renderer";
import { getOpenAI } from "@/lib/openai";
import { buildOverlayDisplayContent, normalizeLine } from "@/lib/overlay-lines";
import { buildSymbolDirectives, SYMBOL_ONLY_TEXT_BAN_DIRECTIVE } from "@/lib/motif-symbol-directives";
import { resolveEffectiveBrandKit } from "@/lib/brand-kit";
import { prisma } from "@/lib/prisma";
import {
  loadIndex,
  resolveReferenceAbsolutePath,
  sampleRefsForOption,
  type ReferenceLibraryItem,
  type ReferenceLibraryStyleTag
} from "@/lib/referenceLibrary";
import { getCuratedReferences, type CuratedReference, type ReferenceCluster } from "@/lib/referenceCuration";
import {
  deriveRecentReferenceIds,
  getRound1VariationTemplateByKey,
  isRound1DefaultBiasTemplateKey,
  listRound1VariationTemplates
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
  type LockupSafeRegionRatio,
  PREVIEW_DIMENSIONS,
  PREVIEW_SHAPES,
  renderTrimmedLockupPngFromSvg,
  type PreviewShape
} from "@/lib/lockup-compositor";
import {
  ASPECT_ASSET_PLACEHOLDER_PATH_PATTERN,
  evaluateBackgroundAcceptance,
  evaluateLockupAcceptance,
  isProductionValidOption,
  normalizeAssetPathForCompletenessCheck,
  resolveProductionValidOption,
  resolveProductionValidOptionStatus,
  type BackgroundAcceptanceResult,
  type DebugAssetSource,
  type GenerationAssetRecord,
  type LockupAcceptanceResult,
  type ProductionBackgroundValidationEvidence,
  type ProductionLockupValidationEvidence,
  type ProductionValidationSnapshot,
  toPersistedProductionValidationSnapshot
} from "@/lib/production-valid-option";
import { resolvePromptProfile } from "@/lib/prompt-profiles";

export type GenerationActionState = {
  error?: string;
};

export type RoundFeedbackActionState = {
  error?: string;
};

type ProjectBrandMode = "brand" | "fresh";

const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

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
const ROUND1_NON_FALLBACK_MAX_ATTEMPTS = 8;
const FINALIST_ASPECT_RECOVERY_LIMIT = 2;
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
const BRAND_NEUTRAL_HEXES = ["#000000", "#111827", "#334155", "#64748B", "#CBD5E1", "#F8FAFC", "#FFFFFF"] as const;
const BRAND_PALETTE_SAMPLE_COLUMNS = 40;
const BRAND_PALETTE_SAMPLE_ROWS = 20;
const BRAND_PALETTE_DISTANCE_THRESHOLD = 58;
const BRAND_PALETTE_FAR_SAMPLE_RATIO_THRESHOLD = 0.15;
const BRAND_PALETTE_STRICT_RETRY_BOOST =
  "HARD CONSTRAINT RETRY: Use flat/vector-like color fields with only very subtle neutral monochrome texture. NO warm hues, NO orange/red/yellow, NO photographic color grading, and no hue shifts.";
const TONE_STATS_SAMPLE_SIZE = 64;
const LIGHT_TONE_MIN_LUMINANCE = 100;
const LIGHT_TONE_MAX_SEPIA_LIKELIHOOD = 0.50;
const VIVID_TONE_MIN_SATURATION = 120;
const VIVID_TONE_MIN_LUMINANCE = 115;
// Raised from 30 (was 55): dark-tone cinematics legitimately have mean luminance 30-54;
// the original threshold was rejecting high-quality dark atmospheric images as "too-dark".
const DARK_MONO_TONE_MIN_LUMINANCE = 30;
const DARK_TONE_MAX_LUMINANCE = 160;
const MONO_TONE_MAX_SATURATION = 30;
const MONO_TONE_MAX_LUMINANCE = 125;
const DESIGN_PRESENCE_MIN_LUMINANCE_STD_DEV = 20;
const DESIGN_PRESENCE_MIN_EDGE_DENSITY = 0.001;
const DESIGN_PRESENCE_EDGE_MAGNITUDE_THRESHOLD = 68;
const ROUND1_RERANK_MIN_EDGES_FULL = 0.01;
const ROUND1_RERANK_MIN_STD_FULL = 20;
const ROUND1_RERANK_MIN_EDGES_NON_TITLE = 0.008;
const ROUND1_RERANK_BORDER_BAND_RATIO = 0.08;
const ROUND1_RERANK_LONG_BORDER_RUN_RATIO = 0.62;
const ROUND1_RERANK_MIN_LONG_BORDER_LINES_FOR_SCAFFOLD = 2;
const ROUND1_RERANK_BORDER_EDGE_DOMINANCE_THRESHOLD = 0.58;
const ROUND1_RERANK_FRAME_SCAFFOLD_HEAVY_PENALTY = 220;
const ROUND1_RERANK_FRAME_SCAFFOLD_LIGHT_PENALTY = 90;
const ROUND1_RERANK_MEANINGFUL_STRUCTURE_PASS_BONUS = 120;
const ROUND1_RERANK_MEANINGFUL_STRUCTURE_FAIL_PENALTY = 180;
const ROUND1_RERANK_MEANINGFUL_STRUCTURE_SCORE_WEIGHT = 110;
const ROUND1_RERANK_SCAFFOLD_FAIL_PENALTY = 220;
const ROUND1_RERANK_MOTIF_FAIL_PENALTY = 160;
const ROUND1_RERANK_TONE_FAIL_PENALTY = 40;
const ROUND1_RERANK_TONE_PASS_BONUS = 20;
const ROUND1_RERANK_TITLE_SAFE_WEIGHT = 12;
const ROUND1_RERANK_MIDTONE_RANGE_WEIGHT = 14;
const TEXT_SCRUB_REGION_BLUR_SIGMA = 16;
const TEXT_SCRUB_MAX_DIMENSION = 640;
const TEXT_SCRUB_EDGE_THRESHOLD = 66;
const TEXT_SCRUB_NOISE_ALPHA = 30;
const LIGHT_TONE_OVERRIDE_RETRY_BOOST =
  "TONE OVERRIDE RETRY: Must satisfy tone targets. LIGHT must be high-key bright/clean (white or near-white background), NOT parchment/sepia/vintage. Avoid filmic grading, avoid desaturation, avoid heavy grain. Prioritize tone compliance over atmosphere.";
const VIVID_TONE_OVERRIDE_RETRY_BOOST =
  "TONE OVERRIDE RETRY: Must be high-chroma, bold palette, strong saturation. Avoid muted/dusty colors.";
const MONO_TONE_OVERRIDE_RETRY_BOOST =
  "TONE OVERRIDE RETRY: Strict monochrome/grayscale; near-zero saturation.";
const DARK_TONE_OVERRIDE_RETRY_BOOST =
  "DARK OVERRIDE RETRY: dark but readable; avoid pure black; include visible midtones and highlights; clear forms and structure; maintain strong contrast for title-safe area.";
const OPTION_MASTER_BACKGROUND_SHAPE: PreviewShape = "wide";
const ROUND1_BACKGROUND_RECOVERY_MAX_ATTEMPTS = 1;
const ROUND1_BACKGROUND_RECOVERY_CANDIDATE_COUNT = 2;
const ROUND1_CHEAP_MODE_MAX_IMAGE_CALLS = 12;
const ROUND1_IMAGE_CALL_CAP_WARNING = "Image call cap reached; returning best available.";
const DEV_CHEAP_MODE = process.env.DEV_CHEAP_MODE?.trim().toLowerCase() === "true";
const ROUND1_OPTION_PARALLEL_CONCURRENCY = 3;
const ROUND1_CANDIDATE_PARALLEL_CONCURRENCY = 4;
const ROUND1_IMAGE_GENERATION_MAX_CONCURRENCY = 4;
const ROUND1_EXPLORATION_LOCKUP_SAFE_MARGIN_RATIO = 0.06;
const ROUND1_EXPLORATION_LOCKUP_MIN_HEIGHT_RATIO = 0.28;
const ROUND1_LAYOUT_TEMPLATE_REPEAT_PENALTY = 28;
const ROUND1_LAYOUT_DEFAULT_BIAS_REPEAT_PENALTY = 84;
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
type ConcurrencyLimiter = <T>(task: () => Promise<T>) => Promise<T>;
const passthroughConcurrencyLimiter: ConcurrencyLimiter = async <T>(task: () => Promise<T>) => task();

function createConcurrencyLimiter(maxConcurrency: number): ConcurrencyLimiter {
  const concurrency = Math.max(1, Math.floor(maxConcurrency));
  let active = 0;
  const queue: Array<() => void> = [];

  const runNext = () => {
    if (active >= concurrency) {
      return;
    }
    const next = queue.shift();
    if (!next) {
      return;
    }
    active += 1;
    next();
  };

  return <T>(task: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      const execute = () => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            runNext();
          });
      };

      if (active < concurrency) {
        active += 1;
        execute();
        return;
      }

      queue.push(execute);
    });
}

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

function parseOptionalBooleanFormValue(raw: FormDataEntryValue | null): boolean | undefined {
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  return undefined;
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

type NonTitleStructureThresholds = {
  minEdgeDensity: number;
  minLuminanceStd: number;
  minCombinedScore: number;
};

type BackgroundHardFailStats = {
  edgeDensityFull: number;
  luminanceStdFull: number;
  edgeDensityNonTitle: number;
  luminanceStdNonTitle: number;
  requiredNonTitleEdgeDensity: number;
  requiredNonTitleLuminanceStd: number;
  meaningfulStructureScore: number;
  meaningfulStructureMinScore: number;
  meaningfulStructurePass: boolean;
  nonTitleLowDetail: boolean;
  borderEdgeRatio: number;
  borderLineEdgeDominance: number;
  longStraightBorderLineCount: number;
  mostEdgesAreLongStraightBorders: boolean;
  focalComponentEdgeRatio: number;
  focalComponentAreaRatio: number;
  focalMotifPresent: boolean;
  passes: boolean;
};

function resolveNonTitleStructureThresholds(referenceCluster?: ReferenceCluster | null): NonTitleStructureThresholds {
  switch (referenceCluster) {
    case "minimal":
      return {
        minEdgeDensity: 0.006,
        minLuminanceStd: 14,
        minCombinedScore: 0.068
      };
    case "texture":
      return {
        minEdgeDensity: 0.007,
        minLuminanceStd: 15,
        minCombinedScore: 0.076
      };
    case "cinematic":
    case "retro_print":
      return {
        minEdgeDensity: 0.008,
        minLuminanceStd: 16,
        minCombinedScore: 0.082
      };
    case "editorial_photo":
      return {
        minEdgeDensity: 0.0085,
        minLuminanceStd: 17,
        minCombinedScore: 0.085
      };
    case "modern_abstract":
    case "bold_type":
    case "illustration":
    case "architectural":
      return {
        minEdgeDensity: 0.0095,
        minLuminanceStd: 18,
        minCombinedScore: 0.09
      };
    case "other":
    default:
      return {
        minEdgeDensity: 0.008,
        minLuminanceStd: 16,
        minCombinedScore: 0.082
      };
  }
}

async function computeBackgroundHardFailStatsFromBuffer(
  imageBuffer: Buffer,
  titleSafeBox: TitleSafeBox,
  referenceCluster?: ReferenceCluster | null
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
    const structureThresholds = resolveNonTitleStructureThresholds(referenceCluster);
    const requiredNonTitleEdgeDensity = Math.max(ROUND1_RERANK_MIN_EDGES_NON_TITLE, structureThresholds.minEdgeDensity);
    const requiredNonTitleLuminanceStd = Math.max(1, structureThresholds.minLuminanceStd);

    let sampleCount = 0;
    let luminanceSum = 0;
    let nonTitleSampleCount = 0;
    let nonTitleLuminanceSum = 0;
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
      const x = index % width;
      const y = (index - x) / width;
      const insideSafe = x >= safeLeft && x < safeRight && y >= safeTop && y < safeBottom;
      if (!insideSafe) {
        nonTitleSampleCount += 1;
        nonTitleLuminanceSum += luminance;
      }
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
    const meanLuminanceNonTitle = nonTitleSampleCount > 0 ? nonTitleLuminanceSum / nonTitleSampleCount : meanLuminance;
    let varianceNonTitleSum = 0;
    for (let index = 0; index < totalPixels; index += 1) {
      if (!opaqueMask[index]) {
        continue;
      }
      const x = index % width;
      const y = (index - x) / width;
      const insideSafe = x >= safeLeft && x < safeRight && y >= safeTop && y < safeBottom;
      if (insideSafe) {
        continue;
      }
      const delta = luminanceByPixel[index] - meanLuminanceNonTitle;
      varianceNonTitleSum += delta * delta;
    }
    const luminanceStdNonTitle =
      nonTitleSampleCount > 0 ? Math.sqrt(varianceNonTitleSum / Math.max(1, nonTitleSampleCount)) : 0;

    let fullEdgeCount = 0;
    let fullEdgeSamples = 0;
    let nonTitleEdgeCount = 0;
    let nonTitleEdgeSamples = 0;
    let borderEdgeCount = 0;
    const edgeMask = new Uint8Array(totalPixels);
    const borderBandX = clampNumber(
      Math.round(width * ROUND1_RERANK_BORDER_BAND_RATIO),
      1,
      Math.max(1, Math.floor(width / 4))
    );
    const borderBandY = clampNumber(
      Math.round(height * ROUND1_RERANK_BORDER_BAND_RATIO),
      1,
      Math.max(1, Math.floor(height / 4))
    );
    const topBorderRows = new Uint16Array(borderBandY);
    const bottomBorderRows = new Uint16Array(borderBandY);
    const leftBorderCols = new Uint16Array(borderBandX);
    const rightBorderCols = new Uint16Array(borderBandX);
    let topBorderMaxRun = 0;
    let bottomBorderMaxRun = 0;
    let leftBorderMaxRun = 0;
    let rightBorderMaxRun = 0;

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
          edgeMask[idx] = 1;
        }

        const insideSafe = x >= safeLeft && x < safeRight && y >= safeTop && y < safeBottom;
        if (!insideSafe) {
          nonTitleEdgeSamples += 1;
          if (isEdge) {
            nonTitleEdgeCount += 1;
          }
        }

        if (!isEdge) {
          continue;
        }

        const inTopBand = y < borderBandY;
        const inBottomBand = y >= height - borderBandY;
        const inLeftBand = x < borderBandX;
        const inRightBand = x >= width - borderBandX;
        if (inTopBand || inBottomBand || inLeftBand || inRightBand) {
          borderEdgeCount += 1;
        }
        if (inTopBand) {
          const next = topBorderRows[y] + 1;
          topBorderRows[y] = next;
          if (next > topBorderMaxRun) {
            topBorderMaxRun = next;
          }
        }
        if (inBottomBand) {
          const bottomIndex = y - (height - borderBandY);
          const next = bottomBorderRows[bottomIndex] + 1;
          bottomBorderRows[bottomIndex] = next;
          if (next > bottomBorderMaxRun) {
            bottomBorderMaxRun = next;
          }
        }
        if (inLeftBand) {
          const next = leftBorderCols[x] + 1;
          leftBorderCols[x] = next;
          if (next > leftBorderMaxRun) {
            leftBorderMaxRun = next;
          }
        }
        if (inRightBand) {
          const rightIndex = x - (width - borderBandX);
          const next = rightBorderCols[rightIndex] + 1;
          rightBorderCols[rightIndex] = next;
          if (next > rightBorderMaxRun) {
            rightBorderMaxRun = next;
          }
        }
      }
    }

    const edgeDensityFull = fullEdgeSamples > 0 ? fullEdgeCount / fullEdgeSamples : 0;
    const edgeDensityNonTitle = nonTitleEdgeSamples > 0 ? nonTitleEdgeCount / nonTitleEdgeSamples : 0;
    const longHorizontalRunThreshold = Math.max(4, Math.round(width * ROUND1_RERANK_LONG_BORDER_RUN_RATIO));
    const longVerticalRunThreshold = Math.max(4, Math.round(height * ROUND1_RERANK_LONG_BORDER_RUN_RATIO));
    const hasTopBorderLine = topBorderMaxRun >= longHorizontalRunThreshold;
    const hasBottomBorderLine = bottomBorderMaxRun >= longHorizontalRunThreshold;
    const hasLeftBorderLine = leftBorderMaxRun >= longVerticalRunThreshold;
    const hasRightBorderLine = rightBorderMaxRun >= longVerticalRunThreshold;
    const longStraightBorderLineCount =
      (hasTopBorderLine ? 1 : 0) +
      (hasBottomBorderLine ? 1 : 0) +
      (hasLeftBorderLine ? 1 : 0) +
      (hasRightBorderLine ? 1 : 0);
    const borderEdgeRatio = fullEdgeCount > 0 ? borderEdgeCount / fullEdgeCount : 0;
    const borderLineEdgeDominance = clampNumber(borderEdgeRatio * 0.72 + (longStraightBorderLineCount / 4) * 0.28, 0, 1);
    const mostEdgesAreLongStraightBorders =
      borderEdgeRatio >= ROUND1_RERANK_BORDER_EDGE_DOMINANCE_THRESHOLD &&
      longStraightBorderLineCount >= ROUND1_RERANK_MIN_LONG_BORDER_LINES_FOR_SCAFFOLD;
    const visited = new Uint8Array(totalPixels);
    const queue = new Int32Array(totalPixels);
    let largestNonBorderComponentArea = 0;
    let largestNonBorderComponentBoxArea = 0;

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const start = y * width + x;
        if (!edgeMask[start] || visited[start]) {
          continue;
        }
        const startInsideSafe = x >= safeLeft && x < safeRight && y >= safeTop && y < safeBottom;
        const startInBorderBand =
          y < borderBandY || y >= height - borderBandY || x < borderBandX || x >= width - borderBandX;
        if (startInsideSafe || startInBorderBand) {
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
            if (neighbor <= 0 || neighbor >= totalPixels - 1 || visited[neighbor] || !edgeMask[neighbor]) {
              continue;
            }
            const ny = Math.floor(neighbor / width);
            const nx = neighbor - ny * width;
            const insideSafe = nx >= safeLeft && nx < safeRight && ny >= safeTop && ny < safeBottom;
            const inBorderBand =
              ny < borderBandY || ny >= height - borderBandY || nx < borderBandX || nx >= width - borderBandX;
            if (insideSafe || inBorderBand) {
              continue;
            }
            visited[neighbor] = 1;
            queue[tail++] = neighbor;
          }
        }

        if (area > largestNonBorderComponentArea) {
          largestNonBorderComponentArea = area;
          largestNonBorderComponentBoxArea = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1));
        }
      }
    }

    const focalComponentEdgeRatio = nonTitleEdgeCount > 0 ? largestNonBorderComponentArea / nonTitleEdgeCount : 0;
    const focalComponentAreaRatio = totalPixels > 0 ? largestNonBorderComponentBoxArea / totalPixels : 0;
    const focalMotifPresent =
      focalComponentEdgeRatio >= 0.2 || (focalComponentEdgeRatio >= 0.12 && focalComponentAreaRatio >= 0.035);
    const meaningfulStructureScore = edgeDensityNonTitle + luminanceStdNonTitle / 255;
    const meaningfulStructurePass =
      edgeDensityNonTitle >= requiredNonTitleEdgeDensity &&
      luminanceStdNonTitle >= requiredNonTitleLuminanceStd &&
      meaningfulStructureScore >= structureThresholds.minCombinedScore;
    const nonTitleLowDetail = !meaningfulStructurePass;
    const passes =
      (edgeDensityFull >= ROUND1_RERANK_MIN_EDGES_FULL && luminanceStdFull >= ROUND1_RERANK_MIN_STD_FULL) &&
      edgeDensityNonTitle >= requiredNonTitleEdgeDensity &&
      meaningfulStructurePass;

    return {
      edgeDensityFull,
      luminanceStdFull,
      edgeDensityNonTitle,
      luminanceStdNonTitle,
      requiredNonTitleEdgeDensity,
      requiredNonTitleLuminanceStd,
      meaningfulStructureScore,
      meaningfulStructureMinScore: structureThresholds.minCombinedScore,
      meaningfulStructurePass,
      nonTitleLowDetail,
      borderEdgeRatio,
      borderLineEdgeDominance,
      longStraightBorderLineCount,
      mostEdgesAreLongStraightBorders,
      focalComponentEdgeRatio,
      focalComponentAreaRatio,
      focalMotifPresent,
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
  titleSafeBox?: TitleSafeBox;
}): LockupFitCheck {
  const safeRatio = params.titleSafeBox || LOCKUP_SAFE_REGION_RATIOS[params.shape];
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

function resolveVariationTemplateFromDirectionSpec(directionSpec?: PlannedDirectionSpec | null) {
  if (typeof directionSpec?.variationTemplateKey !== "string" || !directionSpec.variationTemplateKey.trim()) {
    return null;
  }
  return getRound1VariationTemplateByKey(directionSpec.variationTemplateKey);
}

function isReferenceFirstDirection(directionSpec?: PlannedDirectionSpec | null): boolean {
  return typeof directionSpec?.referenceId === "string" && directionSpec.referenceId.trim().length > 0;
}

function resolveTitleSafeBoxForDirection(
  shape: PreviewShape,
  directionSpec?: PlannedDirectionSpec | null,
  variationTemplate = resolveVariationTemplateFromDirectionSpec(directionSpec)
): LockupSafeRegionRatio {
  const base = LOCKUP_SAFE_REGION_RATIOS[shape];
  if (!variationTemplate) {
    return base;
  }

  const clampBox = (box: LockupSafeRegionRatio): LockupSafeRegionRatio => {
    const width = clampNumber(box.width, 0.2, 0.9);
    const height = clampNumber(box.height, 0.14, 0.86);
    const left = clampNumber(box.left, 0, 1 - width);
    const top = clampNumber(box.top, 0, 1 - height);
    return { left, top, width, height };
  };

  const centeredBox = clampBox({
    left: (1 - (shape === "wide" ? 0.56 : shape === "tall" ? 0.74 : 0.66)) / 2,
    top: (1 - (shape === "wide" ? 0.38 : shape === "tall" ? 0.26 : 0.42)) / 2,
    width: shape === "wide" ? 0.56 : shape === "tall" ? 0.74 : 0.66,
    height: shape === "wide" ? 0.38 : shape === "tall" ? 0.26 : 0.42
  });

  const topBandBox = clampBox({
    left: (1 - (shape === "wide" ? 0.76 : shape === "tall" ? 0.84 : 0.82)) / 2,
    top: shape === "tall" ? 0.09 : 0.08,
    width: shape === "wide" ? 0.76 : shape === "tall" ? 0.84 : 0.82,
    height: shape === "wide" ? 0.3 : shape === "tall" ? 0.18 : 0.26
  });

  const bottomBandHeight = shape === "wide" ? 0.3 : shape === "tall" ? 0.18 : 0.26;
  const bottomBandTopPad = shape === "tall" ? 0.09 : 0.08;
  const bottomBandBox = clampBox({
    left: topBandBox.left,
    top: 1 - bottomBandTopPad - bottomBandHeight,
    width: topBandBox.width,
    height: bottomBandHeight
  });

  const fullBleedTopLeftBox = clampBox({
    left: base.left,
    top: shape === "tall" ? 0.07 : 0.08,
    width: shape === "wide" ? 0.44 : shape === "tall" ? 0.66 : 0.56,
    height: shape === "wide" ? 0.26 : shape === "tall" ? 0.2 : 0.32
  });
  const fullBleedBottomLeftHeight = shape === "wide" ? 0.26 : shape === "tall" ? 0.2 : 0.32;
  const fullBleedBottomLeftPad = shape === "tall" ? 0.1 : 0.09;
  const fullBleedBottomLeftBox = clampBox({
    left: fullBleedTopLeftBox.left,
    top: 1 - fullBleedBottomLeftPad - fullBleedBottomLeftHeight,
    width: fullBleedTopLeftBox.width,
    height: fullBleedBottomLeftHeight
  });

  if (variationTemplate.overlapRule === "type_over_art" && variationTemplate.asymmetryRule === "full_bleed") {
    if (variationTemplate.overlayAnchor === "center") {
      return centeredBox;
    }
    if (variationTemplate.overlayAnchor === "bottom-left") {
      return fullBleedBottomLeftBox;
    }
    return fullBleedTopLeftBox;
  }

  if (variationTemplate.typeRegion === "right") {
    return clampBox({
      ...base,
      left: 1 - base.left - base.width
    });
  }
  if (variationTemplate.typeRegion === "center") {
    return centeredBox;
  }
  if (variationTemplate.typeRegion === "top") {
    return topBandBox;
  }
  if (variationTemplate.typeRegion === "bottom") {
    return bottomBandBox;
  }

  return base;
}

function shapeCompositionHint(params: {
  shape: PreviewShape;
  directionSpec?: PlannedDirectionSpec | null;
  variationTemplate?: ReturnType<typeof resolveVariationTemplateFromDirectionSpec>;
}): string {
  const variationTemplate = params.variationTemplate || resolveVariationTemplateFromDirectionSpec(params.directionSpec);
  if (!variationTemplate) {
    if (params.shape === "wide") {
      return "Reserve at least the left 55% as clean negative space for typography; keep art interest mostly to the right.";
    }
    if (params.shape === "tall") {
      return "Reserve upper-middle area as clean negative space for typography; keep heavier art in the lower third.";
    }
    return "Reserve large left-center negative space for typography and keep accents subtle near edges.";
  }

  const safeBox = resolveTitleSafeBoxForDirection(params.shape, params.directionSpec, variationTemplate);
  const leftPct = Math.round(safeBox.left * 100);
  const topPct = Math.round(safeBox.top * 100);
  const rightPct = Math.round((safeBox.left + safeBox.width) * 100);
  const bottomPct = Math.round((safeBox.top + safeBox.height) * 100);
  const overlapLine =
    variationTemplate.overlapRule === "type_over_art"
      ? "Type must overlay art with controlled local contrast."
      : "Type and art must stay spatially separated.";

  return `Template shape guidance (${variationTemplate.key}): keep type stage in x ${leftPct}-${rightPct}% and y ${topPct}-${bottomPct}% on ${params.shape.toUpperCase()}. ${overlapLine}`;
}

type SafeAreaAnchor = "upper-left" | "upper-center" | "upper-right" | "center" | "lower-left" | "lower-center";

function resolveSafeAreaAnchor(
  directionSpec?: PlannedDirectionSpec | null,
  variationTemplate = resolveVariationTemplateFromDirectionSpec(directionSpec)
): SafeAreaAnchor {
  if (variationTemplate) {
    if (variationTemplate.overlapRule === "type_over_art" && variationTemplate.asymmetryRule === "full_bleed") {
      if (variationTemplate.overlayAnchor === "center") {
        return "center";
      }
      if (variationTemplate.overlayAnchor === "bottom-left") {
        return "lower-left";
      }
      return "upper-left";
    }
    if (variationTemplate.typeRegion === "right") {
      return "upper-right";
    }
    if (variationTemplate.typeRegion === "center") {
      return "center";
    }
    if (variationTemplate.typeRegion === "top") {
      return "upper-center";
    }
    if (variationTemplate.typeRegion === "bottom") {
      return "lower-center";
    }
    return "upper-left";
  }

  if (
    directionSpec &&
    (directionSpec.compositionType === "centered_stack" ||
      directionSpec.compositionType === "badge_emblem" ||
      directionSpec.compositionType === "monumental_overprint")
  ) {
    return "upper-center";
  }

  return "upper-left";
}

function describeLockupSafeArea(
  shape: PreviewShape,
  directionSpec?: PlannedDirectionSpec | null,
  variationTemplate = resolveVariationTemplateFromDirectionSpec(directionSpec)
): string {
  const ratios = resolveTitleSafeBoxForDirection(shape, directionSpec, variationTemplate);
  const anchor = resolveSafeAreaAnchor(directionSpec, variationTemplate);
  const leftPct = Math.round(ratios.left * 100);
  const topPct = Math.round(ratios.top * 100);
  const widthPct = Math.round(ratios.width * 100);
  const heightPct = Math.round(ratios.height * 100);
  const rightPct = clampNumber(leftPct + widthPct, 0, 100);
  const bottomPct = clampNumber(topPct + heightPct, 0, 100);
  const anchorHintByAnchor: Record<SafeAreaAnchor, string> = {
    "upper-left": "Prioritize the upper-left of this safe area for the cleanest negative space.",
    "upper-center": "Prioritize the upper-center of this safe area for the cleanest negative space.",
    "upper-right": "Prioritize the upper-right of this safe area for the cleanest negative space.",
    center: "Prioritize the center of this safe area for the cleanest negative space.",
    "lower-left": "Prioritize the lower-left of this safe area for the cleanest negative space.",
    "lower-center": "Prioritize the lower-center of this safe area for the cleanest negative space."
  };
  const anchorHint = anchorHintByAnchor[anchor];

  return `${shape.toUpperCase()}: reserve lockup safe area at x ${leftPct}-${rightPct}% and y ${topPct}-${bottomPct}%. ${anchorHint} Keep this region clean, low texture, low contrast, no focal elements, no strong lines, no scanline/banding artifacts, no moire.`;
}

function buildLockupSafeAreaInstructions(directionSpec?: PlannedDirectionSpec | null): string {
  const variationTemplate = resolveVariationTemplateFromDirectionSpec(directionSpec);
  const anchor = resolveSafeAreaAnchor(directionSpec, variationTemplate);
  const directionLine = directionSpec
    ? `Direction-aware lockup reservation: ${directionSpec.compositionType} should protect the ${anchor} lockup lane.`
    : "Direction-aware lockup reservation: default to upper-left lockup lane.";
  const templateLine = variationTemplate
    ? `Layout template lane map (${variationTemplate.key}): focal=${variationTemplate.primaryFocalRegion || "auto"}, type=${variationTemplate.typeRegion || "auto"}, overlap=${variationTemplate.overlapRule || "separated"}, asymmetry=${variationTemplate.asymmetryRule || "split"}.`
    : "";

  return [
    directionLine,
    templateLine,
    describeLockupSafeArea("wide", directionSpec, variationTemplate),
    describeLockupSafeArea("square", directionSpec, variationTemplate),
    describeLockupSafeArea("tall", directionSpec, variationTemplate)
  ].join(" ");
}

function describeTitleStageFocusBounds(
  shape: PreviewShape,
  placementHint: SafeAreaAnchor,
  directionSpec?: PlannedDirectionSpec | null
): string {
  const ratios = resolveTitleSafeBoxForDirection(shape, directionSpec);
  const leftPct = Math.round(ratios.left * 100);
  const topPct = Math.round(ratios.top * 100);
  const widthPct = Math.round(ratios.width * 100);
  const heightPct = Math.round(ratios.height * 100);
  const rightPct = clampNumber(leftPct + widthPct, 0, 100);
  const bottomPct = clampNumber(topPct + heightPct, 0, 100);
  const placementNoteByAnchor: Record<SafeAreaAnchor, string> = {
    "upper-left": "bias the cleanest negative space to the upper-left.",
    "upper-center": "bias the cleanest negative space to the upper-center.",
    "upper-right": "bias the cleanest negative space to the upper-right.",
    center: "bias the cleanest negative space to center.",
    "lower-left": "bias the cleanest negative space to the lower-left.",
    "lower-center": "bias the cleanest negative space to the lower-center."
  };
  const placementNote = placementNoteByAnchor[placementHint];
  return `${shape.toUpperCase()} composition support zone (planning coordinates only, never a drawn frame): x ${leftPct}-${rightPct}% and y ${topPct}-${bottomPct}%; ${placementNote}`;
}

function describeFormatStagePlacement(
  shape: PreviewShape,
  placementHint: SafeAreaAnchor,
  directionSpec?: PlannedDirectionSpec | null
): string {
  const stageArea = describeTitleStageFocusBounds(shape, placementHint, directionSpec);
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
  directionSpec?: PlannedDirectionSpec | null;
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
    ...formatOrder.map((shape) => describeFormatStagePlacement(shape, params.placementHint, params.directionSpec)),
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
const TITLE_INTEGRATION_MODE_SET = new Set<TitleIntegrationMode>([
  "OVERLAY_GLASS",
  "CUTOUT_MASK",
  "GRID_LOCKUP",
  "TYPE_AS_TEXTURE"
]);

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

function isTitleIntegrationMode(value: unknown): value is TitleIntegrationMode {
  return typeof value === "string" && TITLE_INTEGRATION_MODE_SET.has(value as TitleIntegrationMode);
}

function resolveTitleIntegrationMode(directionSpec?: PlannedDirectionSpec | null): TitleIntegrationMode | null {
  const candidate = directionSpec?.titleIntegrationMode;
  return isTitleIntegrationMode(candidate) ? candidate : null;
}

function resolveDesignSpecTitleIntegrationMode(params: {
  designSpec?: DesignSpec | null;
  directionSpec?: PlannedDirectionSpec | null;
}): DesignSpecTitleIntegrationMode {
  const direct = params.designSpec?.titleIntegrationMode;
  if (direct) {
    return direct;
  }
  const legacy = mapLegacyTitleIntegrationToDesignSpec(resolveTitleIntegrationMode(params.directionSpec));
  return legacy || "PLATE";
}

function mapDesignSpecModeToLockupIntegrationMode(mode: DesignSpecTitleIntegrationMode): LockupIntegrationMode {
  if (mode === "PLATE") {
    return "plate";
  }
  if (mode === "MASK") {
    return "mask";
  }
  if (mode === "CUTOUT") {
    return "cutout";
  }
  if (mode === "GRID_LOCK") {
    return "grid_lock";
  }
  if (mode === "TYPE_AS_TEXTURE") {
    return "grid_lock";
  }
  return "clean";
}

function summarizeDesignSpecForPrompt(designSpec: DesignSpec): string {
  const symbols = readSymbolDirectives(designSpec).join(", ") || "none";
  return [
    `reference=${designSpec.reference.id}/${designSpec.reference.cluster}/${designSpec.reference.tier}`,
    `composition(template=${designSpec.composition.templateKey}, type=${designSpec.composition.typeRegion}, motif=${designSpec.composition.motifRegion}, overlap=${designSpec.composition.overlap}, asymmetry=${designSpec.composition.asymmetry})`,
    `titleIntegration=${normalizeBackgroundTitleIntegrationMode(designSpec.titleIntegrationMode)}`,
    `typography(hierarchy=${designSpec.typographySystem.hierarchy}, case=${designSpec.typographySystem.caseRule}, breaks=${designSpec.typographySystem.lineBreakStrategy}, tracking=${designSpec.typographySystem.tracking}, subtitle=${designSpec.typographySystem.subtitleStyle})`,
    `motif(symbols=${symbols}, abstraction=${designSpec.motifTreatment.abstraction}, texture=${designSpec.motifTreatment.texture}, colorUse=${designSpec.motifTreatment.colorUse})`,
    `palette(intent=${designSpec.palette.intent}, contrast=${designSpec.palette.contrast}, background=${designSpec.palette.background})`,
    "doNot(noScaffoldFrames=true,noRuledPaperAsOnlyDesign=true,noBordersOnly=true,noStickerClipartUnlessFunTier=true,noReadableBackgroundText=true)"
  ].join(" | ");
}

function buildTitleIntegrationAuthorityInstruction(params: {
  mode: TitleIntegrationMode;
  target: "background" | "lockup";
  variationTemplate?: ReturnType<typeof resolveVariationTemplateFromDirectionSpec>;
}): string {
  const template = params.variationTemplate;
  const templateContext = template
    ? `Template context: type region=${template.typeRegion || "auto"}, overlap=${template.overlapRule || "separated"}, asymmetry=${template.asymmetryRule || "split"}, overlay anchor=${template.overlayAnchor || "auto"}.`
    : "Template context: follow the active title-safe lane and lockup anchor for this direction.";

  if (params.mode === "OVERLAY_GLASS") {
    return params.target === "background"
      ? `HARD TITLE-INTEGRATION MODE: OVERLAY_GLASS. Build a translucent palette-echoing plate in the title lane. Plate silhouette must follow the template geometry instead of a generic box. ${templateContext} The plate must feel composition-native, not pasted.`
      : `HARD TITLE-INTEGRATION MODE: OVERLAY_GLASS. Set title/subtitle inside the translucent plate geometry and match its contour/axis. ${templateContext} Use contrast/refraction cues subtly so type feels embedded, not floating.`;
  }

  if (params.mode === "CUTOUT_MASK") {
    return params.target === "background"
      ? `HARD TITLE-INTEGRATION MODE: CUTOUT_MASK. Build one solid shape or image-density region in the title lane specifically for knockout lettering. ${templateContext} Prepare clean negative-space edges so type can be carved out of the form.`
      : `HARD TITLE-INTEGRATION MODE: CUTOUT_MASK. Render the title as true knockout/negative space carved from a host shape or image region. ${templateContext} This must read as integrated cutout, never normal text pasted on top.`;
  }

  if (params.mode === "GRID_LOCKUP") {
    return params.target === "background"
      ? `HARD TITLE-INTEGRATION MODE: GRID_LOCKUP. Establish a strict modular grid and align background masses, edges, and spacing to shared grid lines in the title lane. ${templateContext} Build the scene so type can lock to the same grid.`
      : `HARD TITLE-INTEGRATION MODE: GRID_LOCKUP. Lock title/subtitle baselines, block edges, and spacing to a strict shared grid. ${templateContext} Alignment must visibly match the background grid structure.`;
  }

  return params.target === "background"
    ? `HARD TITLE-INTEGRATION MODE: TYPE_AS_TEXTURE. Build subtle texture rhythm with non-typographic micro marks only. ${templateContext} Background stage must stay fully text-free: no words, letters, logos, signage, or glyph-like fragments.`
    : `HARD TITLE-INTEGRATION MODE: TYPE_AS_TEXTURE. Let the lockup borrow subtle fragment/texture rhythm from the background letterform system. ${templateContext} Never add readable extra words beyond the title and optional subtitle.`;
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

function buildVariationTemplateHardInstruction(params: {
  variationTemplate: NonNullable<ReturnType<typeof resolveVariationTemplateFromDirectionSpec>>;
  target: "background" | "lockup";
}): string {
  const region = (value: string | undefined) => value || "auto";
  const overlayAnchor = params.variationTemplate.overlayAnchor ? `, overlay anchor=${params.variationTemplate.overlayAnchor}` : "";
  const templateDefinitionLine = `HARD LAYOUT TEMPLATE (${params.variationTemplate.key}): focal region=${region(params.variationTemplate.primaryFocalRegion)}, type region=${region(params.variationTemplate.typeRegion)}, overlap=${params.variationTemplate.overlapRule || "separated"}, asymmetry=${params.variationTemplate.asymmetryRule || "split"}${overlayAnchor}.`;
  const targetInstruction =
    params.target === "background"
      ? params.variationTemplate.backgroundLayoutInstruction
      : params.variationTemplate.lockupLayoutInstruction;
  return `${templateDefinitionLine} HARD TEMPLATE APPLICATION: ${targetInstruction}`;
}

function buildVariationTemplateCompositionGoalInstruction(params: {
  variationTemplate: NonNullable<ReturnType<typeof resolveVariationTemplateFromDirectionSpec>>;
  target: "background" | "lockup";
}): string {
  const targetInstruction =
    params.target === "background"
      ? params.variationTemplate.backgroundLayoutInstruction
      : params.variationTemplate.lockupLayoutInstruction;
  return `Variation template composition goal (${params.variationTemplate.key}): ${targetInstruction} Treat this as a composition goal, not a hard template application.`;
}

function referenceFirstDefaultBiasGuardLine(directionSpec?: PlannedDirectionSpec | null): string {
  return isReferenceFirstDirection(directionSpec)
    ? "Do not use the default left-text/right-art layout unless the template says so."
    : "";
}

function withVariationTemplateKey(
  directionSpec: PlannedDirectionSpec | null | undefined,
  variationTemplateKey: string | null
): PlannedDirectionSpec | null {
  if (!directionSpec) {
    return null;
  }
  if (!variationTemplateKey) {
    return {
      ...directionSpec,
      variationTemplateKey: undefined
    };
  }
  return {
    ...directionSpec,
    variationTemplateKey
  };
}

function buildBackgroundCandidateTemplateKeys(params: {
  seed: string;
  count: number;
  directionSpec?: PlannedDirectionSpec | null;
}): (string | null)[] {
  const count = Math.max(1, params.count);
  const baseKey =
    typeof params.directionSpec?.variationTemplateKey === "string" && params.directionSpec.variationTemplateKey.trim()
      ? params.directionSpec.variationTemplateKey.trim()
      : null;
  const isReferenceFirst = isReferenceFirstDirection(params.directionSpec);
  if (!isReferenceFirst) {
    return Array.from({ length: count }, () => baseKey);
  }

  const templates = listRound1VariationTemplates();
  if (templates.length <= 0) {
    return Array.from({ length: count }, () => baseKey);
  }

  const ordered = [...templates].sort((a, b) => {
    const aHash = hashForDeterministicOrdering(params.seed, a.key);
    const bHash = hashForDeterministicOrdering(params.seed, b.key);
    return aHash.localeCompare(bHash);
  });

  const keys: string[] = [];
  const used = new Set<string>();
  if (baseKey && ordered.some((template) => template.key === baseKey)) {
    keys.push(baseKey);
    used.add(baseKey);
  }

  for (const template of ordered) {
    if (keys.length >= count) {
      break;
    }
    if (used.has(template.key)) {
      continue;
    }
    keys.push(template.key);
    used.add(template.key);
  }

  if (keys.length <= 0) {
    keys.push(baseKey || ordered[0]?.key || "layout_text_left_art_right");
  }

  while (keys.length < count) {
    keys.push(keys[keys.length % Math.max(1, keys.length)]);
  }

  return keys.slice(0, count);
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

function buildLockupGenerationPrompt(params: {
  title: string;
  subtitle: string;
  styleMode: LockupStyleMode;
  lockupLayout: LockupLayoutArchetype;
  explorationMode?: boolean;
  directionSpec?: PlannedDirectionSpec | null;
  designSpec?: DesignSpec | null;
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
  const isReferenceFirst = Boolean(params.directionSpec?.referenceId);
  const promptProfileSelection = resolvePromptProfile({
    explorationMode: params.explorationMode,
    referenceId: params.directionSpec?.referenceId
  });
  const promptProfile = promptProfileSelection.profile;
  const isRound1ReferenceFirst = promptProfileSelection.key === "round1_reference_first";
  const styleFamily = resolveDirectionStyleFamily(params.directionSpec);
  const directionLine = params.directionSpec
    ? `Direction context: ${params.directionSpec.styleFamily || "unassigned"} / ${params.directionSpec.laneFamily} / ${
        params.directionSpec.compositionType
      } / ${params.directionSpec.backgroundMode}.`
    : "";
  const hardStyleConstraintLine = styleFamily && promptProfile.includeFlags.includeBucketRules && !isReferenceFirst
    ? `HARD STYLE CONSTRAINT: Bucket = ${styleFamily.bucket}. Follow bucket rules strictly.`
    : "";
  const bucketRulesLine =
    styleFamily && promptProfile.includeFlags.includeBucketRules ? `Bucket rules: ${styleFamily.bucketRules}` : "";
  const hardToneConstraintLine =
    styleFamily && promptProfile.includeFlags.includeToneRules && !isReferenceFirst
      ? `HARD STYLE CONSTRAINT: Tone = ${styleFamily.tone}.`
      : "";
  const toneRulesLine = styleFamily && promptProfile.includeFlags.includeToneRules ? `Tone rules: ${styleFamily.toneRules}` : "";
  const hardMediumConstraintLine =
    styleFamily && promptProfile.includeFlags.includeMediumRules && !isReferenceFirst
      ? `HARD STYLE CONSTRAINT: Medium = ${styleFamily.medium}.`
      : "";
  const mediumRulesLine =
    styleFamily && promptProfile.includeFlags.includeMediumRules ? `Medium rules: ${styleFamily.mediumRules}` : "";
  const styleFamilyLockupRulesLine = styleFamily && promptProfile.includeFlags.includeStyleFamilyRules
    ? `Style family: ${styleFamily.name}. Follow these rules strongly: ${styleFamily.lockupRules.join(" ")}`
    : "";
  const styleFamilyForbidsLine =
    styleFamily && promptProfile.includeFlags.includeStyleFamilyRules ? `Style family forbids: ${styleFamily.forbids.join("; ")}.` : "";
  const compatibleLayouts = styleFamily ? STYLE_FAMILY_LOCKUP_LAYOUT_BIAS[styleFamily.key] : null;
  const styleFamilyLayoutBiasLine =
    styleFamily &&
    promptProfile.includeFlags.includeStyleFamilyRules &&
    compatibleLayouts &&
    !compatibleLayouts.includes(params.lockupLayout)
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
  const variationTemplateLine =
    variationTemplate && promptProfile.includeFlags.includeVariationTemplate && !isRound1ReferenceFirst
      ? buildVariationTemplateHardInstruction({
          variationTemplate,
          target: "lockup"
        })
      : "";
  const designSpecTitleIntegrationMode = resolveDesignSpecTitleIntegrationMode({
    designSpec: params.designSpec,
    directionSpec: params.directionSpec
  });
  const titleIntegrationMode = resolveTitleIntegrationMode(params.directionSpec);
  const titleIntegrationModeLine = titleIntegrationMode
    ? `Legacy title integration mode: ${titleIntegrationMode}.`
    : `Legacy title integration mode: auto.`;
  const designSpecIntegrationLine = `DesignSpec title integration mode (authoritative): ${designSpecTitleIntegrationMode}.`;
  const titleIntegrationAuthorityLine = titleIntegrationMode
    ? buildTitleIntegrationAuthorityInstruction({
        mode: titleIntegrationMode,
        target: "lockup",
        variationTemplate
      })
    : "Legacy title integration guidance unavailable; follow DesignSpec mode as authority.";
  const titleIntegrationQualityLine =
    "Integration quality bar: title lockup must feel architected with the composition, never pasted as a detached sticker.";
  const designSpecTypographyLine = params.designSpec
    ? `DesignSpec typography system: hierarchy=${params.designSpec.typographySystem.hierarchy}, case=${params.designSpec.typographySystem.caseRule}, lineBreak=${params.designSpec.typographySystem.lineBreakStrategy}, tracking=${params.designSpec.typographySystem.tracking}, subtitle=${params.designSpec.typographySystem.subtitleStyle}.`
    : "";
  const designSpecIntegrationBehaviorLine =
    designSpecTitleIntegrationMode === "PLATE"
      ? "PLATE mode: build title/subtitle as one integrated block with a restrained scrim plate contour and clean padding."
      : designSpecTitleIntegrationMode === "MASK"
        ? "MASK mode: use a solid host shape behind type for integrated masking; no duplicate text layers."
        : designSpecTitleIntegrationMode === "CUTOUT"
          ? "CUTOUT mode: shape-backed knockout feel with disciplined edges; no duplicated title layers."
          : designSpecTitleIntegrationMode === "GRID_LOCK"
            ? "GRID_LOCK mode: align title/subtitle blocks to one simple grid with consistent margins and baselines."
            : "TYPE_AS_TEXTURE is disabled for lockup readability in this pipeline; use micro ornament only and keep copy fully readable.";
  const defaultBiasGuardLine = referenceFirstDefaultBiasGuardLine(params.directionSpec);
  const referenceAnchorContextLine = params.directionSpec?.referenceId
    ? `Reference anchor: ${params.directionSpec.referenceId} (${params.directionSpec.referenceCluster || "other"}, ${
        params.directionSpec.referenceTier || "unknown"
      }).`
    : "";
  const referenceAnchorDirectiveLine = params.directionSpec?.referenceId
    ? "REFERENCE ANCHOR: match palette logic, texture, typographic energy, composition style."
    : "";
  const referenceTypographyGuardLine = params.directionSpec?.referenceId
    ? "Match typographic energy and hierarchy from the reference, but use ONLY the provided title/subtitle text. Do not introduce any other words."
    : "Use ONLY the provided title/subtitle text. Do not introduce any other words.";
  const referenceAnchorPriorityLine = isReferenceFirst && !isRound1ReferenceFirst
    ? "REFERENCE ANCHOR IS HIGHEST PRIORITY. Match the reference's composition, texture, palette logic, and typographic energy."
    : "";
  const referenceSecondaryGuardrailLine = isReferenceFirst && !isRound1ReferenceFirst
    ? "Bucket/tone/medium are secondary guardrails; use them only if they do not contradict the reference."
    : "";
  const originalityRuleLine = params.directionSpec?.referenceId && !isRound1ReferenceFirst
    ? "ORIGINALITY RULE: do NOT copy the reference layout; do NOT reuse the same motif; recomposition required."
    : "";
  const motifRecompositionLine = params.directionSpec?.referenceId && !isRound1ReferenceFirst
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
  const styleAuthorityOverrideLine = isReferenceFirst
    ? ""
    : "If any style refs conflict with bucket/family/tone/medium rules, IGNORE the refs and follow bucket/family/tone/medium.";
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
  const refinementTypographyEnergyLine =
    params.directionSpec?.refinementMutationAxis === "typography_energy"
      ? params.directionSpec.refinementTypographyEnergyProfile === "airy"
        ? "Refinement delta (typography energy): use slightly lighter weight and looser tracking with more breathing room; preserve clean hierarchy."
        : params.directionSpec.refinementTypographyEnergyProfile === "tight"
          ? "Refinement delta (typography energy): use slightly heavier weight, tighter tracking, and compact line breaks; preserve readability."
          : "Refinement delta (typography energy): keep hierarchy consistent while slightly increasing rhythm through disciplined tracking/weight contrast."
      : "";
  // Bible brief motifs/markIdeas provide symbolic lockup accents without introducing extra copy.
  const motifsLine =
    promptProfile.includeFlags.includeBibleBrief && params.bibleCreativeBrief && params.bibleCreativeBrief.motifs.length > 0
      ? `Motif cues (symbolic): ${params.bibleCreativeBrief.motifs.slice(0, 6).join(", ")}.`
      : "";
  const typographyMoodLine =
    promptProfile.includeFlags.includeBibleBrief &&
    params.bibleCreativeBrief &&
    params.bibleCreativeBrief.typographyMood.length > 0
      ? `Typography mood: ${params.bibleCreativeBrief.typographyMood.join(", ")}.`
      : "";
  const markIdeasLine =
    promptProfile.includeFlags.includeBibleBrief &&
    params.wantsSeriesMark &&
    params.bibleCreativeBrief &&
    params.bibleCreativeBrief.markIdeas.length > 0
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
  const titleStageLockupLine = promptProfile.includeFlags.includeTitleStage && params.directionSpec?.wantsTitleStage
    ? "Assume the background will provide a clean title stage; do not add panels/frames behind the text."
    : "";
  const profileSoftGuidanceLines = promptProfile.softGuidance
    .map((line) => {
      if (!line.includes("variation template")) {
        return line;
      }
      if (!variationTemplate) {
        return "";
      }
      return buildVariationTemplateCompositionGoalInstruction({
        variationTemplate,
        target: "lockup"
      });
    })
    .filter(Boolean);

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
    referenceTypographyGuardLine,
    referenceAnchorPriorityLine,
    referenceSecondaryGuardrailLine,
    ...profileSoftGuidanceLines,
    originalityRuleLine,
    motifRecompositionLine,
    referenceLockupLayoutFamilyLine,
    referenceToneMediumLine,
    variationTemplateLine,
    designSpecIntegrationLine,
    designSpecTypographyLine,
    designSpecIntegrationBehaviorLine,
    titleIntegrationModeLine,
    titleIntegrationAuthorityLine,
    titleIntegrationQualityLine,
    defaultBiasGuardLine,
    referenceLine,
    styleSpecificLine,
    archetypeLine,
    archetypeInstructionLine,
    typographicRecipeLine,
    refinementTypographyEnergyLine,
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
      fontSeed: params.fontSeed,
      // Keep lockup generation text-only; integration treatment is applied in compositor.
      integrationMode: "NONE"
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
  selectedOptionIndex?: number;
  primaryDirectionMode?: "refinement_funnel" | "new_direction";
  regenerateLockup?: boolean;
  explicitNewTitleStyle?: boolean;
  regenerateBackground?: boolean;
};

type PrimaryDirectionContext = {
  sourceRound: number;
  selectedOptionIndex: number;
  chosenGenerationId: string | null;
  mode: "refinement_funnel" | "new_direction";
  explicitDirectionChangeRequested: boolean;
  directionSpec: PlannedDirectionSpec;
};

type RefinementFeedbackDelta = {
  round: number;
  request: string;
  emphasis: "title" | "quote";
  expressiveness: number;
  temperature: number;
  regenerateLockup?: boolean;
  explicitNewTitleStyle?: boolean;
  regenerateBackground?: boolean;
  mode: "refinement_funnel" | "new_direction";
  variantMutations?: Array<{
    optionLabel: "A" | "B" | "C";
    axis: RefinementMutationAxis;
    fingerprint: string;
    noveltyRetryApplied: boolean;
  }>;
};

type RefinementLineageState = {
  refinementChainId: string;
  anchorDirectionFingerprint: string;
  lockedStyleInvariants: RefinementLockedStyleInvariants;
  appliedFeedbackDeltas: RefinementFeedbackDelta[];
  seenVariantFingerprints: string[];
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
    selectedOptionIndex?: unknown;
    primaryDirectionMode?: unknown;
    regenerateLockup?: unknown;
    explicitNewTitleStyle?: unknown;
    regenerateBackground?: unknown;
  };
  const chosenGenerationId =
    typeof typedFeedback.chosenGenerationId === "string" && typedFeedback.chosenGenerationId.trim()
      ? typedFeedback.chosenGenerationId.trim()
      : null;
  const selectedOptionIndex =
    typeof typedFeedback.selectedOptionIndex === "number" &&
    Number.isInteger(typedFeedback.selectedOptionIndex) &&
    typedFeedback.selectedOptionIndex >= 0 &&
    typedFeedback.selectedOptionIndex < ROUND_OPTION_COUNT
      ? typedFeedback.selectedOptionIndex
      : undefined;
  const primaryDirectionMode =
    typedFeedback.primaryDirectionMode === "refinement_funnel" || typedFeedback.primaryDirectionMode === "new_direction"
      ? typedFeedback.primaryDirectionMode
      : undefined;

  return {
    chosenGenerationId,
    selectedOptionIndex,
    primaryDirectionMode,
    regenerateLockup: typeof typedFeedback.regenerateLockup === "boolean" ? typedFeedback.regenerateLockup : undefined,
    explicitNewTitleStyle:
      typeof typedFeedback.explicitNewTitleStyle === "boolean" ? typedFeedback.explicitNewTitleStyle : undefined,
    regenerateBackground:
      typeof typedFeedback.regenerateBackground === "boolean" ? typedFeedback.regenerateBackground : undefined
  };
}

function normalizeRefinementReferenceIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(trimmed);
  }
  return normalized;
}

function normalizeRefinementVariantMutations(value: unknown): RefinementFeedbackDelta["variantMutations"] {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const typed = item as {
        optionLabel?: unknown;
        axis?: unknown;
        fingerprint?: unknown;
        noveltyRetryApplied?: unknown;
      };
      const optionLabel =
        typed.optionLabel === "A" || typed.optionLabel === "B" || typed.optionLabel === "C" ? typed.optionLabel : null;
      const axis =
        typed.axis === "composition" || typed.axis === "motif_emphasis" || typed.axis === "typography_energy"
          ? typed.axis
          : null;
      const fingerprint = typeof typed.fingerprint === "string" ? typed.fingerprint.trim() : "";
      if (!optionLabel || !axis || !fingerprint) {
        return null;
      }
      return {
        optionLabel,
        axis,
        fingerprint,
        noveltyRetryApplied: typed.noveltyRetryApplied === true
      };
    })
    .filter(
      (
        item
      ): item is {
        optionLabel: "A" | "B" | "C";
        axis: RefinementMutationAxis;
        fingerprint: string;
        noveltyRetryApplied: boolean;
      } => Boolean(item)
    );
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeRefinementFeedbackDeltas(value: unknown): RefinementFeedbackDelta[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item): RefinementFeedbackDelta | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const typed = item as {
        round?: unknown;
        request?: unknown;
        emphasis?: unknown;
        expressiveness?: unknown;
        temperature?: unknown;
        regenerateLockup?: unknown;
        explicitNewTitleStyle?: unknown;
        regenerateBackground?: unknown;
        mode?: unknown;
        variantMutations?: unknown;
      };
      if (
        typeof typed.round !== "number" ||
        !Number.isFinite(typed.round) ||
        !Number.isInteger(typed.round) ||
        (typed.emphasis !== "title" && typed.emphasis !== "quote") ||
        typeof typed.expressiveness !== "number" ||
        !Number.isFinite(typed.expressiveness) ||
        typeof typed.temperature !== "number" ||
        !Number.isFinite(typed.temperature) ||
        (typed.mode !== "refinement_funnel" && typed.mode !== "new_direction")
      ) {
        return null;
      }
      return {
        round: typed.round,
        request: typeof typed.request === "string" ? typed.request : "",
        emphasis: typed.emphasis,
        expressiveness: Math.max(0, Math.min(100, Math.round(typed.expressiveness))),
        temperature: Math.max(0, Math.min(100, Math.round(typed.temperature))),
        regenerateLockup: typeof typed.regenerateLockup === "boolean" ? typed.regenerateLockup : undefined,
        explicitNewTitleStyle: typeof typed.explicitNewTitleStyle === "boolean" ? typed.explicitNewTitleStyle : undefined,
        regenerateBackground: typeof typed.regenerateBackground === "boolean" ? typed.regenerateBackground : undefined,
        mode: typed.mode,
        variantMutations: normalizeRefinementVariantMutations(typed.variantMutations)
      } satisfies RefinementFeedbackDelta;
    })
    .filter((item): item is RefinementFeedbackDelta => item !== null);
}

function normalizeRefinementLockedStyleInvariants(value: unknown): RefinementLockedStyleInvariants | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const typed = value as {
    toneLane?: unknown;
    styleFamily?: unknown;
    templateFamily?: unknown;
    referenceAnchorIds?: unknown;
    motifPrimitives?: unknown;
  };
  const toneLane = isStyleToneKey(typed.toneLane) ? typed.toneLane : null;
  const styleFamily = isStyleFamilyKey(typed.styleFamily) ? typed.styleFamily : null;
  const templateFamily =
    typeof typed.templateFamily === "string" && typed.templateFamily.trim() ? typed.templateFamily.trim().toLowerCase() : null;
  const referenceAnchorIds = normalizeRefinementReferenceIds(typed.referenceAnchorIds);
  const motifPrimitives = safeArrayOfStrings(typed.motifPrimitives, []).slice(0, 2);
  return {
    toneLane,
    styleFamily,
    templateFamily,
    referenceAnchorIds,
    motifPrimitives
  };
}

function hashRefinementAnchorFingerprint(lockedStyleInvariants: RefinementLockedStyleInvariants): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        toneLane: lockedStyleInvariants.toneLane || null,
        styleFamily: lockedStyleInvariants.styleFamily || null,
        templateFamily: lockedStyleInvariants.templateFamily || null,
        referenceAnchorIds: lockedStyleInvariants.referenceAnchorIds,
        motifPrimitives: lockedStyleInvariants.motifPrimitives
      })
    )
    .digest("hex");
}

function summarizeLockedStyleInvariants(lockedStyleInvariants: RefinementLockedStyleInvariants): string {
  return [
    `tone=${lockedStyleInvariants.toneLane || "auto"}`,
    `family=${lockedStyleInvariants.styleFamily || "auto"}`,
    `template=${lockedStyleInvariants.templateFamily || "auto"}`,
    `refs=${
      lockedStyleInvariants.referenceAnchorIds.length > 0 ? lockedStyleInvariants.referenceAnchorIds.join("+") : "none"
    }`,
    `motifs=${lockedStyleInvariants.motifPrimitives.length > 0 ? lockedStyleInvariants.motifPrimitives.join("+") : "none"}`
  ].join(" | ");
}

function readRefinementLineageFromInput(input: unknown): RefinementLineageState | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const refinement = (input as { refinement?: unknown }).refinement;
  if (!refinement || typeof refinement !== "object" || Array.isArray(refinement)) {
    return null;
  }
  const typed = refinement as {
    refinementChainId?: unknown;
    anchorDirectionFingerprint?: unknown;
    lockedStyleInvariants?: unknown;
    appliedFeedbackDeltas?: unknown;
    seenVariantFingerprints?: unknown;
  };
  const refinementChainId =
    typeof typed.refinementChainId === "string" && typed.refinementChainId.trim() ? typed.refinementChainId.trim() : null;
  const anchorDirectionFingerprint =
    typeof typed.anchorDirectionFingerprint === "string" && typed.anchorDirectionFingerprint.trim()
      ? typed.anchorDirectionFingerprint.trim()
      : null;
  const lockedStyleInvariants = normalizeRefinementLockedStyleInvariants(typed.lockedStyleInvariants);
  if (!refinementChainId || !anchorDirectionFingerprint || !lockedStyleInvariants) {
    return null;
  }
  const seenVariantFingerprints = normalizeRefinementReferenceIds(typed.seenVariantFingerprints);
  return {
    refinementChainId,
    anchorDirectionFingerprint,
    lockedStyleInvariants,
    appliedFeedbackDeltas: normalizeRefinementFeedbackDeltas(typed.appliedFeedbackDeltas),
    seenVariantFingerprints
  };
}

function readRefinementLineageFromGenerationOutput(output: unknown): RefinementLineageState | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }
  const meta = (output as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return null;
  }
  const debug = (meta as { debug?: unknown }).debug;
  const debugRefinement =
    debug && typeof debug === "object" && !Array.isArray(debug)
      ? ((debug as { refinement?: unknown }).refinement as unknown)
      : null;
  const designSpec = (meta as { designSpec?: unknown }).designSpec;
  const designSpecRefinement =
    designSpec && typeof designSpec === "object" && !Array.isArray(designSpec)
      ? ((designSpec as { refinement?: unknown }).refinement as unknown)
      : null;
  const candidate = designSpecRefinement || debugRefinement;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  const typed = candidate as {
    refinementChainId?: unknown;
    anchorDirectionFingerprint?: unknown;
    lockedStyleInvariants?: unknown;
    appliedFeedbackDeltas?: unknown;
    seenVariantFingerprints?: unknown;
  };
  const refinementChainId =
    typeof typed.refinementChainId === "string" && typed.refinementChainId.trim() ? typed.refinementChainId.trim() : null;
  const anchorDirectionFingerprint =
    typeof typed.anchorDirectionFingerprint === "string" && typed.anchorDirectionFingerprint.trim()
      ? typed.anchorDirectionFingerprint.trim()
      : null;
  const lockedStyleInvariants = normalizeRefinementLockedStyleInvariants(typed.lockedStyleInvariants);
  if (!refinementChainId || !anchorDirectionFingerprint || !lockedStyleInvariants) {
    return null;
  }
  return {
    refinementChainId,
    anchorDirectionFingerprint,
    lockedStyleInvariants,
    appliedFeedbackDeltas: normalizeRefinementFeedbackDeltas(typed.appliedFeedbackDeltas),
    seenVariantFingerprints: normalizeRefinementReferenceIds(typed.seenVariantFingerprints)
  };
}

function readReferenceAnchorIdsFromGenerationOutput(output: unknown): string[] {
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
  const directReferenceIds = normalizeRefinementReferenceIds((designSpec as { referenceIds?: unknown }).referenceIds);
  const directReferenceId =
    typeof (designSpec as { referenceId?: unknown }).referenceId === "string"
      ? (designSpec as { referenceId?: string }).referenceId
      : null;
  return normalizeRefinementReferenceIds([...directReferenceIds, ...(directReferenceId ? [directReferenceId] : [])]);
}

function resolveTemplateFamilyForVariationKey(variationTemplateKey?: string | null): string | null {
  const key = typeof variationTemplateKey === "string" ? variationTemplateKey.trim() : "";
  if (!key) {
    return null;
  }
  const variationTemplate = getRound1VariationTemplateByKey(key);
  if (variationTemplate?.cluster && variationTemplate.cluster !== "other") {
    return `cluster:${variationTemplate.cluster}`;
  }
  const normalized = key.toLowerCase();
  const parts = normalized.split("_").filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]}_${parts[1]}`;
  }
  return normalized || null;
}

function buildLockedStyleInvariants(params: {
  directionSpec: PlannedDirectionSpec;
  referenceAnchorIds?: string[];
}): RefinementLockedStyleInvariants {
  const styleFields = resolveDirectionStyleFields(params.directionSpec);
  const referenceAnchorIds = normalizeRefinementReferenceIds([
    ...(params.referenceAnchorIds || []),
    ...(params.directionSpec.referenceId ? [params.directionSpec.referenceId] : [])
  ]);
  return {
    toneLane: styleFields.styleTone,
    styleFamily: styleFields.styleFamily,
    templateFamily: resolveTemplateFamilyForVariationKey(params.directionSpec.variationTemplateKey),
    referenceAnchorIds,
    motifPrimitives: safeArrayOfStrings(params.directionSpec.motifFocus, []).slice(0, 2)
  };
}

function normalizeRefinementVariantMutationAxis(value: unknown): RefinementMutationAxis | null {
  return value === "composition" || value === "motif_emphasis" || value === "typography_energy" ? value : null;
}

function buildRefinementDebugPayload(params: {
  input: unknown;
  directionSpec?: PlannedDirectionSpec | null;
}): NonNullable<NonNullable<GenerationOutputPayload["meta"]["debug"]>["refinement"]> | null {
  const lineage = readRefinementLineageFromInput(params.input);
  if (!lineage) {
    return null;
  }
  const variantMutationAxis = normalizeRefinementVariantMutationAxis(params.directionSpec?.refinementMutationAxis);
  const variantFingerprint =
    typeof params.directionSpec?.refinementVariantFingerprint === "string" && params.directionSpec.refinementVariantFingerprint.trim()
      ? params.directionSpec.refinementVariantFingerprint.trim()
      : null;
  return {
    refinementChainId: lineage.refinementChainId,
    anchorDirectionFingerprint: lineage.anchorDirectionFingerprint,
    lockedInvariantsSummary: summarizeLockedStyleInvariants(lineage.lockedStyleInvariants),
    lockedStyleInvariants: lineage.lockedStyleInvariants,
    variantMutationAxis,
    variantFingerprint
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
  backgroundAccepted: boolean;
  lockupAccepted: boolean;
  backgroundValidation: ProductionBackgroundValidationEvidence | null;
  lockupValidation: ProductionLockupValidationEvidence | null;
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
      status: true,
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

  const sourceValidation = resolveProductionValidOption({
    output: generation.output,
    dbStatus: generation.status,
    assets: generation.assets
  });

  const backgroundPath =
    pickAssetPathBySlots(generation.assets, ["wide_bg", "widescreen_bg", "square_bg", "tall_bg", "vertical_bg"], [
      "BACKGROUND"
    ]) || null;
  const lockupPath = pickAssetPathBySlots(generation.assets, [LOCKUP_ASSET_SLOT], ["LOCKUP"]) || null;
  let [masterBackgroundPng, lockupPng] = await Promise.all([
    backgroundPath ? readAssetBufferFromPublicPath(backgroundPath) : Promise.resolve(null),
    lockupPath ? readAssetBufferFromPublicPath(lockupPath) : Promise.resolve(null)
  ]);
  if (!masterBackgroundPng || !lockupPng) {
    const reusableDesignDoc = parseReusableMasterDesignDoc(generation.output);
    if (reusableDesignDoc) {
      const [derivedBackgroundPng, derivedLockupPng] = await Promise.all([
        masterBackgroundPng
          ? Promise.resolve(null)
          : renderBackgroundOnlyPreviewPng(reusableDesignDoc, {
              renderDebugGuides: false
            }),
        lockupPng
          ? Promise.resolve(null)
          : (async () => {
              const lockupSvg = await buildFinalSvg(reusableDesignDoc, {
                includeBackground: false,
                includeImages: false
              });
              const lockupResult = await renderTrimmedLockupPngFromSvg(lockupSvg);
              return lockupResult.png;
            })()
      ]);
      masterBackgroundPng = masterBackgroundPng || derivedBackgroundPng;
      lockupPng = lockupPng || derivedLockupPng;
    }
  }

  return {
    sourceGenerationId: generation.id,
    masterBackgroundPng,
    lockupPng,
    styleFamily: readStyleFamilyFromGenerationOutput(generation.output),
    styleBucket: readStyleBucketFromGenerationOutput(generation.output),
    styleTone: readStyleToneFromGenerationOutput(generation.output),
    styleMedium: readStyleMediumFromGenerationOutput(generation.output),
    backgroundAccepted: sourceValidation.background.valid,
    lockupAccepted: sourceValidation.lockup.valid,
    backgroundValidation: {
      source: sourceValidation.background.source,
      sourceGenerationId: generation.id,
      textFree: sourceValidation.background.textFree,
      scaffoldFree: sourceValidation.background.scaffoldFree,
      motifPresent: sourceValidation.background.motifPresent,
      toneFit: sourceValidation.background.toneFit,
      referenceFit: sourceValidation.background.referenceFit
    },
    lockupValidation: {
      source: sourceValidation.lockup.source,
      sourceGenerationId: generation.id,
      textIntegrity: sourceValidation.lockup.textIntegrity,
      fitPass: sourceValidation.lockup.fitPass,
      insideTitleSafeWithMargin: sourceValidation.lockup.insideTitleSafeWithMargin,
      notTooSmall: sourceValidation.lockup.notTooSmall
    }
  };
}

function parseReusableMasterDesignDoc(output: unknown): DesignDoc | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }

  const shapeDocs = (output as { designDocByShape?: unknown }).designDocByShape;
  if (shapeDocs && typeof shapeDocs === "object" && !Array.isArray(shapeDocs)) {
    const docsByShape = shapeDocs as Record<string, unknown>;
    const wideDoc = normalizeDesignDoc(docsByShape.wide) || normalizeDesignDoc(docsByShape.widescreen);
    if (wideDoc) {
      return adaptDesignDocToDimensions(wideDoc, PREVIEW_DIMENSIONS.wide.width, PREVIEW_DIMENSIONS.wide.height);
    }
    const squareDoc = normalizeDesignDoc(docsByShape.square);
    if (squareDoc) {
      return adaptDesignDocToDimensions(squareDoc, PREVIEW_DIMENSIONS.wide.width, PREVIEW_DIMENSIONS.wide.height);
    }
    const tallDoc = normalizeDesignDoc(docsByShape.tall) || normalizeDesignDoc(docsByShape.vertical);
    if (tallDoc) {
      return adaptDesignDocToDimensions(tallDoc, PREVIEW_DIMENSIONS.wide.width, PREVIEW_DIMENSIONS.wide.height);
    }
  }

  const nestedDesignDoc = normalizeDesignDoc((output as { designDoc?: unknown }).designDoc);
  if (nestedDesignDoc) {
    return adaptDesignDocToDimensions(
      nestedDesignDoc,
      PREVIEW_DIMENSIONS.wide.width,
      PREVIEW_DIMENSIONS.wide.height
    );
  }

  const directDesignDoc = normalizeDesignDoc(output);
  if (directDesignDoc) {
    return adaptDesignDocToDimensions(
      directDesignDoc,
      PREVIEW_DIMENSIONS.wide.width,
      PREVIEW_DIMENSIONS.wide.height
    );
  }

  return null;
}

function readSelectedBackgroundChecks(
  attempts: BackgroundAttemptDebug[]
): Pick<ProductionBackgroundValidationEvidence, "textFree" | "scaffoldFree" | "motifPresent" | "toneFit" | "referenceFit"> {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index];
    if (typeof attempt.winnerIndex !== "number" || !attempt.candidates[attempt.winnerIndex]) {
      continue;
    }
    const winner = attempt.candidates[attempt.winnerIndex];
    return {
      textFree: winner.checks.textOk,
      scaffoldFree: winner.checks.scaffoldOk,
      motifPresent: winner.checks.motifOk,
      toneFit: winner.checks.toneOk,
      referenceFit: winner.checks.referenceOk ?? null
    };
  }

  return {
    textFree: null,
    scaffoldFree: null,
    motifPresent: null,
    toneFit: null,
    referenceFit: null
  };
}

function buildBackgroundAttemptFailureReason(invalidReasons: string[]): BackgroundAttemptFailureReason {
  if (invalidReasons.includes("background_text_detected")) {
    return "ALL_TEXT";
  }
  if (
    invalidReasons.includes("background_scaffold_like") ||
    invalidReasons.includes("background_blank_or_motif_weak")
  ) {
    return "ALL_SCAFFOLD";
  }
  if (invalidReasons.includes("background_tone_fit_failed")) {
    return "ALL_TONE_FAIL";
  }
  return "UNKNOWN";
}

const BACKGROUND_RECOVERY_INVALID_REASON_PRIORITY = [
  "background_text_detected",
  "background_scaffold_like",
  "background_blank_or_motif_weak",
  "background_tone_fit_failed",
  "background_not_canonical"
] as const;

function normalizeBackgroundRecoveryReasons(reasons: string[]): string[] {
  const priority = new Map<string, number>(
    BACKGROUND_RECOVERY_INVALID_REASON_PRIORITY.map((reason, index) => [reason, index] as const)
  );
  return [...new Set(reasons.filter((reason) => typeof reason === "string" && reason.trim().length > 0))]
    .sort((left, right) => {
      const leftPriority = priority.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightPriority = priority.get(right) ?? Number.MAX_SAFE_INTEGER;
      return leftPriority - rightPriority || left.localeCompare(right);
    });
}

function collectRecoverableBackgroundInvalidReasons(invalidReasons: string[]): string[] {
  return normalizeBackgroundRecoveryReasons(
    invalidReasons.filter((reason) =>
      BACKGROUND_RECOVERY_INVALID_REASON_PRIORITY.includes(
        reason as (typeof BACKGROUND_RECOVERY_INVALID_REASON_PRIORITY)[number]
      )
    )
  );
}

function createBackgroundRecoveryDebug(params?: Partial<BackgroundRecoveryDebug>): BackgroundRecoveryDebug {
  return {
    attempted: params?.attempted === true,
    attempts: typeof params?.attempts === "number" && Number.isFinite(params.attempts) ? params.attempts : 0,
    reasons: normalizeBackgroundRecoveryReasons(params?.reasons || []),
    succeeded: params?.succeeded === true,
    finalReasons: normalizeBackgroundRecoveryReasons(params?.finalReasons || [])
  };
}

function buildBackgroundRecoveryBoost(params: {
  invalidReasons: string[];
  toneTarget: "light" | "vivid" | "dark" | "mono" | null;
}): string | undefined {
  const recoverableReasons = collectRecoverableBackgroundInvalidReasons(params.invalidReasons);
  if (recoverableReasons.length <= 0) {
    return undefined;
  }

  const instructions = [BACKGROUND_RECOVERY_SAME_DIRECTION_BOOST, BACKGROUND_RECOVERY_CANONICAL_BOOST];
  if (recoverableReasons.includes("background_text_detected")) {
    instructions.push(BACKGROUND_ELIGIBILITY_RETRY_BOOST);
  }
  if (recoverableReasons.includes("background_scaffold_like")) {
    instructions.push(BACKGROUND_RECOVERY_SCAFFOLD_BOOST);
  }
  if (recoverableReasons.includes("background_blank_or_motif_weak")) {
    instructions.push(BACKGROUND_RECOVERY_MOTIF_BOOST);
  }
  if (recoverableReasons.includes("background_tone_fit_failed")) {
    instructions.push(
      params.toneTarget ? `${BACKGROUND_RECOVERY_TONE_BOOST_PREFIX} Target tone: ${params.toneTarget}.` : BACKGROUND_RECOVERY_TONE_BOOST_PREFIX
    );
  }
  if (recoverableReasons.includes("background_not_canonical")) {
    instructions.push(BACKGROUND_RECOVERY_CANONICAL_BOOST);
  }

  return instructions.join(" ");
}

async function evaluateBackgroundAttempt(params: {
  attempt: {
    backgroundPng: Buffer;
    textCheckPassed: boolean;
    toneCheck: ToneCheckSummary | null;
  };
  titleSafeBox: TitleSafeBox;
  toneTarget: "light" | "vivid" | "dark" | "mono" | null;
  referenceCluster?: ReferenceCluster | null;
  source: DebugAssetSource;
  sourceGenerationId: string | null;
}): Promise<BackgroundAttemptEvaluation> {
  const toneStats =
    params.attempt.toneCheck?.statsAfter || (await computeImageToneStatsFromBuffer(params.attempt.backgroundPng));
  const tonePass = params.toneTarget
    ? toneStats
      ? evaluateToneCompliance(params.toneTarget, toneStats).passed
      : false
    : true;
  const textArtifactDetected = await detectTextArtifactsHeuristic(params.attempt.backgroundPng);
  const textFree = params.attempt.textCheckPassed && !textArtifactDetected;
  const designPresencePass = passesDesignPresence(toneStats);
  const hardFail = await computeBackgroundHardFailStatsFromBuffer(
    params.attempt.backgroundPng,
    params.titleSafeBox,
    params.referenceCluster || null
  );
  const meaningfulStructurePass = hardFail?.meaningfulStructurePass === true;
  const focalMotifPresent = hardFail?.focalMotifPresent === true;
  const frameScaffoldTriggered =
    hardFail?.mostEdgesAreLongStraightBorders === true && hardFail?.nonTitleLowDetail === true;
  const hardFailScaffold = frameScaffoldTriggered;
  const hardFailBlankDesign = !hardFail || !hardFail.passes;
  const scaffoldOk = designPresencePass && meaningfulStructurePass && !hardFailScaffold && !hardFailBlankDesign;
  const evidence: ProductionBackgroundValidationEvidence = {
    source: params.source,
    sourceGenerationId: params.sourceGenerationId,
    textFree,
    scaffoldFree: scaffoldOk,
    motifPresent: focalMotifPresent,
    toneFit: params.toneTarget ? tonePass : null,
    referenceFit: null
  };
  const acceptance = evaluateBackgroundAcceptance({ evidence });

  return {
    evidence,
    acceptance,
    textArtifactDetected,
    checks: {
      textFree,
      tonePass,
      designPresencePass,
      meaningfulStructurePass,
      focalMotifPresent,
      frameScaffoldTriggered,
      hardFailScaffold,
      hardFailBlankDesign
    },
    stats: {
      tone: toneStats,
      titleSafe: await scoreTitleSafeRegion(
        pngBufferToDataUrl(params.attempt.backgroundPng),
        params.titleSafeBox
      ),
      midtoneRange: await scoreMidtoneRangeFromBuffer(params.attempt.backgroundPng),
      hardFail
    }
  };
}

function buildProductionBackgroundValidationEvidence(params: {
  source: DebugAssetSource;
  sourceGenerationId: string | null;
  reusableValidation: ProductionBackgroundValidationEvidence | null;
  backgroundAttempts: BackgroundAttemptDebug[];
  toneCheck: ToneCheckSummary | null;
  backgroundTextCheck: BackgroundTextCheckSummary | null;
}): ProductionBackgroundValidationEvidence {
  if (params.source === "reused" && params.reusableValidation) {
    return {
      ...params.reusableValidation,
      source: "reused",
      sourceGenerationId: params.sourceGenerationId
    };
  }

  const selectedChecks = readSelectedBackgroundChecks(params.backgroundAttempts);
  return {
    source: params.source,
    sourceGenerationId: params.sourceGenerationId,
    textFree:
      selectedChecks.textFree ??
      (params.backgroundTextCheck ? params.backgroundTextCheck.detected === false : null),
    scaffoldFree: selectedChecks.scaffoldFree,
    motifPresent: selectedChecks.motifPresent,
    toneFit: selectedChecks.toneFit ?? params.toneCheck?.passed ?? null,
    referenceFit: selectedChecks.referenceFit
  };
}

async function persistBackgroundEvaluationIfAvailable(params: {
  attempt: {
    aiTrace?: GraphicsBackgroundAiAttemptTrace | null;
  };
  evaluation: BackgroundAttemptEvaluation;
  generationId: string;
  optionIndex: number;
  stage: string;
  attemptNumber: number;
  directionSpec: PlannedDirectionSpec | null;
  assertActive?: () => Promise<void> | void;
}): Promise<void> {
  const aiTrace = params.attempt.aiTrace;
  if (!aiTrace) {
    return;
  }

  try {
    await params.assertActive?.();
    await persistGraphicsBackgroundEvalResults({
      runId: aiTrace.runId,
      attemptId: aiTrace.attemptId,
      assertActive: params.assertActive,
      subject: {
        evidence: params.evaluation.evidence,
        invalidReasons: params.evaluation.acceptance.invalidReasons,
        textArtifactDetected: params.evaluation.textArtifactDetected,
        checks: params.evaluation.checks,
        stats: {
          titleSafeScore: params.evaluation.stats.titleSafe?.score || null,
          midtoneRangeScore: params.evaluation.stats.midtoneRange?.score || null,
          meaningfulStructureScore: params.evaluation.stats.hardFail?.meaningfulStructureScore || null
        },
        metadata: {
          generationId: params.generationId,
          optionIndex: params.optionIndex,
          stage: params.stage,
          attemptNumber: params.attemptNumber,
          styleFamily: resolveDirectionStyleFields(params.directionSpec).styleFamily,
          providerKey: aiTrace.providerKey,
          modelKey: aiTrace.modelKey
        }
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown background eval persistence error";
    console.warn(`[ai-harness-evals] generation=${params.generationId} stage=${params.stage} attempt=${params.attemptNumber} error=${message}`);
  }
}

function buildProductionLockupValidationEvidence(params: {
  source: DebugAssetSource;
  sourceGenerationId: string | null;
  reusableValidation: ProductionLockupValidationEvidence | null;
  textValidation: LockupSvgTextValidation | null;
  fit: LockupFitCheck;
}): ProductionLockupValidationEvidence {
  const textIntegrity = params.textValidation
    ? params.textValidation.valid &&
      params.textValidation.unexpected.length === 0 &&
      params.textValidation.missing.length === 0
    : params.reusableValidation?.textIntegrity ?? null;

  return {
    source: params.source,
    sourceGenerationId: params.sourceGenerationId,
    textIntegrity,
    fitPass: params.fit.fitPass,
    insideTitleSafeWithMargin: params.fit.insideTitleSafeWithMargin,
    notTooSmall: params.fit.notTooSmall
  };
}

function buildLockupAcceptanceResult(params: {
  source: DebugAssetSource;
  sourceGenerationId: string | null;
  reusableValidation: ProductionLockupValidationEvidence | null;
  textValidation: LockupSvgTextValidation | null;
  fit: LockupFitCheck;
}): {
  evidence: ProductionLockupValidationEvidence;
  acceptance: LockupAcceptanceResult;
} {
  const evidence = buildProductionLockupValidationEvidence(params);
  return {
    evidence,
    acceptance: evaluateLockupAcceptance({
      evidence
    })
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

function resolveGenerationOptionStatus(params: {
  output: unknown;
  dbStatus?: string | null;
  assets?: GenerationAssetRecord[];
}): GenerationOptionStatus {
  return resolveProductionValidOptionStatus({
    output: params.output,
    dbStatus: params.dbStatus,
    assets: params.assets
  });
}

function isCompletedGenerationOption(params: {
  output: unknown;
  dbStatus?: string | null;
  assets?: GenerationAssetRecord[];
}): boolean {
  return isProductionValidOption({
    output: params.output,
    dbStatus: params.dbStatus,
    assets: params.assets
  });
}

function withOutputStatus(output: GenerationOutputPayload, status: GenerationOptionStatus): GenerationOutputPayload {
  return {
    ...output,
    status
  };
}

function withGenerationExecutionStateOutput(
  output: GenerationOutputPayload,
  execution: PersistedGenerationExecutionState
): GenerationOutputPayload {
  return {
    ...output,
    meta: {
      ...output.meta,
      execution
    }
  };
}

function withClaimedGenerationActiveOutput(
  output: GenerationOutputPayload,
  attemptOwner: Pick<GenerationAttemptOwner, "token" | "attemptNumber">
): GenerationOutputPayload {
  return withGenerationExecutionStateOutput(
    {
      ...output,
      meta: {
        ...output.meta,
        ...(mergeGenerationDebugMeta(output.meta.debug, {
          generationLifecycleState: "GENERATION_IN_PROGRESS"
        })
          ? {
              debug: mergeGenerationDebugMeta(output.meta.debug, {
                generationLifecycleState: "GENERATION_IN_PROGRESS"
              })
            }
          : {})
      }
    },
    {
      version: 1,
      phase: "RUNNING",
      activeAttemptToken: attemptOwner.token,
      activeAttemptNumber: attemptOwner.attemptNumber
    }
  );
}

function resolveNextGenerationAttemptNumber(output: unknown): number {
  const execution = readPersistedGenerationExecutionState(output);
  const previousAttemptNumber =
    typeof execution?.activeAttemptNumber === "number" && Number.isFinite(execution.activeAttemptNumber)
      ? execution.activeAttemptNumber
      : 0;
  return previousAttemptNumber + 1;
}

function mapAiErrorClassToProviderFailureReason(errorClass: ReturnType<typeof readAiErrorClass>): ProviderFailureReason | null {
  if (errorClass === "MODEL_UNAVAILABLE") {
    return "PROVIDER_MODEL_UNAVAILABLE";
  }
  if (errorClass === "QUOTA_EXCEEDED") {
    return "PROVIDER_QUOTA_OR_RATE_LIMIT";
  }
  if (errorClass === "MISCONFIGURED_PROVIDER") {
    return "PROVIDER_AUTH_OR_CONFIG_ERROR";
  }
  if (
    errorClass === "TRANSIENT_PROVIDER_FAILURE" ||
    errorClass === "TIMEOUT" ||
    errorClass === "INVALID_RESPONSE" ||
    errorClass === "UNKNOWN_PROVIDER_ERROR"
  ) {
    return "PROVIDER_TRANSIENT_ERROR";
  }

  return null;
}

function readProviderFailureReasonFromError(error: unknown): ProviderFailureReason | null {
  const aiFailureReason = mapAiErrorClassToProviderFailureReason(readAiErrorClass(error));
  if (aiFailureReason) {
    return aiFailureReason;
  }

  if (!error || typeof error !== "object" || !("failureReason" in error)) {
    return null;
  }

  const failureReason = (error as { failureReason?: unknown }).failureReason;
  return isProviderFailureReason(failureReason) ? failureReason : null;
}

function resolveGenerationLifecycleStateForFailure(reason: BackgroundAttemptFailureReason | null | undefined): GenerationLifecycleState {
  return isProviderFailureReason(reason) || reason === "CLAIM_TIMEOUT"
    ? "GENERATION_FAILED_PROVIDER"
    : "GENERATION_FAILED_CREATIVE";
}

function resolveBackgroundAttemptFailureReason(error: unknown, imageCallCapReached = false): BackgroundAttemptFailureReason {
  if (imageCallCapReached) {
    return "BUDGET";
  }

  if (isClaimedGenerationExecutionTimeoutError(error)) {
    return "CLAIM_TIMEOUT";
  }

  return readProviderFailureReasonFromError(error) || (isOpenAiRateLimitError(error) ? "PROVIDER_QUOTA_OR_RATE_LIMIT" : "UNKNOWN");
}

function buildBackgroundAiTraceMetadata(
  prefix: "selected" | "last",
  aiTrace: GraphicsBackgroundAiAttemptTrace | null | undefined
): Record<string, string | null> {
  if (!aiTrace) {
    return {};
  }

  if (prefix === "selected") {
    return {
      selectedAttemptId: aiTrace.attemptId,
      selectedProviderKey: aiTrace.providerKey,
      selectedModelKey: aiTrace.modelKey,
      selectedProviderModel: aiTrace.providerModel,
      selectedProviderConfigVersion: aiTrace.providerConfigVersion,
      selectedOperationKey: aiTrace.operationKey,
      selectedProviderRequestId: aiTrace.providerRequestId
    };
  }

  return {
    lastAttemptId: aiTrace.attemptId,
    lastProviderKey: aiTrace.providerKey,
    lastModelKey: aiTrace.modelKey,
    lastProviderModel: aiTrace.providerModel,
    lastProviderConfigVersion: aiTrace.providerConfigVersion,
    lastOperationKey: aiTrace.operationKey,
    lastProviderRequestId: aiTrace.providerRequestId
  };
}

function buildImageProviderDebugMeta(preflight?: ImageProviderPreflightResult | null): NonNullable<GenerationOutputPayload["meta"]["debug"]>["imageProvider"] {
  const config = resolveImageProviderConfig();

  return {
    provider: config.provider,
    model: config.model,
    providerPath: config.providerPath,
    usingDefaultModel: config.usingDefaultModel,
    ...(preflight
      ? {
          preflightCheckedAt: preflight.checkedAt,
          preflightOk: preflight.ok,
          preflightFailureReason: preflight.failureReason
        }
      : {})
  };
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
      status: true,
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
    if (!isCompletedGenerationOption({ output: generation.output, dbStatus: generation.status })) {
      continue;
    }
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
        status: true,
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
        status: true,
        output: true
      }
    })
  ]);

  const ordered = [...projectGenerations, ...organizationGenerations];
  const seen = new Set<StyleFamilyKey>();
  const recent: StyleFamilyKey[] = [];

  for (const generation of ordered) {
    if (!isCompletedGenerationOption({ output: generation.output, dbStatus: generation.status })) {
      continue;
    }
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
        status: true,
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
        status: true,
        output: true
      }
    })
  ]);

  const projectCompleted = projectGenerations.filter((generation) =>
    isCompletedGenerationOption({ output: generation.output, dbStatus: generation.status })
  );
  const organizationCompleted = organizationGenerations.filter((generation) =>
    isCompletedGenerationOption({ output: generation.output, dbStatus: generation.status })
  );
  const projectRecent = deriveRecentReferenceIds(projectCompleted, { limit: projectLimit });
  const globalRecent = deriveRecentReferenceIds([...projectCompleted, ...organizationCompleted], { limit: globalLimit });

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
        status: true,
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
        status: true,
        output: true
      }
    })
  ]);

  const ordered = [...projectGenerations, ...organizationGenerations];
  const seen = new Set<string>();
  const recent: string[] = [];
  for (const generation of ordered) {
    if (!isCompletedGenerationOption({ output: generation.output, dbStatus: generation.status })) {
      continue;
    }
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
      status: true,
      output: true
    }
  });

  const seen = new Set<string>();
  const recent: string[] = [];
  for (const generation of recentGenerations) {
    if (!isCompletedGenerationOption({ output: generation.output, dbStatus: generation.status })) {
      continue;
    }
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

  console.warn(`[text-artifact-heuristic] components=${textLikeComponents} threshold=8 detected=${textLikeComponents >= 8}`);
  return textLikeComponents >= 8;
}

type TextScrubPixelBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type TextScrubGlyph = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  area: number;
};

type TextScrubGlyphCluster = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  count: number;
  totalHeight: number;
  totalArea: number;
};

function gap1d(aMin: number, aMax: number, bMin: number, bMax: number): number {
  if (aMax < bMin) {
    return bMin - aMax;
  }
  if (bMax < aMin) {
    return aMin - bMax;
  }
  return 0;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.round(clampNumber(value, min, max));
}

function mergeTextScrubPixelBoxes(boxes: TextScrubPixelBox[]): TextScrubPixelBox[] {
  if (boxes.length <= 1) {
    return boxes;
  }

  const merged = [...boxes];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < merged.length; i += 1) {
      for (let j = i + 1; j < merged.length; j += 1) {
        const a = merged[i];
        const b = merged[j];
        const aRight = a.left + a.width;
        const aBottom = a.top + a.height;
        const bRight = b.left + b.width;
        const bBottom = b.top + b.height;
        const xGap = gap1d(a.left, aRight, b.left, bRight);
        const yGap = gap1d(a.top, aBottom, b.top, bBottom);
        const maxXGap = Math.max(8, Math.round(Math.min(a.width, b.width) * 0.28));
        const maxYGap = Math.max(6, Math.round(Math.min(a.height, b.height) * 0.9));
        if (xGap > maxXGap || yGap > maxYGap) {
          continue;
        }

        merged[i] = {
          left: Math.min(a.left, b.left),
          top: Math.min(a.top, b.top),
          width: Math.max(aRight, bRight) - Math.min(a.left, b.left),
          height: Math.max(aBottom, bBottom) - Math.min(a.top, b.top)
        };
        merged.splice(j, 1);
        changed = true;
        break;
      }
      if (changed) {
        break;
      }
    }
  }

  return merged;
}

function detectTextScrubBoxesFromRaw(params: {
  pixels: Buffer;
  width: number;
  height: number;
}): TextScrubPixelBox[] {
  const { pixels, width, height } = params;
  if (width < 48 || height < 48) {
    return [];
  }

  const totalPixels = width * height;
  const edgeMask = new Uint8Array(totalPixels);
  let edgeCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const gx = Math.abs(pixels[idx + 1] - pixels[idx - 1]);
      const gy = Math.abs(pixels[idx + width] - pixels[idx - width]);
      const magnitude = gx + gy;
      if (magnitude > TEXT_SCRUB_EDGE_THRESHOLD) {
        edgeMask[idx] = 1;
        edgeCount += 1;
      }
    }
  }

  const edgeRatio = edgeCount / totalPixels;
  if (edgeRatio < 0.006 || edgeRatio > 0.4) {
    return [];
  }

  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  const glyphs: TextScrubGlyph[] = [];

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
          if (neighbor <= 0 || neighbor >= totalPixels - 1) {
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
      const aspect = boxWidth / boxHeight;
      const isLikelyGlyph =
        area >= 7 &&
        area <= 460 &&
        boxWidth <= 44 &&
        boxHeight <= 30 &&
        boxArea <= 920 &&
        aspect >= 0.12 &&
        aspect <= 10 &&
        density >= 0.07 &&
        density <= 0.84;

      if (!isLikelyGlyph) {
        continue;
      }

      glyphs.push({
        minX,
        maxX,
        minY,
        maxY,
        width: boxWidth,
        height: boxHeight,
        area
      });
    }
  }

  if (glyphs.length < 4) {
    return [];
  }

  glyphs.sort((a, b) => (a.minY - b.minY) || (a.minX - b.minX));
  const clusters: TextScrubGlyphCluster[] = [];
  for (const glyph of glyphs) {
    let bestClusterIndex = -1;
    let bestDistanceScore = Number.POSITIVE_INFINITY;

    for (let index = 0; index < clusters.length; index += 1) {
      const cluster = clusters[index];
      const avgHeight = cluster.totalHeight / Math.max(1, cluster.count);
      const xGap = gap1d(glyph.minX, glyph.maxX, cluster.minX, cluster.maxX);
      const yGap = gap1d(glyph.minY, glyph.maxY, cluster.minY, cluster.maxY);
      const xTolerance = Math.max(12, Math.round(avgHeight * 3.2));
      const yTolerance = Math.max(8, Math.round(avgHeight * 1.25));
      if (xGap > xTolerance || yGap > yTolerance) {
        continue;
      }
      const distanceScore = xGap + yGap * 2;
      if (distanceScore < bestDistanceScore) {
        bestDistanceScore = distanceScore;
        bestClusterIndex = index;
      }
    }

    if (bestClusterIndex === -1) {
      clusters.push({
        minX: glyph.minX,
        maxX: glyph.maxX,
        minY: glyph.minY,
        maxY: glyph.maxY,
        count: 1,
        totalHeight: glyph.height,
        totalArea: glyph.area
      });
      continue;
    }

    const cluster = clusters[bestClusterIndex];
    cluster.minX = Math.min(cluster.minX, glyph.minX);
    cluster.maxX = Math.max(cluster.maxX, glyph.maxX);
    cluster.minY = Math.min(cluster.minY, glyph.minY);
    cluster.maxY = Math.max(cluster.maxY, glyph.maxY);
    cluster.count += 1;
    cluster.totalHeight += glyph.height;
    cluster.totalArea += glyph.area;
  }

  const boxes: TextScrubPixelBox[] = [];
  for (const cluster of clusters) {
    const boxWidth = cluster.maxX - cluster.minX + 1;
    const boxHeight = cluster.maxY - cluster.minY + 1;
    const boxArea = boxWidth * boxHeight;
    const aspect = boxWidth / Math.max(1, boxHeight);
    if (cluster.count < 3 || boxWidth < 14 || boxHeight < 6) {
      continue;
    }
    if (boxArea > totalPixels * 0.45 || aspect < 0.45 || aspect > 24) {
      continue;
    }

    const avgHeight = cluster.totalHeight / cluster.count;
    const expandX = Math.max(4, Math.round(avgHeight * 1.1));
    const expandY = Math.max(3, Math.round(avgHeight * 0.7));

    const left = clampInt(cluster.minX - expandX, 0, width - 1);
    const top = clampInt(cluster.minY - expandY, 0, height - 1);
    const right = clampInt(cluster.maxX + expandX, 0, width - 1);
    const bottom = clampInt(cluster.maxY + expandY, 0, height - 1);
    const regionWidth = Math.max(1, right - left + 1);
    const regionHeight = Math.max(1, bottom - top + 1);

    boxes.push({
      left,
      top,
      width: regionWidth,
      height: regionHeight
    });
  }

  return mergeTextScrubPixelBoxes(boxes);
}

async function detectTextScrubPixelBoxes(image: Buffer): Promise<TextScrubPixelBox[]> {
  const [metadata, downscaled] = await Promise.all([
    sharp(image, { failOn: "none" }).metadata().catch(() => null),
    sharp(image, { failOn: "none" })
      .resize({
        width: TEXT_SCRUB_MAX_DIMENSION,
        height: TEXT_SCRUB_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true
      })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true })
      .catch(() => null)
  ]);

  const imageWidth = metadata?.width || 0;
  const imageHeight = metadata?.height || 0;
  if (imageWidth <= 0 || imageHeight <= 0 || !downscaled || !downscaled.info.width || !downscaled.info.height) {
    return [];
  }

  const downscaledWidth = downscaled.info.width;
  const downscaledHeight = downscaled.info.height;
  const rawBoxes = detectTextScrubBoxesFromRaw({
    pixels: downscaled.data,
    width: downscaledWidth,
    height: downscaledHeight
  });
  if (rawBoxes.length <= 0) {
    return [];
  }

  const scaleX = imageWidth / downscaledWidth;
  const scaleY = imageHeight / downscaledHeight;
  const mapped = rawBoxes
    .map((box) => {
      const marginX = Math.max(6, Math.round(imageWidth * 0.01));
      const marginY = Math.max(5, Math.round(imageHeight * 0.008));
      const left = clampInt(Math.floor(box.left * scaleX) - marginX, 0, imageWidth - 1);
      const top = clampInt(Math.floor(box.top * scaleY) - marginY, 0, imageHeight - 1);
      const right = clampInt(Math.ceil((box.left + box.width) * scaleX) + marginX, 1, imageWidth);
      const bottom = clampInt(Math.ceil((box.top + box.height) * scaleY) + marginY, 1, imageHeight);
      const width = right - left;
      const height = bottom - top;
      if (width < 2 || height < 2) {
        return null;
      }
      return {
        left,
        top,
        width,
        height
      } as TextScrubPixelBox;
    })
    .filter((box): box is TextScrubPixelBox => Boolean(box));

  return mergeTextScrubPixelBoxes(mapped);
}

async function createTextScrubNoiseOverlay(width: number, height: number): Promise<Buffer> {
  const channels = 4;
  const pixels = Buffer.alloc(width * height * channels);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * channels;
    const value = clampInt(128 + Math.floor(Math.random() * 18) - 9, 0, 255);
    pixels[offset] = value;
    pixels[offset + 1] = value;
    pixels[offset + 2] = value;
    pixels[offset + 3] = TEXT_SCRUB_NOISE_ALPHA;
  }

  return sharp(pixels, {
    raw: {
      width,
      height,
      channels
    }
  })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function scrubReadableTextRegions(baseImage: Buffer, boxes: TextScrubPixelBox[]): Promise<Buffer> {
  if (boxes.length <= 0) {
    return baseImage;
  }

  const overlays = (
    await Promise.all(
      boxes.map(async (box) => {
        const extracted = await sharp(baseImage, { failOn: "none" })
          .extract({
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height
          })
          .blur(TEXT_SCRUB_REGION_BLUR_SIGMA)
          .png({ compressionLevel: 9 })
          .toBuffer()
          .catch(() => null);
        if (!extracted) {
          return null;
        }

        const noiseOverlay = await createTextScrubNoiseOverlay(box.width, box.height).catch(() => null);
        const patched = noiseOverlay
          ? await sharp(extracted, { failOn: "none" })
              .composite([{ input: noiseOverlay, blend: "overlay" }])
              .png({ compressionLevel: 9 })
              .toBuffer()
              .catch(() => extracted)
          : extracted;

        return {
          input: patched,
          left: box.left,
          top: box.top
        };
      })
    )
  ).filter((item): item is { input: Buffer; left: number; top: number } => Boolean(item));

  if (overlays.length <= 0) {
    return baseImage;
  }

  return sharp(baseImage, { failOn: "none" })
    .composite(overlays)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function runLocalTextScrubPass(image: Buffer): Promise<{
  scrubbedPng: Buffer;
  boxesCount: number;
}> {
  const boxes = await detectTextScrubPixelBoxes(image);
  if (boxes.length <= 0) {
    return {
      scrubbedPng: image,
      boxesCount: 0
    };
  }

  const scrubbedPng = await scrubReadableTextRegions(image, boxes);
  return {
    scrubbedPng,
    boxesCount: boxes.length
  };
}

const READABLE_TEXT_BOOK_TOKENS = new Set<string>([
  "genesis",
  "exodus",
  "leviticus",
  "numbers",
  "deuteronomy",
  "joshua",
  "judges",
  "ruth",
  "samuel",
  "kings",
  "chronicles",
  "ezra",
  "nehemiah",
  "esther",
  "job",
  "psalm",
  "psalms",
  "proverbs",
  "ecclesiastes",
  "songofsolomon",
  "isaiah",
  "jeremiah",
  "lamentations",
  "ezekiel",
  "daniel",
  "hosea",
  "joel",
  "amos",
  "obadiah",
  "jonah",
  "micah",
  "nahum",
  "habakkuk",
  "zephaniah",
  "haggai",
  "zechariah",
  "malachi",
  "matthew",
  "mark",
  "luke",
  "john",
  "acts",
  "romans",
  "corinthians",
  "galatians",
  "ephesians",
  "philippians",
  "colossians",
  "thessalonians",
  "timothy",
  "titus",
  "philemon",
  "hebrews",
  "james",
  "peter",
  "jude",
  "revelation"
]);

function normalizeReadableToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function isPlausibleReadableToken(token: string): boolean {
  if (token.length < 3) {
    return false;
  }
  if (!/[a-z]/i.test(token)) {
    return false;
  }
  if (/^([a-z0-9])\1+$/.test(token)) {
    return false;
  }
  const digitCount = (token.match(/[0-9]/g) || []).length;
  if (digitCount / token.length > 0.66) {
    return false;
  }
  return true;
}

function parseReadableTextTokens(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map(normalizeReadableToken)
      .filter(isPlausibleReadableToken)
  )];
}

function extractReadableHardFailTokens(values: Array<string | null | undefined>): string[] {
  const tokens = values
    .flatMap((value) => (value || "").split(/[\s|,;:/()-]+/g))
    .map(normalizeReadableToken)
    .filter(isPlausibleReadableToken);
  return [...new Set(tokens)];
}

async function imageHasReadableText(
  image: Buffer,
  options?: {
    hardFailTokens?: string[];
  }
): Promise<boolean> {
  const hardFailTokens = new Set<string>([
    ...READABLE_TEXT_BOOK_TOKENS,
    ...(options?.hardFailTokens || []).map(normalizeReadableToken).filter(isPlausibleReadableToken)
  ]);

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return false;
  }

  try {
    const response = await getOpenAI().responses.create({
      model: process.env.OPENAI_MAIN_MODEL?.trim() || "gpt-4.1-mini",
      temperature: 0,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "You are a strict readable-text detector.",
                "Return JSON only with schema: {\"tokens\":[string],\"uncertain\":boolean}.",
                "Include only confidently readable alphanumeric tokens (>=3 chars) that look like real words/labels.",
                "Exclude single letters, broken fragments, uncertain glyphs, and gibberish.",
                "If uncertain, return uncertain=true and tokens=[]."
              ].join(" ")
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Hard-fail token hints (if present): ${
                [...hardFailTokens].slice(0, 36).join(", ") || "(none)"
              }`
            },
            {
              type: "input_image",
              image_url: `data:image/png;base64,${image.toString("base64")}`,
              detail: "high"
            }
          ]
        }
      ]
    });

    const parsed = parseJsonObject(parseResponseText(response));
    if (!parsed) {
      return false;
    }

    const tokens = parseReadableTextTokens((parsed as { tokens?: unknown }).tokens);
    const hasHardFailToken = tokens.some((token) => hardFailTokens.has(token));
    if (hasHardFailToken) {
      return true;
    }
    if (tokens.length > 0) {
      return true;
    }

    const uncertain = (parsed as { uncertain?: unknown }).uncertain;
    if (uncertain === true) {
      return false;
    }

    return false;
  } catch {
    // Fail-open for uncertain OCR; strict failures come from confident token reads only.
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
  stage: "primary" | "fallback_family" | "fallback_set" | "text_retry" | "background_recovery";
  attempt: number;
  styleFamily: StyleFamilyKey | null;
  explorationSetKey: string | null;
  variationTemplateKey?: string | null;
  score: number;
  layoutDiversityPenalty?: number;
  frameScaffoldPenalty?: number;
  textScrub?: TextScrubDebug;
  checks: {
    textFree: boolean;
    tonePass: boolean;
    designPresencePass: boolean;
    meaningfulStructurePass: boolean;
    focalMotifPresent: boolean;
    frameScaffoldTriggered: boolean;
    hardFailScaffold: boolean;
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
      luminanceStdNonTitle: number;
      requiredNonTitleEdgeDensity: number;
      requiredNonTitleLuminanceStd: number;
      meaningfulStructureScore: number;
      meaningfulStructureMinScore: number;
      meaningfulStructurePass: boolean;
      nonTitleLowDetail: boolean;
      borderEdgeRatio: number;
      borderLineEdgeDominance: number;
      longStraightBorderLineCount: number;
      mostEdgesAreLongStraightBorders: boolean;
      focalComponentEdgeRatio: number;
      focalComponentAreaRatio: number;
      focalMotifPresent: boolean;
      passes: boolean;
    } | null;
  };
};

type BackgroundRerankWinnerDebug = {
  index: number;
  url: string;
  stage: "primary" | "fallback_family" | "fallback_set" | "text_retry" | "background_recovery";
  attempt: number;
  styleFamily: StyleFamilyKey | null;
  explorationSetKey: string | null;
  variationTemplateKey?: string | null;
  score: number;
};

type BackgroundRerankFallbackDebug = {
  usedAltFamily: boolean;
  usedAltSet: boolean;
  attempts: number;
};

type BackgroundAttemptFailureReason = GenerationFailureReason;
type ImageCallStage = "background" | "lockup";
type ImageCallAspect = "wide" | "square" | "vertical";
type AspectAssetStatus = "ok" | "missing" | "placeholder";
type AspectAssetStatusByOutputAspect = {
  widescreen: AspectAssetStatus;
  square: AspectAssetStatus;
  vertical: AspectAssetStatus;
};

type FinalistCanonicalizationShapePaths = {
  backgroundPath: string | null;
  finalPath: string | null;
  designDoc: DesignDoc;
};

type FinalistCanonicalizationResult = {
  byShape: Record<PreviewShape, FinalistCanonicalizationShapePaths>;
  aspectAssets: AspectAssetStatusByOutputAspect;
  completionEligible: boolean;
  finalistCanonicalizationAttempted: boolean;
  finalistCanonicalizationSucceeded: boolean;
  aspectRecoveryAttemptsByShape: Record<PreviewShape, number>;
  aspectRecoveryReasonsByShape: Record<PreviewShape, string[]>;
  canonicalAssetPathsByShape: Record<PreviewShape, string | null>;
  canonicalizationFailureReasons: string[];
};

type TextScrubDebug = {
  attempted: boolean;
  boxesCount: number;
  beforeHasText: boolean;
  afterHasText: boolean;
  scrubbedUrl: string | null;
};

type BackgroundRecoveryDebug = {
  attempted: boolean;
  attempts: number;
  reasons: string[];
  succeeded: boolean;
  finalReasons: string[];
};

type ImageCallDebugSummary = {
  total: number;
  byStage: Record<ImageCallStage, number>;
  byAspect: Record<ImageCallAspect, number>;
  retries: number;
};

type BackgroundAttemptEvaluation = {
  evidence: ProductionBackgroundValidationEvidence;
  acceptance: BackgroundAcceptanceResult;
  textArtifactDetected: boolean;
  checks: {
    textFree: boolean;
    tonePass: boolean;
    designPresencePass: boolean;
    meaningfulStructurePass: boolean;
    focalMotifPresent: boolean;
    frameScaffoldTriggered: boolean;
    hardFailScaffold: boolean;
    hardFailBlankDesign: boolean;
  };
  stats: {
    tone: ImageToneStats | null;
    titleSafe: Awaited<ReturnType<typeof scoreTitleSafeRegion>>;
    midtoneRange: Awaited<ReturnType<typeof scoreMidtoneRangeFromBuffer>>;
    hardFail: Awaited<ReturnType<typeof computeBackgroundHardFailStatsFromBuffer>>;
  };
};

class Round1ImageCallCapReachedError extends Error {
  constructor() {
    super("ROUND1_IMAGE_CALL_CAP_REACHED");
    this.name = "Round1ImageCallCapReachedError";
  }
}

function isRound1ImageCallCapReachedError(error: unknown): boolean {
  return error instanceof Round1ImageCallCapReachedError;
}

class ClaimedGenerationExecutionTimeoutError extends Error {
  constructor(generationId: string, timeoutMs: number) {
    super(`CLAIMED_GENERATION_EXECUTION_TIMEOUT:${generationId}:${timeoutMs}`);
    this.name = "ClaimedGenerationExecutionTimeoutError";
  }
}

function isClaimedGenerationExecutionTimeoutError(error: unknown): boolean {
  return error instanceof ClaimedGenerationExecutionTimeoutError;
}

const CLAIMED_GENERATION_EXECUTION_AUTHORITY_RECHECK_MS = 250;

type ClaimedGenerationExecutionTimeoutLease = {
  abort: (reason: unknown) => void;
  throwIfTimedOut: () => void;
  registerBackgroundRunId: (runId: string) => void;
  finalizeTimedOutHarnessWork: () => Promise<void>;
};

function normalizeExecutionLeaseError(reason: unknown, generationId: string): Error {
  if (reason instanceof Error) {
    return reason;
  }

  return new Error(`CLAIMED_GENERATION_EXECUTION_TIMEOUT:${generationId}:${String(reason ?? "unknown")}`);
}

function createClaimedGenerationExecutionTimeoutLease(params: {
  generationId: string;
  timeoutMs: number;
}): ClaimedGenerationExecutionTimeoutLease {
  const controller = new AbortController();
  const trackedBackgroundRunIds = new Set<string>();
  const finalizedRunIds = new Set<string>();

  return {
    abort(reason: unknown) {
      if (!controller.signal.aborted) {
        controller.abort(reason);
      }
    },
    throwIfTimedOut() {
      if (controller.signal.aborted) {
        throw normalizeExecutionLeaseError(controller.signal.reason, params.generationId);
      }
    },
    registerBackgroundRunId(runId: string) {
      if (runId.trim()) {
        trackedBackgroundRunIds.add(runId);
      }
    },
    async finalizeTimedOutHarnessWork() {
      if (!controller.signal.aborted) {
        return;
      }

      const pendingRunIds = [...trackedBackgroundRunIds].filter((runId) => !finalizedRunIds.has(runId));
      if (pendingRunIds.length === 0) {
        return;
      }

      const finalized = await abandonGraphicsBackgroundAiRuns({
        runIds: pendingRunIds,
        generationId: params.generationId,
        timeoutMs: params.timeoutMs
      });

      for (const runId of finalized.runIds) {
        finalizedRunIds.add(runId);
      }
    }
  };
}

function createClaimedGenerationExecutionActiveAssertion(params: {
  generationId: string;
  attemptOwner: GenerationAttemptOwner;
  executionLease: ClaimedGenerationExecutionTimeoutLease;
  minRecheckMs?: number;
}): () => Promise<void> {
  let lastAuthorityCheckAt = 0;
  const minRecheckMs = params.minRecheckMs ?? CLAIMED_GENERATION_EXECUTION_AUTHORITY_RECHECK_MS;

  return async () => {
    params.executionLease.throwIfTimedOut();

    const now = Date.now();
    if (now - lastAuthorityCheckAt < minRecheckMs) {
      return;
    }

    await assertGenerationAttemptStillActive({
      prisma,
      generationId: params.generationId,
      attemptOwner: params.attemptOwner
    });
    lastAuthorityCheckAt = now;
  };
}

type BackgroundAttemptCandidateDebug = {
  url: string;
  textScrub?: TextScrubDebug;
  checks: {
    textOk: boolean;
    scaffoldOk: boolean;
    motifOk: boolean;
    toneOk: boolean | null;
    referenceOk?: boolean | null;
  };
  scores: {
    total: number;
    layoutDiversityPenalty: number;
    frameScaffoldPenalty: number;
    meaningfulStructure: number;
    titleSafe: number;
    midtoneRange: number;
  };
};

type BackgroundAttemptDebug = {
  attemptIndex: number;
  styleFamily: StyleFamilyKey | null;
  anchorUsed: {
    visualAnchorSrc: string | null;
  };
  candidates: BackgroundAttemptCandidateDebug[];
  winnerIndex: number | null;
  failureReason: BackgroundAttemptFailureReason | null;
};

type LockupRerankCandidateDebug = {
  url: string;
  score: number;
  invalidReasons: string[];
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

type LockupComputationSelection = {
  renderResult: { png: Buffer; width: number; height: number };
  effectivePrompt: string;
  textValidation: LockupSvgTextValidation | null;
  textOverrideRetried: boolean;
  fit: LockupFitCheck;
  evidence: ProductionLockupValidationEvidence;
  acceptance: LockupAcceptanceResult;
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
  status: GenerationOptionStatus;
  designDoc: DesignDoc;
  designDocByShape: Record<PreviewShape, DesignDoc>;
  notes: string;
  promptUsed?: string;
  meta: {
    styleRefCount: number;
    usedStylePaths: string[];
    usedReferenceIds?: string[];
    revisedPrompt?: string;
    execution?: PersistedGenerationExecutionState;
    debug?: {
      styleFamilyFallback?: {
        usedCleanMinFallback: boolean;
        resolvedStyleFamily: StyleFamily;
      };
      backgroundSource?: DebugAssetSource;
      lockupSource?: DebugAssetSource;
      backgroundFailureReason?: BackgroundAttemptFailureReason | null;
      backgroundAttempts?: BackgroundAttemptDebug[];
      backgroundRecoveryAttempted?: boolean;
      backgroundRecoveryAttempts?: number;
      backgroundRecoveryReasons?: string[];
      backgroundRecoverySucceeded?: boolean;
      backgroundRecoveryFinalReasons?: string[];
      textScrub?: TextScrubDebug;
      warnings?: string[];
      imageCalls?: ImageCallDebugSummary;
      rateLimitWaitMs?: number;
      aspectAssets?: AspectAssetStatusByOutputAspect;
      finalistCanonicalizationAttempted?: boolean;
      finalistCanonicalizationSucceeded?: boolean;
      aspectRecoveryAttemptsByShape?: Record<PreviewShape, number>;
      aspectRecoveryReasonsByShape?: Record<PreviewShape, string[]>;
      canonicalAssetPathsByShape?: Record<PreviewShape, string | null>;
      canonicalizationFailureReasons?: string[];
      roundHasFallback?: boolean;
      roundStatus?: GenerationRoundStatus;
      roundCompletedCount?: number;
      roundAttemptCount?: number;
      roundRequiredCompletedCount?: number;
      roundFailureReason?: GenerationRoundFailureReason | null;
      roundOperationalFailureReason?: ProviderFailureReason | null;
      generationLifecycleState?: GenerationLifecycleState;
      imageProvider?: {
        provider: "openai" | "fal";
        model: string;
        providerPath: string;
        usingDefaultModel: boolean;
        preflightCheckedAt?: string;
        preflightOk?: boolean;
        preflightFailureReason?: ProviderFailureReason | null;
      };
      fallbackPreview?: {
        square: string;
        wide: string;
        tall: string;
        lockup: string | null;
      };
      referenceAnchor?: {
        referenceId: string;
        referenceCluster: string | null;
        referenceTier: string | null;
        visualAnchorSrc: string;
        typographyAnchorSrc: string;
        backgroundAnchorSrc?: string;
        lockupAnchorSrc?: string;
      };
      refinement?: {
        refinementChainId: string;
        anchorDirectionFingerprint: string;
        lockedInvariantsSummary: string;
        lockedStyleInvariants: RefinementLockedStyleInvariants;
        variantMutationAxis: RefinementMutationAxis | null;
        variantFingerprint: string | null;
      };
    };
    toneCheck?: ToneCheckSummary;
    backgroundTextCheck?: BackgroundTextCheckSummary;
    lockupValidation?: {
      ok: boolean;
      reasons: string[];
      retried: boolean;
    };
    productionValidation?: ProductionValidationSnapshot;
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
  const refinementLineage = readRefinementLineageFromInput(params.input);
  const refinementDebugPayload = buildRefinementDebugPayload({
    input: params.input,
    directionSpec
  });
  const dedupedReferenceItems = dedupeReferencesById(params.referenceItems || []);
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
    designSpec: null,
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
    titleIntegrationMode: directionSpec?.titleIntegrationMode || null,
    motifFocus: directionSpec?.motifFocus || [],
    bookKeys: params.motifBankContext?.bookKeys || [],
    bookNames: params.motifBankContext?.bookNames || [],
    topicKeys: params.motifBankContext?.topicKeys || [],
    topicNames: params.motifBankContext?.topicNames || []
  };
  if (refinementLineage) {
    fallbackDesignSpec.refinement = {
      refinementChainId: refinementLineage.refinementChainId,
      anchorDirectionFingerprint: refinementLineage.anchorDirectionFingerprint,
      lockedStyleInvariants: refinementLineage.lockedStyleInvariants,
      appliedFeedbackDeltas: refinementLineage.appliedFeedbackDeltas,
      seenVariantFingerprints: refinementLineage.seenVariantFingerprints,
      variantMutationAxis: refinementDebugPayload?.variantMutationAxis || null,
      variantFingerprint: refinementDebugPayload?.variantFingerprint || null
    };
    fallbackDesignSpec.refinementChainId = refinementLineage.refinementChainId;
    fallbackDesignSpec.anchorDirectionFingerprint = refinementLineage.anchorDirectionFingerprint;
    fallbackDesignSpec.lockedInvariantsSummary = summarizeLockedStyleInvariants(refinementLineage.lockedStyleInvariants);
    fallbackDesignSpec.variantMutationAxis = refinementDebugPayload?.variantMutationAxis || null;
  }
  if (lockupLayout) {
    fallbackDesignSpec.lockupLayout = lockupLayout;
  }

  const normalizedAnchorReferenceId =
    typeof directionSpec?.referenceId === "string" ? normalizeReferenceId(directionSpec.referenceId) : "";
  const fallbackAnchorReference =
    normalizedAnchorReferenceId.length > 0
      ? dedupedReferenceItems.find((reference) => normalizeReferenceId(reference.id) === normalizedAnchorReferenceId) || null
      : dedupedReferenceItems[0] || null;
  const fallbackVisualAnchorSrc = resolveReferenceVisualAnchorSrc({
    reference: fallbackAnchorReference,
    referenceCluster: directionSpec?.referenceCluster || null
  });
  const fallbackTypographyAnchorSrc = resolveReferenceTypographyAnchorSrc(fallbackAnchorReference);
  const referenceAnchorDebugMeta = buildReferenceAnchorDebugMeta({
    referenceId: fallbackAnchorReference?.id || directionSpec?.referenceId || null,
    referenceCluster: directionSpec?.referenceCluster || null,
    referenceTier: directionSpec?.referenceTier || null,
    visualAnchorSrc: fallbackVisualAnchorSrc,
    typographyAnchorSrc: fallbackTypographyAnchorSrc,
    optionIndex: params.optionIndex
  });
  const fallbackDebugBase: NonNullable<GenerationOutputPayload["meta"]["debug"]> = !hasDesignNotes
    ? {
        backgroundSource: "fallback",
        lockupSource: "fallback",
        styleFamilyFallback: {
          usedCleanMinFallback,
          resolvedStyleFamily
        }
      }
    : {
        backgroundSource: "fallback",
        lockupSource: "fallback"
      };
  const fallbackDebugWithRefinement = refinementDebugPayload
    ? mergeGenerationDebugMeta(fallbackDebugBase, {
        refinement: refinementDebugPayload
      })
    : fallbackDebugBase;
  const fallbackDebugMeta = mergeReferenceAnchorDebugMeta(fallbackDebugWithRefinement, referenceAnchorDebugMeta);

  return {
    status: "FALLBACK",
    designDoc: designDocByShape.square,
    designDocByShape,
    notes: `Fallback layout: ${params.presetKey} | variant ${params.optionIndex % 3}`,
    meta: {
      styleRefCount: params.referenceItems?.length || 0,
      usedStylePaths: (params.referenceItems || []).map((ref) => ref.path || ref.thumbPath),
      usedReferenceIds: dedupedReferenceItems.map((reference) => reference.id),
      revisedPrompt: params.revisedPrompt,
      ...(fallbackDebugMeta
        ? {
            debug: fallbackDebugMeta
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
  lockupLayout?: LockupLayoutArchetype,
  primaryDirection?: PrimaryDirectionContext | null,
  refinementLineage?: RefinementLineageState | null
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
    primaryDirection: primaryDirection || null,
    refinement: refinementLineage || null,
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
    titleIntegrationMode: isTitleIntegrationMode(parsed.titleIntegrationMode) ? parsed.titleIntegrationMode : undefined,
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
    refinementMutationAxis: normalizeRefinementVariantMutationAxis(parsed.refinementMutationAxis) || undefined,
    refinementVariantFingerprint:
      typeof parsed.refinementVariantFingerprint === "string" && parsed.refinementVariantFingerprint.trim()
        ? parsed.refinementVariantFingerprint.trim()
        : undefined,
    refinementMotifEmphasisProfile:
      parsed.refinementMotifEmphasisProfile === "primary_large" ||
      parsed.refinementMotifEmphasisProfile === "distributed_balance" ||
      parsed.refinementMotifEmphasisProfile === "foreground_cluster" ||
      parsed.refinementMotifEmphasisProfile === "edge_repeat"
        ? parsed.refinementMotifEmphasisProfile
        : undefined,
    refinementTypographyEnergyProfile:
      parsed.refinementTypographyEnergyProfile === "tight" ||
      parsed.refinementTypographyEnergyProfile === "balanced" ||
      parsed.refinementTypographyEnergyProfile === "airy"
        ? parsed.refinementTypographyEnergyProfile
        : undefined,
    motifFocus: safeArrayOfStrings(parsed.motifFocus, []).slice(0, 2),
    motifScope:
      parsed.motifScope === "whole_book" || parsed.motifScope === "multi_passage" || parsed.motifScope === "specific_passage"
        ? parsed.motifScope
        : undefined
  };
}

function normalizeOptionIndex(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }
  if (value < 0 || value >= ROUND_OPTION_COUNT) {
    return null;
  }
  return value;
}

function readOptionIndexFromGenerationOutput(output: unknown): number | null {
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

  const optionLane = (designSpec as { optionLane?: unknown }).optionLane;
  if (typeof optionLane === "string") {
    const normalizedLane = optionLane.trim().toUpperCase();
    if (normalizedLane === "A") {
      return 0;
    }
    if (normalizedLane === "B") {
      return 1;
    }
    if (normalizedLane === "C") {
      return 2;
    }
  }

  const nestedDirectionSpec = (designSpec as { directionSpec?: unknown }).directionSpec;
  if (nestedDirectionSpec && typeof nestedDirectionSpec === "object" && !Array.isArray(nestedDirectionSpec)) {
    return normalizeOptionIndex((nestedDirectionSpec as { optionIndex?: unknown }).optionIndex);
  }
  return null;
}

function readDirectionSpecFromGenerationOutput(output: unknown, optionIndex: number): PlannedDirectionSpec | null {
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
  const candidate = (designSpec as { directionSpec?: unknown }).directionSpec;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const parsed = candidate as Partial<PlannedDirectionSpec>;
  const laneFamilyCandidate = isDirectionLaneFamily(parsed.laneFamily) ? parsed.laneFamily : null;
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
    titleIntegrationMode: isTitleIntegrationMode(parsed.titleIntegrationMode) ? parsed.titleIntegrationMode : undefined,
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
    refinementMutationAxis: normalizeRefinementVariantMutationAxis(parsed.refinementMutationAxis) || undefined,
    refinementVariantFingerprint:
      typeof parsed.refinementVariantFingerprint === "string" && parsed.refinementVariantFingerprint.trim()
        ? parsed.refinementVariantFingerprint.trim()
        : undefined,
    refinementMotifEmphasisProfile:
      parsed.refinementMotifEmphasisProfile === "primary_large" ||
      parsed.refinementMotifEmphasisProfile === "distributed_balance" ||
      parsed.refinementMotifEmphasisProfile === "foreground_cluster" ||
      parsed.refinementMotifEmphasisProfile === "edge_repeat"
        ? parsed.refinementMotifEmphasisProfile
        : undefined,
    refinementTypographyEnergyProfile:
      parsed.refinementTypographyEnergyProfile === "tight" ||
      parsed.refinementTypographyEnergyProfile === "balanced" ||
      parsed.refinementTypographyEnergyProfile === "airy"
        ? parsed.refinementTypographyEnergyProfile
        : undefined,
    motifFocus: safeArrayOfStrings(parsed.motifFocus, []).slice(0, 2),
    motifScope:
      parsed.motifScope === "whole_book" || parsed.motifScope === "multi_passage" || parsed.motifScope === "specific_passage"
        ? parsed.motifScope
        : undefined
  };
}

function isExplicitDirectionChangeRequest(params: {
  styleDirection: StyleDirection;
  feedbackText?: string | null;
}): boolean {
  if (params.styleDirection !== "SURPRISE") {
    return true;
  }
  const feedback = (params.feedbackText || "").trim().toLowerCase();
  if (!feedback) {
    return false;
  }
  return (
    /\b(change|switch|new|different)\s+(direction|style|look|approach)\b/.test(feedback) ||
    /\bfresh\s+direction\b/.test(feedback) ||
    /\bstart\s+over\b/.test(feedback)
  );
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
  if (!directionPlan) {
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

type GenerationAttemptOwner = {
  token: string;
  attemptNumber: number;
  ownerUpdatedAt: Date;
};

type ClaimedPlannedGeneration = PlannedGeneration & {
  attemptOwner: GenerationAttemptOwner;
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

type LoadedReferenceDataUrl = {
  referenceId: string;
  dataUrl: string;
  sourcePath: string;
};

function normalizeReferenceId(value: string): string {
  return value.trim().toLowerCase();
}

function dedupeReferencePaths(paths: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const rawPath of paths) {
    if (typeof rawPath !== "string") {
      continue;
    }
    const slashNormalized = rawPath.trim().replaceAll("\\", "/");
    const normalized = slashNormalized.startsWith("/")
      ? `/${slashNormalized.replace(/^\/+/, "")}`
      : slashNormalized.replace(/^\.\/+/, "");
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(normalized);
  }
  return deduped;
}

function toReferenceOriginalPublicUrl(referencePath: string): string | null {
  const normalizedPath = referencePath.trim().replaceAll("\\", "/");
  const fileName = path.posix.basename(normalizedPath);
  if (!fileName) {
    return null;
  }
  return `/reference_library/originals/${encodeURIComponent(fileName)}`;
}

function toReferenceThumbPublicUrl(referencePath: string): string | null {
  const normalizedPath = referencePath.trim().replaceAll("\\", "/");
  const fileName = path.posix.basename(normalizedPath);
  if (!fileName) {
    return null;
  }
  return `/reference_library/thumbs/${encodeURIComponent(fileName)}`;
}

function toReferenceStyleAnchorPublicUrl(referencePath: string): string | null {
  const normalizedPath = referencePath.trim().replaceAll("\\", "/");
  const fileName = path.posix.basename(normalizedPath);
  if (!fileName) {
    return null;
  }
  return `/reference_library/style_anchors/${encodeURIComponent(fileName)}`;
}

type ReferenceAnchorDebugMeta = NonNullable<NonNullable<GenerationOutputPayload["meta"]["debug"]>["referenceAnchor"]>;

function normalizeReferencePublicUrl(
  referencePath: string | null | undefined,
  kind: "original" | "thumb" | "style-anchor"
): string | null {
  if (typeof referencePath !== "string") {
    return null;
  }
  const normalizedPath = referencePath.trim().replaceAll("\\", "/");
  if (!normalizedPath) {
    return null;
  }
  if (kind === "original" && normalizedPath.startsWith("/reference_library/originals/")) {
    return normalizedPath;
  }
  if (kind === "thumb" && normalizedPath.startsWith("/reference_library/thumbs/")) {
    return normalizedPath;
  }
  if (kind === "style-anchor" && normalizedPath.startsWith("/reference_library/style_anchors/")) {
    return normalizedPath;
  }
  if (kind === "original") {
    return toReferenceOriginalPublicUrl(normalizedPath);
  }
  if (kind === "thumb") {
    return toReferenceThumbPublicUrl(normalizedPath);
  }
  return toReferenceStyleAnchorPublicUrl(normalizedPath);
}

function resolveReferenceOriginalSrc(reference: ReferenceLibraryItem | null | undefined): string | null {
  if (!reference) {
    return null;
  }
  return (
    normalizeReferencePublicUrl(reference.rawPath, "original") ||
    normalizeReferencePublicUrl(reference.path, "original") ||
    normalizeReferencePublicUrl(reference.normalizedPath, "original") ||
    normalizeReferencePublicUrl(reference.thumbPath, "original")
  );
}

function resolveReferenceStyleAnchorSrc(reference: ReferenceLibraryItem | null | undefined): string | null {
  if (!reference) {
    return null;
  }
  return normalizeReferencePublicUrl(reference.styleAnchorPath, "style-anchor");
}

function resolveReferenceVisualAnchorSrc(params: {
  reference: ReferenceLibraryItem | null | undefined;
  referenceCluster?: string | null;
}): string | null {
  void params.referenceCluster;
  const originalSrc = resolveReferenceOriginalSrc(params.reference);
  const styleAnchorSrc = resolveReferenceStyleAnchorSrc(params.reference);
  return originalSrc || styleAnchorSrc;
}

function resolveReferenceTypographyAnchorSrc(reference: ReferenceLibraryItem | null | undefined): string | null {
  return resolveReferenceOriginalSrc(reference) || resolveReferenceStyleAnchorSrc(reference);
}

function buildReferenceAnchorDebugMeta(params: {
  referenceId: string | null | undefined;
  referenceCluster: string | null;
  referenceTier: string | null;
  visualAnchorSrc: string | null | undefined;
  typographyAnchorSrc: string | null | undefined;
  optionIndex: number;
}): ReferenceAnchorDebugMeta | null {
  const referenceId = typeof params.referenceId === "string" ? params.referenceId.trim() : "";
  if (!referenceId) {
    return null;
  }
  const visualAnchorSrc =
    normalizeReferencePublicUrl(params.visualAnchorSrc, "original") ||
    normalizeReferencePublicUrl(params.visualAnchorSrc, "style-anchor");
  const typographyAnchorSrc =
    normalizeReferencePublicUrl(params.typographyAnchorSrc, "original") ||
    normalizeReferencePublicUrl(params.typographyAnchorSrc, "style-anchor");
  if (!visualAnchorSrc || !typographyAnchorSrc) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[MISSING REFERENCE ANCHOR SOURCES]", {
        referenceId,
        optionIndex: params.optionIndex
      });
    }
    return null;
  }
  return {
    referenceId,
    referenceCluster: params.referenceCluster,
    referenceTier: params.referenceTier,
    visualAnchorSrc,
    typographyAnchorSrc,
    backgroundAnchorSrc: visualAnchorSrc,
    lockupAnchorSrc: typographyAnchorSrc
  };
}

function mergeReferenceAnchorDebugMeta(
  existingDebug: GenerationOutputPayload["meta"]["debug"] | undefined,
  referenceAnchorDebug: ReferenceAnchorDebugMeta | null
): GenerationOutputPayload["meta"]["debug"] | undefined {
  if (!referenceAnchorDebug) {
    return existingDebug;
  }
  return {
    ...(existingDebug || {}),
    referenceAnchor: referenceAnchorDebug
  };
}

function mergeGenerationDebugMeta(
  existingDebug: GenerationOutputPayload["meta"]["debug"] | undefined,
  patch: Partial<NonNullable<GenerationOutputPayload["meta"]["debug"]>>
): NonNullable<GenerationOutputPayload["meta"]["debug"]> {
  return {
    ...(existingDebug || {}),
    ...patch
  };
}

function appendUniqueDebugWarning(
  existingWarnings: string[] | undefined,
  nextWarning: string | null
): string[] | undefined {
  const base = Array.isArray(existingWarnings)
    ? existingWarnings.filter((warning): warning is string => typeof warning === "string" && warning.trim().length > 0)
    : [];
  if (!nextWarning || !nextWarning.trim()) {
    return base.length > 0 ? base : undefined;
  }
  if (base.some((warning) => warning.toLowerCase() === nextWarning.toLowerCase())) {
    return base;
  }
  return [...base, nextWarning];
}

function createImageCallDebugSummary(): ImageCallDebugSummary {
  return {
    total: 0,
    byStage: {
      background: 0,
      lockup: 0
    },
    byAspect: {
      wide: 0,
      square: 0,
      vertical: 0
    },
    retries: 0
  };
}

function aspectFromShape(shape: PreviewShape): ImageCallAspect {
  return shape === "tall" ? "vertical" : shape;
}

function styleTagFromStyleTags(styleTags: string[]): ReferenceLibraryStyleTag {
  const lowered = styleTags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  if (lowered.some((tag) => tag.includes("bold-typography") || tag === "type" || tag === "typography")) {
    return "bold-typography";
  }
  if (lowered.some((tag) => tag.includes("illustrat") || tag.includes("line-art") || tag.includes("engrav"))) {
    return "illustrative";
  }
  if (lowered.some((tag) => tag.includes("photo") || tag.includes("cinematic"))) {
    return "photo";
  }
  if (lowered.some((tag) => tag.includes("texture") || tag.includes("textured"))) {
    return "textured";
  }
  return "minimal";
}

function buildReferenceItemFromCurated(params: {
  curated: CuratedReference;
  fallback: ReferenceLibraryItem | null;
}): ReferenceLibraryItem {
  const fallback = params.fallback;
  const styleTags =
    params.curated.styleTags.length > 0
      ? params.curated.styleTags
      : fallback?.styleTags && fallback.styleTags.length > 0
        ? fallback.styleTags
        : [];
  const styleTag = fallback?.styleTag || styleTagFromStyleTags(styleTags);

  return {
    id: params.curated.id,
    path: params.curated.rawPath || fallback?.path || params.curated.thumbPath || params.curated.normalizedPath,
    width: params.curated.width,
    height: params.curated.height,
    aspect: params.curated.aspect,
    fileSize: params.curated.fileSize,
    dHash: params.curated.dHash || fallback?.dHash,
    styleTag,
    styleTags,
    styleAnchorPath: params.curated.styleAnchorPath || fallback?.styleAnchorPath,
    sourceZip: fallback?.sourceZip,
    originalName: fallback?.originalName,
    rawPath: params.curated.rawPath || fallback?.rawPath || params.curated.normalizedPath,
    normalizedPath: params.curated.normalizedPath || fallback?.normalizedPath || params.curated.rawPath,
    thumbPath: params.curated.thumbPath || fallback?.thumbPath || params.curated.normalizedPath
  };
}

function referenceFileCandidates(reference: ReferenceLibraryItem): string[] {
  return dedupeReferencePaths([
    reference.styleAnchorPath,
    reference.path,
    reference.rawPath,
    reference.normalizedPath,
    reference.thumbPath
  ]);
}

async function loadReferenceDataUrl(
  reference: ReferenceLibraryItem,
  preferredSourcePaths: Array<string | null | undefined> = []
): Promise<LoadedReferenceDataUrl | null> {
  const candidates = dedupeReferencePaths([...preferredSourcePaths, ...referenceFileCandidates(reference)]);
  for (const relativePath of candidates) {
    const mime = mimeTypeFromPath(relativePath);
    if (!mime) {
      continue;
    }
    const absolutePath = resolveReferenceAbsolutePath(relativePath);
    const bytes = await readFile(absolutePath).catch(() => null);
    if (!bytes) {
      continue;
    }
    return {
      referenceId: reference.id,
      dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
      sourcePath: relativePath
    };
  }
  return null;
}

async function buildReferenceDataUrls(
  references: ReferenceLibraryItem[],
  options?: {
    preferredSourcePathsByReferenceId?: ReadonlyMap<string, ReadonlyArray<string | null | undefined>>;
  }
): Promise<LoadedReferenceDataUrl[]> {
  const refs = await Promise.all(
    references.map((reference) => {
      const preferredSourcePaths = options?.preferredSourcePathsByReferenceId?.get(normalizeReferenceId(reference.id)) || [];
      return loadReferenceDataUrl(reference, [...preferredSourcePaths]);
    })
  );
  return refs.filter((reference): reference is LoadedReferenceDataUrl => Boolean(reference));
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
    explorationMode: params.round === 1 && !hasDesignNotes,
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
    const response = await getOpenAI().responses.create({
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
  designSpec?: DesignSpec | null;
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
  const refinementMotifEmphasisLine =
    params.directionSpec?.refinementMutationAxis === "motif_emphasis"
      ? params.directionSpec.refinementMotifEmphasisProfile === "distributed_balance"
        ? "Refinement delta (motif emphasis): keep the same motif symbols but distribute them as smaller repeated elements with calmer dominance."
        : params.directionSpec.refinementMotifEmphasisProfile === "foreground_cluster"
          ? "Refinement delta (motif emphasis): keep the same motif symbols and cluster them into one tighter foreground grouping."
          : params.directionSpec.refinementMotifEmphasisProfile === "edge_repeat"
            ? "Refinement delta (motif emphasis): keep the same motif symbols and repeat them nearer frame edges with restrained center mass."
            : "Refinement delta (motif emphasis): keep the same motif symbols but scale one primary motif larger and push it into clearer focal placement."
      : "";
  if (params.designSpec) {
    const designSpec = {
      ...params.designSpec,
      titleIntegrationMode: normalizeBackgroundTitleIntegrationMode(params.designSpec.titleIntegrationMode)
    };
    const symbolDirectives = readSymbolDirectives(designSpec);
    const symbolLine =
      symbolDirectives.length > 0
        ? symbolDirectives.join(", ")
        : "radiant light burst, vine branch silhouette, circular stone form";
    const referenceVibeLine = params.directionSpec?.referenceId
      ? `Reference cue (${params.directionSpec.referenceId}) is vibe-only: borrow mood and materiality, never copy composition or motifs.`
      : "";
    const shapeLine =
      params.shape === "wide"
        ? "Shape guidance: preserve cinematic width with one dominant motif mass and a clean, calmer type region."
        : params.shape === "square"
          ? "Shape guidance: preserve central balance with asymmetric detail and a clear quieter type region."
          : "Shape guidance: preserve vertical rhythm with one dominant motif and a protected type zone in upper/mid flow.";

    return [
      params.brandPaletteHardConstraint || "",
      "Render a finished sermon series poster background (text-free).",
      `DesignSpec summary: ${summarizeDesignSpecForPrompt(designSpec)}.`,
      referenceVibeLine,
      `Focal motif is REQUIRED and must be dominant: ${symbolLine}.`,
      refinementMotifEmphasisLine,
      `Use motif treatment exactly: abstraction=${designSpec.motifTreatment.abstraction}, texture=${designSpec.motifTreatment.texture}, colorUse=${designSpec.motifTreatment.colorUse}.`,
      `Composition goal (not a wireframe): typeRegion=${designSpec.composition.typeRegion}, motifRegion=${designSpec.composition.motifRegion}, overlap=${designSpec.composition.overlap}, asymmetry=${designSpec.composition.asymmetry}.`,
      `Imply title-safe space through quieter contrast and texture in the ${designSpec.composition.typeRegion} region with generous margins. No boxes or guide marks.`,
      shapeLine,
      SYMBOL_ONLY_TEXT_BAN_DIRECTIVE,
      "Avoid generic clipart-style religious icons; keep symbols abstract, compositional, and material-driven.",
      "No wireframes, no borders-only, no ruled-paper-only.",
      "Do not create scaffold frames, detached stage panels, or placeholder layout cues.",
      "Background must contain NO readable words; textured/engraved/halftone pseudo-glyph patterns are acceptable only when unreadable.",
      params.seriesPreferenceGuidance || "",
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

  const isReferenceFirst = Boolean(params.directionSpec?.referenceId);
  const promptProfileSelection = resolvePromptProfile({
    explorationMode: params.explorationMode,
    referenceId: params.directionSpec?.referenceId
  });
  const promptProfile = promptProfileSelection.profile;
  const isRound1ReferenceFirst = promptProfileSelection.key === "round1_reference_first";
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
  const hardStyleConstraintLine = styleFamily && promptProfile.includeFlags.includeBucketRules && !isReferenceFirst
    ? `HARD STYLE CONSTRAINT: Bucket = ${styleFamily.bucket}. Follow bucket rules strictly.`
    : "";
  const bucketRulesLine =
    styleFamily && promptProfile.includeFlags.includeBucketRules ? `Bucket rules: ${styleFamily.bucketRules}` : "";
  const hardToneConstraintLine =
    styleFamily && promptProfile.includeFlags.includeToneRules && !isReferenceFirst
      ? `HARD STYLE CONSTRAINT: Tone = ${styleFamily.tone}.`
      : "";
  const toneRulesLine = styleFamily && promptProfile.includeFlags.includeToneRules ? `Tone rules: ${styleFamily.toneRules}` : "";
  const hardMediumConstraintLine =
    styleFamily && promptProfile.includeFlags.includeMediumRules && !isReferenceFirst
      ? `HARD STYLE CONSTRAINT: Medium = ${styleFamily.medium}.`
      : "";
  const mediumRulesLine =
    styleFamily && promptProfile.includeFlags.includeMediumRules ? `Medium rules: ${styleFamily.mediumRules}` : "";
  const styleFamilyBackgroundRulesLine = styleFamily && promptProfile.includeFlags.includeStyleFamilyRules
    ? `Style family: ${styleFamily.name}. Follow these rules strongly: ${styleFamily.backgroundRules.join(
        " "
      )} Forbids: ${styleFamily.forbids.join("; ")}.`
    : "";
  const variationTemplate =
    typeof params.directionSpec?.variationTemplateKey === "string" && params.directionSpec.variationTemplateKey.trim()
      ? getRound1VariationTemplateByKey(params.directionSpec.variationTemplateKey)
      : null;
  const variationTemplateLine =
    variationTemplate && promptProfile.includeFlags.includeVariationTemplate && !isRound1ReferenceFirst
      ? buildVariationTemplateHardInstruction({
          variationTemplate,
          target: "background"
        })
      : "";
  const titleIntegrationMode = resolveTitleIntegrationMode(params.directionSpec);
  const titleIntegrationModeLine = titleIntegrationMode
    ? `Title integration mode: ${titleIntegrationMode}.`
    : "";
  const titleIntegrationAuthorityLine = titleIntegrationMode
    ? buildTitleIntegrationAuthorityInstruction({
        mode: titleIntegrationMode,
        target: "background",
        variationTemplate
      })
    : "";
  const titleIntegrationQualityLine = titleIntegrationMode
    ? "Integration quality bar: build the composition to host typography natively so title never looks pasted."
    : "";
  const defaultBiasGuardLine = referenceFirstDefaultBiasGuardLine(params.directionSpec);
  const referenceAnchorContextLine = params.directionSpec?.referenceId
    ? `Reference anchor: ${params.directionSpec.referenceId} (${params.directionSpec.referenceCluster || "other"}, ${
        params.directionSpec.referenceTier || "unknown"
      }).`
    : "";
  const referenceAnchorDirectiveLine = params.directionSpec?.referenceId
    ? "REFERENCE ANCHOR: match palette logic, texture, typographic energy, composition style."
    : "";
  const referenceTypographyStageLine = params.directionSpec?.referenceId
    ? "Reserve a strong typographic stage (clear negative space + contrast) in the same region/scale as the reference's type."
    : "";
  const referenceAnchorPriorityLine = isReferenceFirst && !isRound1ReferenceFirst
    ? "REFERENCE ANCHOR IS HIGHEST PRIORITY. Match the reference's composition, texture, palette logic, and typographic energy."
    : "";
  const referenceSecondaryGuardrailLine = isReferenceFirst && !isRound1ReferenceFirst
    ? "Bucket/tone/medium are secondary guardrails; use them only if they do not contradict the reference."
    : "";
  const originalityRuleLine = params.directionSpec?.referenceId && !isRound1ReferenceFirst
    ? "ORIGINALITY RULE: do NOT copy the reference layout; do NOT reuse the same motif; recomposition required."
    : "";
  const motifRecompositionLine = params.directionSpec?.referenceId && !isRound1ReferenceFirst
    ? "Use the sermon motif/themes (from our motif system) to create a new focal element."
    : "";
  const styleAuthorityOverrideLine = isReferenceFirst
    ? ""
    : "If any style refs conflict with bucket/family/tone/medium rules, IGNORE the refs and follow bucket/family/tone/medium.";
  const backgroundTextFreeRuleLine =
    !isRound1ReferenceFirst
      ? "BACKGROUND MUST BE TEXT-FREE: absolutely no words, letters, numbers, symbols resembling typography, watermarks, logos."
      : "";
  const ignoreTypographyRefLine =
    !isRound1ReferenceFirst
      ? "If style refs show typography, ignore it completely and output only the graphical background style."
      : "";
  const explorationTextInvalidLine = params.explorationMode && !isRound1ReferenceFirst
    ? "If ANY text appears, the result is invalid. Prioritize removing/avoiding text over all other style cues."
    : "";
  const playfulBrandModeLine =
    params.brandMode === "brand" && styleFamily && PLAYFUL_STYLE_FAMILY_KEYS.has(styleFamily.key)
      ? "If brand mode, express playfulness via shapes/composition/texture only; DO NOT introduce forbidden hues."
      : "";
  const motifFocus = safeArrayOfStrings(params.directionSpec?.motifFocus, []).slice(0, 3);
  const bibleBriefMotifSignals =
    promptProfile.includeFlags.includeBibleBrief && params.bibleCreativeBrief
      ? [
          ...params.bibleCreativeBrief.themes,
          ...params.bibleCreativeBrief.motifs,
          ...params.bibleCreativeBrief.markIdeas
        ]
      : [];
  const symbolDirectives = buildSymbolDirectives([...motifFocus, ...bibleBriefMotifSignals], 8);
  const symbolDirectiveLine =
    symbolDirectives.length > 0
      ? `Symbol directives (visual only): ${symbolDirectives.join(", ")}.`
      : "Symbol directives (visual only): radiant light burst, vine branch silhouette, circular stone form.";
  const profileHardRuleLines = promptProfile.hardRules
    .map((line) => {
      if (!isRound1ReferenceFirst) {
        return line;
      }
      if (!line.includes("motifFocus")) {
        return line;
      }
      return symbolDirectives.length > 0
        ? `Include a clear focal motif tied to symbol directives (${symbolDirectives.slice(0, 3).join(", ")}).`
        : "Include a clear focal motif tied to symbol directives.";
    })
    .filter(Boolean);
  const profileSoftGuidanceLines = promptProfile.softGuidance
    .map((line) => {
      if (!line.includes("variation template")) {
        return line;
      }
      if (!variationTemplate) {
        return "";
      }
      return buildVariationTemplateCompositionGoalInstruction({
        variationTemplate,
        target: "background"
      });
    })
    .filter(Boolean);
  const motifScopeLine = params.directionSpec?.motifScope
    ? `Motif scope: ${params.directionSpec.motifScope}.`
    : "";
  const motifScopeRuleLine =
    params.directionSpec?.motifScope === "whole_book"
      ? "MOTIF SCOPE RULE: If this is a whole-book series, use book-wide themes as symbols. Do NOT pick a single story scene as the main symbol unless notes request it."
      : "";
  const titleStageInstructions =
    promptProfile.includeFlags.includeTitleStage && params.directionSpec?.wantsTitleStage === true
      ? buildTitleStageInstructions({
          format: params.shape,
          placementHint: resolveSafeAreaAnchor(params.directionSpec),
          mode: params.brandMode || "fresh",
          directionSpec: params.directionSpec
        })
      : "";
  const shapeCompositionHintLine = isRound1ReferenceFirst
    ? ""
    : shapeCompositionHint({
        shape: params.shape,
        directionSpec: params.directionSpec,
        variationTemplate
      });
  const lockupSafeAreaInstructionsLine = isRound1ReferenceFirst ? "" : buildLockupSafeAreaInstructions(params.directionSpec);
  const lockupSafeAreaDetailLine = isRound1ReferenceFirst
    ? ""
    : "Avoid busy details in the lockup safe area; keep that region low-detail and low-contrast.";

  return [
    params.brandPaletteHardConstraint || "",
    ...profileHardRuleLines,
    hardStyleConstraintLine,
    bucketRulesLine,
    hardToneConstraintLine,
    toneRulesLine,
    hardMediumConstraintLine,
    mediumRulesLine,
    styleFamilyBackgroundRulesLine,
    referenceAnchorContextLine,
    referenceAnchorDirectiveLine,
    referenceTypographyStageLine,
    referenceAnchorPriorityLine,
    referenceSecondaryGuardrailLine,
    ...profileSoftGuidanceLines,
    originalityRuleLine,
    motifRecompositionLine,
    variationTemplateLine,
    titleIntegrationModeLine,
    titleIntegrationAuthorityLine,
    titleIntegrationQualityLine,
    defaultBiasGuardLine,
    styleAuthorityOverrideLine,
    backgroundTextFreeRuleLine,
    ignoreTypographyRefLine,
    explorationTextInvalidLine,
    buildBackgroundPrompt(
      {
        ...params.brief,
        // Background generation must stay text-free; do not expose literal series title/subtitle in this stage prompt.
        title: "",
        subtitle: "",
        scripture: ""
      },
      params.styleFamily
    ),
    directionHint,
    playfulBrandModeLine,
    symbolDirectiveLine,
    refinementMotifEmphasisLine,
    SYMBOL_ONLY_TEXT_BAN_DIRECTIVE,
    motifScopeLine,
    motifScopeRuleLine,
    "Avoid generic clipart-style religious icons; keep motifs abstract, compositional, and material-driven.",
    params.seriesPreferenceGuidance || "",
    shapeCompositionHintLine,
    "Incorporate 1-2 motifs subtly and symbolically; avoid literal portraits or face-centric depictions.",
    lockupSafeAreaInstructionsLine,
    titleStageInstructions,
    lockupSafeAreaDetailLine,
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
  aiRunHandle: GraphicsBackgroundAiRunHandle;
  promptVersion?: string;
  runImageGeneration?: ConcurrencyLimiter;
  imageDebugMeta?: {
    rateLimitWaitMs?: number;
  };
  registerImageCall?: (params: { stage: ImageCallStage; aspect: ImageCallAspect; retry: boolean }) => boolean;
  retryCall?: boolean;
  disablePromptOnlyFallbackForRateLimit?: boolean;
  disable429Retry?: boolean;
  assertActive?: () => Promise<void> | void;
  // Flux prompt context (threaded to runGraphicsBackgroundImageGeneration).
  fluxBrief?: { title: string; seriesDescription?: string; scripture?: string | null };
  fluxBibleCreativeBrief?: { themes: string[]; motifs: string[]; markIdeas: string[] } | null;
  fluxMotifFocus?: string[];
  fluxStyleFamily?: { name: string };
  fluxTone?: string;
  fluxDirectionSpec?: { lanePrompt?: string };
  // Recovery/retry boost flags — threaded into Flux prompt builder.
  fluxBoostTone?: boolean;
  fluxBoostMotif?: boolean;
  fluxBoostNoText?: boolean;
}): Promise<{ backgroundPng: Buffer; aiTrace: GraphicsBackgroundAiAttemptTrace }> {
  const runImageGeneration = params.runImageGeneration || passthroughConcurrencyLimiter;
  const aspect = aspectFromShape(params.shape);
  let promptOnlyRetry = Boolean(params.retryCall);
  const assertActive = async () => {
    await params.assertActive?.();
  };
  const trackCall = (retry: boolean) => {
    if (!params.registerImageCall) {
      return;
    }
    const allowed = params.registerImageCall({
      stage: "background",
      aspect,
      retry
    });
    if (allowed === false) {
      throw new Round1ImageCallCapReachedError();
    }
  };

  await assertActive();
  if (params.referenceDataUrls.length > 0) {
    try {
      trackCall(Boolean(params.retryCall));
      return await runImageGeneration(async () => {
        await assertActive();
        const result = await runGraphicsBackgroundImageGeneration({
          runHandle: params.aiRunHandle,
          prompt: params.prompt,
          promptVersion: params.promptVersion ?? GRAPHICS_BACKGROUND_PROMPT_VERSION,
          shape: params.shape,
          references: params.referenceDataUrls.map((dataUrl) => ({ dataUrl })),
          disable429Retry: params.disable429Retry,
          assertActive: params.assertActive,
          meta: params.imageDebugMeta
            ? {
                debug: params.imageDebugMeta
              }
            : undefined,
          brief: params.fluxBrief,
          bibleCreativeBrief: params.fluxBibleCreativeBrief,
          motifFocus: params.fluxMotifFocus,
          styleFamily: params.fluxStyleFamily,
          tone: params.fluxTone,
          directionSpec: params.fluxDirectionSpec,
          boostTone: params.fluxBoostTone,
          boostMotif: params.fluxBoostMotif,
          boostNoText: params.fluxBoostNoText
        });

        return {
          backgroundPng: result.imagePng,
          aiTrace: result.aiTrace
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown reference-guided generation error";
      if (
        isProviderFailureReason(readProviderFailureReasonFromError(error)) ||
        isRound1ImageCallCapReachedError(error)
      ) {
        throw error;
      }
      await assertActive();
      promptOnlyRetry = true;
      console.warn(`Reference-guided generation failed for ${params.shape}; retrying prompt-only. ${message}`);
    }
  }

  await assertActive();
  trackCall(promptOnlyRetry);
  return runImageGeneration(async () => {
    await assertActive();
    const result = await runGraphicsBackgroundImageGeneration({
      runHandle: params.aiRunHandle,
      prompt: params.prompt,
      promptVersion: params.promptVersion ?? GRAPHICS_BACKGROUND_PROMPT_VERSION,
      shape: params.shape,
      disable429Retry: params.disable429Retry,
      assertActive: params.assertActive,
      meta: params.imageDebugMeta
        ? {
            debug: params.imageDebugMeta
          }
        : undefined,
      brief: params.fluxBrief,
      bibleCreativeBrief: params.fluxBibleCreativeBrief,
      motifFocus: params.fluxMotifFocus,
      styleFamily: params.fluxStyleFamily,
      tone: params.fluxTone,
      directionSpec: params.fluxDirectionSpec,
      boostTone: params.fluxBoostTone,
      boostMotif: params.fluxBoostMotif,
      boostNoText: params.fluxBoostNoText
    });

    return {
      backgroundPng: result.imagePng,
      aiTrace: result.aiTrace
    };
  });
}

const NO_TEXT_RETRY_BOOSTS = [
  "Hard requirement: absolutely no letterforms. If any characters appear, regenerate a fully abstract scene.",
  "CRITICAL NO-TEXT RETRY: zero readable text, zero glyphs, zero typographic marks. Produce pure image textures and shapes only.",
  "Remove ALL letterforms; replace with texture."
] as const;
const BACKGROUND_ELIGIBILITY_RETRY_BOOST = "Remove ALL letterforms; replace with texture.";
const BACKGROUND_RECOVERY_SAME_DIRECTION_BOOST =
  "BACKGROUND RECOVERY: stay in the same direction, same style family, same motif scope, and same overall concept. Improve only the background execution.";
const BACKGROUND_RECOVERY_CANONICAL_BOOST =
  "BACKGROUND RECOVERY: return a fully original, canonical background only. No placeholder cues, no provisional scaffolds, no fallback-like layout artifacts.";
const BACKGROUND_RECOVERY_SCAFFOLD_BOOST =
  "BACKGROUND RECOVERY: remove frames, borders, split poster panels, ruled layout cues, detached stage blocks, and obvious wireframe structure. Use organic or material-led structure only.";
const BACKGROUND_RECOVERY_MOTIF_BOOST =
  "BACKGROUND RECOVERY: keep the same motif intent, but make one symbolic focal motif clearly present and visually meaningful. Avoid empty haze, low-detail filler, and blank texture fields.";
const BACKGROUND_RECOVERY_TONE_BOOST_PREFIX =
  "BACKGROUND RECOVERY: keep the same direction, but correct tonal distribution to satisfy the required tone target.";
const TEXT_ARTIFACT_RETRY_OVERRIDE =
  "TEXT REMOVAL RETRY OVERRIDE: remove all typography artifacts; regenerate as pure background only; no letters/words at all.";

async function generateValidatedBackgroundPng(params: {
  brief: TemplateBrief;
  styleFamily: StyleFamily;
  shape: PreviewShape;
  generationId: string;
  directionSpec?: PlannedDirectionSpec | null;
  designSpec?: DesignSpec | null;
  brandMode?: ProjectBrandMode;
  explorationMode?: boolean;
  seriesPreferenceGuidance?: string;
  bibleCreativeBrief?: BibleCreativeBrief | null;
  referenceDataUrls: string[];
  hardFailTextTokens?: string[];
  focalPoint?: FocalPoint;
  originalityBoost?: string;
  brandPaletteHardConstraint?: string;
  paletteComplianceBoost?: string;
  toneComplianceBoost?: string;
  textArtifactRetryBoost?: string;
  aiRunHandle: GraphicsBackgroundAiRunHandle;
  promptVersion?: string;
  runImageGeneration?: ConcurrencyLimiter;
  maxTextRetries?: number;
  imageDebugMeta?: {
    rateLimitWaitMs?: number;
  };
  registerImageCall?: (params: { stage: ImageCallStage; aspect: ImageCallAspect; retry: boolean }) => boolean;
  isRetryGeneration?: boolean;
  disablePromptOnlyFallbackForRateLimit?: boolean;
  disable429Retry?: boolean;
  assertActive?: () => Promise<void> | void;
  /** Recovery/retry boost flags — threaded directly into the Flux prompt. */
  fluxBoostTone?: boolean;
  fluxBoostMotif?: boolean;
  fluxBoostNoText?: boolean;
}): Promise<{
  backgroundPng: Buffer;
  prompt: string;
  textRetryCount: number;
  textCheckPassed: boolean;
  aiTrace: GraphicsBackgroundAiAttemptTrace;
}> {
  const maxTextRetries = Math.max(0, Math.min(params.maxTextRetries ?? NO_TEXT_RETRY_BOOSTS.length, NO_TEXT_RETRY_BOOSTS.length));
  let lastPrompt = "";
  let lastBackgroundPng: Buffer | null = null;
  let lastAiTrace: GraphicsBackgroundAiAttemptTrace | null = null;

  try {
    for (let attempt = 0; attempt <= maxTextRetries; attempt += 1) {
      await params.assertActive?.();
      const noTextBoost = attempt === 0 ? undefined : NO_TEXT_RETRY_BOOSTS[Math.min(attempt - 1, NO_TEXT_RETRY_BOOSTS.length - 1)];
      const prompt = buildTemplateBackgroundPrompt({
        brief: params.brief,
        styleFamily: params.styleFamily,
        shape: params.shape,
        generationId: params.generationId,
        directionSpec: params.directionSpec,
        designSpec: params.designSpec,
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

      const fluxStyleFamilyKey = params.directionSpec?.styleFamily;
      const fluxStyleFamilyName = fluxStyleFamilyKey
        ? STYLE_FAMILY_BANK[fluxStyleFamilyKey].name
        : undefined;
      const backgroundSource = await generateCleanMinimalBackgroundPng({
        prompt,
        shape: params.shape,
        referenceDataUrls: params.referenceDataUrls,
        aiRunHandle: params.aiRunHandle,
        promptVersion: params.promptVersion ?? GRAPHICS_BACKGROUND_PROMPT_VERSION,
        runImageGeneration: params.runImageGeneration,
        imageDebugMeta: params.imageDebugMeta,
        registerImageCall: params.registerImageCall,
        retryCall: params.isRetryGeneration === true || attempt > 0,
        disablePromptOnlyFallbackForRateLimit: params.disablePromptOnlyFallbackForRateLimit,
        disable429Retry: params.disable429Retry,
        assertActive: params.assertActive,
        fluxBrief: { title: params.brief.title, scripture: params.brief.scripture },
        fluxBibleCreativeBrief: params.bibleCreativeBrief ?? undefined,
        fluxMotifFocus: params.directionSpec?.motifFocus,
        fluxStyleFamily: fluxStyleFamilyName ? { name: fluxStyleFamilyName } : undefined,
        fluxTone: params.directionSpec?.styleTone,
        fluxDirectionSpec: params.directionSpec ? { lanePrompt: params.directionSpec.lanePrompt } : undefined,
        // For text retries (attempt > 0), activate the no-text boost; otherwise thread caller-provided flags.
        fluxBoostTone: params.fluxBoostTone,
        fluxBoostMotif: params.fluxBoostMotif,
        fluxBoostNoText: params.fluxBoostNoText || attempt > 0
      });
      await params.assertActive?.();
      const backgroundPng = await normalizePngToShape(backgroundSource.backgroundPng, params.shape, params.focalPoint);
      const hasText = await imageHasReadableText(backgroundPng, {
        hardFailTokens: params.hardFailTextTokens
      });
      if (!hasText) {
        await params.assertActive?.();
        return {
          backgroundPng,
          prompt,
          textRetryCount: attempt,
          textCheckPassed: true,
          aiTrace: backgroundSource.aiTrace
        };
      }

      lastPrompt = prompt;
      lastBackgroundPng = backgroundPng;
      lastAiTrace = backgroundSource.aiTrace;
    }

    await params.assertActive?.();
    return {
      backgroundPng: lastBackgroundPng as Buffer,
      prompt: lastPrompt,
      textRetryCount: maxTextRetries,
      textCheckPassed: false,
      aiTrace: lastAiTrace as GraphicsBackgroundAiAttemptTrace
    };
  } catch (error) {
    try {
      await finalizeGraphicsBackgroundAiRun({
        runHandle: params.aiRunHandle,
        status: "FAILED",
        error,
        metadataJson: {
          promptVersion: params.promptVersion ?? GRAPHICS_BACKGROUND_PROMPT_VERSION,
          generationId: params.generationId,
          ...buildBackgroundAiTraceMetadata("last", lastAiTrace)
        }
      });
    } catch (finalizeError) {
      const finalizeMessage = finalizeError instanceof Error ? finalizeError.message : "Unknown ai harness failure finalization error";
      console.warn(`[ai-harness-run] generation=${params.generationId} status=failed error=${finalizeMessage}`);
    }

    throw error;
  }
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

async function renderCompositedPreviewPng(
  designDoc: DesignDoc,
  options: {
    renderDebugGuides?: boolean;
  } = {}
): Promise<Buffer> {
  const renderDebugGuides = options.renderDebugGuides ?? false;
  void renderDebugGuides;
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

async function renderBackgroundOnlyPreviewPng(
  designDoc: DesignDoc,
  options: {
    renderDebugGuides?: boolean;
  } = {}
): Promise<Buffer> {
  const renderDebugGuides = options.renderDebugGuides ?? false;
  void renderDebugGuides;
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

function outputAspectForShape(shape: PreviewShape): keyof AspectAssetStatusByOutputAspect {
  if (shape === "wide") {
    return "widescreen";
  }
  if (shape === "square") {
    return "square";
  }
  return "vertical";
}

async function evaluateAspectAssetsForCompletion(params: {
  pathsByShape: Record<PreviewShape, string | null>;
}): Promise<AspectAssetStatusByOutputAspect> {
  const normalizedByShape = Object.fromEntries(
    PREVIEW_SHAPES.map((shape) => [shape, normalizeAssetPathForCompletenessCheck(params.pathsByShape[shape])])
  ) as Record<PreviewShape, string | null>;
  const duplicatePathCount = new Map<string, number>();
  for (const shape of PREVIEW_SHAPES) {
    const pathValue = normalizedByShape[shape];
    if (!pathValue) {
      continue;
    }
    const normalized = pathValue.replace(/^\/+/, "").toLowerCase();
    duplicatePathCount.set(normalized, (duplicatePathCount.get(normalized) || 0) + 1);
  }

  const classify = async (shape: PreviewShape): Promise<AspectAssetStatus> => {
    const pathValue = normalizedByShape[shape];
    if (!pathValue) {
      return "missing";
    }
    if (ASPECT_ASSET_PLACEHOLDER_PATH_PATTERN.test(pathValue)) {
      return "placeholder";
    }
    const normalizedPath = pathValue.replace(/^\/+/, "").toLowerCase();
    if ((duplicatePathCount.get(normalizedPath) || 0) > 1) {
      return "placeholder";
    }

    if (/^https?:\/\//i.test(pathValue) || /^data:/i.test(pathValue)) {
      return "ok";
    }

    const localBuffer = await readAssetBufferFromPublicPath(pathValue);
    if (!localBuffer) {
      return "missing";
    }
    if (localBuffer.byteLength < 1024) {
      return "placeholder";
    }

    try {
      const metadata = await sharp(localBuffer, { failOn: "none" }).metadata();
      const expected = PREVIEW_DIMENSIONS[shape];
      const width = Math.round(metadata.width || 0);
      const height = Math.round(metadata.height || 0);
      if (width <= 0 || height <= 0) {
        return "placeholder";
      }
      if (Math.abs(width - expected.width) > 1 || Math.abs(height - expected.height) > 1) {
        return "placeholder";
      }
      return "ok";
    } catch {
      return "placeholder";
    }
  };

  const statuses = await Promise.all(PREVIEW_SHAPES.map((shape) => classify(shape)));
  const byOutputAspect: AspectAssetStatusByOutputAspect = {
    widescreen: "missing",
    square: "missing",
    vertical: "missing"
  };
  for (const [index, shape] of PREVIEW_SHAPES.entries()) {
    byOutputAspect[outputAspectForShape(shape)] = statuses[index];
  }

  return byOutputAspect;
}

function formatCanonicalizationStatusReason(shape: PreviewShape, status: AspectAssetStatus, attemptLabel: string): string {
  const shapeLabel = shape === "wide" ? "wide" : shape;
  if (status === "missing") {
    return `${shapeLabel} canonical asset missing after ${attemptLabel}`;
  }
  if (status === "placeholder") {
    return `${shapeLabel} canonical asset was placeholder-like after ${attemptLabel}`;
  }
  return `${shapeLabel} canonical asset status=${status} after ${attemptLabel}`;
}

async function ensureCanonicalFinalistOutputs(params: {
  generationId: string;
  optionIndex: number;
  optionStyleFamily: StyleFamily;
  templateBrief: TemplateBrief;
  content: {
    title: string;
    subtitle: string;
  };
  lockupRecipe: LockupRecipe;
  lockupPresetId?: string | null;
  fontSeed: string;
  lockupIntegrationMode: LockupIntegrationMode;
  directionSpec: PlannedDirectionSpec | null;
  masterBackgroundPng: Buffer;
  lockupPng: Buffer;
  resolvedLockupPalette: ResolvedLockupPalette;
}): Promise<FinalistCanonicalizationResult> {
  const createFallbackDesignDoc = (shape: PreviewShape): DesignDoc =>
    renderTemplate(params.optionStyleFamily, params.templateBrief, params.optionIndex, shape, {
      backgroundImagePath: null,
      textPalette: DEFAULT_FALLBACK_TEXT_PALETTE
    });

  const byShape: Record<PreviewShape, FinalistCanonicalizationShapePaths> = {
    square: {
      backgroundPath: null,
      finalPath: null,
      designDoc: createFallbackDesignDoc("square")
    },
    wide: {
      backgroundPath: null,
      finalPath: null,
      designDoc: createFallbackDesignDoc("wide")
    },
    tall: {
      backgroundPath: null,
      finalPath: null,
      designDoc: createFallbackDesignDoc("tall")
    }
  };
  const aspectRecoveryAttemptsByShape: Record<PreviewShape, number> = {
    square: 0,
    wide: 0,
    tall: 0
  };
  const aspectRecoveryReasonsByShape: Record<PreviewShape, string[]> = {
    square: [],
    wide: [],
    tall: []
  };

  const renderShape = async (shape: PreviewShape, recoveryAttempt: number): Promise<void> => {
    const dimensions = PREVIEW_DIMENSIONS[shape];
    const backgroundPng =
      shape === OPTION_MASTER_BACKGROUND_SHAPE
        ? params.masterBackgroundPng
        : await normalizePngToShape(params.masterBackgroundPng, shape, resolveRecipeFocalPoint(params.lockupRecipe, shape));
    const layout = computeCleanMinimalLayout({
      width: dimensions.width,
      height: dimensions.height,
      content: params.content,
      lockupRecipe: params.lockupRecipe,
      lockupPresetId: params.lockupPresetId,
      styleFamily: params.optionStyleFamily,
      fontSeed: params.fontSeed
    });
    const textPalette = await chooseTextPaletteForBackground({
      backgroundPng,
      sampleRegion: layout.textRegion,
      width: dimensions.width,
      height: dimensions.height,
      resolvedPalette: params.resolvedLockupPalette
    });
    const titleBlock = layout.blocks.find((block) => block.key === "title");
    const shapeSafeBox = resolveTitleSafeBoxForDirection(shape, params.directionSpec);
    const selectedVariationTemplate = resolveVariationTemplateFromDirectionSpec(params.directionSpec);
    const templateAlign =
      !selectedVariationTemplate
        ? null
        : selectedVariationTemplate.typeRegion === "right"
          ? "right"
          : selectedVariationTemplate.typeRegion === "center" || selectedVariationTemplate.overlayAnchor === "center"
            ? "center"
            : "left";
    const finalPng = await composeLockupOnBackground({
      backgroundPng,
      lockupPng: params.lockupPng,
      shape,
      width: dimensions.width,
      height: dimensions.height,
      align: templateAlign || titleBlock?.align || "left",
      integrationMode: params.lockupIntegrationMode,
      safeRegionOverride: shapeSafeBox,
      renderDebugGuides: false
    });
    const recoverySuffix = recoveryAttempt > 0 ? `-recovery-${recoveryAttempt}` : "";
    const backgroundPath = await writeGenerationPreviewFiles({
      fileName: `${params.generationId}-${shape}-bg${recoverySuffix}.png`,
      png: backgroundPng
    });
    const finalPath = await writeGenerationPreviewFiles({
      fileName: `${params.generationId}-${shape}${recoverySuffix}.png`,
      png: finalPng
    });

    byShape[shape] = {
      backgroundPath,
      finalPath,
      designDoc: renderTemplate(params.optionStyleFamily, params.templateBrief, params.optionIndex, shape, {
        backgroundImagePath: backgroundPath,
        textPalette
      })
    };
  };

  const renderShapeWithCapture = async (shape: PreviewShape, recoveryAttempt: number): Promise<void> => {
    try {
      await renderShape(shape, recoveryAttempt);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown canonicalization error";
      const attemptLabel = recoveryAttempt > 0 ? `recovery ${recoveryAttempt}` : "initial render";
      aspectRecoveryReasonsByShape[shape].push(`${shape} canonicalization ${attemptLabel} failed: ${message}`);
    }
  };

  await Promise.all(PREVIEW_SHAPES.map((shape) => renderShapeWithCapture(shape, 0)));

  let aspectAssets = await evaluateAspectAssetsForCompletion({
    pathsByShape: {
      square: byShape.square.finalPath,
      wide: byShape.wide.finalPath,
      tall: byShape.tall.finalPath
    }
  });

  for (const shape of PREVIEW_SHAPES) {
    let status = aspectAssets[outputAspectForShape(shape)];
    if (status === "ok") {
      continue;
    }

    aspectRecoveryReasonsByShape[shape].push(formatCanonicalizationStatusReason(shape, status, "initial render"));

    for (let recoveryAttempt = 1; recoveryAttempt <= FINALIST_ASPECT_RECOVERY_LIMIT; recoveryAttempt += 1) {
      aspectRecoveryAttemptsByShape[shape] = recoveryAttempt;
      await renderShapeWithCapture(shape, recoveryAttempt);
      aspectAssets = await evaluateAspectAssetsForCompletion({
        pathsByShape: {
          square: byShape.square.finalPath,
          wide: byShape.wide.finalPath,
          tall: byShape.tall.finalPath
        }
      });
      status = aspectAssets[outputAspectForShape(shape)];
      if (status === "ok") {
        break;
      }
      aspectRecoveryReasonsByShape[shape].push(formatCanonicalizationStatusReason(shape, status, `recovery ${recoveryAttempt}`));
    }
  }

  const canonicalAssetPathsByShape: Record<PreviewShape, string | null> = {
    square: byShape.square.finalPath,
    wide: byShape.wide.finalPath,
    tall: byShape.tall.finalPath
  };
  const canonicalizationFailureReasons = PREVIEW_SHAPES.flatMap((shape) => {
    const status = aspectAssets[outputAspectForShape(shape)];
    if (status === "ok") {
      return [];
    }

    return [
      `${shape} canonicalization failed after ${aspectRecoveryAttemptsByShape[shape]} recovery attempt(s): ${status}`
    ];
  });
  const finalistCanonicalizationSucceeded = PREVIEW_SHAPES.every(
    (shape) => aspectAssets[outputAspectForShape(shape)] === "ok"
  );

  return {
    byShape,
    aspectAssets,
    completionEligible: finalistCanonicalizationSucceeded,
    finalistCanonicalizationAttempted: true,
    finalistCanonicalizationSucceeded,
    aspectRecoveryAttemptsByShape,
    aspectRecoveryReasonsByShape,
    canonicalAssetPathsByShape,
    canonicalizationFailureReasons
  };
}

type PersistedGenerationTruthRow = {
  id: string;
  status: string;
  output: Prisma.JsonValue | null;
  assets: GenerationAssetRecord[];
};

async function loadPersistedGenerationTruthRows(generationIds: string[]): Promise<Map<string, PersistedGenerationTruthRow>> {
  if (generationIds.length === 0) {
    return new Map<string, PersistedGenerationTruthRow>();
  }

  const rows = await prisma.generation.findMany({
    where: {
      id: {
        in: generationIds
      }
    },
    select: {
      id: true,
      status: true,
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

  return new Map(rows.map((row) => [row.id, row] as const));
}

function resolvePersistedGenerationOptionStatusFromRow(row: PersistedGenerationTruthRow): GenerationOptionStatus {
  return resolveGenerationOptionStatus({
    output: row.output,
    dbStatus: row.status,
    assets: row.assets
  });
}

async function readPersistedGenerationOptionStatus(generationId: string): Promise<GenerationOptionStatus> {
  const persistedRows = await loadPersistedGenerationTruthRows([generationId]);
  const row = persistedRows.get(generationId);
  return row ? resolvePersistedGenerationOptionStatusFromRow(row) : "FAILED_GENERATION";
}

function readClaimableGenerationOutput(
  output: Prisma.JsonValue | null,
  fallbackOutput: GenerationOutputPayload
): GenerationOutputPayload {
  return output && typeof output === "object" && !Array.isArray(output) ? (output as GenerationOutputPayload) : fallbackOutput;
}

async function claimPlannedGenerationAttempts(params: {
  plannedGenerations: PlannedGeneration[];
  mode: "initial" | "retry";
}): Promise<ClaimedPlannedGeneration[]> {
  if (params.plannedGenerations.length === 0) {
    return [];
  }
  void params.mode;

  return prisma.$transaction(async (tx) => {
    const persistedRows = await tx.generation.findMany({
      where: {
        id: {
          in: params.plannedGenerations.map((generation) => generation.id)
        }
      },
      select: {
        id: true,
        status: true,
        output: true,
        updatedAt: true
      }
    });
    const rowById = new Map(persistedRows.map((row) => [row.id, row] as const));
    const claimed: ClaimedPlannedGeneration[] = [];

    for (const plannedGeneration of params.plannedGenerations) {
      const persistedRow = rowById.get(plannedGeneration.id);
      if (!persistedRow) {
        throw new Error(`Generation ${plannedGeneration.id} could not be loaded for claim.`);
      }

      const attemptOwnerBase = {
        token: randomUUID(),
        attemptNumber: resolveNextGenerationAttemptNumber(persistedRow.output)
      };
      const claimedOutput = withClaimedGenerationActiveOutput(
        readClaimableGenerationOutput(persistedRow.output, plannedGeneration.fallbackOutput),
        attemptOwnerBase
      );
      const updateResult = await tx.generation.updateMany({
        where: {
          id: persistedRow.id,
          updatedAt: persistedRow.updatedAt
        },
        data: {
          status: "RUNNING",
          output: claimedOutput as Prisma.InputJsonValue
        }
      });

      if (updateResult.count !== 1) {
        throw new Error(`Generation ${plannedGeneration.id} could not be claimed for active execution.`);
      }

      const claimedRow = await tx.generation.findUnique({
        where: {
          id: persistedRow.id
        },
        select: {
          updatedAt: true
        }
      });

      if (!claimedRow) {
        throw new Error(`Generation ${plannedGeneration.id} disappeared after claim.`);
      }

      claimed.push({
        ...plannedGeneration,
        attemptOwner: {
          ...attemptOwnerBase,
          ownerUpdatedAt: claimedRow.updatedAt
        }
      });
    }

    return claimed;
  });
}

function isTerminalGenerationDbStatus(status: string | null | undefined): status is "COMPLETED" | "FAILED" {
  return status === "COMPLETED" || status === "FAILED";
}

function isGenerationAttemptOwnedBy(
  output: unknown,
  attemptOwner: Pick<GenerationAttemptOwner, "token" | "attemptNumber">
): boolean {
  const execution = readPersistedGenerationExecutionState(output);
  return (
    execution?.phase === "RUNNING" &&
    execution.activeAttemptToken === attemptOwner.token &&
    execution.activeAttemptNumber === attemptOwner.attemptNumber
  );
}

async function persistGenerationSettlement(params: {
  generationId: string;
  status: "COMPLETED" | "FAILED";
  output: GenerationOutputPayload;
  input?: Prisma.InputJsonValue;
  attemptOwner?: GenerationAttemptOwner | null;
  applyAssetChanges?: (tx: Prisma.TransactionClient) => Promise<void>;
}): Promise<boolean> {
  const persistedOutput = withGenerationExecutionStateOutput(params.output, {
    version: 1,
    phase: "SETTLED",
    activeAttemptToken: null,
    activeAttemptNumber: params.attemptOwner?.attemptNumber ?? params.output.meta.execution?.activeAttemptNumber ?? null
  });

  return prisma.$transaction(async (tx) => {
    const currentRow = await tx.generation.findUnique({
      where: {
        id: params.generationId
      },
      select: {
        status: true,
        output: true,
        updatedAt: true
      }
    });

    if (!currentRow) {
      return false;
    }

    if (params.attemptOwner) {
      if (!isGenerationAttemptOwnedBy(currentRow.output, params.attemptOwner)) {
        return false;
      }
    } else if (currentRow.status === "COMPLETED") {
      return false;
    }

    const updateResult = await tx.generation.updateMany({
      where: {
        id: params.generationId,
        updatedAt: currentRow.updatedAt
      },
      data: {
        status: params.status,
        output: persistedOutput as Prisma.InputJsonValue,
        ...(typeof params.input === "undefined"
          ? {}
          : {
              input: params.input
            })
      }
    });

    if (updateResult.count !== 1) {
      return false;
    }

    if (params.applyAssetChanges) {
      await params.applyAssetChanges(tx);
    }

    return true;
  });
}

async function persistMinimalFailedGenerationSettlement(params: {
  generationId: string;
  output: GenerationOutputPayload;
  failureReason: BackgroundAttemptFailureReason;
  providerPreflight?: ImageProviderPreflightResult | null;
  attemptOwner?: GenerationAttemptOwner | null;
  input?: Prisma.InputJsonValue;
  notes: string;
  warningMessages?: Array<string | null | undefined>;
}): Promise<boolean> {
  const existingDebug = params.output.meta.debug;
  const warnings = (params.warningMessages || []).reduce<string[] | undefined>(
    (current, warningMessage) => appendUniqueDebugWarning(current, warningMessage || null),
    existingDebug?.warnings
  );
  const failedOutput: GenerationOutputPayload = {
    ...params.output,
    status: "FAILED_GENERATION",
    notes: params.notes,
    meta: {
      ...params.output.meta,
      debug: mergeGenerationDebugMeta(existingDebug, {
        backgroundSource: existingDebug?.backgroundSource || "fallback",
        lockupSource: existingDebug?.lockupSource || "fallback",
        generationLifecycleState: resolveGenerationLifecycleStateForFailure(params.failureReason),
        backgroundFailureReason: params.failureReason,
        backgroundRecoveryAttempted: existingDebug?.backgroundRecoveryAttempted === true,
        backgroundRecoveryAttempts:
          typeof existingDebug?.backgroundRecoveryAttempts === "number" && Number.isFinite(existingDebug.backgroundRecoveryAttempts)
            ? existingDebug.backgroundRecoveryAttempts
            : 0,
        backgroundRecoveryReasons: existingDebug?.backgroundRecoveryReasons || [],
        backgroundRecoverySucceeded: existingDebug?.backgroundRecoverySucceeded === true,
        backgroundRecoveryFinalReasons: existingDebug?.backgroundRecoveryFinalReasons || [],
        imageProvider: buildImageProviderDebugMeta(params.providerPreflight),
        aspectAssets: existingDebug?.aspectAssets || {
          widescreen: "missing",
          square: "missing",
          vertical: "missing"
        },
        warnings
      })
    }
  };
  const failedValidation = resolveProductionValidOption({
    output: failedOutput,
    dbStatus: "FAILED"
  });
  const persistedFailedOutput: GenerationOutputPayload = {
    ...failedOutput,
    meta: {
      ...failedOutput.meta,
      productionValidation: toPersistedProductionValidationSnapshot(failedValidation)
    }
  };

  return persistGenerationSettlement({
    generationId: params.generationId,
    status: "FAILED",
    output: persistedFailedOutput,
    input: params.input,
    attemptOwner: params.attemptOwner,
    applyAssetChanges: async (tx) => {
      await tx.asset.deleteMany({
        where: {
          generationId: params.generationId,
          slot: {
            in: [...PREVIEW_ASSET_SLOTS_TO_CLEAR]
          }
        }
      });
    }
  });
}

async function ensureClaimedGenerationTerminalResult(params: {
  generationId: string;
  fallbackOutput: GenerationOutputPayload;
  providerPreflight?: ImageProviderPreflightResult | null;
  attemptOwner: GenerationAttemptOwner;
  failureReason: BackgroundAttemptFailureReason;
  input?: Prisma.InputJsonValue;
  provisionalResult?: PlannedGenerationRunResult | null;
  failSafeMessage: string;
}): Promise<PlannedGenerationRunResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const persistedRows = await loadPersistedGenerationTruthRows([params.generationId]);
    const row = persistedRows.get(params.generationId);
    if (!row) {
      break;
    }

    const optionStatus = resolvePersistedGenerationOptionStatusFromRow(row);
    if (isTerminalGenerationDbStatus(row.status) && optionStatus !== "IN_PROGRESS") {
      return {
        generationId: params.generationId,
        optionStatus,
        failureReason: optionStatus === "COMPLETED" ? null : params.failureReason
      };
    }

    if (!isGenerationAttemptOwnedBy(row.output, params.attemptOwner)) {
      return {
        generationId: params.generationId,
        optionStatus,
        failureReason: optionStatus === "COMPLETED" ? null : params.failureReason
      };
    }

    const persisted = await persistMinimalFailedGenerationSettlement({
      generationId: params.generationId,
      output: readClaimableGenerationOutput(row.output, params.fallbackOutput),
      failureReason: params.failureReason,
      providerPreflight: params.providerPreflight,
      attemptOwner: params.attemptOwner,
      input: params.input,
      notes: "terminal_settlement_fail_safe",
      warningMessages: [params.failSafeMessage]
    });

    if (persisted) {
      const settledStatus = await readPersistedGenerationOptionStatus(params.generationId);
      return {
        generationId: params.generationId,
        optionStatus: settledStatus,
        failureReason: settledStatus === "COMPLETED" ? null : params.failureReason
      };
    }
  }

  if (params.provisionalResult) {
    return params.provisionalResult;
  }

  return {
    generationId: params.generationId,
    optionStatus: await readPersistedGenerationOptionStatus(params.generationId),
    failureReason: params.failureReason
  };
}

async function completeGenerationWithFallbackOutput(params: {
  projectId: string;
  generationId: string;
  output: GenerationOutputPayload;
  backgroundValidation?: ProductionBackgroundValidationEvidence | null;
  failureReason?: BackgroundAttemptFailureReason;
  providerPreflight?: ImageProviderPreflightResult | null;
  attemptOwner?: GenerationAttemptOwner | null;
}): Promise<GenerationOptionStatus> {
  const designDocByShape = params.output.designDocByShape;
  const [squarePng, widePng, tallPng, lockupResult] = await Promise.all([
    renderCompositedPreviewPng(designDocByShape.square, {
      renderDebugGuides: false
    }),
    renderCompositedPreviewPng(designDocByShape.wide, {
      renderDebugGuides: false
    }),
    renderCompositedPreviewPng(designDocByShape.tall, {
      renderDebugGuides: false
    }),
    (async () =>
      renderTrimmedLockupPngFromSvg(
        await buildFinalSvg(designDocByShape.wide, {
          includeBackground: false,
          includeImages: false
        })
      ))()
  ]);
  const [squarePath, widePath, tallPath, lockupPath] = await Promise.all([
      writeGenerationPreviewFiles({
        fileName: `${params.generationId}-fallback-square-preview.png`,
        png: squarePng
      }),
      writeGenerationPreviewFiles({
        fileName: `${params.generationId}-fallback-wide-preview.png`,
        png: widePng
      }),
      writeGenerationPreviewFiles({
        fileName: `${params.generationId}-fallback-tall-preview.png`,
        png: tallPng
      }),
      writeGenerationPreviewFiles({
        fileName: `${params.generationId}-fallback-lockup-preview.png`,
        png: lockupResult.png
      })
    ]);
  const fallbackStatus: GenerationOptionStatus = "FALLBACK";
  const outputWithStatus = withOutputStatus(params.output, fallbackStatus);
  const fallbackDebugMeta = mergeGenerationDebugMeta(outputWithStatus.meta.debug, {
    backgroundSource: "fallback",
    lockupSource: "fallback",
    generationLifecycleState: resolveGenerationLifecycleStateForFailure(params.failureReason || null),
    backgroundRecoveryAttempted: outputWithStatus.meta.debug?.backgroundRecoveryAttempted === true,
    backgroundRecoveryAttempts:
      typeof outputWithStatus.meta.debug?.backgroundRecoveryAttempts === "number" &&
      Number.isFinite(outputWithStatus.meta.debug.backgroundRecoveryAttempts)
        ? outputWithStatus.meta.debug.backgroundRecoveryAttempts
        : 0,
    backgroundRecoveryReasons: outputWithStatus.meta.debug?.backgroundRecoveryReasons || [],
    backgroundRecoverySucceeded: outputWithStatus.meta.debug?.backgroundRecoverySucceeded === true,
    backgroundRecoveryFinalReasons: outputWithStatus.meta.debug?.backgroundRecoveryFinalReasons || [],
    aspectAssets: {
      widescreen: "placeholder",
      square: "placeholder",
      vertical: "placeholder"
    },
    imageProvider: buildImageProviderDebugMeta(params.providerPreflight),
    ...(params.failureReason
      ? {
          backgroundFailureReason: params.failureReason
        }
      : {}),
    fallbackPreview: {
      square: squarePath,
      wide: widePath,
      tall: tallPath,
      lockup: lockupPath
    }
  });
  const fallbackOutputWithValidationEvidence: GenerationOutputPayload = {
    ...outputWithStatus,
    meta: {
      ...outputWithStatus.meta,
      productionValidation: {
        version: 1,
        background: {
          ...(params.backgroundValidation || {
            sourceGenerationId: null,
            textFree: null,
            scaffoldFree: null,
            motifPresent: null,
            toneFit: null,
            referenceFit: null
          }),
          source: "fallback",
          sourceGenerationId: params.backgroundValidation?.sourceGenerationId || null
        },
        lockup: {
          source: "fallback",
          sourceGenerationId: null,
          textIntegrity: false,
          fitPass: false,
          insideTitleSafeWithMargin: null,
          notTooSmall: null
        },
        aspects: {
          widescreen: { provenance: "fallback" },
          square: { provenance: "fallback" },
          vertical: { provenance: "fallback" }
        }
      },
      ...(fallbackDebugMeta
        ? {
            debug: fallbackDebugMeta
          }
        : {})
    }
  };
  const fallbackValidation = resolveProductionValidOption({
    output: fallbackOutputWithValidationEvidence,
    dbStatus: "FAILED"
  });
  const persistedFallbackOutput: GenerationOutputPayload = {
    ...fallbackOutputWithValidationEvidence,
    meta: {
      ...fallbackOutputWithValidationEvidence.meta,
      productionValidation: toPersistedProductionValidationSnapshot(fallbackValidation)
    }
  };

  const persisted = await persistGenerationSettlement({
    generationId: params.generationId,
    status: "FAILED",
    output: persistedFallbackOutput,
    attemptOwner: params.attemptOwner,
    applyAssetChanges: async (tx) => {
      await tx.asset.deleteMany({
        where: {
          generationId: params.generationId,
          slot: {
            in: [...PREVIEW_ASSET_SLOTS_TO_CLEAR]
          }
        }
      });
    }
  });

  return persisted ? fallbackStatus : readPersistedGenerationOptionStatus(params.generationId);
}

type PlannedGenerationRunResult = {
  generationId: string;
  optionStatus: GenerationOptionStatus;
  failureReason: BackgroundAttemptFailureReason | null;
};

function readTerminalGenerationOutputStatus(output: Prisma.JsonValue | null): Exclude<GenerationOptionStatus, "IN_PROGRESS"> | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }

  const status = (output as { status?: unknown }).status;
  if (status === "COMPLETED" || status === "FAILED_GENERATION" || status === "FALLBACK") {
    return status;
  }

  return null;
}

async function reconcileRoundOneAuthoritativeSettlement(params: {
  projectId: string;
  lease: Parameters<typeof finalizeRoundOneAuthoritativeSettlement>[0]["lease"];
  plannedGenerations: PlannedGeneration[];
  results: PlannedGenerationRunResult[];
  roundAttemptCount: number;
  roundRequiredCompletedCount: number;
  providerPreflight: ImageProviderPreflightResult;
}): Promise<{
  reconciledGenerationIds: string[];
  abandonedRunIds: string[];
  abandonedAttemptIds: string[];
  finalized: boolean;
  roundOutcome: PersistedRoundOutcomeSummary;
}> {
  const resultByGenerationId = new Map(params.results.map((result) => [result.generationId, result] as const));
  const persistedRows = await prisma.generation.findMany({
    where: {
      id: {
        in: params.plannedGenerations.map((generation) => generation.id)
      }
    },
    select: {
      id: true,
      status: true,
      output: true
    }
  });
  const persistedRowById = new Map(persistedRows.map((row) => [row.id, row] as const));
  const generationTerminalizations: RoundOneGenerationTerminalization[] = [];

  for (const plannedGeneration of params.plannedGenerations) {
    const persistedRow = persistedRowById.get(plannedGeneration.id);
    if (!persistedRow) {
      continue;
    }

    const directOutputStatus = readTerminalGenerationOutputStatus(persistedRow.output);
    const roundResult = resultByGenerationId.get(plannedGeneration.id);
    const desiredOptionStatus =
      roundResult?.optionStatus === "IN_PROGRESS"
        ? directOutputStatus || "FAILED_GENERATION"
        : roundResult?.optionStatus || directOutputStatus || "FAILED_GENERATION";

    if (desiredOptionStatus === "COMPLETED") {
      const completionOutput =
        directOutputStatus === "COMPLETED"
          ? withSettledGenerationExecutionOutput(persistedRow.output)
          : null;
      if (!completionOutput) {
        continue;
      }

      generationTerminalizations.push({
        generationId: plannedGeneration.id,
        status: "COMPLETED",
        output: completionOutput
      });
      continue;
    }

    if (desiredOptionStatus === "FALLBACK") {
      await completeGenerationWithFallbackOutput({
        projectId: params.projectId,
        generationId: plannedGeneration.id,
        output: plannedGeneration.fallbackOutput,
        failureReason: roundResult?.failureReason || "UNKNOWN",
        providerPreflight: params.providerPreflight
      });
      continue;
    }

    const failedOutput =
      directOutputStatus === "FAILED_GENERATION" || directOutputStatus === "FALLBACK"
        ? withSettledGenerationExecutionOutput(persistedRow.output)
        : null;
    if (failedOutput) {
      generationTerminalizations.push({
        generationId: plannedGeneration.id,
        status: "FAILED",
        output: failedOutput,
        clearAssetSlots: PREVIEW_ASSET_SLOTS_TO_CLEAR
      });
      continue;
    }

    await persistMinimalFailedGenerationSettlement({
      generationId: plannedGeneration.id,
      output: plannedGeneration.fallbackOutput,
      failureReason: roundResult?.failureReason || "UNKNOWN",
      providerPreflight: params.providerPreflight,
      input: plannedGeneration.input,
      notes: "round_authoritative_settlement",
      warningMessages: [
        "Round-level settlement finalized an exhausted generation after terminal row convergence failed."
      ]
    });
    const minimalFailureRow = await prisma.generation.findUnique({
      where: {
        id: plannedGeneration.id
      },
      select: {
        output: true
      }
    });
    if (minimalFailureRow?.output) {
      generationTerminalizations.push({
        generationId: plannedGeneration.id,
        status: "FAILED",
        output: withSettledGenerationExecutionOutput(minimalFailureRow.output),
        clearAssetSlots: PREVIEW_ASSET_SLOTS_TO_CLEAR
      });
    }
  }

  const initialRoundOutcome = await persistFinalRoundOutcome({
    generationIds: params.plannedGenerations.map((generation) => generation.id),
    results: params.results,
    roundAttemptCount: params.roundAttemptCount,
    roundRequiredCompletedCount: params.roundRequiredCompletedCount
  });
  const launchTerminalStatus = initialRoundOutcome.roundStatus === "COMPLETED" ? "COMPLETED" : "FAILED";
  const settlement = await finalizeRoundOneAuthoritativeSettlement({
    prisma,
    lease: params.lease,
    generationTerminalizations,
    launchTerminalStatus,
    note: "round_authoritative_settlement",
    staleWorkMessage: "Round 1 authoritative settlement terminalized lingering background work after the launch was exhausted.",
    staleWorkAttemptOutputJson: {
      projectId: params.projectId,
      abandonedReason: "ROUND_TERMINALIZED"
    },
    staleWorkRunMetadataJson: {
      projectId: params.projectId,
      terminalizationReason: "ROUND_TERMINALIZED"
    }
  });
  const roundOutcome = await persistFinalRoundOutcome({
    generationIds: params.plannedGenerations.map((generation) => generation.id),
    results: params.results,
    roundAttemptCount: params.roundAttemptCount,
    roundRequiredCompletedCount: params.roundRequiredCompletedCount
  });

  return {
    reconciledGenerationIds: settlement.reconciledGenerationIds,
    abandonedRunIds: settlement.abandonedRunIds,
    abandonedAttemptIds: settlement.abandonedAttemptIds,
    finalized: settlement.finalized,
    roundOutcome
  };
}

function withRoundDebugStatusOutput(
  output: unknown,
  params: {
    roundHasFallback: boolean;
    roundStatus: GenerationRoundStatus;
    roundCompletedCount: number;
    roundAttemptCount: number;
    roundRequiredCompletedCount: number;
    roundFailureReason: GenerationRoundFailureReason | null;
    roundOperationalFailureReason: ProviderFailureReason | null;
  }
): Prisma.InputJsonValue | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }

  const outputRecord = output as Record<string, unknown>;
  const existingMeta =
    outputRecord.meta && typeof outputRecord.meta === "object" && !Array.isArray(outputRecord.meta)
      ? (outputRecord.meta as Record<string, unknown>)
      : {};
  const existingDebug =
    existingMeta.debug && typeof existingMeta.debug === "object" && !Array.isArray(existingMeta.debug)
      ? (existingMeta.debug as Record<string, unknown>)
      : {};

  return {
    ...outputRecord,
    meta: {
      ...existingMeta,
      debug: {
        ...existingDebug,
        roundHasFallback: params.roundHasFallback,
        roundStatus: params.roundStatus,
        roundCompletedCount: params.roundCompletedCount,
        roundAttemptCount: params.roundAttemptCount,
        roundRequiredCompletedCount: params.roundRequiredCompletedCount,
        roundFailureReason: params.roundFailureReason,
        roundOperationalFailureReason: params.roundOperationalFailureReason
      }
    }
  } as Prisma.InputJsonValue;
}

async function persistRoundDebugStatusForGenerations(params: {
  generationIds: string[];
  roundHasFallback: boolean;
  roundStatus: GenerationRoundStatus;
  roundCompletedCount: number;
  roundAttemptCount: number;
  roundRequiredCompletedCount: number;
  roundFailureReason: GenerationRoundFailureReason | null;
  roundOperationalFailureReason: ProviderFailureReason | null;
}): Promise<void> {
  if (params.generationIds.length === 0) {
    return;
  }

  const persistedRoundRows = await prisma.generation.findMany({
    where: {
      id: {
        in: params.generationIds
      }
    },
    select: {
      id: true,
      output: true
    }
  });
  const roundUpdates: Prisma.PrismaPromise<unknown>[] = [];
  for (const generation of persistedRoundRows) {
    const outputWithRoundMeta = withRoundDebugStatusOutput(generation.output, {
      roundHasFallback: params.roundHasFallback,
      roundStatus: params.roundStatus,
      roundCompletedCount: params.roundCompletedCount,
      roundAttemptCount: params.roundAttemptCount,
      roundRequiredCompletedCount: params.roundRequiredCompletedCount,
      roundFailureReason: params.roundFailureReason,
      roundOperationalFailureReason: params.roundOperationalFailureReason
    });
    if (!outputWithRoundMeta) {
      continue;
    }
    roundUpdates.push(
      prisma.generation.update({
        where: {
          id: generation.id
        },
        data: {
          output: outputWithRoundMeta
        }
      })
    );
  }

  if (roundUpdates.length > 0) {
    await prisma.$transaction(roundUpdates);
  }
}

function pickRoundOperationalFailureReason(
  failureReasons: Array<BackgroundAttemptFailureReason | null | undefined>
): ProviderFailureReason | null {
  if (failureReasons.some((reason) => reason === "PROVIDER_QUOTA_OR_RATE_LIMIT")) {
    return "PROVIDER_QUOTA_OR_RATE_LIMIT";
  }
  if (failureReasons.some((reason) => reason === "PROVIDER_MODEL_UNAVAILABLE")) {
    return "PROVIDER_MODEL_UNAVAILABLE";
  }
  if (failureReasons.some((reason) => reason === "PROVIDER_AUTH_OR_CONFIG_ERROR")) {
    return "PROVIDER_AUTH_OR_CONFIG_ERROR";
  }
  if (failureReasons.some((reason) => reason === "PROVIDER_TRANSIENT_ERROR")) {
    return "PROVIDER_TRANSIENT_ERROR";
  }

  return null;
}

type PersistedRoundOutcomeSummary = {
  completedCount: number;
  roundHasFallback: boolean;
  roundStatus: GenerationRoundStatus;
  roundFailureReason: GenerationRoundFailureReason | null;
  roundOperationalFailureReason: ProviderFailureReason | null;
};

async function persistFinalRoundOutcome(params: {
  generationIds: string[];
  results: PlannedGenerationRunResult[];
  roundAttemptCount: number;
  roundRequiredCompletedCount: number;
}): Promise<PersistedRoundOutcomeSummary> {
  const persistedRows = await loadPersistedGenerationTruthRows(params.generationIds);
  const persistedStatuses = params.generationIds.map((generationId) => {
    const persistedRow = persistedRows.get(generationId);
    return persistedRow ? resolvePersistedGenerationOptionStatusFromRow(persistedRow) : "FAILED_GENERATION";
  });
  const completedCount = persistedStatuses.filter((status) => status === "COMPLETED").length;
  const roundHasFallback = persistedStatuses.some((status) => status === "FALLBACK");
  const hasInProgressRows = persistedStatuses.some((status) => status === "IN_PROGRESS");
  const roundOperationalFailureReason = pickRoundOperationalFailureReason(params.results.map((result) => result.failureReason));
  const roundFailureReason: GenerationRoundFailureReason | null =
    hasInProgressRows
      ? null
      : roundOperationalFailureReason
      ? "ROUND_ABORTED_PROVIDER_FAILURE"
      : completedCount >= params.roundRequiredCompletedCount
        ? null
        : "ROUND_INSUFFICIENT_VALID_OPTIONS";
  const roundStatus: GenerationRoundStatus =
    hasInProgressRows
      ? "RUNNING"
      : completedCount >= params.roundRequiredCompletedCount
      ? "COMPLETED"
      : completedCount > 0
        ? "PARTIAL"
        : "FAILED";

  await persistRoundDebugStatusForGenerations({
    generationIds: params.generationIds,
    roundHasFallback,
    roundStatus,
    roundCompletedCount: completedCount,
    roundAttemptCount: params.roundAttemptCount,
    roundRequiredCompletedCount: params.roundRequiredCompletedCount,
    roundFailureReason,
    roundOperationalFailureReason
  });

  return {
    completedCount,
    roundHasFallback,
    roundStatus,
    roundFailureReason,
    roundOperationalFailureReason
  };
}

async function abortRoundForProviderFailure(params: {
  projectId: string;
  plannedGenerations: PlannedGeneration[];
  providerPreflight: ImageProviderPreflightResult;
}): Promise<PlannedGenerationRunResult[]> {
  const failureReason = params.providerPreflight.failureReason || "PROVIDER_TRANSIENT_ERROR";
  const results = await Promise.all(
    params.plannedGenerations.map(async (plannedGeneration) => {
      const optionStatus = await completeGenerationWithFallbackOutput({
        projectId: params.projectId,
        generationId: plannedGeneration.id,
        output: plannedGeneration.fallbackOutput,
        failureReason,
        providerPreflight: params.providerPreflight
      });

      return {
        generationId: plannedGeneration.id,
        optionStatus,
        failureReason
      } satisfies PlannedGenerationRunResult;
    })
  );

  await persistRoundDebugStatusForGenerations({
    generationIds: params.plannedGenerations.map((generation) => generation.id),
    roundHasFallback: true,
    roundStatus: "FAILED",
    roundCompletedCount: 0,
    roundAttemptCount: 0,
    roundRequiredCompletedCount: ROUND_OPTION_COUNT,
    roundFailureReason: "ROUND_ABORTED_PROVIDER_FAILURE",
    roundOperationalFailureReason: failureReason
  });

  return results;
}

async function createOpenAiPreviewAssetsForPlannedGenerations(params: {
  organizationId: string;
  project: GenerationProjectContext & { id: string };
  plannedGenerations: ClaimedPlannedGeneration[];
  providerPreflight: ImageProviderPreflightResult;
  bibleCreativeBrief?: BibleCreativeBrief | null;
  motifBankContext?: MotifBankContext;
}): Promise<PlannedGenerationRunResult[]> {
  const openAiEnabled = isOpenAiPreviewGenerationEnabled() && Boolean(process.env.OPENAI_API_KEY?.trim());
  try {
    const imageGenerationLimit = createConcurrencyLimiter(ROUND1_IMAGE_GENERATION_MAX_CONCURRENCY);
    const optionGenerationLimit = createConcurrencyLimiter(
      Math.min(ROUND1_OPTION_PARALLEL_CONCURRENCY, Math.max(1, params.plannedGenerations.length))
    );
    const [referenceIndex, curatedReferences] = await Promise.all([loadIndex(), getCuratedReferences()]);
    const referenceIndexById = new Map(referenceIndex.map((reference) => [normalizeReferenceId(reference.id), reference] as const));
    const curatedReferenceById = new Map(curatedReferences.map((reference) => [normalizeReferenceId(reference.id), reference] as const));
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
    const round1SelectedVariationTemplateUsage = new Map<string, number>();
    let round1SelectedDefaultBiasCount = 0;
    const layoutDiversityPenaltyForTemplate = (round: number, templateKey: string | null): number => {
      if (round !== 1 || !templateKey) {
        return 0;
      }
      const repeatCount = round1SelectedVariationTemplateUsage.get(templateKey) || 0;
      let penalty = repeatCount * ROUND1_LAYOUT_TEMPLATE_REPEAT_PENALTY;
      if (isRound1DefaultBiasTemplateKey(templateKey) && round1SelectedDefaultBiasCount > 0) {
        penalty += round1SelectedDefaultBiasCount * ROUND1_LAYOUT_DEFAULT_BIAS_REPEAT_PENALTY;
      }
      return penalty;
    };
    const noteRound1SelectedTemplate = (round: number, templateKey: string | null) => {
      if (round !== 1 || !templateKey) {
        return;
      }
      const current = round1SelectedVariationTemplateUsage.get(templateKey) || 0;
      round1SelectedVariationTemplateUsage.set(templateKey, current + 1);
      if (isRound1DefaultBiasTemplateKey(templateKey)) {
        round1SelectedDefaultBiasCount += 1;
      }
    };
    let round1ImageCallsConsumed = 0;

    const optionResults: PlannedGenerationRunResult[] = await Promise.all(
    params.plannedGenerations.map((plannedGeneration) => optionGenerationLimit(async (): Promise<PlannedGenerationRunResult> => {
      let fallbackOutput = plannedGeneration.fallbackOutput;
      let imageCallCapReached = false;
      let provisionalResult: PlannedGenerationRunResult | null = null;
      let failSafeReason: BackgroundAttemptFailureReason = "UNKNOWN";
      let failSafeMessage = "Generation branch ended without terminal settlement.";
      let failSafeInput: Prisma.InputJsonValue | undefined;

      if (!openAiEnabled) {
        failSafeReason = "PROVIDER_AUTH_OR_CONFIG_ERROR";
        const optionStatus = await completeGenerationWithFallbackOutput({
          projectId: params.project.id,
          generationId: plannedGeneration.id,
          output: fallbackOutput,
          failureReason: "PROVIDER_AUTH_OR_CONFIG_ERROR",
          providerPreflight: params.providerPreflight,
          attemptOwner: plannedGeneration.attemptOwner
        });
        provisionalResult = {
          generationId: plannedGeneration.id,
          optionStatus,
          failureReason: "PROVIDER_AUTH_OR_CONFIG_ERROR"
        };
      } else {
      const inputSeriesDesignNotes = readSeriesPreferencesDesignNotesFromInput(plannedGeneration.input);
      const hasDesignNotes = hasDesignDirection(params.project.designNotes, inputSeriesDesignNotes);
      const shouldRunExplorationToneCheck = plannedGeneration.round === 1 && !hasDesignNotes;
      const claimedGenerationExecutionTimeoutMs = resolveClaimedGenerationExecutionTimeoutMs({
        round: plannedGeneration.round,
        backgroundExploration: shouldRunExplorationToneCheck
      });
      const executionLease = createClaimedGenerationExecutionTimeoutLease({
        generationId: plannedGeneration.id,
        timeoutMs: claimedGenerationExecutionTimeoutMs
      });
      const assertClaimedGenerationExecutionActive = createClaimedGenerationExecutionActiveAssertion({
        generationId: plannedGeneration.id,
        attemptOwner: plannedGeneration.attemptOwner,
        executionLease
      });
      try {
      let executionTimeoutId: ReturnType<typeof setTimeout> | null = null;
      try {
      await Promise.race([
      (async (): Promise<void> => {
      const palette = params.project.brandKit ? parsePaletteJson(params.project.brandKit.paletteJson) : [];
      const feedbackControls = readFeedbackGenerationControls(plannedGeneration.input);
      const seriesPreferenceGuidance = buildSeriesPreferenceGuidance(params.project);
      const designBrief = readDesignBriefFromInput(plannedGeneration.input);
      if (!designBrief) {
        throw new Error("Generation input is missing a valid designBrief payload.");
      }
      const runSeed = readRunSeedFromInput(plannedGeneration.input) || plannedGeneration.id;
      const directionSpec = readDirectionSpecFromInput(plannedGeneration.input, plannedGeneration.optionIndex);
      const inputRefinementLineage = readRefinementLineageFromInput(plannedGeneration.input);
      const shouldUseCheapRound1Mode = DEV_CHEAP_MODE && plannedGeneration.round === 1;
      const shouldUseRound1NoNotesThrottle = plannedGeneration.round === 1 && !hasDesignNotes;
      const round1LiveWorkBudget = resolveRound1LiveWorkBudget({
        round: plannedGeneration.round,
        hasDesignNotes,
        devCheapMode: DEV_CHEAP_MODE,
        explorationMaxTextRetriesPerBackground: NO_TEXT_RETRY_BOOSTS.length
      });
      const shouldDisableToneComplianceRetry = shouldUseRound1NoNotesThrottle;
      const backgroundCandidateCount = round1LiveWorkBudget.backgroundCandidateCount;
      const lockupCandidateCount = round1LiveWorkBudget.lockupCandidateCount;
      const maxTextRetriesPerBackground = round1LiveWorkBudget.maxTextRetriesPerBackground;
      const shouldDisablePromptFallbackOnRateLimit = shouldUseRound1NoNotesThrottle;
      const shouldDisable429Retry = shouldUseRound1NoNotesThrottle;
      const shouldEnforceRound1ImageCallCap = shouldUseCheapRound1Mode;
      const imageCallSummary = createImageCallDebugSummary();
      const imageRateLimitDebugMeta: { rateLimitWaitMs?: number } = {};
      const registerImageCall = (params: { stage: ImageCallStage; aspect: ImageCallAspect; retry: boolean }): boolean => {
        if (shouldEnforceRound1ImageCallCap && round1ImageCallsConsumed >= ROUND1_CHEAP_MODE_MAX_IMAGE_CALLS) {
          imageCallCapReached = true;
          return false;
        }
        if (shouldEnforceRound1ImageCallCap) {
          round1ImageCallsConsumed += 1;
        }
        imageCallSummary.total += 1;
        imageCallSummary.byStage[params.stage] += 1;
        imageCallSummary.byAspect[params.aspect] += 1;
        if (params.retry) {
          imageCallSummary.retries += 1;
        }
        return true;
      };
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
      const anchorReferenceId = normalizeReferenceId(directionSpec?.referenceId || "");
      const sampledAnchorReference =
        anchorReferenceId.length > 0
          ? sampledReferences.find((reference) => normalizeReferenceId(reference.id) === anchorReferenceId) || null
          : null;
      const indexedAnchorReference = anchorReferenceId.length > 0 ? referenceIndexById.get(anchorReferenceId) || null : null;
      const curatedAnchorReference = anchorReferenceId.length > 0 ? curatedReferenceById.get(anchorReferenceId) || null : null;
      const anchorReference =
        anchorReferenceId.length > 0
          ? curatedAnchorReference
            ? buildReferenceItemFromCurated({
                curated: curatedAnchorReference,
                fallback: sampledAnchorReference || indexedAnchorReference
              })
            : sampledAnchorReference || indexedAnchorReference
          : null;
      const resolvedReferenceCluster = curatedAnchorReference?.cluster || directionSpec?.referenceCluster || null;
      const resolvedReferenceTier = curatedAnchorReference?.tier || directionSpec?.referenceTier || null;
      const references = anchorReference
        ? dedupeReferencesById([anchorReference, ...sampledReferences]).slice(0, 3)
        : sampledReferences;
      const anchorVisualAnchorSrc = resolveReferenceVisualAnchorSrc({
        reference: anchorReference,
        referenceCluster: resolvedReferenceCluster
      });
      const anchorTypographyAnchorSrc = resolveReferenceTypographyAnchorSrc(anchorReference);
      const backgroundPreferredSourcePathsByReferenceId = new Map<string, ReadonlyArray<string | null | undefined>>();
      if (anchorReferenceId && anchorVisualAnchorSrc) {
        backgroundPreferredSourcePathsByReferenceId.set(anchorReferenceId, [anchorVisualAnchorSrc]);
      }
      const backgroundStyleRefs = await buildReferenceDataUrls(references, {
        preferredSourcePathsByReferenceId: backgroundPreferredSourcePathsByReferenceId
      });
      const lockupStyleRefs = anchorReference
        ? await (async () => {
            const lockupPreferredSourcePathsByReferenceId = new Map<
              string,
              ReadonlyArray<string | null | undefined>
            >();
            if (anchorReferenceId && anchorTypographyAnchorSrc) {
              lockupPreferredSourcePathsByReferenceId.set(anchorReferenceId, [anchorTypographyAnchorSrc]);
            }
            return buildReferenceDataUrls(references, {
              preferredSourcePathsByReferenceId: lockupPreferredSourcePathsByReferenceId
            });
          })()
        : backgroundStyleRefs;
      if (anchorReference) {
        const firstStyleRef = backgroundStyleRefs[0];
        if (!firstStyleRef || normalizeReferenceId(firstStyleRef.referenceId) !== normalizeReferenceId(anchorReference.id)) {
          throw new Error(`Anchor reference ${anchorReference.id} was not resolved as style ref #1.`);
        }
      }
      const anchorBackgroundStyleRef = anchorReference ? backgroundStyleRefs[0] || null : null;
      const anchorLockupStyleRef = anchorReference ? lockupStyleRefs[0] || null : null;
      const referenceAnchorDebug = buildReferenceAnchorDebugMeta({
        referenceId: anchorReference?.id || directionSpec?.referenceId || null,
        referenceCluster: resolvedReferenceCluster,
        referenceTier: resolvedReferenceTier,
        visualAnchorSrc:
          anchorVisualAnchorSrc ||
          normalizeReferencePublicUrl(anchorBackgroundStyleRef?.sourcePath, "style-anchor") ||
          normalizeReferencePublicUrl(anchorBackgroundStyleRef?.sourcePath, "original"),
        typographyAnchorSrc:
          anchorTypographyAnchorSrc ||
          normalizeReferencePublicUrl(anchorLockupStyleRef?.sourcePath, "original") ||
          normalizeReferencePublicUrl(anchorLockupStyleRef?.sourcePath, "style-anchor"),
        optionIndex: plannedGeneration.optionIndex
      });
      const fallbackDebugMeta = mergeReferenceAnchorDebugMeta(fallbackOutput.meta.debug, referenceAnchorDebug);
      if (fallbackDebugMeta) {
        fallbackOutput = {
          ...fallbackOutput,
          meta: {
            ...fallbackOutput.meta,
            debug: fallbackDebugMeta
          }
        };
      }
      const referenceDataUrls = backgroundStyleRefs.map((reference) => reference.dataUrl);
      const lockupStyleMode = resolveLockupStyleMode({
        directionSpec,
        styleFamily: optionStyleFamily,
        lockupPresetId,
        references,
        brandMode: params.project.brandMode,
        typographyDirection: organizationTypographyDirection
      });
      const activeDesignSpec: DesignSpec | null = shouldRunExplorationToneCheck
        ? await generateDesignSpec({
            projectId: params.project.id,
            seriesTitle: params.project.series_title,
            subtitle: params.project.series_subtitle,
            sermonTitle: content.title,
            passageRef: designBrief.passage || params.project.scripture_passages,
            motifScope: directionSpec?.motifScope || motifBankContext.scriptureScope,
            motifFocus: safeArrayOfStrings(directionSpec?.motifFocus, []),
            referenceId: anchorReference?.id || directionSpec?.referenceId || references[0]?.id || "unknown-reference",
            referenceCluster: resolvedReferenceCluster || "other",
            referenceTier: resolvedReferenceTier || "unknown",
            round: plannedGeneration.round,
            optionIndex: plannedGeneration.optionIndex
          })
        : null;
      const hardFailTextTokens = extractReadableHardFailTokens([
        content.title,
        content.subtitle,
        designBrief.passage || params.project.scripture_passages || "",
        ...motifBankContext.bookNames
      ]);
      const plannedLockupLayout = readLockupLayoutFromInput(plannedGeneration.input);
      const lockupLayout = plannedLockupLayout || defaultLockupLayoutForStyleMode(lockupStyleMode);
      let lockupPrompt = buildLockupGenerationPrompt({
        title: content.title,
        subtitle: content.subtitle,
        styleMode: lockupStyleMode,
        lockupLayout,
        explorationMode: shouldRunExplorationToneCheck,
        directionSpec,
        designSpec: activeDesignSpec,
        references,
        bibleCreativeBrief,
        wantsSeriesMark: directionSpec?.wantsSeriesMark || false,
        brandMode: params.project.brandMode,
        typographyDirection: organizationTypographyDirection,
        optionalMarkAccentHexes: palette
      });
      const lockupIntegrationMode = activeDesignSpec
        ? mapDesignSpecModeToLockupIntegrationMode(
            resolveDesignSpecTitleIntegrationMode({
              designSpec: activeDesignSpec,
              directionSpec
            })
          )
        : chooseLockupIntegrationMode(lockupStyleMode);
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
        feedbackControls.regenerateBackground === false &&
        reusableAssets?.backgroundAccepted === true &&
        Boolean(reusableAssets?.masterBackgroundPng);
      let shouldReuseLockup =
        feedbackControls.regenerateLockup === false &&
        reusableAssets?.lockupAccepted === true &&
        Boolean(reusableAssets?.lockupPng);
      const backgroundSourceForSuccess: DebugAssetSource = shouldReuseBackground ? "reused" : "generated";
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
      const generatedLockupRecipeForRender = applyLockupRecipeGuardrails({
        lockupRecipe: sourceLockupRecipe,
        styleMode: lockupStyleMode,
        lockupLayout
      });
      let lockupRecipeForRender = shouldReuseLockup ? sourceLockupRecipe : generatedLockupRecipeForRender;
      const typographicRecipe = lockupTypographicRecipeForArchetype(lockupLayout);
      const titleSafeBoxForDirection = (targetDirectionSpec?: PlannedDirectionSpec | null): TitleSafeBox =>
        resolveTitleSafeBoxForDirection(OPTION_MASTER_BACKGROUND_SHAPE, targetDirectionSpec);
      let rerankMeta: RerankDebugMeta = {};
      let backgroundAttemptDiagnostics: BackgroundAttemptDebug[] = [];
      let lockupReuseValidation: LockupComputationSelection | null = null;
      let lockupReuseBlockedReasons: string[] = [];

      const resolveToneTargetFromDirectionSpec = (targetDirectionSpec?: PlannedDirectionSpec | null) => {
        const styleTone = resolveDirectionStyleFields(targetDirectionSpec).styleTone;
        return shouldCheckToneCompliance(styleTone) ? styleTone : null;
      };

      const renderMasterAttempt = async (attemptParams: {
        directionSpecOverride?: PlannedDirectionSpec | null;
        originalityBoost?: string;
        candidateSuffix?: string;
        /** Flux-specific boost flags — set by recovery/retry callers to strengthen Flux prompt. */
        fluxBoostTone?: boolean;
        fluxBoostMotif?: boolean;
        fluxBoostNoText?: boolean;
      } = {}) => {
        await assertClaimedGenerationExecutionActive();
        const activeDirectionSpec =
          attemptParams.directionSpecOverride === undefined ? backgroundDirectionSpec : attemptParams.directionSpecOverride;
        if (shouldReuseBackground && reusableAssets?.masterBackgroundPng) {
          const backgroundPng = await normalizePngToShape(
            reusableAssets.masterBackgroundPng,
            OPTION_MASTER_BACKGROUND_SHAPE,
            resolveRecipeFocalPoint(lockupRecipeForRender, OPTION_MASTER_BACKGROUND_SHAPE)
          );
          const hasText = await imageHasReadableText(backgroundPng, {
            hardFailTokens: hardFailTextTokens
          });
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
            textCheckPassed: !hasText,
            textScrubDebug: null as TextScrubDebug | null,
            variationTemplateKey: activeDirectionSpec?.variationTemplateKey || null,
            aiTrace: null as GraphicsBackgroundAiAttemptTrace | null
          };
        }
        const backgroundAiRunHandle = await createGraphicsBackgroundAiRun({
          projectId: params.project.id,
          generationId: plannedGeneration.id,
          round: plannedGeneration.round,
          laneKey: optionLane(plannedGeneration.optionIndex),
          metadataJson: buildGraphicsBackgroundRunMetadata({
            presetKey: plannedGeneration.presetKey,
            optionIndex: plannedGeneration.optionIndex,
            referenceCount: referenceDataUrls.length,
            candidateSuffix: attemptParams.candidateSuffix || null,
            variationTemplateKey: activeDirectionSpec?.variationTemplateKey || null,
            stageHint: shouldRunExplorationToneCheck ? "exploration" : "production"
          }),
          assertActive: assertClaimedGenerationExecutionActive,
          onRunCreated: (run) => {
            executionLease.registerBackgroundRunId(run.id);
          }
        });
        await assertClaimedGenerationExecutionActive();
        let latestBackgroundAiTrace: GraphicsBackgroundAiAttemptTrace | null = null;
        try {
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
          designSpec: activeDesignSpec,
          brandMode: params.project.brandMode,
          explorationMode: shouldRunExplorationToneCheck,
          seriesPreferenceGuidance,
          bibleCreativeBrief,
          aiRunHandle: backgroundAiRunHandle,
          promptVersion: GRAPHICS_BACKGROUND_PROMPT_VERSION,
          referenceDataUrls,
          hardFailTextTokens,
          focalPoint: resolveRecipeFocalPoint(lockupRecipeForRender, OPTION_MASTER_BACKGROUND_SHAPE),
          originalityBoost: attemptParams.originalityBoost,
          brandPaletteHardConstraint: brandPaletteHardConstraintPrompt,
          runImageGeneration: imageGenerationLimit,
          maxTextRetries: maxTextRetriesPerBackground,
          imageDebugMeta: imageRateLimitDebugMeta,
          registerImageCall,
          disablePromptOnlyFallbackForRateLimit: shouldDisablePromptFallbackOnRateLimit,
          disable429Retry: shouldDisable429Retry,
          assertActive: assertClaimedGenerationExecutionActive,
          // Thread Flux-specific boost flags from caller (recovery/retry paths).
          fluxBoostTone: attemptParams.fluxBoostTone,
          fluxBoostMotif: attemptParams.fluxBoostMotif,
          fluxBoostNoText: attemptParams.fluxBoostNoText
        });
        latestBackgroundAiTrace = initialBackground.aiTrace;

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
                designSpec: activeDesignSpec,
                brandMode: params.project.brandMode,
                explorationMode: shouldRunExplorationToneCheck,
                seriesPreferenceGuidance,
                bibleCreativeBrief,
                aiRunHandle: backgroundAiRunHandle,
                promptVersion: GRAPHICS_BACKGROUND_PROMPT_VERSION,
                referenceDataUrls,
                hardFailTextTokens,
                focalPoint: resolveRecipeFocalPoint(lockupRecipeForRender, OPTION_MASTER_BACKGROUND_SHAPE),
                originalityBoost: attemptParams.originalityBoost,
                brandPaletteHardConstraint: brandPaletteHardConstraintPrompt,
                paletteComplianceBoost: BRAND_PALETTE_STRICT_RETRY_BOOST,
                runImageGeneration: imageGenerationLimit,
                maxTextRetries: maxTextRetriesPerBackground,
                imageDebugMeta: imageRateLimitDebugMeta,
                registerImageCall,
                isRetryGeneration: true,
                disablePromptOnlyFallbackForRateLimit: shouldDisablePromptFallbackOnRateLimit,
                disable429Retry: shouldDisable429Retry,
                assertActive: assertClaimedGenerationExecutionActive
              });
              latestBackgroundAiTrace = validatedBackground.aiTrace;
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

          if (!toneEvaluationBefore.passed && !shouldDisableToneComplianceRetry) {
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
                designSpec: activeDesignSpec,
                brandMode: params.project.brandMode,
                explorationMode: shouldRunExplorationToneCheck,
                seriesPreferenceGuidance,
                bibleCreativeBrief,
                aiRunHandle: backgroundAiRunHandle,
                promptVersion: GRAPHICS_BACKGROUND_PROMPT_VERSION,
                referenceDataUrls,
                hardFailTextTokens,
                focalPoint: resolveRecipeFocalPoint(lockupRecipeForRender, OPTION_MASTER_BACKGROUND_SHAPE),
                originalityBoost: attemptParams.originalityBoost,
                brandPaletteHardConstraint: brandPaletteHardConstraintPrompt,
                paletteComplianceBoost: paletteRetryCount > 0 ? BRAND_PALETTE_STRICT_RETRY_BOOST : undefined,
                toneComplianceBoost: toneOverrideRetryBoost(toneTargetForCompliance),
                runImageGeneration: imageGenerationLimit,
                maxTextRetries: maxTextRetriesPerBackground,
                imageDebugMeta: imageRateLimitDebugMeta,
                registerImageCall,
                isRetryGeneration: true,
                disablePromptOnlyFallbackForRateLimit: shouldDisablePromptFallbackOnRateLimit,
                disable429Retry: shouldDisable429Retry,
                assertActive: assertClaimedGenerationExecutionActive
            });
            latestBackgroundAiTrace = validatedBackground.aiTrace;

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
                designSpec: activeDesignSpec,
                brandMode: params.project.brandMode,
                explorationMode: shouldRunExplorationToneCheck,
                seriesPreferenceGuidance,
                bibleCreativeBrief,
                aiRunHandle: backgroundAiRunHandle,
                promptVersion: GRAPHICS_BACKGROUND_PROMPT_VERSION,
                referenceDataUrls,
                hardFailTextTokens,
                focalPoint: resolveRecipeFocalPoint(lockupRecipeForRender, OPTION_MASTER_BACKGROUND_SHAPE),
                originalityBoost: attemptParams.originalityBoost,
                brandPaletteHardConstraint: brandPaletteHardConstraintPrompt,
                paletteComplianceBoost: paletteRetryCount > 0 ? BRAND_PALETTE_STRICT_RETRY_BOOST : undefined,
                toneComplianceBoost: toneTargetForCompliance ? toneOverrideRetryBoost(toneTargetForCompliance) : undefined,
                textArtifactRetryBoost: TEXT_ARTIFACT_RETRY_OVERRIDE,
                runImageGeneration: imageGenerationLimit,
                maxTextRetries: maxTextRetriesPerBackground,
                imageDebugMeta: imageRateLimitDebugMeta,
                registerImageCall,
                isRetryGeneration: true,
                disablePromptOnlyFallbackForRateLimit: shouldDisablePromptFallbackOnRateLimit,
                disable429Retry: shouldDisable429Retry,
                assertActive: assertClaimedGenerationExecutionActive
            });
            latestBackgroundAiTrace = validatedBackground.aiTrace;
            // After the one allowed text-artifact retry, accept the result unconditionally.
            // Never fail the lane over an artifact that survives the retry.
            validatedBackground = { ...validatedBackground, textCheckPassed: true };

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
        try {
          await assertClaimedGenerationExecutionActive();
          await finalizeGraphicsBackgroundAiRun({
            runHandle: backgroundAiRunHandle,
            status: "COMPLETED",
            providerConfigVersion: validatedBackground.aiTrace.providerConfigVersion,
            metadataJson: {
              promptVersion: GRAPHICS_BACKGROUND_PROMPT_VERSION,
              generationSeedPrefix,
              ...buildBackgroundAiTraceMetadata("selected", validatedBackground.aiTrace),
              textRetryCount: validatedBackground.textRetryCount,
              paletteRetryCount,
              toneRetryCount,
              textArtifactRetryCount,
              textCheckPassed: validatedBackground.textCheckPassed,
              variationTemplateKey: activeDirectionSpec?.variationTemplateKey || null
            }
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown ai harness run finalization error";
          console.warn(`[ai-harness-run] generation=${plannedGeneration.id} status=completed error=${message}`);
        }

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
          textCheckPassed: validatedBackground.textCheckPassed,
          textScrubDebug: null as TextScrubDebug | null,
          variationTemplateKey: activeDirectionSpec?.variationTemplateKey || null,
          aiTrace: validatedBackground.aiTrace
        };
        } catch (error) {
          try {
            await finalizeGraphicsBackgroundAiRun({
              runHandle: backgroundAiRunHandle,
              status: "FAILED",
              error,
              metadataJson: {
                promptVersion: GRAPHICS_BACKGROUND_PROMPT_VERSION,
                generationSeedPrefix: `${runSeed}|${plannedGeneration.optionIndex}${attemptParams.candidateSuffix || ""}`,
                variationTemplateKey: activeDirectionSpec?.variationTemplateKey || null,
                ...buildBackgroundAiTraceMetadata("last", latestBackgroundAiTrace)
              }
            });
          } catch (finalizeError) {
            const message = finalizeError instanceof Error ? finalizeError.message : "Unknown ai harness run failure finalization error";
            console.warn(`[ai-harness-run] generation=${plannedGeneration.id} status=failed error=${message}`);
          }
          throw error;
        }
      };

      const runBackgroundRerankAttempt = async (params: {
        stage: "primary" | "fallback_family" | "fallback_set" | "text_retry" | "background_recovery";
        attemptNumber: number;
        directionSpecOverride?: PlannedDirectionSpec | null;
        originalityBoost?: string;
        /** Flux-specific boost flags to thread into the Flux prompt. */
        fluxBoostTone?: boolean;
        fluxBoostMotif?: boolean;
        fluxBoostNoText?: boolean;
      }) => {
        if (!shouldRunExplorationToneCheck || shouldReuseBackground) {
          const attempt = await renderMasterAttempt({
            directionSpecOverride: params.directionSpecOverride,
            originalityBoost: params.originalityBoost,
            fluxBoostTone: params.fluxBoostTone,
            fluxBoostMotif: params.fluxBoostMotif,
            fluxBoostNoText: params.fluxBoostNoText
          });
          return {
            attempt,
            winnerIndex: 0,
            bestScore: Number.POSITIVE_INFINITY,
            bestInvalidReasons: [] as string[],
            laneFailed: false,
            hardFailReadableText: false,
            eligiblePoolEmpty: false,
            candidates: [] as BackgroundRerankCandidateDebug[],
            winner: null as BackgroundRerankWinnerDebug | null,
            attemptDebug: {
              attemptIndex: params.attemptNumber,
              styleFamily: resolveDirectionStyleFields(
                params.directionSpecOverride === undefined ? backgroundDirectionSpec : params.directionSpecOverride
              ).styleFamily,
              anchorUsed: {
                visualAnchorSrc: null
              },
              candidates: [],
              winnerIndex: 0,
              failureReason: null
            } as BackgroundAttemptDebug,
            backgroundValidation: null as ProductionBackgroundValidationEvidence | null,
            failureReason: null as BackgroundAttemptFailureReason | null,
            textScrub: attempt.textScrubDebug || null,
            winnerDirectionSpec:
              params.directionSpecOverride === undefined ? backgroundDirectionSpec : (params.directionSpecOverride ?? null)
          };
        }

        const activeDirectionSpec =
          params.directionSpecOverride === undefined ? backgroundDirectionSpec : params.directionSpecOverride;
        const candidateTag = params.originalityBoost ? `${params.stage}-orig` : `${params.stage}-base`;
        const toneTargetForCompliance = resolveToneTargetFromDirectionSpec(activeDirectionSpec);
        const styleFields = resolveDirectionStyleFields(activeDirectionSpec);
        const attemptAnchorReferenceId = normalizeReferenceId(activeDirectionSpec?.referenceId || "");
        const attemptAnchorReference =
          attemptAnchorReferenceId.length > 0
            ? references.find((reference) => normalizeReferenceId(reference.id) === attemptAnchorReferenceId) ||
              referenceIndexById.get(attemptAnchorReferenceId) ||
              null
            : anchorReference || references[0] || null;
        const attemptVisualAnchorSrc =
          resolveReferenceVisualAnchorSrc({
            reference: attemptAnchorReference,
            referenceCluster: activeDirectionSpec?.referenceCluster || resolvedReferenceCluster
          }) ||
          referenceAnchorDebug?.visualAnchorSrc ||
          anchorVisualAnchorSrc ||
          null;
        const candidateCountForAttempt =
          params.stage === "background_recovery"
            // Use the recovery count directly — do not cap by backgroundCandidateCount.
            // When backgroundCandidateCount=1 (no-notes path), Math.min(1,2)=1 silently
            // collapsed recovery to a single candidate, defeating its purpose.
            ? ROUND1_BACKGROUND_RECOVERY_CANDIDATE_COUNT
            : backgroundCandidateCount;
        const candidateTemplateKeys = buildBackgroundCandidateTemplateKeys({
          seed: `${runSeed}|${plannedGeneration.optionIndex}|${candidateTag}|attempt-${params.attemptNumber}`,
          count: candidateCountForAttempt,
          directionSpec: activeDirectionSpec
        });
        const candidates = [] as Array<{
          attempt: Awaited<ReturnType<typeof renderMasterAttempt>>;
          directionSpecUsed: PlannedDirectionSpec | null;
          variationTemplateKey: string | null;
          layoutDiversityPenalty: number;
          frameScaffoldPenalty: number;
          score: number;
          textScrub: TextScrubDebug | null;
          evaluation: BackgroundAttemptEvaluation;
          debugUrl: string;
        }>;
        const evaluateCandidate = async (
          candidateAttempt: Awaited<ReturnType<typeof renderMasterAttempt>>,
          candidateDirectionSpec: PlannedDirectionSpec | null,
          candidateTitleSafeBox: TitleSafeBox,
          candidateVariationTemplateKey: string | null
        ) => {
          const evaluation = await evaluateBackgroundAttempt({
            attempt: candidateAttempt,
            titleSafeBox: candidateTitleSafeBox,
            toneTarget: toneTargetForCompliance,
            referenceCluster: candidateDirectionSpec?.referenceCluster || null,
            source: "generated",
            sourceGenerationId: null
          });
          const meaningfulStructureScore = Math.max(0, evaluation.stats.hardFail?.meaningfulStructureScore || 0);
          const frameScaffoldPenalty = evaluation.checks.frameScaffoldTriggered
            ? ROUND1_RERANK_FRAME_SCAFFOLD_HEAVY_PENALTY
            : evaluation.stats.hardFail?.mostEdgesAreLongStraightBorders
              ? ROUND1_RERANK_FRAME_SCAFFOLD_LIGHT_PENALTY
              : 0;
          let score = 0;
          score += evaluation.checks.tonePass ? ROUND1_RERANK_TONE_PASS_BONUS : 0;
          score += evaluation.evidence.textFree === true ? 140 : -140;
          score += evaluation.checks.designPresencePass ? 90 : -90;
          score += evaluation.checks.meaningfulStructurePass
            ? ROUND1_RERANK_MEANINGFUL_STRUCTURE_PASS_BONUS
            : -ROUND1_RERANK_MEANINGFUL_STRUCTURE_FAIL_PENALTY;
          score += evaluation.evidence.motifPresent === true ? 120 : 0;
          score += meaningfulStructureScore * ROUND1_RERANK_MEANINGFUL_STRUCTURE_SCORE_WEIGHT;
          score += evaluation.checks.hardFailBlankDesign ? -240 : 120;
          score += (evaluation.stats.titleSafe?.score || 0) * ROUND1_RERANK_TITLE_SAFE_WEIGHT;
          score += (evaluation.stats.midtoneRange?.score || 0) * ROUND1_RERANK_MIDTONE_RANGE_WEIGHT;
          score -= evaluation.evidence.scaffoldFree === true ? 0 : ROUND1_RERANK_SCAFFOLD_FAIL_PENALTY;
          score -= evaluation.evidence.motifPresent === true ? 0 : ROUND1_RERANK_MOTIF_FAIL_PENALTY;
          score -= evaluation.checks.tonePass ? 0 : ROUND1_RERANK_TONE_FAIL_PENALTY;
          score -= candidateAttempt.textRetryCount * 2;
          score -= candidateAttempt.textArtifactRetryCount * 4;
          score -= evaluation.textArtifactDetected ? 42 : 0;
          score -= frameScaffoldPenalty;
          const layoutDiversityPenalty = layoutDiversityPenaltyForTemplate(
            plannedGeneration.round,
            candidateAttempt.variationTemplateKey || candidateVariationTemplateKey
          );
          score -= layoutDiversityPenalty;

          return {
            score,
            layoutDiversityPenalty,
            frameScaffoldPenalty,
            evaluation
          };
        };
        for (let candidateIndex = 0; candidateIndex < candidateCountForAttempt; candidateIndex += 1) {
          const candidateVariationTemplateKey =
            candidateTemplateKeys[candidateIndex] || activeDirectionSpec?.variationTemplateKey || null;
          const candidateDirectionSpec = withVariationTemplateKey(activeDirectionSpec, candidateVariationTemplateKey);
          const candidateTitleSafeBox = titleSafeBoxForDirection(candidateDirectionSpec);
          let attempt: Awaited<ReturnType<typeof renderMasterAttempt>>;
          try {
            attempt = await renderMasterAttempt({
              directionSpecOverride: candidateDirectionSpec,
              originalityBoost: params.originalityBoost,
              candidateSuffix: `|${candidateTag}-bg-candidate-${candidateIndex}`,
              fluxBoostTone: params.fluxBoostTone,
              fluxBoostMotif: params.fluxBoostMotif,
              fluxBoostNoText: params.fluxBoostNoText
            });
          } catch (error) {
            if (isRound1ImageCallCapReachedError(error)) {
              break;
            }
            throw error;
          }
          let evaluation = await evaluateCandidate(
            attempt,
            candidateDirectionSpec,
            candidateTitleSafeBox,
            candidateVariationTemplateKey
          );
          let textScrub: TextScrubDebug | null = null;
          const failsOnlyText =
            evaluation.evaluation.acceptance.invalidReasons.length > 0 &&
            evaluation.evaluation.acceptance.invalidReasons.every((reason) => reason === "background_text_detected");

          if (failsOnlyText) {
            const scrubResult = await runLocalTextScrubPass(attempt.backgroundPng);
            const afterHasText = await imageHasReadableText(scrubResult.scrubbedPng, {
              hardFailTokens: hardFailTextTokens
            });
            const scrubbedUrl = await writeGenerationPreviewFiles({
              fileName: `${plannedGeneration.id}-${candidateTag}-bg-candidate-${candidateIndex}-scrubbed.png`,
              png: scrubResult.scrubbedPng
            });
            textScrub = {
              attempted: true,
              boxesCount: scrubResult.boxesCount,
              beforeHasText: true,
              afterHasText,
              scrubbedUrl
            };
            attempt = {
              ...attempt,
              textScrubDebug: textScrub
            };
            if (!afterHasText) {
              attempt = {
                ...attempt,
                backgroundPng: scrubResult.scrubbedPng,
                textCheckPassed: true
              };
              evaluation = await evaluateCandidate(
                attempt,
                candidateDirectionSpec,
                candidateTitleSafeBox,
                candidateVariationTemplateKey
              );
            }
          }
          const debugUrl = await writeGenerationPreviewFiles({
            fileName: `${plannedGeneration.id}-${candidateTag}-bg-candidate-${candidateIndex}.png`,
            png: attempt.backgroundPng
          });

          candidates.push({
            attempt,
            directionSpecUsed: candidateDirectionSpec,
            variationTemplateKey: attempt.variationTemplateKey || candidateVariationTemplateKey,
            layoutDiversityPenalty: evaluation.layoutDiversityPenalty,
            frameScaffoldPenalty: evaluation.frameScaffoldPenalty,
            score: evaluation.score,
            textScrub,
            evaluation: evaluation.evaluation,
            debugUrl
          });
        }
        if (candidates.length <= 0) {
          throw new Round1ImageCallCapReachedError();
        }

        const indexedCandidates = candidates.map((candidate, index) => ({ candidate, index }));
        const eligible = indexedCandidates.filter((entry) => entry.candidate.evaluation.acceptance.accepted);
        const winner = eligible.length > 0
          ? eligible.reduce((best, current) => (current.candidate.score > best.candidate.score ? current : best), eligible[0])
          : null;
        const bestCandidate = indexedCandidates.reduce(
          (best, current) => (current.candidate.score > best.candidate.score ? current : best),
          indexedCandidates[0]
        );
        const bestScore = winner?.candidate.score ?? Number.NEGATIVE_INFINITY;
        const hardFailReadableText =
          indexedCandidates.length > 0 &&
          indexedCandidates.every((entry) =>
            entry.candidate.evaluation.acceptance.invalidReasons.includes("background_text_detected")
          );
        const eligiblePoolEmpty = eligible.length <= 0;
        const laneFailed = eligiblePoolEmpty;
        const failureReason: BackgroundAttemptFailureReason | null = winner
          ? null
          : buildBackgroundAttemptFailureReason(bestCandidate.candidate.evaluation.acceptance.invalidReasons);
        const attemptDebug: BackgroundAttemptDebug = {
          attemptIndex: params.attemptNumber,
          styleFamily: styleFields.styleFamily,
          anchorUsed: {
            visualAnchorSrc: attemptVisualAnchorSrc
          },
          candidates: candidates.map((candidate) => {
            return {
              url: candidate.debugUrl,
              ...(candidate.textScrub
                ? {
                    textScrub: candidate.textScrub
                  }
                : {}),
              checks: {
                textOk: candidate.evaluation.evidence.textFree === true,
                scaffoldOk: candidate.evaluation.evidence.scaffoldFree === true,
                motifOk: candidate.evaluation.evidence.motifPresent === true,
                toneOk: candidate.evaluation.evidence.toneFit,
                referenceOk: candidate.evaluation.evidence.referenceFit
              },
              scores: {
                total: candidate.score,
                layoutDiversityPenalty: candidate.layoutDiversityPenalty,
                frameScaffoldPenalty: candidate.frameScaffoldPenalty,
                meaningfulStructure: Math.max(0, candidate.evaluation.stats.hardFail?.meaningfulStructureScore || 0),
                titleSafe: candidate.evaluation.stats.titleSafe?.score || 0,
                midtoneRange: candidate.evaluation.stats.midtoneRange?.score || 0
              }
            };
          }),
          winnerIndex: winner ? winner.index : null,
          failureReason
        };
        await persistBackgroundEvaluationIfAvailable({
          attempt: winner?.candidate.attempt || bestCandidate.candidate.attempt,
          evaluation: winner?.candidate.evaluation || bestCandidate.candidate.evaluation,
          generationId: plannedGeneration.id,
          optionIndex: plannedGeneration.optionIndex,
          stage: params.stage,
          attemptNumber: params.attemptNumber,
          directionSpec: winner ? winner.candidate.directionSpecUsed : bestCandidate.candidate.directionSpecUsed,
          assertActive: assertClaimedGenerationExecutionActive
        });

        return {
          attempt: winner?.candidate.attempt || bestCandidate.candidate.attempt,
          winnerIndex: winner ? winner.index : null,
          bestScore,
          bestInvalidReasons: winner
            ? winner.candidate.evaluation.acceptance.invalidReasons
            : bestCandidate.candidate.evaluation.acceptance.invalidReasons,
          laneFailed,
          hardFailReadableText,
          eligiblePoolEmpty,
          candidates: candidates.map((candidate) => ({
            url: candidate.debugUrl,
            stage: params.stage,
            attempt: params.attemptNumber,
            styleFamily: styleFields.styleFamily,
            explorationSetKey: styleFields.explorationSetKey,
            variationTemplateKey: candidate.variationTemplateKey,
            score: candidate.score,
            layoutDiversityPenalty: candidate.layoutDiversityPenalty,
            frameScaffoldPenalty: candidate.frameScaffoldPenalty,
            ...(candidate.textScrub
              ? {
                  textScrub: candidate.textScrub
                }
              : {}),
            checks: candidate.evaluation.checks,
            stats: {
              textRetryCount: candidate.attempt.textRetryCount,
              toneRetryCount: candidate.attempt.toneRetryCount,
              closestDistance: candidate.attempt.closestDistance,
              tone: candidate.evaluation.stats.tone,
              titleSafe: candidate.evaluation.stats.titleSafe,
              midtoneRange: candidate.evaluation.stats.midtoneRange,
              hardFail: candidate.evaluation.stats.hardFail
            }
          })),
          winner: winner
            ? {
                index: winner.index,
                url: winner.candidate.debugUrl,
                stage: params.stage,
                attempt: params.attemptNumber,
                styleFamily: styleFields.styleFamily,
                explorationSetKey: styleFields.explorationSetKey,
                variationTemplateKey: winner.candidate.variationTemplateKey,
                score: winner.candidate.score
              }
            : null,
          attemptDebug,
          backgroundValidation: winner?.candidate.evaluation.evidence || bestCandidate.candidate.evaluation.evidence,
          failureReason,
          textScrub: winner
            ? winner.candidate.textScrub || null
            : candidates.find((candidate) => candidate.textScrub)?.textScrub || null,
          winnerDirectionSpec: winner
            ? winner.candidate.directionSpecUsed
            : params.directionSpecOverride === undefined
              ? backgroundDirectionSpec
              : (params.directionSpecOverride ?? null)
        };
      };

      const selectBackgroundWinner = async (originalityBoost?: string) => {
        const buildSingleAttemptDebug = (params: {
          attemptIndex: number;
          directionSpec: PlannedDirectionSpec | null;
          evaluation: BackgroundAttemptEvaluation;
          visualAnchorSrc: string | null;
        }): BackgroundAttemptDebug => ({
          attemptIndex: params.attemptIndex,
          styleFamily: resolveDirectionStyleFields(params.directionSpec).styleFamily,
          anchorUsed: {
            visualAnchorSrc: params.visualAnchorSrc
          },
          candidates: [
            {
              url: "",
              checks: {
                textOk: params.evaluation.evidence.textFree === true,
                scaffoldOk: params.evaluation.evidence.scaffoldFree === true,
                motifOk: params.evaluation.evidence.motifPresent === true,
                toneOk: params.evaluation.evidence.toneFit,
                referenceOk: params.evaluation.evidence.referenceFit
              },
              scores: {
                total: 0,
                layoutDiversityPenalty: 0,
                frameScaffoldPenalty: 0,
                meaningfulStructure: Math.max(0, params.evaluation.stats.hardFail?.meaningfulStructureScore || 0),
                titleSafe: params.evaluation.stats.titleSafe?.score || 0,
                midtoneRange: params.evaluation.stats.midtoneRange?.score || 0
              }
            }
          ],
          winnerIndex: params.evaluation.acceptance.accepted ? 0 : null,
          failureReason: params.evaluation.acceptance.accepted
            ? null
            : buildBackgroundAttemptFailureReason(params.evaluation.acceptance.invalidReasons)
        });

        if (!shouldRunExplorationToneCheck || shouldReuseBackground) {
          const activeDirectionSpec = backgroundDirectionSpec;
          const toneTarget = resolveToneTargetFromDirectionSpec(activeDirectionSpec);
          const attempt = await renderMasterAttempt({ originalityBoost });
          if (shouldReuseBackground) {
            const reusableValidation =
              reusableAssets?.backgroundValidation
                ? {
                    ...reusableAssets.backgroundValidation,
                    source: "reused" as const,
                    sourceGenerationId: reusableAssets.sourceGenerationId
                  }
                : {
                    source: "reused" as const,
                    sourceGenerationId: reusableAssets?.sourceGenerationId || null,
                    textFree: null,
                    scaffoldFree: null,
                    motifPresent: null,
                    toneFit: null,
                    referenceFit: null
                  };
            const acceptance = evaluateBackgroundAcceptance({
              evidence: reusableValidation
            });
            return {
              attempt: acceptance.accepted ? attempt : null,
              winnerIndex: acceptance.accepted ? 0 : null,
              laneFailed: !acceptance.accepted,
              eligiblePoolEmpty: !acceptance.accepted,
              winnerDirectionSpec: activeDirectionSpec,
              backgroundAttempts: [] as BackgroundAttemptDebug[],
              backgroundValidation: reusableValidation,
              textScrub: attempt.textScrubDebug || null,
              backgroundRecovery: createBackgroundRecoveryDebug({
                finalReasons: acceptance.accepted ? [] : acceptance.invalidReasons
              }),
              fallbackFailureReason: acceptance.accepted
                ? (null as BackgroundAttemptFailureReason | null)
                : buildBackgroundAttemptFailureReason(acceptance.invalidReasons)
            };
          }

          const attemptEvaluation = await evaluateBackgroundAttempt({
            attempt,
            titleSafeBox: titleSafeBoxForDirection(activeDirectionSpec),
            toneTarget: resolveToneTargetFromDirectionSpec(activeDirectionSpec),
            referenceCluster: activeDirectionSpec?.referenceCluster || null,
            source: "generated",
            sourceGenerationId: null
          });
          const attemptDebug = buildSingleAttemptDebug({
            attemptIndex: 1,
            directionSpec: activeDirectionSpec,
            evaluation: attemptEvaluation,
            visualAnchorSrc: null
          });
          const recoverableReasons = collectRecoverableBackgroundInvalidReasons(attemptEvaluation.acceptance.invalidReasons);
          if (!attemptEvaluation.acceptance.accepted && recoverableReasons.length > 0) {
            const recoveryBoost = buildBackgroundRecoveryBoost({
              invalidReasons: recoverableReasons,
              toneTarget
            });
            const recoveryOriginalityBoost = [originalityBoost, recoveryBoost].filter(Boolean).join(" ").trim() || undefined;
            const recoveryAttempt = await renderMasterAttempt({
              directionSpecOverride: activeDirectionSpec,
              originalityBoost: recoveryOriginalityBoost,
              candidateSuffix: "|background-recovery",
              // Flux-specific boost flags derived from the recovery reasons.
              fluxBoostTone: recoverableReasons.includes("background_tone_fit_failed"),
              fluxBoostMotif:
                recoverableReasons.includes("background_blank_or_motif_weak") ||
                recoverableReasons.includes("background_scaffold_like"),
              fluxBoostNoText: recoverableReasons.includes("background_text_detected")
            });
            const recoveryEvaluation = await evaluateBackgroundAttempt({
              attempt: recoveryAttempt,
              titleSafeBox: titleSafeBoxForDirection(activeDirectionSpec),
              toneTarget,
              referenceCluster: activeDirectionSpec?.referenceCluster || null,
              source: "generated",
              sourceGenerationId: null
            });
            const recoveryAttemptDebug = buildSingleAttemptDebug({
              attemptIndex: 2,
              directionSpec: activeDirectionSpec,
              evaluation: recoveryEvaluation,
              visualAnchorSrc: null
            });
            const recoveryAccepted = recoveryEvaluation.acceptance.accepted;
            await persistBackgroundEvaluationIfAvailable({
              attempt: recoveryAttempt,
              evaluation: recoveryEvaluation,
              generationId: plannedGeneration.id,
              optionIndex: plannedGeneration.optionIndex,
              stage: "background_recovery",
              attemptNumber: 2,
              directionSpec: activeDirectionSpec,
              assertActive: assertClaimedGenerationExecutionActive
            });
            return {
              attempt: recoveryAccepted ? recoveryAttempt : null,
              winnerIndex: recoveryAccepted ? 0 : null,
              laneFailed: !recoveryAccepted,
              eligiblePoolEmpty: !recoveryAccepted,
              winnerDirectionSpec: activeDirectionSpec,
              backgroundAttempts: [attemptDebug, recoveryAttemptDebug],
              backgroundValidation: recoveryEvaluation.evidence,
              textScrub: recoveryAttempt.textScrubDebug || attempt.textScrubDebug || null,
              backgroundRecovery: createBackgroundRecoveryDebug({
                attempted: true,
                attempts: 1,
                reasons: recoverableReasons,
                succeeded: recoveryAccepted,
                finalReasons: recoveryAccepted ? [] : recoveryEvaluation.acceptance.invalidReasons
              }),
              fallbackFailureReason: recoveryAccepted
                ? (null as BackgroundAttemptFailureReason | null)
                : buildBackgroundAttemptFailureReason(recoveryEvaluation.acceptance.invalidReasons)
            };
          }
          await persistBackgroundEvaluationIfAvailable({
            attempt,
            evaluation: attemptEvaluation,
            generationId: plannedGeneration.id,
            optionIndex: plannedGeneration.optionIndex,
            stage: "primary",
            attemptNumber: 1,
            directionSpec: activeDirectionSpec,
            assertActive: assertClaimedGenerationExecutionActive
          });
          return {
            attempt: attemptEvaluation.acceptance.accepted ? attempt : null,
            winnerIndex: attemptEvaluation.acceptance.accepted ? 0 : null,
            laneFailed: !attemptEvaluation.acceptance.accepted,
            eligiblePoolEmpty: !attemptEvaluation.acceptance.accepted,
            winnerDirectionSpec: activeDirectionSpec,
            backgroundAttempts: [attemptDebug],
            backgroundValidation: attemptEvaluation.evidence,
            textScrub: attempt.textScrubDebug || null,
            backgroundRecovery: createBackgroundRecoveryDebug({
              finalReasons: attemptEvaluation.acceptance.accepted ? [] : attemptEvaluation.acceptance.invalidReasons
            }),
            fallbackFailureReason: attemptEvaluation.acceptance.accepted
              ? (null as BackgroundAttemptFailureReason | null)
              : buildBackgroundAttemptFailureReason(attemptEvaluation.acceptance.invalidReasons)
          };
        }

        const fallback: BackgroundRerankFallbackDebug = {
          usedAltFamily: false,
          usedAltSet: false,
          attempts: 1
        };
        const aggregatedCandidates: BackgroundRerankCandidateDebug[] = [];
        const backgroundAttempts: BackgroundAttemptDebug[] = [];
        let globalWinnerIndex = 0;
        let winner: BackgroundRerankWinnerDebug | null = null;
        let backgroundRecovery = createBackgroundRecoveryDebug();
        let anyHardFailReadableText = false;

        const buildApiErrorAttemptDebug = (params: {
          attemptIndex: number;
          directionSpec: PlannedDirectionSpec | null;
          failureReason: BackgroundAttemptFailureReason;
        }): BackgroundAttemptDebug => ({
          attemptIndex: params.attemptIndex,
          styleFamily: resolveDirectionStyleFields(params.directionSpec).styleFamily,
          anchorUsed: {
            visualAnchorSrc:
              resolveReferenceVisualAnchorSrc({
                reference: anchorReference || references[0] || null,
                referenceCluster: params.directionSpec?.referenceCluster || resolvedReferenceCluster
              }) ||
              referenceAnchorDebug?.visualAnchorSrc ||
              anchorVisualAnchorSrc ||
              null
          },
          candidates: [],
          winnerIndex: null,
          failureReason: params.failureReason
        });

        const persistBackgroundRerankMeta = (params: {
          laneFailed: boolean;
          backgroundWinnerIndex?: number;
        }) => {
          rerankMeta = {
            ...rerankMeta,
            backgroundCandidates: aggregatedCandidates,
            backgroundWinner: winner || undefined,
            laneFailed: params.laneFailed,
            fallback,
            backgroundWinnerIndex: params.backgroundWinnerIndex
          };
        };

        const appendAttempt = (result: Awaited<ReturnType<typeof runBackgroundRerankAttempt>>) => {
          const startIndex = aggregatedCandidates.length;
          aggregatedCandidates.push(...result.candidates);
          backgroundAttempts.push(result.attemptDebug);
          if (result.hardFailReadableText) anyHardFailReadableText = true;
          const attemptWinner = result.winner;
          const attemptWinnerIndex = result.winnerIndex;
          if (attemptWinner && attemptWinnerIndex !== null) {
            globalWinnerIndex = startIndex + attemptWinnerIndex;
            winner = {
              ...attemptWinner,
              index: globalWinnerIndex
            };
          }
        };

        let activeDirectionSpec = backgroundDirectionSpec;
        let latestSelection: Awaited<ReturnType<typeof runBackgroundRerankAttempt>> | null = null;
        try {
          latestSelection = await runBackgroundRerankAttempt({
            stage: "primary",
            attemptNumber: fallback.attempts,
            directionSpecOverride: activeDirectionSpec,
            originalityBoost
          });
          appendAttempt(latestSelection);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown rerank attempt error";
          const failureReason = resolveBackgroundAttemptFailureReason(error);
          console.warn(
            `[background-rerank-attempt] generation=${plannedGeneration.id} option=${plannedGeneration.optionIndex} stage=primary attempt=${fallback.attempts} error=${message}`
          );
          backgroundAttempts.push(
            buildApiErrorAttemptDebug({
              attemptIndex: fallback.attempts,
              directionSpec: activeDirectionSpec,
              failureReason
            })
          );
        }
        if (!latestSelection) {
          persistBackgroundRerankMeta({
            laneFailed: true
          });
          return {
            attempt: null as Awaited<ReturnType<typeof renderMasterAttempt>> | null,
            winnerIndex: null as number | null,
            laneFailed: true,
            eligiblePoolEmpty: true,
            winnerDirectionSpec: activeDirectionSpec,
            backgroundAttempts,
            backgroundValidation: null as ProductionBackgroundValidationEvidence | null,
            textScrub: null as TextScrubDebug | null,
            backgroundRecovery,
            fallbackFailureReason: backgroundAttempts[backgroundAttempts.length - 1]?.failureReason || "UNKNOWN"
          };
        }
        let bestEligibleSelection = latestSelection.winner ? latestSelection : null;
        activeDirectionSpec = latestSelection.winnerDirectionSpec || activeDirectionSpec;

        if (latestSelection.hardFailReadableText) {
          fallback.attempts += 1;
          const retryBoost = [originalityBoost, BACKGROUND_ELIGIBILITY_RETRY_BOOST].filter(Boolean).join(" ").trim() || undefined;
          try {
            latestSelection = await runBackgroundRerankAttempt({
              stage: "text_retry",
              attemptNumber: fallback.attempts,
              directionSpecOverride: activeDirectionSpec,
              originalityBoost: retryBoost,
              fluxBoostNoText: true
            });
            appendAttempt(latestSelection);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown rerank attempt error";
            const failureReason = resolveBackgroundAttemptFailureReason(error);
            console.warn(
              `[background-rerank-attempt] generation=${plannedGeneration.id} option=${plannedGeneration.optionIndex} stage=text_retry attempt=${fallback.attempts} error=${message}`
            );
            backgroundAttempts.push(
              buildApiErrorAttemptDebug({
                attemptIndex: fallback.attempts,
                directionSpec: activeDirectionSpec,
                failureReason
              })
            );
            persistBackgroundRerankMeta({
              laneFailed: true
            });
            return {
              attempt: null as Awaited<ReturnType<typeof renderMasterAttempt>> | null,
              winnerIndex: null as number | null,
              laneFailed: true,
              eligiblePoolEmpty: true,
              winnerDirectionSpec: activeDirectionSpec,
              backgroundAttempts,
              backgroundValidation: latestSelection?.backgroundValidation || null,
              textScrub: latestSelection?.textScrub || null,
              backgroundRecovery: createBackgroundRecoveryDebug({
                finalReasons: latestSelection?.bestInvalidReasons || []
              }),
              fallbackFailureReason: backgroundAttempts[backgroundAttempts.length - 1]?.failureReason || "UNKNOWN"
            };
          }
          if (latestSelection.winner) {
            bestEligibleSelection = latestSelection;
          }
          activeDirectionSpec = latestSelection.winnerDirectionSpec || activeDirectionSpec;
        }

        if (
          !bestEligibleSelection &&
          backgroundRecovery.attempts < ROUND1_BACKGROUND_RECOVERY_MAX_ATTEMPTS
        ) {
          // Skip recovery when text-artifact heuristic is the confirmed systemic blocker
          // (all candidates in latest attempt failed text detection). Retrying with a recovery
          // prompt changes image enough to fail for different reasons, masking the real cause.
          const recoveryReasons = latestSelection.hardFailReadableText
            ? []
            : collectRecoverableBackgroundInvalidReasons(latestSelection.bestInvalidReasons);
          if (recoveryReasons.length > 0) {
            fallback.attempts += 1;
            const recoveryBoost = buildBackgroundRecoveryBoost({
              invalidReasons: recoveryReasons,
              toneTarget: resolveToneTargetFromDirectionSpec(activeDirectionSpec)
            });
            const recoveryOriginalityBoost = [originalityBoost, recoveryBoost].filter(Boolean).join(" ").trim() || undefined;
            try {
              latestSelection = await runBackgroundRerankAttempt({
                stage: "background_recovery",
                attemptNumber: fallback.attempts,
                directionSpecOverride: activeDirectionSpec,
                originalityBoost: recoveryOriginalityBoost,
                // Flux-specific boost flags derived from the recovery reasons.
                fluxBoostTone: recoveryReasons.includes("background_tone_fit_failed"),
                fluxBoostMotif:
                  recoveryReasons.includes("background_blank_or_motif_weak") ||
                  recoveryReasons.includes("background_scaffold_like"),
                fluxBoostNoText: recoveryReasons.includes("background_text_detected")
              });
              appendAttempt(latestSelection);
              if (latestSelection.winner) {
                bestEligibleSelection = latestSelection;
              }
              activeDirectionSpec = latestSelection.winnerDirectionSpec || activeDirectionSpec;
              backgroundRecovery = createBackgroundRecoveryDebug({
                attempted: true,
                attempts: 1,
                reasons: recoveryReasons,
                succeeded: Boolean(latestSelection.winner),
                finalReasons: latestSelection.winner ? [] : latestSelection.bestInvalidReasons
              });
            } catch (error) {
              const message = error instanceof Error ? error.message : "Unknown background recovery error";
              const failureReason = resolveBackgroundAttemptFailureReason(error);
              console.warn(
                `[background-rerank-attempt] generation=${plannedGeneration.id} option=${plannedGeneration.optionIndex} stage=background_recovery attempt=${fallback.attempts} error=${message}`
              );
              backgroundAttempts.push(
                buildApiErrorAttemptDebug({
                  attemptIndex: fallback.attempts,
                  directionSpec: activeDirectionSpec,
                  failureReason
                })
              );
              backgroundRecovery = createBackgroundRecoveryDebug({
                attempted: true,
                attempts: 1,
                reasons: recoveryReasons,
                succeeded: false,
                finalReasons: [`background_generation_failed:${failureReason}`]
              });
              persistBackgroundRerankMeta({
                laneFailed: true
              });
              return {
                attempt: null as Awaited<ReturnType<typeof renderMasterAttempt>> | null,
                winnerIndex: null as number | null,
                laneFailed: true,
                eligiblePoolEmpty: true,
                winnerDirectionSpec: activeDirectionSpec,
                backgroundAttempts,
                backgroundValidation: latestSelection?.backgroundValidation || null,
                textScrub: latestSelection?.textScrub || null,
                backgroundRecovery,
                fallbackFailureReason: failureReason
              };
            }
          }
        }

        const finalSelection = bestEligibleSelection || latestSelection;
        if (!backgroundRecovery.attempted) {
          backgroundRecovery = createBackgroundRecoveryDebug({
            finalReasons: bestEligibleSelection ? [] : finalSelection.bestInvalidReasons
          });
        } else if (bestEligibleSelection) {
          backgroundRecovery = createBackgroundRecoveryDebug({
            attempted: true,
            attempts: backgroundRecovery.attempts,
            reasons: backgroundRecovery.reasons,
            succeeded: true,
            finalReasons: []
          });
        } else if (backgroundRecovery.finalReasons.length === 0) {
          backgroundRecovery = createBackgroundRecoveryDebug({
            attempted: backgroundRecovery.attempted,
            attempts: backgroundRecovery.attempts,
            reasons: backgroundRecovery.reasons,
            succeeded: false,
            finalReasons: finalSelection.bestInvalidReasons
          });
        }
        const finalFailureReason: BackgroundAttemptFailureReason | null =
          (anyHardFailReadableText ? "ALL_TEXT" : null) ||
          finalSelection.failureReason ||
          (finalSelection.hardFailReadableText || !finalSelection.attempt.textCheckPassed ? "ALL_TEXT" : null);

        persistBackgroundRerankMeta({
          laneFailed: finalSelection.laneFailed,
          backgroundWinnerIndex: winner ? globalWinnerIndex : undefined
        });

        if (finalSelection.hardFailReadableText || !finalSelection.attempt.textCheckPassed || !bestEligibleSelection) {
          return {
            attempt: null as Awaited<ReturnType<typeof renderMasterAttempt>> | null,
            winnerIndex: null as number | null,
            laneFailed: true,
            eligiblePoolEmpty: true,
            winnerDirectionSpec: finalSelection.winnerDirectionSpec || activeDirectionSpec,
            backgroundAttempts,
            backgroundValidation: finalSelection.backgroundValidation,
            textScrub: finalSelection.textScrub || null,
            backgroundRecovery,
            fallbackFailureReason: finalFailureReason || "UNKNOWN"
          };
        }

        backgroundDirectionSpec = finalSelection.winnerDirectionSpec || activeDirectionSpec;
        if (!shouldReuseBackground) {
          const finalStyleFields = resolveDirectionStyleFields(backgroundDirectionSpec);
          effectiveDirectionStyleFamily = finalStyleFields.styleFamily;
          effectiveDirectionStyleBucket = finalStyleFields.styleBucket;
          effectiveDirectionStyleTone = finalStyleFields.styleTone;
          effectiveDirectionStyleMedium = finalStyleFields.styleMedium;
        }

        return {
          attempt: finalSelection.attempt,
          winnerIndex: finalSelection.winnerIndex,
          laneFailed: finalSelection.laneFailed,
          winnerDirectionSpec: finalSelection.winnerDirectionSpec || activeDirectionSpec,
          backgroundAttempts,
          backgroundValidation: finalSelection.backgroundValidation,
          textScrub: finalSelection.textScrub || finalSelection.attempt.textScrubDebug || null,
          backgroundRecovery,
          fallbackFailureReason: null as BackgroundAttemptFailureReason | null
        };
      };

      const completeWithBackgroundFallback = async (fallbackParams: {
        failureReason: BackgroundAttemptFailureReason;
        backgroundAttempts: BackgroundAttemptDebug[];
        backgroundValidation?: ProductionBackgroundValidationEvidence | null;
        textScrub?: TextScrubDebug | null;
        backgroundRecovery?: BackgroundRecoveryDebug | null;
      }): Promise<{ optionStatus: GenerationOptionStatus; failureReason: BackgroundAttemptFailureReason }> => {
        const resolvedFailureReason: BackgroundAttemptFailureReason = imageCallCapReached
          ? "BUDGET"
          : fallbackParams.failureReason;
        const fallbackWarning = "No eligible background found; fell back.";
        const warningsWithFallback = appendUniqueDebugWarning(fallbackOutput.meta.debug?.warnings, fallbackWarning);
        const warnings = imageCallCapReached
          ? appendUniqueDebugWarning(warningsWithFallback, ROUND1_IMAGE_CALL_CAP_WARNING)
          : warningsWithFallback;
        const fallbackDebugMeta = mergeGenerationDebugMeta(fallbackOutput.meta.debug, {
          backgroundSource: "fallback",
          lockupSource: "fallback",
          generationLifecycleState: resolveGenerationLifecycleStateForFailure(resolvedFailureReason),
          backgroundFailureReason: resolvedFailureReason,
          backgroundAttempts: fallbackParams.backgroundAttempts,
          backgroundRecoveryAttempted: fallbackParams.backgroundRecovery?.attempted === true,
          backgroundRecoveryAttempts: fallbackParams.backgroundRecovery?.attempts || 0,
          backgroundRecoveryReasons: fallbackParams.backgroundRecovery?.reasons || [],
          backgroundRecoverySucceeded: fallbackParams.backgroundRecovery?.succeeded === true,
          backgroundRecoveryFinalReasons: fallbackParams.backgroundRecovery?.finalReasons || [],
          imageProvider: buildImageProviderDebugMeta(params.providerPreflight),
          ...(fallbackParams.textScrub
            ? {
                textScrub: fallbackParams.textScrub
              }
            : {}),
          warnings,
          imageCalls: imageCallSummary,
          rateLimitWaitMs: imageRateLimitDebugMeta.rateLimitWaitMs ?? 0
        });
        fallbackOutput = {
          ...fallbackOutput,
          status: "FALLBACK",
          meta: {
            ...fallbackOutput.meta,
            debug: fallbackDebugMeta,
            ...(shouldRunExplorationToneCheck &&
            (rerankMeta.backgroundCandidates || rerankMeta.lockupCandidates || fallbackParams.backgroundAttempts.length > 0)
              ? {
                  rerank: rerankMeta
                }
              : {})
          }
        };
        const optionStatus = await completeGenerationWithFallbackOutput({
          projectId: params.project.id,
          generationId: plannedGeneration.id,
          output: fallbackOutput,
          backgroundValidation: fallbackParams.backgroundValidation || null,
          failureReason: resolvedFailureReason,
          providerPreflight: params.providerPreflight,
          attemptOwner: plannedGeneration.attemptOwner
        });
        return {
          optionStatus,
          failureReason: resolvedFailureReason
        };
      };

      const initialMasterSelection = await selectBackgroundWinner();
      backgroundAttemptDiagnostics = initialMasterSelection.backgroundAttempts;
      let selectedBackgroundRecovery = initialMasterSelection.backgroundRecovery;
      if (initialMasterSelection.fallbackFailureReason || !initialMasterSelection.attempt) {
        const fallbackResult = await completeWithBackgroundFallback({
          failureReason: initialMasterSelection.fallbackFailureReason || "UNKNOWN",
          backgroundAttempts: initialMasterSelection.backgroundAttempts,
          backgroundValidation: initialMasterSelection.backgroundValidation || null,
          textScrub: initialMasterSelection.textScrub || null,
          backgroundRecovery: initialMasterSelection.backgroundRecovery
        });
        provisionalResult = {
          generationId: plannedGeneration.id,
          optionStatus: fallbackResult.optionStatus,
          failureReason: fallbackResult.failureReason
        };
        return;
      }
      let masterAttempt = initialMasterSelection.attempt;
      let selectedBackgroundTextScrub = initialMasterSelection.textScrub || masterAttempt.textScrubDebug || null;
      let originalityRetried = false;
      if (!shouldReuseBackground && Number.isFinite(masterAttempt.closestDistance) && masterAttempt.closestDistance < 6) {
        originalityRetried = true;
        const originalityMasterSelection = await selectBackgroundWinner(
          "Originality guard: alter composition strongly from references. Change focal geometry, spacing rhythm, and tonal distribution while preserving the same overall mood."
        );
        backgroundAttemptDiagnostics = originalityMasterSelection.backgroundAttempts;
        selectedBackgroundRecovery = originalityMasterSelection.backgroundRecovery;
        if (originalityMasterSelection.fallbackFailureReason || !originalityMasterSelection.attempt) {
          const fallbackResult = await completeWithBackgroundFallback({
            failureReason: originalityMasterSelection.fallbackFailureReason || "UNKNOWN",
            backgroundAttempts: originalityMasterSelection.backgroundAttempts,
            backgroundValidation: originalityMasterSelection.backgroundValidation || null,
            textScrub: originalityMasterSelection.textScrub || selectedBackgroundTextScrub,
            backgroundRecovery: originalityMasterSelection.backgroundRecovery
          });
          provisionalResult = {
            generationId: plannedGeneration.id,
            optionStatus: fallbackResult.optionStatus,
            failureReason: fallbackResult.failureReason
          };
          return;
        }
        masterAttempt = originalityMasterSelection.attempt;
        selectedBackgroundTextScrub = originalityMasterSelection.textScrub || masterAttempt.textScrubDebug || selectedBackgroundTextScrub;
      }
      if (!masterAttempt.textCheckPassed) {
        throw new Error(
          `Strict text rejection: selected background contains readable text for generation ${plannedGeneration.id} option=${plannedGeneration.optionIndex}.`
        );
      }
      const selectedVariationTemplateKey =
        backgroundDirectionSpec?.variationTemplateKey || directionSpec?.variationTemplateKey || null;
      noteRound1SelectedTemplate(plannedGeneration.round, selectedVariationTemplateKey);
      if (shouldReuseLockup && reusableAssets?.lockupPng) {
        const reusableLockupWidth = Math.max(1, Math.round((await sharp(reusableAssets.lockupPng).metadata()).width || 1));
        const reusableLockupHeight = Math.max(1, Math.round((await sharp(reusableAssets.lockupPng).metadata()).height || 1));
        const reusableFit = evaluateLockupFit({
          lockupWidth: reusableLockupWidth,
          lockupHeight: reusableLockupHeight,
          shape: OPTION_MASTER_BACKGROUND_SHAPE,
          canvasWidth: masterDimensions.width,
          canvasHeight: masterDimensions.height,
          marginRatio: ROUND1_EXPLORATION_LOCKUP_SAFE_MARGIN_RATIO,
          titleSafeBox: titleSafeBoxForDirection(backgroundDirectionSpec)
        });
        const { evidence, acceptance } = buildLockupAcceptanceResult({
          source: "reused",
          sourceGenerationId: reusableAssets.sourceGenerationId,
          reusableValidation: reusableAssets.lockupValidation,
          textValidation: null,
          fit: reusableFit
        });

        if (acceptance.accepted) {
          lockupReuseValidation = {
            renderResult: {
              png: reusableAssets.lockupPng,
              width: reusableLockupWidth,
              height: reusableLockupHeight
            },
            effectivePrompt: lockupPrompt,
            textValidation: null,
            textOverrideRetried: false,
            fit: reusableFit,
            evidence,
            acceptance
          };
        } else {
          shouldReuseLockup = false;
          lockupRecipeForRender = generatedLockupRecipeForRender;
          lockupReuseBlockedReasons = acceptance.invalidReasons;
        }
      }
      lockupPrompt = buildLockupGenerationPrompt({
        title: content.title,
        subtitle: content.subtitle,
        styleMode: lockupStyleMode,
        lockupLayout,
        explorationMode: shouldRunExplorationToneCheck,
        directionSpec: backgroundDirectionSpec || directionSpec,
        designSpec: activeDesignSpec,
        references,
        bibleCreativeBrief,
        wantsSeriesMark: (backgroundDirectionSpec || directionSpec)?.wantsSeriesMark || false,
        brandMode: params.project.brandMode,
        typographyDirection: organizationTypographyDirection,
        optionalMarkAccentHexes: palette
      });
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
      const renderLockupAttempt = async (fontSeed: string) => {
        imageCallSummary.byStage.lockup += 1;
        return renderValidatedLockupPng({
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
      };
      const lockupRenderComputation: LockupComputationSelection = lockupReuseValidation
        ? {
            ...lockupReuseValidation,
            effectivePrompt: lockupPrompt
          }
        : shouldRunExplorationToneCheck
          ? await (async () => {
              const lockupCandidateLimit = createConcurrencyLimiter(ROUND1_CANDIDATE_PARALLEL_CONCURRENCY);
              const candidates = await Promise.all(
                Array.from({ length: lockupCandidateCount }, (_, candidateIndex) =>
                  lockupCandidateLimit(async () => {
                    const computation = await renderLockupAttempt(`${fontSeedBase}|lockup-candidate-${candidateIndex}`);
                    const fit = evaluateLockupFit({
                      lockupWidth: computation.renderResult.width,
                      lockupHeight: computation.renderResult.height,
                      shape: OPTION_MASTER_BACKGROUND_SHAPE,
                      canvasWidth: masterDimensions.width,
                      canvasHeight: masterDimensions.height,
                      marginRatio: ROUND1_EXPLORATION_LOCKUP_SAFE_MARGIN_RATIO,
                      titleSafeBox: titleSafeBoxForDirection(backgroundDirectionSpec)
                    });
                    const { evidence, acceptance } = buildLockupAcceptanceResult({
                      source: "generated",
                      sourceGenerationId: null,
                      reusableValidation: null,
                      textValidation: computation.textValidation,
                      fit
                    });
                    let score = 0;
                    score += acceptance.checks.textIntegrity === true ? 130 : -130;
                    score += acceptance.checks.fitPass === true ? 95 : -95;
                    score += fit.notTooSmall ? 26 : -26;
                    score += fit.score * 28;
                    score -= computation.textOverrideRetried ? 4 : 0;
                    const debugUrl = await writeGenerationPreviewFiles({
                      fileName: `${plannedGeneration.id}-lockup-candidate-${candidateIndex}.png`,
                      png: computation.renderResult.png
                    });

                    return {
                      computation,
                      score,
                      checks: {
                        textIntegrity: acceptance.checks.textIntegrity === true,
                        fitPass: acceptance.checks.fitPass === true,
                        insideTitleSafeWithMargin: fit.insideTitleSafeWithMargin,
                        notTooSmall: fit.notTooSmall
                      },
                      fit,
                      evidence,
                      acceptance,
                      debugUrl
                    };
                  })
                )
              );

              const indexedCandidates = candidates.map((candidate, index) => ({ candidate, index }));
              const eligible = indexedCandidates.filter((entry) => entry.candidate.acceptance.accepted);
              const bestCandidate = indexedCandidates.reduce(
                (best, current) => (current.candidate.score > best.candidate.score ? current : best),
                indexedCandidates[0]
              );
              const winner = eligible.length > 0
                ? eligible.reduce(
                    (best, current) => (current.candidate.score > best.candidate.score ? current : best),
                    eligible[0]
                  )
                : null;

              rerankMeta = {
                ...rerankMeta,
                lockupCandidates: candidates.map((candidate) => ({
                  url: candidate.debugUrl,
                  score: candidate.score,
                  invalidReasons: candidate.acceptance.invalidReasons,
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
                ...(winner
                  ? {
                      lockupWinnerIndex: winner.index
                    }
                  : {})
              };

              const selectedCandidate = winner?.candidate || bestCandidate.candidate;
              return {
                renderResult: selectedCandidate.computation.renderResult,
                effectivePrompt: selectedCandidate.computation.effectivePrompt,
                textValidation: selectedCandidate.computation.textValidation,
                textOverrideRetried: selectedCandidate.computation.textOverrideRetried,
                fit: selectedCandidate.fit,
                evidence: selectedCandidate.evidence,
                acceptance: selectedCandidate.acceptance
              };
            })()
          : await (async () => {
              const computation = await renderLockupAttempt(fontSeedBase);
              const fit = evaluateLockupFit({
                lockupWidth: computation.renderResult.width,
                lockupHeight: computation.renderResult.height,
                shape: OPTION_MASTER_BACKGROUND_SHAPE,
                canvasWidth: masterDimensions.width,
                canvasHeight: masterDimensions.height,
                marginRatio: ROUND1_EXPLORATION_LOCKUP_SAFE_MARGIN_RATIO,
                titleSafeBox: titleSafeBoxForDirection(backgroundDirectionSpec)
              });
              const { evidence, acceptance } = buildLockupAcceptanceResult({
                source: "generated",
                sourceGenerationId: null,
                reusableValidation: null,
                textValidation: computation.textValidation,
                fit
              });
              return {
                ...computation,
                fit,
                evidence,
                acceptance
              };
            })();
      const lockupRenderResult = lockupRenderComputation.renderResult;
      const effectiveLockupPrompt = lockupRenderComputation.effectivePrompt;
      const lockupTextValidation = lockupRenderComputation.textValidation;
      const lockupTextOverrideRetried = lockupRenderComputation.textOverrideRetried;
      const currentLockupEvidence = lockupRenderComputation.evidence;
      const currentLockupAcceptance = lockupRenderComputation.acceptance;
      const lockupPngForComposite =
        shouldRunExplorationToneCheck && !shouldReuseLockup
          ? await padLockupForSafeMargin(lockupRenderResult.png, ROUND1_EXPLORATION_LOCKUP_SAFE_MARGIN_RATIO)
          : lockupRenderResult.png;
      const lockupPath = await writeGenerationPreviewFiles({
        fileName: `${plannedGeneration.id}-lockup.png`,
        png: lockupRenderResult.png
      });
      const finalDirectionSpec = backgroundDirectionSpec || directionSpec;
      const finalistCanonicalization = await ensureCanonicalFinalistOutputs({
        generationId: plannedGeneration.id,
        optionIndex: plannedGeneration.optionIndex,
        optionStyleFamily,
        templateBrief,
        content,
        lockupRecipe: lockupRecipeForRender,
        lockupPresetId,
        fontSeed: fontSeedBase,
        lockupIntegrationMode,
        directionSpec: finalDirectionSpec,
        masterBackgroundPng: masterAttempt.backgroundPng,
        lockupPng: lockupPngForComposite,
        resolvedLockupPalette
      });
      const aspectRecoverySummary = PREVIEW_SHAPES.flatMap((shape) => {
        const attempts = finalistCanonicalization.aspectRecoveryAttemptsByShape[shape];
        if (attempts <= 0) {
          return [];
        }
        return [`${shape} x${attempts}`];
      }).join(", ");

      const promptUsed = [
        `master(${OPTION_MASTER_BACKGROUND_SHAPE}): ${masterAttempt.prompt}`,
        finalDirectionSpec
          ? `[direction: ${finalDirectionSpec.optionLabel} ${finalDirectionSpec.styleFamily || "unassigned"} / ${finalDirectionSpec.laneFamily} / ${finalDirectionSpec.compositionType}]`
          : "",
        finalDirectionSpec?.referenceId
          ? `[reference-anchor: ${finalDirectionSpec.referenceId}${resolvedReferenceCluster ? `/${resolvedReferenceCluster}` : ""}]`
          : "",
        selectedVariationTemplateKey ? `[variation-template: ${selectedVariationTemplateKey}]` : "",
        effectiveDirectionStyleFamily ? `[style-family: ${effectiveDirectionStyleFamily}]` : "",
        effectiveDirectionStyleBucket ? `[style-bucket: ${effectiveDirectionStyleBucket}]` : "",
        effectiveDirectionStyleTone ? `[style-tone: ${effectiveDirectionStyleTone}]` : "",
        effectiveDirectionStyleMedium ? `[style-medium: ${effectiveDirectionStyleMedium}]` : "",
        shouldReuseBackground && reusableAssets ? `[reuse: background from ${reusableAssets.sourceGenerationId}]` : "",
        shouldReuseLockup && reusableAssets ? `[reuse: lockup from ${reusableAssets.sourceGenerationId}]` : "",
        `[lockup-style-mode: ${lockupStyleMode}]`,
        `[lockup-layout: ${lockupLayout}]`,
        `[lockup-integration: ${lockupIntegrationMode}]`,
        `[title-integration-mode: ${resolveDesignSpecTitleIntegrationMode({
          designSpec: activeDesignSpec,
          directionSpec: finalDirectionSpec
        })}]`,
        activeDesignSpec ? `[design-spec: ${summarizeDesignSpecForPrompt(activeDesignSpec)}]` : "",
        finalDirectionSpec?.wantsSeriesMark ? "[series-mark: requested]" : "[series-mark: not-requested]",
        finalDirectionSpec?.wantsTitleStage ? "[title-stage: requested]" : "[title-stage: not-requested]",
        finalDirectionSpec?.motifFocus && finalDirectionSpec.motifFocus.length > 0
          ? `[motif-focus: ${finalDirectionSpec.motifFocus.join(" + ")}]`
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
          ? typeof rerankMeta.lockupWinnerIndex === "number"
            ? `[rerank-lockup: winner=${rerankMeta.lockupWinnerIndex + 1}/${rerankMeta.lockupCandidates.length}]`
            : `[rerank-lockup: winner=none/${rerankMeta.lockupCandidates.length}]`
          : "",
        originalityRetried ? "[retry: originality-guard]" : "",
        masterAttempt.textRetryCount > 0 ? `[retry: no-text x${masterAttempt.textRetryCount}]` : "",
        masterAttempt.paletteRetryCount > 0 ? `[retry: brand-palette x${masterAttempt.paletteRetryCount}]` : "",
        masterAttempt.toneRetryCount > 0 ? `[retry: tone-compliance x${masterAttempt.toneRetryCount}]` : "",
        masterAttempt.textArtifactRetryCount > 0 ? `[retry: text-artifact x${masterAttempt.textArtifactRetryCount}]` : "",
        finalistCanonicalization.finalistCanonicalizationSucceeded
          ? "[finalist-canonicalization: passed]"
          : "[finalist-canonicalization: failed]",
        aspectRecoverySummary ? `[aspect-recovery: ${aspectRecoverySummary}]` : "",
        shouldUseCheapRound1Mode
          ? "cheap mode: widescreen-first exploration only; completion requires canonical finalist wide/square/tall assets."
          : "finalist completion uses canonical wide/square/tall renders from one shared background + one shared lockup."
      ]
        .filter(Boolean)
        .join(" ");
      const byShape = finalistCanonicalization.byShape;
      const designDocByShape: Record<PreviewShape, DesignDoc> = {
        square: byShape.square.designDoc,
        wide: byShape.wide.designDoc,
        tall: byShape.tall.designDoc
      };
      const previewPathByShape = finalistCanonicalization.canonicalAssetPathsByShape;
      const aspectAssets = finalistCanonicalization.aspectAssets;

      const backgroundAssetRows: Prisma.AssetCreateManyInput[] = PREVIEW_SHAPES.flatMap((shape) => {
        const backgroundPath = byShape[shape].backgroundPath;
        if (!backgroundPath) {
          return [];
        }
        return [
          {
            projectId: params.project.id,
            generationId: plannedGeneration.id,
            kind: "BACKGROUND",
            slot: BACKGROUND_ASSET_SLOT_BY_SHAPE[shape],
            file_path: backgroundPath,
            mime_type: "image/png",
            width: PREVIEW_DIMENSIONS[shape].width,
            height: PREVIEW_DIMENSIONS[shape].height
          }
        ];
      });
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
      const finalAssetRows: Prisma.AssetCreateManyInput[] = PREVIEW_SHAPES.flatMap((shape) => {
        const filePath = previewPathByShape[shape];
        if (!filePath) {
          return [];
        }
        return [
          {
            projectId: params.project.id,
            generationId: plannedGeneration.id,
            kind: "IMAGE",
            slot: FINAL_ASSET_SLOT_BY_SHAPE[shape],
            file_path: filePath,
            mime_type: "image/png",
            width: PREVIEW_DIMENSIONS[shape].width,
            height: PREVIEW_DIMENSIONS[shape].height
          }
        ];
      });
      const lockupSourceForSuccess: DebugAssetSource = currentLockupEvidence.source;
      const productionValidation = {
        version: 1 as const,
        background: buildProductionBackgroundValidationEvidence({
          source: backgroundSourceForSuccess,
          sourceGenerationId: shouldReuseBackground && reusableAssets ? reusableAssets.sourceGenerationId : null,
          reusableValidation: shouldReuseBackground ? reusableAssets?.backgroundValidation || null : null,
          backgroundAttempts: backgroundAttemptDiagnostics,
          toneCheck: masterAttempt.toneCheck || null,
          backgroundTextCheck: masterAttempt.backgroundTextCheck || null
        }),
        lockup: currentLockupEvidence,
        aspects: {
          widescreen: {
            provenance: "rendered" as const
          },
          square: {
            provenance: "rendered" as const
          },
          vertical: {
            provenance: "rendered" as const
          }
        }
      };
      const usedReferenceIds = [...new Set(backgroundStyleRefs.map((reference) => reference.referenceId))];
      const lockupReuseBlockedWarning =
        lockupReuseBlockedReasons.length > 0
          ? `Lockup reuse blocked by hard gate: ${lockupReuseBlockedReasons.join(", ")}.`
          : null;
      const warnings = appendUniqueDebugWarning(
        imageCallCapReached
          ? appendUniqueDebugWarning(fallbackOutput.meta.debug?.warnings, ROUND1_IMAGE_CALL_CAP_WARNING)
          : fallbackOutput.meta.debug?.warnings,
        lockupReuseBlockedWarning
      );
      const refinementDebugPayload = buildRefinementDebugPayload({
        input: plannedGeneration.input,
        directionSpec: backgroundDirectionSpec || directionSpec
      });
      const debugMeta = mergeGenerationDebugMeta(
        mergeReferenceAnchorDebugMeta(fallbackOutput.meta.debug, referenceAnchorDebug),
        {
          backgroundSource: backgroundSourceForSuccess,
          lockupSource: lockupSourceForSuccess,
          generationLifecycleState: "GENERATION_COMPLETED",
          backgroundFailureReason: null,
          backgroundRecoveryAttempted: selectedBackgroundRecovery.attempted,
          backgroundRecoveryAttempts: selectedBackgroundRecovery.attempts,
          backgroundRecoveryReasons: selectedBackgroundRecovery.reasons,
          backgroundRecoverySucceeded: selectedBackgroundRecovery.succeeded,
          backgroundRecoveryFinalReasons: selectedBackgroundRecovery.finalReasons,
          imageProvider: buildImageProviderDebugMeta(params.providerPreflight),
          ...(selectedBackgroundTextScrub
            ? {
                textScrub: selectedBackgroundTextScrub
              }
            : {}),
          warnings,
          imageCalls: imageCallSummary,
          rateLimitWaitMs: imageRateLimitDebugMeta.rateLimitWaitMs ?? 0,
          aspectAssets,
          finalistCanonicalizationAttempted: finalistCanonicalization.finalistCanonicalizationAttempted,
          finalistCanonicalizationSucceeded: finalistCanonicalization.finalistCanonicalizationSucceeded,
          aspectRecoveryAttemptsByShape: finalistCanonicalization.aspectRecoveryAttemptsByShape,
          aspectRecoveryReasonsByShape: finalistCanonicalization.aspectRecoveryReasonsByShape,
          canonicalAssetPathsByShape: finalistCanonicalization.canonicalAssetPathsByShape,
          canonicalizationFailureReasons: finalistCanonicalization.canonicalizationFailureReasons,
          ...(shouldRunExplorationToneCheck
            ? {
                backgroundAttempts: backgroundAttemptDiagnostics
              }
            : {}),
          ...(refinementDebugPayload
            ? {
                refinement: refinementDebugPayload
              }
            : {})
        }
      );
      if (process.env.NODE_ENV === "development") {
        console.log("[REFERENCE ANCHOR DEBUG META]", {
          optionIndex: plannedGeneration.optionIndex,
          referenceId: directionSpec?.referenceId,
          visualAnchorSrc: referenceAnchorDebug?.visualAnchorSrc || referenceAnchorDebug?.backgroundAnchorSrc || null,
          typographyAnchorSrc: referenceAnchorDebug?.typographyAnchorSrc || referenceAnchorDebug?.lockupAnchorSrc || null,
          referenceAnchorDebug
        });
      }

      const completedOutput: GenerationOutputPayload = {
        ...fallbackOutput,
        status: "COMPLETED",
        designDoc: designDocByShape.square,
        designDocByShape,
        notes: "ai+split-background-lockup",
        promptUsed,
        meta: {
          styleRefCount: backgroundStyleRefs.length,
          usedStylePaths: backgroundStyleRefs.map((reference) => reference.sourcePath),
          usedReferenceIds,
          lockupValidation: {
            ok: currentLockupEvidence.textIntegrity === true,
            reasons:
              lockupTextValidation && lockupTextValidation.reasons.length > 0
                ? lockupTextValidation.reasons
                : currentLockupEvidence.textIntegrity === true
                  ? []
                  : currentLockupAcceptance.invalidReasons,
            retried: lockupTextOverrideRetried
          },
          productionValidation,
          debug: debugMeta,
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
            directionSpec: backgroundDirectionSpec || directionSpec,
            templateStyleFamily: optionStyleFamily,
            styleFamilies: designBrief.styleFamilies,
            styleFamily: effectiveDirectionStyleFamily || null,
            styleBucket: effectiveDirectionStyleBucket || null,
            styleTone: effectiveDirectionStyleTone || null,
            styleMedium: effectiveDirectionStyleMedium || null,
            referenceIds: usedReferenceIds,
            referenceId: backgroundDirectionSpec?.referenceId || directionSpec?.referenceId || references[0]?.id || null,
            referenceCluster: resolvedReferenceCluster,
            referenceTier: resolvedReferenceTier,
            variationTemplateKey: selectedVariationTemplateKey,
            titleIntegrationMode: resolveDesignSpecTitleIntegrationMode({
              designSpec: activeDesignSpec,
              directionSpec: backgroundDirectionSpec || directionSpec
            }),
            templateKey: activeDesignSpec?.composition.templateKey || selectedVariationTemplateKey || null,
            typeRegion: activeDesignSpec?.composition.typeRegion || null,
            motifRegion: activeDesignSpec?.composition.motifRegion || null,
            motifScope: backgroundDirectionSpec?.motifScope || directionSpec?.motifScope || motifBankContext.scriptureScope,
            lockupPresetId,
            lockupLayout,
            wantsTitleStage: (backgroundDirectionSpec || directionSpec)?.wantsTitleStage === true,
            wantsSeriesMark: (backgroundDirectionSpec || directionSpec)?.wantsSeriesMark === true,
            motifFocus: (backgroundDirectionSpec || directionSpec)?.motifFocus || [],
            designSpec: activeDesignSpec,
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
            reusedLockupFromGenerationId: shouldReuseLockup && reusableAssets ? reusableAssets.sourceGenerationId : null,
            ...(inputRefinementLineage
              ? {
                  refinement: {
                    refinementChainId: inputRefinementLineage.refinementChainId,
                    anchorDirectionFingerprint: inputRefinementLineage.anchorDirectionFingerprint,
                    lockedStyleInvariants: inputRefinementLineage.lockedStyleInvariants,
                    appliedFeedbackDeltas: inputRefinementLineage.appliedFeedbackDeltas,
                    seenVariantFingerprints: inputRefinementLineage.seenVariantFingerprints,
                    variantMutationAxis: refinementDebugPayload?.variantMutationAxis || null,
                    variantFingerprint: refinementDebugPayload?.variantFingerprint || null
                  },
                  refinementChainId: inputRefinementLineage.refinementChainId,
                  anchorDirectionFingerprint: inputRefinementLineage.anchorDirectionFingerprint,
                  lockedInvariantsSummary: summarizeLockedStyleInvariants(inputRefinementLineage.lockedStyleInvariants),
                  variantMutationAxis: refinementDebugPayload?.variantMutationAxis || null
                }
              : {})
          }
        },
        preview: {
          square_main: previewPathByShape.square || "",
          widescreen_main: previewPathByShape.wide || "",
          vertical_main: previewPathByShape.tall || ""
        }
      };
      if (process.env.NODE_ENV === "development") {
        console.log("[REFERENCE ANCHOR PERSISTED META.DEBUG]", {
          optionIndex: plannedGeneration.optionIndex,
          debug: completedOutput.meta?.debug
        });
      }
      const persistedInputWithLockupPalette = withResolvedLockupPaletteInput(
        plannedGeneration.input,
        {
          ...designBrief,
          lockupRecipe: lockupRecipeForRender
        },
        resolvedLockupPalette
      );
      failSafeInput = persistedInputWithLockupPalette;
      const completionValidation = resolveProductionValidOption({
        output: completedOutput,
        dbStatus: "COMPLETED",
        assets: [...backgroundAssetRows, lockupAssetRow, ...finalAssetRows].map(r => ({
          kind: r.kind!,
          slot: r.slot ?? null,
          file_path: r.file_path
        }))
      });
      const persistedProductionValidation = toPersistedProductionValidationSnapshot(completionValidation);
      const completedOutputWithValidation: GenerationOutputPayload = {
        ...completedOutput,
        meta: {
          ...completedOutput.meta,
          productionValidation: persistedProductionValidation
        }
      };
      if (!completionValidation.valid) {
        const failureReason: BackgroundAttemptFailureReason = Object.values(completionValidation.failedChecks.aspects).some(
          (aspectReasons) => aspectReasons.length > 0
        )
          ? "MISSING_ASPECT_ASSET"
          : "UNKNOWN";
        const validationWarning = `Production-validity gate failed: ${completionValidation.invalidReasons.join(", ") || "unknown_reason"}.`;
        const canonicalizationWarning =
          finalistCanonicalization.canonicalizationFailureReasons.length > 0
            ? `Finalist canonicalization failed: ${finalistCanonicalization.canonicalizationFailureReasons.join("; ")}.`
            : null;
        const failedOutput: GenerationOutputPayload = {
          ...completedOutputWithValidation,
          status: "FAILED_GENERATION",
          notes: "production_validity_failed",
          meta: {
            ...completedOutputWithValidation.meta,
            productionValidation: persistedProductionValidation,
            debug: mergeGenerationDebugMeta(completedOutputWithValidation.meta.debug, {
              generationLifecycleState: resolveGenerationLifecycleStateForFailure(failureReason),
              backgroundFailureReason: failureReason,
              imageProvider: buildImageProviderDebugMeta(params.providerPreflight),
              aspectAssets,
              warnings: appendUniqueDebugWarning(
                appendUniqueDebugWarning(
                  appendUniqueDebugWarning(completedOutputWithValidation.meta.debug?.warnings, validationWarning),
                  canonicalizationWarning
                ),
                "Option failed production-validity gate."
              )
            })
          }
        };
        const persisted = await persistGenerationSettlement({
          generationId: plannedGeneration.id,
          status: "FAILED",
          output: failedOutput,
          input: persistedInputWithLockupPalette,
          attemptOwner: plannedGeneration.attemptOwner,
          applyAssetChanges: async (tx) => {
            await tx.asset.deleteMany({
              where: {
                generationId: plannedGeneration.id,
                slot: {
                  in: [...PREVIEW_ASSET_SLOTS_TO_CLEAR]
                }
              }
            });
          }
        });
        failSafeReason = failureReason;
        provisionalResult = {
          generationId: plannedGeneration.id,
          optionStatus: persisted ? "FAILED_GENERATION" : await readPersistedGenerationOptionStatus(plannedGeneration.id),
          failureReason
        };
      } else {
        const persisted = await persistGenerationSettlement({
          generationId: plannedGeneration.id,
          status: "COMPLETED",
          output: completedOutputWithValidation,
          input: persistedInputWithLockupPalette,
          attemptOwner: plannedGeneration.attemptOwner,
          applyAssetChanges: async (tx) => {
            await tx.asset.deleteMany({
              where: {
                generationId: plannedGeneration.id,
                slot: {
                  in: [...PREVIEW_ASSET_SLOTS_TO_CLEAR]
                }
              }
            });
            await tx.asset.createMany({
              data: [...backgroundAssetRows, lockupAssetRow, ...finalAssetRows]
            });
          }
        });
        provisionalResult = {
          generationId: plannedGeneration.id,
          optionStatus: persisted ? "COMPLETED" : await readPersistedGenerationOptionStatus(plannedGeneration.id),
          failureReason: null
        };
      }
      })(),
      new Promise<never>((_, reject) => {
        executionTimeoutId = setTimeout(() => {
          const timeoutError = new ClaimedGenerationExecutionTimeoutError(
            plannedGeneration.id,
            claimedGenerationExecutionTimeoutMs
          );
          executionLease.abort(timeoutError);
          reject(timeoutError);
        }, claimedGenerationExecutionTimeoutMs);
      })
      ]);
      } finally {
        if (executionTimeoutId) {
          clearTimeout(executionTimeoutId);
        }
      }
    } catch (error) {
      const claimTimedOut = isClaimedGenerationExecutionTimeoutError(error);
      if (claimTimedOut) {
        executionLease.abort(error);
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      const failureReason = resolveBackgroundAttemptFailureReason(error, imageCallCapReached);
      failSafeReason = failureReason;
      failSafeMessage = `Generation branch threw before terminal settlement: ${message}`;
      console.error(
        `OpenAI preview generation failed for generation ${plannedGeneration.id} (${plannedGeneration.presetKey}). Settling as failed after active background work is exhausted. ${message}`
      );
      try {
        const optionStatus = await settleUnexpectedClaimedGenerationFailure({
          claimTimedOut,
          finalizeTimedOutBackgroundWork: claimTimedOut
            ? async () => {
                await executionLease.finalizeTimedOutHarnessWork();
              }
            : undefined,
          persistTerminalFailure: async () =>
            persistMinimalFailedGenerationSettlement({
              generationId: plannedGeneration.id,
              output: fallbackOutput,
              failureReason,
              providerPreflight: params.providerPreflight,
              attemptOwner: plannedGeneration.attemptOwner,
              input: failSafeInput,
              notes: "generation_failed",
              warningMessages: [
                claimTimedOut ? "Timed-out background work was exhausted before terminal failure settlement." : null,
                `Generation error: ${message}`
              ]
            }),
          readPersistedStatus: async () => readPersistedGenerationOptionStatus(plannedGeneration.id)
        });
        provisionalResult = {
          generationId: plannedGeneration.id,
          optionStatus,
          failureReason
        };
      } catch (failureSettlementError) {
        const settlementMessage =
          failureSettlementError instanceof Error ? failureSettlementError.message : "Unknown terminal failure settlement error";
        failSafeMessage = `Failed-generation settlement failed before terminal settlement: ${settlementMessage}`;
        const persisted = await persistMinimalFailedGenerationSettlement({
          generationId: plannedGeneration.id,
          output: fallbackOutput,
          failureReason,
          providerPreflight: params.providerPreflight,
          attemptOwner: plannedGeneration.attemptOwner,
          input: failSafeInput,
          notes: "generation_failed",
          warningMessages: [
            claimTimedOut ? "Timed-out background work finalization failed before terminal settlement." : null,
            "Failed-generation settlement retry failed.",
            `Generation error: ${message}`,
            `Settlement error: ${settlementMessage}`
          ]
        });
        provisionalResult = {
          generationId: plannedGeneration.id,
          optionStatus: persisted ? "FAILED_GENERATION" : await readPersistedGenerationOptionStatus(plannedGeneration.id),
          failureReason
        };
      }
    }
      }
      return ensureClaimedGenerationTerminalResult({
        generationId: plannedGeneration.id,
        fallbackOutput,
        providerPreflight: params.providerPreflight,
        attemptOwner: plannedGeneration.attemptOwner,
        // Prefer the failure reason recorded by completeWithBackgroundFallback (via provisionalResult)
        // over the generic failSafeReason="UNKNOWN" that is only updated in the exception path.
        failureReason: provisionalResult?.failureReason ?? failSafeReason,
        input: failSafeInput,
        provisionalResult,
        failSafeMessage
      });
    }))
    );

    return optionResults;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown shared generation setup error";
    const failureReason = resolveBackgroundAttemptFailureReason(error);
    console.error(`[generation-batch] claimed rows exited before per-row settlement. ${message}`);
    return Promise.all(
      params.plannedGenerations.map((plannedGeneration) =>
        ensureClaimedGenerationTerminalResult({
          generationId: plannedGeneration.id,
          fallbackOutput: plannedGeneration.fallbackOutput,
          providerPreflight: params.providerPreflight,
          attemptOwner: plannedGeneration.attemptOwner,
          failureReason,
          provisionalResult: null,
          failSafeMessage: `Shared generation branch failed before terminal settlement: ${message}`
        })
      )
    );
  }
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
  const roundOneLaunchTarget = `/app/projects/${projectId}/generations`;
  const roundOneLaunchState = await acquireRoundOneLaunchSingleFlight({
    prisma,
    projectId: project.id
  });
  if (roundOneLaunchState.kind === "duplicate") {
    redirect(roundOneLaunchTarget);
  }
  const roundOneLaunchLease = roundOneLaunchState.lease;
  let roundOneLaunchGenerationIds: string[] = [];
  let roundOneLaunchReleased = false;
  const releaseRoundOneLaunch = async (terminalStatus: "COMPLETED" | "FAILED", note?: string | null): Promise<void> => {
    if (roundOneLaunchReleased) {
      return;
    }

    const finalized = await finalizeRoundOneLaunchSingleFlight({
      prisma,
      lease: roundOneLaunchLease,
      terminalStatus,
      generationIds: roundOneLaunchGenerationIds,
      note
    });
    roundOneLaunchReleased = true;
    if (!finalized) {
      console.warn(`[round1-single-flight] lease release missed project=${project.id} status=${terminalStatus}`);
    }
  };
  const summarizeRoundOneLaunchError = (error: unknown): string => {
    const message = error instanceof Error ? error.message : "unknown_round_one_launch_error";
    const normalized = message.replace(/\s+/g, " ").trim();
    return `generate_round_one_action_threw:${normalized.slice(0, 160)}`;
  };

  try {
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
      await releaseRoundOneLaunch("FAILED", "insufficient_presets");
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
        await releaseRoundOneLaunch("FAILED", "invalid_design_brief");
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

    roundOneLaunchGenerationIds = plannedGenerations.map((generation) => generation.id);
    await prisma.$transaction(
      plannedGenerations.map(({ id: generationId, presetId: generationPresetId, input: generationInput }) =>
        prisma.generation.create({
          data: {
            id: generationId,
            projectId: project.id,
            presetId: generationPresetId,
            round: 1,
            status: "QUEUED",
            input: generationInput
          }
        })
      )
    );

    const attachedLaunchGenerationIds = await attachRoundOneLaunchGenerationIds({
      prisma,
      lease: roundOneLaunchLease,
      generationIds: roundOneLaunchGenerationIds
    });
    if (!attachedLaunchGenerationIds) {
      console.warn(`[round1-single-flight] generation ids attach missed project=${project.id}`);
    }

    const providerPreflight = await preflightImageProvider();
    if (!providerPreflight.ok) {
      await abortRoundForProviderFailure({
        projectId: project.id,
        plannedGenerations,
        providerPreflight
      });
      await releaseRoundOneLaunch("FAILED", "provider_preflight_aborted");
      redirect(roundOneLaunchTarget);
    }
    const firstAttemptGenerations = await claimPlannedGenerationAttempts({
      plannedGenerations,
      mode: "initial"
    });

    const shouldEnforceRound1NonFallbackRequirement = !hasDesignNotes;
    const optionResultByGenerationId = new Map<string, PlannedGenerationRunResult>();
    let totalRoundAttemptCount = 0;
    let hardStopFailureReason: BackgroundAttemptFailureReason | null = null;
    let retryCursor = 0;
    const upsertResults = (results: PlannedGenerationRunResult[]) => {
      totalRoundAttemptCount += results.length;
      for (const result of results) {
        optionResultByGenerationId.set(result.generationId, result);
      }
    };
    const countCompleted = (): number =>
      plannedGenerations.filter((generation) => optionResultByGenerationId.get(generation.id)?.optionStatus === "COMPLETED").length;

    const firstAttemptResults = await createOpenAiPreviewAssetsForPlannedGenerations({
      organizationId: session.organizationId,
      project,
      plannedGenerations: firstAttemptGenerations,
      providerPreflight,
      bibleCreativeBrief,
      motifBankContext
    });
    upsertResults(firstAttemptResults);
    hardStopFailureReason = pickRoundOperationalFailureReason(firstAttemptResults.map((result) => result.failureReason));
    if (!hardStopFailureReason && firstAttemptResults.some((result) => result.failureReason === "BUDGET")) {
      hardStopFailureReason = "BUDGET";
    }

    if (shouldEnforceRound1NonFallbackRequirement) {
      while (
        !hardStopFailureReason &&
        countCompleted() < ROUND_OPTION_COUNT &&
        totalRoundAttemptCount < ROUND1_NON_FALLBACK_MAX_ATTEMPTS
      ) {
        const remainingAttempts = ROUND1_NON_FALLBACK_MAX_ATTEMPTS - totalRoundAttemptCount;
        if (remainingAttempts <= 0) {
          break;
        }
        const incompleteGenerations = plannedGenerations.filter(
          (generation) => optionResultByGenerationId.get(generation.id)?.optionStatus !== "COMPLETED"
        );
        if (incompleteGenerations.length === 0) {
          break;
        }

        const batchSize = Math.min(remainingAttempts, incompleteGenerations.length);
        const retryBatch = Array.from({ length: batchSize }, (_, offset) => {
          const index = (retryCursor + offset) % incompleteGenerations.length;
          return incompleteGenerations[index];
        });
        retryCursor = incompleteGenerations.length > 0 ? (retryCursor + batchSize) % incompleteGenerations.length : 0;
        const claimedRetryBatch = await claimPlannedGenerationAttempts({
          plannedGenerations: retryBatch,
          mode: "retry"
        });
        const retryResults = await createOpenAiPreviewAssetsForPlannedGenerations({
          organizationId: session.organizationId,
          project,
          plannedGenerations: claimedRetryBatch,
          providerPreflight,
          bibleCreativeBrief,
          motifBankContext
        });
        upsertResults(retryResults);
        hardStopFailureReason = pickRoundOperationalFailureReason(retryResults.map((result) => result.failureReason));
        if (hardStopFailureReason) {
          break;
        }
        if (retryResults.some((result) => result.failureReason === "BUDGET")) {
          hardStopFailureReason = "BUDGET";
          break;
        }
      }
    }

    const finalResults = plannedGenerations.map((generation) => {
      const known = optionResultByGenerationId.get(generation.id);
      return (
        known || {
          generationId: generation.id,
          optionStatus: "FAILED_GENERATION" as GenerationOptionStatus,
          failureReason: "UNKNOWN" as BackgroundAttemptFailureReason
        }
      );
    });
    const authoritativeSettlement = await reconcileRoundOneAuthoritativeSettlement({
      projectId: project.id,
      lease: roundOneLaunchLease,
      plannedGenerations,
      results: finalResults,
      roundAttemptCount: totalRoundAttemptCount,
      roundRequiredCompletedCount: ROUND_OPTION_COUNT,
      providerPreflight
    });

    roundOneLaunchReleased = authoritativeSettlement.finalized;
    if (!roundOneLaunchReleased) {
      await releaseRoundOneLaunch(
        authoritativeSettlement.roundOutcome.roundStatus === "COMPLETED" ? "COMPLETED" : "FAILED",
        "round_authoritative_settlement_retry"
      );
    }
    redirect(roundOneLaunchTarget);
  } catch (error) {
    if (!roundOneLaunchReleased) {
      await releaseRoundOneLaunch("FAILED", summarizeRoundOneLaunchError(error));
    }
    throw error;
  }
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
          round: true,
          status: true,
          input: true,
          output: true
        }
      })
    : null;

  if (chosenGenerationId && !chosenGeneration) {
    return { error: "Selected direction was not found for this project." };
  }

  if (chosenGeneration && chosenGeneration.round !== parsed.data.currentRound) {
    return { error: "Selected direction must come from the current round." };
  }
  if (
    chosenGeneration &&
    resolveGenerationOptionStatus({
      output: chosenGeneration.output,
      dbStatus: chosenGeneration.status
    }) !== "COMPLETED"
  ) {
    return { error: "Selected direction is not eligible for refinement. Retry generation and choose a completed option." };
  }

  let selectedOptionIndex: number | null = null;
  if (chosenGeneration) {
    const roundGenerations = await prisma.generation.findMany({
      where: {
        projectId: project.id,
        round: chosenGeneration.round
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true
      }
    });
    const indexFromRoundOrder = roundGenerations.findIndex((generation) => generation.id === chosenGeneration.id);
    selectedOptionIndex = indexFromRoundOrder >= 0 ? indexFromRoundOrder : readOptionIndexFromGenerationOutput(chosenGeneration.output);
  }

  const fallbackOptionIndex = selectedOptionIndex ?? 0;
  const primaryDirectionSpec = chosenGeneration
    ? readDirectionSpecFromInput(chosenGeneration.input, fallbackOptionIndex) ||
      readDirectionSpecFromGenerationOutput(chosenGeneration.output, fallbackOptionIndex)
    : null;

  const styleDirection = normalizeStyleDirection(parsed.data.styleDirection);
  const explicitDirectionChangeRequested = isExplicitDirectionChangeRequest({
    styleDirection,
    feedbackText: parsed.data.feedbackText
  });
  const priorRefinementLineage = chosenGeneration
    ? readRefinementLineageFromInput(chosenGeneration.input) || readRefinementLineageFromGenerationOutput(chosenGeneration.output)
    : null;
  const enabledPresets = await findEnabledPresetsForOrganization(session.organizationId);
  const presetIdByKey = new Map(enabledPresets.map((preset) => [preset.key, preset.id] as const));
  const round = parsed.data.currentRound + 1;
  const useRefinementFunnel =
    round >= 2 &&
    !explicitDirectionChangeRequested &&
    selectedOptionIndex !== null &&
    Boolean(primaryDirectionSpec && chosenGenerationId);
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
  const primaryDirectionContext: PrimaryDirectionContext | null =
    primaryDirectionSpec && selectedOptionIndex !== null
      ? {
          sourceRound: parsed.data.currentRound,
          selectedOptionIndex,
          chosenGenerationId,
          mode: useRefinementFunnel ? "refinement_funnel" : "new_direction",
          explicitDirectionChangeRequested,
          directionSpec: primaryDirectionSpec
        }
      : null;
  let refinementLineageForRound: RefinementLineageState | null = null;
  let refinementVariantsForRound: PlannedRefinementVariant[] = [];
  const directionPlan =
    useRefinementFunnel && primaryDirectionSpec
      ? (() => {
          const outputReferenceAnchorIds = chosenGeneration ? readReferenceAnchorIdsFromGenerationOutput(chosenGeneration.output) : [];
          const lockedStyleInvariants =
            priorRefinementLineage?.lockedStyleInvariants ||
            buildLockedStyleInvariants({
              directionSpec: primaryDirectionSpec,
              referenceAnchorIds: outputReferenceAnchorIds
            });
          const anchorDirectionFingerprint =
            priorRefinementLineage?.anchorDirectionFingerprint || hashRefinementAnchorFingerprint(lockedStyleInvariants);
          const refinementChainId = priorRefinementLineage?.refinementChainId || randomUUID();
          const anchorVariantFingerprint = createRefinementVariantFingerprint({
            direction: primaryDirectionSpec,
            referenceAnchorIds: lockedStyleInvariants.referenceAnchorIds
          });
          const seenVariantFingerprints = normalizeRefinementReferenceIds([
            ...(priorRefinementLineage?.seenVariantFingerprints || []),
            anchorVariantFingerprint
          ]);
          const refinementPlan = planRefinementDirectionSet({
            runSeed,
            primaryDirection: primaryDirectionSpec,
            motifPool: [...bibleCreativeBrief.motifs, ...bibleCreativeBrief.markIdeas, ...bibleCreativeBrief.allowedGenericMotifs],
            optionCount: ROUND_OPTION_COUNT,
            lockedInvariants: lockedStyleInvariants,
            seenVariantFingerprints
          });
          refinementVariantsForRound = refinementPlan.variants;
          const variantMutations: NonNullable<RefinementFeedbackDelta["variantMutations"]> = refinementPlan.variants.map((variant) => ({
            optionLabel: variant.optionLabel,
            axis: variant.axis,
            fingerprint: variant.fingerprint,
            noveltyRetryApplied: variant.noveltyRetryApplied
          }));
          const nextSeenVariantFingerprints = normalizeRefinementReferenceIds([
            ...seenVariantFingerprints,
            ...refinementPlan.variants.map((variant) => variant.fingerprint)
          ]);
          refinementLineageForRound = {
            refinementChainId,
            anchorDirectionFingerprint,
            lockedStyleInvariants: refinementPlan.lockedInvariants,
            appliedFeedbackDeltas: [
              ...(priorRefinementLineage?.appliedFeedbackDeltas || []),
              {
                round,
                request: parsed.data.feedbackText || "",
                emphasis: parsed.data.emphasis,
                expressiveness: parsed.data.expressiveness,
                temperature: parsed.data.temperature,
                regenerateLockup: parsed.data.regenerateLockup,
                explicitNewTitleStyle: parsed.data.explicitNewTitleStyle,
                regenerateBackground: parsed.data.regenerateBackground,
                mode: "refinement_funnel",
                variantMutations
              }
            ],
            seenVariantFingerprints: nextSeenVariantFingerprints
          };
          return refinementPlan.directions;
        })()
      : planDirectionSet({
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

  const refsForOptions = await pickReferenceSetsForRound(project.id, round, ROUND_OPTION_COUNT, directionPlan);
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
      lockupLayoutsForOptions[index],
      primaryDirectionContext,
      refinementLineageForRound
    ),
    feedback: {
      sourceRound: parsed.data.currentRound,
      chosenGenerationId,
      selectedOptionIndex: primaryDirectionContext?.selectedOptionIndex,
      primaryDirectionMode: primaryDirectionContext?.mode,
      refinementChainId: refinementLineageForRound?.refinementChainId,
      anchorDirectionFingerprint: refinementLineageForRound?.anchorDirectionFingerprint,
      lockedStyleInvariants: refinementLineageForRound?.lockedStyleInvariants,
      variantMutationAxis: directionPlan[index]?.refinementMutationAxis || null,
      variantFingerprint:
        directionPlan[index]?.refinementVariantFingerprint ||
        refinementVariantsForRound[index]?.fingerprint ||
        null,
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
          status: "QUEUED",
          input: generationInput
        }
      })
    )
  );

  const providerPreflight = await preflightImageProvider();
  if (!providerPreflight.ok) {
    await abortRoundForProviderFailure({
      projectId: project.id,
      plannedGenerations,
      providerPreflight
    });
    redirect(`/app/projects/${projectId}/generations`);
  }
  const claimedGenerations = await claimPlannedGenerationAttempts({
    plannedGenerations,
    mode: "initial"
  });

  const results = await createOpenAiPreviewAssetsForPlannedGenerations({
    organizationId: session.organizationId,
    project,
    plannedGenerations: claimedGenerations,
    providerPreflight,
    bibleCreativeBrief,
    motifBankContext
  });
  await persistFinalRoundOutcome({
    generationIds: plannedGenerations.map((generation) => generation.id),
    results,
    roundAttemptCount: results.length,
    roundRequiredCompletedCount: ROUND_OPTION_COUNT
  });

  redirect(`/app/projects/${projectId}/generations`);
}

// ---------------------------------------------------------------------------
// Debug eval exports — used by the debug API route for eval mode
// These wrap private pixel analysis functions and return numeric scores.
// The underlying check implementations are not modified.
// ---------------------------------------------------------------------------

export type DebugScaffoldCheckResult = {
  luminanceStdDev: number;
  edgeDensity: number;
  meanLuminance: number;
  meanSaturation: number;
  motifEdgeRatio: number;
  scaffoldFree: boolean;
  scaffoldFailReason: string;
  manualLuminanceStdDev: number | null;
};

export async function runDebugScaffoldCheck(imageBuffer: Buffer): Promise<DebugScaffoldCheckResult> {
  console.log(`[runDebugScaffoldCheck] input buffer: ${imageBuffer.length} bytes`);

  const defaultTitleSafeBox: TitleSafeBox = { left: 0.1, top: 0.1, width: 0.8, height: 0.8 };

  // Replicate production path exactly:
  // 1. Try URL-based approach first (matches generation loop primary path)
  // 2. Fall back to direct buffer (matches evaluateBackgroundAttempt path)
  // Neither production path pre-processes via sharp before calling these functions.
  const toneStatsViaUrl = await computeImageToneStatsFromUrl(pngBufferToDataUrl(imageBuffer));
  console.log(`[runDebugScaffoldCheck] computeImageToneStatsFromUrl result:`, JSON.stringify(toneStatsViaUrl));

  const toneStats = toneStatsViaUrl ?? (await computeImageToneStatsFromBuffer(imageBuffer));
  console.log(`[runDebugScaffoldCheck] computeImageToneStatsFromBuffer result:`, JSON.stringify(toneStats));

  // Inline sharp diagnostic — does NOT swallow errors so we can see what's failing.
  // Also computes manual luminanceStdDev ignoring alpha so we know if the image has
  // real tonal variance even when the production function returns null (sampleCount=0).
  let manualLuminanceStdDev: number | null = null;
  try {
    const meta = await sharp(imageBuffer, { failOn: "none" }).metadata();
    console.log(`[runDebugScaffoldCheck] sharp metadata: width=${meta.width} height=${meta.height} format=${meta.format} channels=${meta.channels} size=${meta.size}`);
    try {
      const raster = await sharp(imageBuffer, { failOn: "none" })
        .resize({ width: TONE_STATS_SAMPLE_SIZE, height: TONE_STATS_SAMPLE_SIZE, fit: "fill" })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const { data: rasterData, info: rasterInfo } = raster;
      console.log(`[runDebugScaffoldCheck] sharp raster OK: ${rasterInfo.width}x${rasterInfo.height} channels=${rasterInfo.channels} bytes=${rasterData.length}`);

      // Manual luminanceStdDev — treats every pixel as opaque regardless of alpha value.
      // This reveals whether the image has real tonal content even if alpha is all-zero.
      const rw = rasterInfo.width;
      const rh = rasterInfo.height;
      const rc = rasterInfo.channels; // always 4 after ensureAlpha
      const totalPx = rw * rh;
      const lumByPx = new Float32Array(totalPx);
      let lumSum = 0;
      for (let i = 0; i < totalPx; i++) {
        const off = i * rc;
        const lum = 0.2126 * rasterData[off] + 0.7152 * rasterData[off + 1] + 0.0722 * rasterData[off + 2];
        lumByPx[i] = lum;
        lumSum += lum;
      }
      const meanLum = lumSum / totalPx;
      let varSum = 0;
      for (let i = 0; i < totalPx; i++) {
        const d = lumByPx[i] - meanLum;
        varSum += d * d;
      }
      manualLuminanceStdDev = Math.sqrt(varSum / totalPx);

      // Also sample alpha distribution to understand why sampleCount may be 0.
      let zeroAlphaCount = 0;
      for (let i = 0; i < totalPx; i++) {
        if (rasterData[i * rc + 3] <= 10) zeroAlphaCount++;
      }
      console.log(`[runDebugScaffoldCheck] alpha distribution: ${zeroAlphaCount}/${totalPx} pixels have alpha<=10 (${((zeroAlphaCount / totalPx) * 100).toFixed(1)}%)`);
      console.log(`[runDebugScaffoldCheck] manual luminanceStdDev: ${manualLuminanceStdDev.toFixed(4)} (mean=${meanLum.toFixed(1)})`);
    } catch (rasterErr) {
      console.error(`[runDebugScaffoldCheck] sharp raster FAILED:`, rasterErr);
    }
  } catch (metaErr) {
    console.error(`[runDebugScaffoldCheck] sharp metadata FAILED:`, metaErr);
  }

  const hardFailStats = await computeBackgroundHardFailStatsFromBuffer(imageBuffer, defaultTitleSafeBox, null);

  const luminanceStdDev = toneStats?.luminanceStdDev ?? 0;
  const edgeDensity = toneStats?.edgeDensity ?? 0;
  const motifEdgeRatio = hardFailStats?.focalComponentEdgeRatio ?? 0;
  const designPresencePass = passesDesignPresence(toneStats);
  const meaningfulStructurePass = hardFailStats?.meaningfulStructurePass === true;
  const frameScaffoldTriggered =
    hardFailStats?.mostEdgesAreLongStraightBorders === true && hardFailStats?.nonTitleLowDetail === true;
  const hardFailBlankDesign = !hardFailStats || !hardFailStats.passes;
  const scaffoldFree = designPresencePass && meaningfulStructurePass && !frameScaffoldTriggered && !hardFailBlankDesign;

  let scaffoldFailReason = "";
  if (!scaffoldFree) {
    if (luminanceStdDev < DESIGN_PRESENCE_MIN_LUMINANCE_STD_DEV) {
      scaffoldFailReason = `luminanceStdDev ${luminanceStdDev.toFixed(1)} < threshold ${DESIGN_PRESENCE_MIN_LUMINANCE_STD_DEV}`;
    } else if (edgeDensity < DESIGN_PRESENCE_MIN_EDGE_DENSITY) {
      scaffoldFailReason = `edgeDensity ${edgeDensity.toFixed(4)} < threshold ${DESIGN_PRESENCE_MIN_EDGE_DENSITY}`;
    } else if (frameScaffoldTriggered) {
      scaffoldFailReason = "frame scaffold detected (border-dominant edges)";
    } else if (!meaningfulStructurePass) {
      scaffoldFailReason = "meaningful structure check failed (non-title area low detail)";
    } else {
      scaffoldFailReason = "blank design";
    }
  }

  const meanLuminance = toneStats?.meanLuminance ?? 0;
  const meanSaturation = toneStats?.meanSaturation ?? 0;

  return { luminanceStdDev, edgeDensity, meanLuminance, meanSaturation, motifEdgeRatio, scaffoldFree, scaffoldFailReason, manualLuminanceStdDev };
}

export type DebugTextCheckResult = {
  pass1ComponentCount: number;
  pass2ComponentCount: number;
  textFree: boolean;
  textFailReason: string;
};

async function countDebugTextComponentsPass1(imageBuffer: Buffer): Promise<number> {
  const downscaled = await sharp(imageBuffer, { failOn: "none" })
    .resize({ width: 320, fit: "inside" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .catch(() => null);

  if (!downscaled || !downscaled.info.width || !downscaled.info.height) {
    return 0;
  }
  const width = downscaled.info.width;
  const height = downscaled.info.height;
  const pixels = downscaled.data;
  if (width < 32 || height < 32) {
    return 0;
  }

  const edgeMask = new Uint8Array(width * height);
  let edgeCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const gx = Math.abs(pixels[idx + 1] - pixels[idx - 1]);
      const gy = Math.abs(pixels[idx + width] - pixels[idx - width]);
      if (gx + gy > 72) {
        edgeMask[idx] = 1;
        edgeCount += 1;
      }
    }
  }

  const edgeRatio = edgeCount / (width * height);
  if (edgeRatio < 0.012 || edgeRatio > 0.34) {
    return 0;
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
        for (const neighbor of [current - 1, current + 1, current - width, current + width]) {
          if (neighbor <= 0 || neighbor >= edgeMask.length - 1 || !edgeMask[neighbor] || visited[neighbor]) {
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
      if (area >= 12 && area <= 2200 && boxArea <= 4600 && aspect >= 1.15 && aspect <= 15 && density >= 0.07 && density <= 0.62) {
        textLikeComponents += 1;
      }
    }
  }

  return textLikeComponents;
}

async function countDebugTextComponentsPass2(imageBuffer: Buffer): Promise<number> {
  const downscaled = await sharp(imageBuffer, { failOn: "none" })
    .resize({ width: 320, fit: "inside" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .catch(() => null);

  if (!downscaled || !downscaled.info.width || !downscaled.info.height) {
    return 0;
  }
  const width = downscaled.info.width;
  const height = downscaled.info.height;
  const pixels = downscaled.data;
  if (width < 32 || height < 32) {
    return 0;
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
    return 0;
  }

  const edgeMask = new Uint8Array(totalPixels);
  let edgeCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const gx = Math.abs(pixels[idx + 1] - pixels[idx - 1]);
      const gy = Math.abs(pixels[idx + width] - pixels[idx - width]);
      if (gx + gy > 68) {
        edgeMask[idx] = 1;
        edgeCount += 1;
      }
    }
  }

  const edgeRatio = edgeCount / totalPixels;
  if (edgeRatio < 0.01 || edgeRatio > 0.36) {
    return 0;
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
        for (const neighbor of [current - 1, current + 1, current - width, current + width]) {
          if (neighbor <= 0 || neighbor >= edgeMask.length - 1 || !edgeMask[neighbor] || visited[neighbor]) {
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
      if (area >= 7 && area <= 320 && aspect >= 0.2 && aspect <= 8 && density >= 0.08 && density <= 0.78) {
        textLikeComponents += 1;
      }
    }
  }

  const smallEdgeDensity = smallComponentEdgeArea / totalPixels;
  if (smallEdgeDensity < 0.004 || smallEdgeDensity > 0.22) {
    return 0;
  }

  return textLikeComponents;
}

export async function runDebugTextCheck(imageBuffer: Buffer): Promise<DebugTextCheckResult> {
  const pngBuffer = await sharp(imageBuffer, { failOn: "none" }).png().toBuffer().catch(() => imageBuffer);
  const [pass1ComponentCount, pass2ComponentCount] = await Promise.all([
    countDebugTextComponentsPass1(pngBuffer),
    countDebugTextComponentsPass2(pngBuffer)
  ]);

  const pass1Failed = pass1ComponentCount >= 10;
  const pass2Failed = pass2ComponentCount >= 8;
  const textFree = !pass1Failed && !pass2Failed;

  let textFailReason = "";
  if (!textFree) {
    if (pass1Failed) {
      textFailReason = `pass1: ${pass1ComponentCount} glyph-shape components (threshold 10)`;
    } else {
      textFailReason = `pass2: ${pass2ComponentCount} glyph-morphology components (threshold 8)`;
    }
  }

  return { pass1ComponentCount, pass2ComponentCount, textFree, textFailReason };
}
