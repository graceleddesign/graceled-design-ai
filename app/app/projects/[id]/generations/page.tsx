import Link from "next/link";
import { notFound } from "next/navigation";
import { approveFinalDesignAction } from "@/app/app/projects/actions";
import { DirectionOptionCard } from "@/components/direction-option-card";
import { requireSession } from "@/lib/auth";
import { optionLabel } from "@/lib/option-label";
import { prisma } from "@/lib/prisma";
import {
  isStyleBucketKey,
  isStyleFamilyKey,
  isStyleMediumKey,
  isStyleToneKey,
  STYLE_FAMILY_BANK
} from "@/lib/style-family-bank";

type PreviewFields = {
  square: string;
  wide: string;
  tall: string;
};

type GenerationAssetRecord = {
  kind: "IMAGE" | "BACKGROUND" | "LOCKUP" | "ZIP" | "OTHER";
  slot: string | null;
  file_path: string;
};

type OptionDesignSpecSummary = {
  optionStatus: "COMPLETED" | "FAILED_GENERATION" | "FALLBACK";
  roundHasFallback: boolean;
  roundStatus: "COMPLETED" | "PARTIAL" | "FAILED" | null;
  roundCompletedCount: number | null;
  roundAttemptCount: number | null;
  roundRequiredCompletedCount: number | null;
  roundFailureReason: "INSUFFICIENT_NONFALLBACK_OPTIONS" | "RATE_LIMIT" | "BUDGET" | "UNKNOWN" | null;
  wantsTitleStage: boolean;
  wantsSeriesMark: boolean;
  styleBucket: string | null;
  styleTone: string | null;
  styleMedium: string | null;
  motifScope: "whole_book" | "multi_passage" | "specific_passage" | null;
  styleFamilyName: string | null;
  lockupLayout: string | null;
  motifFocus: string[];
  referenceId: string | null;
  referenceCluster: string | null;
  variationTemplateKey: string | null;
  debugTemplateKey: string | null;
  debugTypeRegion: string | null;
  debugMotifRegion: string | null;
  debugTitleIntegrationMode: string | null;
  debugBackgroundAnchorSrc: string | null;
  debugLockupAnchorSrc: string | null;
  debugBackgroundSource: "generated" | "reused" | "fallback" | null;
  debugLockupSource: "generated" | "reused" | "fallback" | null;
  debugBackgroundFailureReason: "ALL_TEXT" | "ALL_SCAFFOLD" | "API_ERROR" | "RATE_LIMIT" | "BUDGET" | "UNKNOWN" | null;
  debugWarning: string | null;
  debugImageCalls: {
    total: number;
    retries: number;
    byStage: {
      background: number;
      lockup: number;
    };
    byAspect: {
      wide: number;
      square: number;
      vertical: number;
    };
  } | null;
  debugRateLimitWaitMs: number | null;
  debugRefinementChainId: string | null;
  debugAnchorDirectionFingerprint: string | null;
  debugLockedInvariantsSummary: string | null;
  debugVariantMutationAxis: "composition" | "motif_emphasis" | "typography_energy" | null;
  debugEliminatedChecks: string[];
  debugBestEffortBackground: {
    imageUrl: string;
    score: number | null;
    failedChecks: Array<"textOk" | "scaffoldOk" | "motifOk" | "toneOk">;
    failureReason: "ALL_TEXT" | "ALL_SCAFFOLD" | "API_ERROR" | "RATE_LIMIT" | "BUDGET" | "UNKNOWN" | null;
    eligibleCount: number;
    totalCandidates: number;
    failureCounts: {
      textOk: number;
      scaffoldOk: number;
      motifOk: number;
      toneOk: number;
    };
  } | null;
};

const OPTION_TINTS = [
  "from-emerald-200 to-emerald-50",
  "from-amber-200 to-amber-50",
  "from-sky-200 to-sky-50",
  "from-rose-200 to-rose-50",
  "from-violet-200 to-violet-50",
  "from-slate-300 to-slate-100"
];

const BACKGROUND_FAILURE_REASONS = ["ALL_TEXT", "ALL_SCAFFOLD", "API_ERROR", "RATE_LIMIT", "BUDGET", "UNKNOWN"] as const;
const BACKGROUND_CHECK_KEYS = ["textOk", "scaffoldOk", "motifOk", "toneOk"] as const;
const ROUND1_IMAGE_CALL_CAP_WARNING = "Image call cap reached; returning best available.";
const REQUIRED_COMPLETED_OPTIONS_PER_ROUND = 3;

type BackgroundFailureReason = (typeof BACKGROUND_FAILURE_REASONS)[number];
type BackgroundCheckKey = (typeof BACKGROUND_CHECK_KEYS)[number];

function isOptionGenerationStatus(value: unknown): value is "COMPLETED" | "FAILED_GENERATION" | "FALLBACK" {
  return value === "COMPLETED" || value === "FAILED_GENERATION" || value === "FALLBACK";
}

function isRoundStatus(value: unknown): value is "COMPLETED" | "PARTIAL" | "FAILED" {
  return value === "COMPLETED" || value === "PARTIAL" || value === "FAILED";
}

function resolveOptionGenerationStatus(output: unknown, dbStatus?: string): "COMPLETED" | "FAILED_GENERATION" | "FALLBACK" {
  if (output && typeof output === "object" && !Array.isArray(output)) {
    const directStatus = (output as { status?: unknown }).status;
    if (isOptionGenerationStatus(directStatus)) {
      return directStatus;
    }
    const meta = (output as { meta?: unknown }).meta;
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
      const debug = (meta as { debug?: unknown }).debug;
      if (debug && typeof debug === "object" && !Array.isArray(debug)) {
        if ((debug as { backgroundSource?: unknown }).backgroundSource === "fallback") {
          return "FALLBACK";
        }
      }
    }
  }

  if (dbStatus === "FAILED") {
    return "FAILED_GENERATION";
  }
  if (dbStatus === "COMPLETED") {
    return "COMPLETED";
  }
  if (dbStatus === "RUNNING" || dbStatus === "QUEUED") {
    return "FAILED_GENERATION";
  }
  if (!output) {
    return "FAILED_GENERATION";
  }
  return "COMPLETED";
}

function isBackgroundFailureReason(value: unknown): value is BackgroundFailureReason {
  return typeof value === "string" && BACKGROUND_FAILURE_REASONS.includes(value as BackgroundFailureReason);
}

function normalizeAssetUrl(filePath: string): string {
  const trimmed = filePath.trim();
  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed) || /^data:/i.test(trimmed)) {
    return trimmed;
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed.replace(/^\/+/, "")}`;
}

function readAssetPreview(assets: GenerationAssetRecord[]): PreviewFields {
  const resolved: Record<PreviewShape, { final: string; background: string }> = {
    square: { final: "", background: "" },
    wide: { final: "", background: "" },
    tall: { final: "", background: "" }
  };

  const imageLikeAssets = assets.filter(
    (asset) => (asset.kind === "IMAGE" || asset.kind === "BACKGROUND") && Boolean(asset.file_path?.trim())
  );
  const fallback = imageLikeAssets[0] ? normalizeAssetUrl(imageLikeAssets[0].file_path) : "";

  for (const asset of imageLikeAssets) {
    const slot = asset.slot?.trim().toLowerCase();
    const filePath = normalizeAssetUrl(asset.file_path);
    if (!filePath) {
      continue;
    }

    if (slot === "square" || slot === "square_main") {
      if (!resolved.square.final) {
        resolved.square.final = filePath;
      }
      continue;
    }
    if (slot === "wide" || slot === "wide_main" || slot === "widescreen" || slot === "widescreen_main") {
      if (!resolved.wide.final) {
        resolved.wide.final = filePath;
      }
      continue;
    }
    if (slot === "tall" || slot === "tall_main" || slot === "vertical" || slot === "vertical_main") {
      if (!resolved.tall.final) {
        resolved.tall.final = filePath;
      }
      continue;
    }
    if (slot === "square_bg") {
      if (!resolved.square.background) {
        resolved.square.background = filePath;
      }
      continue;
    }
    if (slot === "wide_bg" || slot === "widescreen_bg") {
      if (!resolved.wide.background) {
        resolved.wide.background = filePath;
      }
      continue;
    }
    if (slot === "tall_bg" || slot === "vertical_bg") {
      if (!resolved.tall.background) {
        resolved.tall.background = filePath;
      }
    }
  }

  return {
    square: resolved.square.final || resolved.square.background || fallback,
    wide: resolved.wide.final || resolved.wide.background || fallback,
    tall: resolved.tall.final || resolved.tall.background || fallback
  };
}

function readDesignSpecSummary(output: unknown, dbStatus?: string): OptionDesignSpecSummary {
  const fallback: OptionDesignSpecSummary = {
    optionStatus: resolveOptionGenerationStatus(output, dbStatus),
    roundHasFallback: false,
    roundStatus: null,
    roundCompletedCount: null,
    roundAttemptCount: null,
    roundRequiredCompletedCount: null,
    roundFailureReason: null,
    wantsTitleStage: false,
    wantsSeriesMark: false,
    styleBucket: null,
    styleTone: null,
    styleMedium: null,
    motifScope: null,
    styleFamilyName: null,
    lockupLayout: null,
    motifFocus: [],
    referenceId: null,
    referenceCluster: null,
    variationTemplateKey: null,
    debugTemplateKey: null,
    debugTypeRegion: null,
    debugMotifRegion: null,
    debugTitleIntegrationMode: null,
    debugBackgroundAnchorSrc: null,
    debugLockupAnchorSrc: null,
    debugBackgroundSource: null,
    debugLockupSource: null,
    debugBackgroundFailureReason: null,
    debugWarning: null,
    debugImageCalls: null,
    debugRateLimitWaitMs: null,
    debugRefinementChainId: null,
    debugAnchorDirectionFingerprint: null,
    debugLockedInvariantsSummary: null,
    debugVariantMutationAxis: null,
    debugEliminatedChecks: [],
    debugBestEffortBackground: null
  };
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return fallback;
  }

  const meta = (output as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return fallback;
  }

  const debug = (meta as { debug?: unknown }).debug;
  const debugObject = debug && typeof debug === "object" && !Array.isArray(debug) ? debug : null;
  const roundHasFallbackCandidate = debugObject ? (debugObject as { roundHasFallback?: unknown }).roundHasFallback : null;
  const roundStatusCandidate = debugObject ? (debugObject as { roundStatus?: unknown }).roundStatus : null;
  const roundCompletedCountCandidate = debugObject ? (debugObject as { roundCompletedCount?: unknown }).roundCompletedCount : null;
  const roundAttemptCountCandidate = debugObject ? (debugObject as { roundAttemptCount?: unknown }).roundAttemptCount : null;
  const roundRequiredCompletedCountCandidate = debugObject
    ? (debugObject as { roundRequiredCompletedCount?: unknown }).roundRequiredCompletedCount
    : null;
  const roundFailureReasonCandidate = debugObject ? (debugObject as { roundFailureReason?: unknown }).roundFailureReason : null;
  const debugBackgroundSourceCandidate = debugObject
    ? (debugObject as { backgroundSource?: unknown }).backgroundSource
    : null;
  const debugLockupSourceCandidate = debugObject ? (debugObject as { lockupSource?: unknown }).lockupSource : null;
  const debugBackgroundFailureReasonCandidate = debugObject
    ? (debugObject as { backgroundFailureReason?: unknown }).backgroundFailureReason
    : null;
  const warningsCandidate = debugObject ? (debugObject as { warnings?: unknown }).warnings : null;
  const warnings = Array.isArray(warningsCandidate)
    ? warningsCandidate.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  const debugWarning =
    warnings.find((value) => value.trim().toLowerCase() === ROUND1_IMAGE_CALL_CAP_WARNING.toLowerCase()) ||
    warnings[0] ||
    null;
  const imageCallsCandidate = debugObject ? (debugObject as { imageCalls?: unknown }).imageCalls : null;
  const imageCallsObject =
    imageCallsCandidate && typeof imageCallsCandidate === "object" && !Array.isArray(imageCallsCandidate)
      ? (imageCallsCandidate as {
          total?: unknown;
          retries?: unknown;
          byStage?: unknown;
          byAspect?: unknown;
        })
      : null;
  const byStageObject =
    imageCallsObject?.byStage && typeof imageCallsObject.byStage === "object" && !Array.isArray(imageCallsObject.byStage)
      ? (imageCallsObject.byStage as Record<string, unknown>)
      : null;
  const byAspectObject =
    imageCallsObject?.byAspect && typeof imageCallsObject.byAspect === "object" && !Array.isArray(imageCallsObject.byAspect)
      ? (imageCallsObject.byAspect as Record<string, unknown>)
      : null;
  const imageCallsTotalCandidate = imageCallsObject?.total;
  const imageCallsRetriesCandidate = imageCallsObject?.retries;
  const debugImageCalls =
    typeof imageCallsTotalCandidate === "number" && Number.isFinite(imageCallsTotalCandidate)
      ? {
          total: imageCallsTotalCandidate,
          retries:
            typeof imageCallsRetriesCandidate === "number" && Number.isFinite(imageCallsRetriesCandidate)
              ? imageCallsRetriesCandidate
              : 0,
          byStage: {
            background:
              typeof byStageObject?.background === "number" && Number.isFinite(byStageObject.background)
                ? byStageObject.background
                : 0,
            lockup:
              typeof byStageObject?.lockup === "number" && Number.isFinite(byStageObject.lockup)
                ? byStageObject.lockup
                : 0
          },
          byAspect: {
            wide: typeof byAspectObject?.wide === "number" && Number.isFinite(byAspectObject.wide) ? byAspectObject.wide : 0,
            square:
              typeof byAspectObject?.square === "number" && Number.isFinite(byAspectObject.square) ? byAspectObject.square : 0,
            vertical:
              typeof byAspectObject?.vertical === "number" && Number.isFinite(byAspectObject.vertical)
                ? byAspectObject.vertical
                : 0
          }
        }
      : null;
  const debugRateLimitWaitMsCandidate = debugObject ? (debugObject as { rateLimitWaitMs?: unknown }).rateLimitWaitMs : null;
  const debugRateLimitWaitMs =
    typeof debugRateLimitWaitMsCandidate === "number" && Number.isFinite(debugRateLimitWaitMsCandidate)
      ? debugRateLimitWaitMsCandidate
      : null;
  const debugRefinementCandidate = debugObject ? (debugObject as { refinement?: unknown }).refinement : null;
  const debugRefinementObject =
    debugRefinementCandidate && typeof debugRefinementCandidate === "object" && !Array.isArray(debugRefinementCandidate)
      ? (debugRefinementCandidate as {
          refinementChainId?: unknown;
          anchorDirectionFingerprint?: unknown;
          lockedInvariantsSummary?: unknown;
          variantMutationAxis?: unknown;
        })
      : null;
  const debugRefinementChainIdCandidate = debugRefinementObject?.refinementChainId;
  const debugAnchorDirectionFingerprintCandidate = debugRefinementObject?.anchorDirectionFingerprint;
  const debugLockedInvariantsSummaryCandidate = debugRefinementObject?.lockedInvariantsSummary;
  const debugVariantMutationAxisCandidate = debugRefinementObject?.variantMutationAxis;
  const backgroundAttemptsCandidate = debugObject ? (debugObject as { backgroundAttempts?: unknown }).backgroundAttempts : null;
  const latestBackgroundAttempt =
    Array.isArray(backgroundAttemptsCandidate) && backgroundAttemptsCandidate.length > 0
      ? backgroundAttemptsCandidate[backgroundAttemptsCandidate.length - 1]
      : null;
  const latestAttemptObject =
    latestBackgroundAttempt && typeof latestBackgroundAttempt === "object" && !Array.isArray(latestBackgroundAttempt)
      ? latestBackgroundAttempt
      : null;
  const latestAttemptFailureReasonCandidate = latestAttemptObject
    ? (latestAttemptObject as { failureReason?: unknown }).failureReason
    : null;
  const latestAttemptFailureReason = isBackgroundFailureReason(latestAttemptFailureReasonCandidate)
    ? latestAttemptFailureReasonCandidate
    : null;
  const parsedAttemptCandidates = (() => {
    const candidatesCandidate = latestAttemptObject ? (latestAttemptObject as { candidates?: unknown }).candidates : null;
    if (!Array.isArray(candidatesCandidate) || candidatesCandidate.length === 0) {
      return [] as Array<{
        imageUrl: string | null;
        score: number;
        checks: Record<BackgroundCheckKey, boolean>;
      }>;
    }
    return candidatesCandidate
      .map((candidate) => {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
          return null;
        }
        const candidateObject = candidate as { checks?: unknown; scores?: unknown; url?: unknown };
        const checksObject =
          candidateObject.checks && typeof candidateObject.checks === "object" && !Array.isArray(candidateObject.checks)
            ? (candidateObject.checks as Record<string, unknown>)
            : null;
        const scoresObject =
          candidateObject.scores && typeof candidateObject.scores === "object" && !Array.isArray(candidateObject.scores)
            ? (candidateObject.scores as Record<string, unknown>)
            : null;
        const scoreCandidate = scoresObject?.total;
        const score = typeof scoreCandidate === "number" && Number.isFinite(scoreCandidate) ? scoreCandidate : Number.NEGATIVE_INFINITY;
        const rawUrl = typeof candidateObject.url === "string" && candidateObject.url.trim() ? candidateObject.url : null;
        return {
          imageUrl: rawUrl ? normalizeAssetUrl(rawUrl) : null,
          score,
          checks: {
            textOk: checksObject?.textOk === true,
            scaffoldOk: checksObject?.scaffoldOk === true,
            motifOk: checksObject?.motifOk === true,
            toneOk: checksObject?.toneOk === true
          } satisfies Record<BackgroundCheckKey, boolean>
        };
      })
      .filter((candidate): candidate is { imageUrl: string | null; score: number; checks: Record<BackgroundCheckKey, boolean> } =>
        Boolean(candidate)
      );
  })();
  const debugEliminatedChecks =
    parsedAttemptCandidates.length > 0
      ? (() => {
          const eliminated: string[] = [];
          if (parsedAttemptCandidates.every((candidate) => !candidate.checks.textOk)) {
            eliminated.push("text");
          }
          return eliminated;
        })()
      : [];
  const bestEffortCandidate =
    parsedAttemptCandidates.length > 0
      ? parsedAttemptCandidates.reduce(
          (best, candidate) => (candidate.score > best.score ? candidate : best),
          parsedAttemptCandidates[0]
        )
      : null;
  const debugBestEffortBackground =
    debugBackgroundSourceCandidate === "fallback" &&
    bestEffortCandidate?.imageUrl &&
    parsedAttemptCandidates.length > 0
      ? (() => {
          const failureCounts = {
            textOk: parsedAttemptCandidates.filter((candidate) => !candidate.checks.textOk).length,
            scaffoldOk: parsedAttemptCandidates.filter((candidate) => !candidate.checks.scaffoldOk).length,
            motifOk: parsedAttemptCandidates.filter((candidate) => !candidate.checks.motifOk).length,
            toneOk: parsedAttemptCandidates.filter((candidate) => !candidate.checks.toneOk).length
          };
          const eligibleCount = parsedAttemptCandidates.filter((candidate) => candidate.checks.textOk).length;
          return {
            imageUrl: bestEffortCandidate.imageUrl,
            score: Number.isFinite(bestEffortCandidate.score) ? bestEffortCandidate.score : null,
            failedChecks: BACKGROUND_CHECK_KEYS.filter((checkKey) => !bestEffortCandidate.checks[checkKey]),
            failureReason: latestAttemptFailureReason || (isBackgroundFailureReason(debugBackgroundFailureReasonCandidate)
              ? debugBackgroundFailureReasonCandidate
              : null),
            eligibleCount,
            totalCandidates: parsedAttemptCandidates.length,
            failureCounts
          };
        })()
      : null;
  const debugReferenceAnchor =
    debug && typeof debug === "object" && !Array.isArray(debug)
      ? (debug as { referenceAnchor?: unknown }).referenceAnchor
      : null;
  const debugBackgroundAnchorSrcCandidate =
    debugReferenceAnchor && typeof debugReferenceAnchor === "object" && !Array.isArray(debugReferenceAnchor)
      ? ((debugReferenceAnchor as { visualAnchorSrc?: unknown }).visualAnchorSrc ??
        (debugReferenceAnchor as { backgroundAnchorSrc?: unknown }).backgroundAnchorSrc ??
        (debugReferenceAnchor as { anchorRefSrc?: unknown }).anchorRefSrc)
      : null;
  const debugLockupAnchorSrcCandidate =
    debugReferenceAnchor && typeof debugReferenceAnchor === "object" && !Array.isArray(debugReferenceAnchor)
      ? ((debugReferenceAnchor as { typographyAnchorSrc?: unknown }).typographyAnchorSrc ??
        (debugReferenceAnchor as { lockupAnchorSrc?: unknown }).lockupAnchorSrc ??
        (debugReferenceAnchor as { anchorRefSrc?: unknown }).anchorRefSrc)
      : null;
  const debugBackgroundAnchorSrc =
    typeof debugBackgroundAnchorSrcCandidate === "string" && debugBackgroundAnchorSrcCandidate.trim()
      ? debugBackgroundAnchorSrcCandidate.trim()
      : null;
  const debugLockupAnchorSrc =
    typeof debugLockupAnchorSrcCandidate === "string" && debugLockupAnchorSrcCandidate.trim()
      ? debugLockupAnchorSrcCandidate.trim()
      : null;
  const debugRefinementChainId =
    typeof debugRefinementChainIdCandidate === "string" && debugRefinementChainIdCandidate.trim()
      ? debugRefinementChainIdCandidate.trim()
      : null;
  const debugAnchorDirectionFingerprint =
    typeof debugAnchorDirectionFingerprintCandidate === "string" && debugAnchorDirectionFingerprintCandidate.trim()
      ? debugAnchorDirectionFingerprintCandidate.trim()
      : null;
  const debugLockedInvariantsSummary =
    typeof debugLockedInvariantsSummaryCandidate === "string" && debugLockedInvariantsSummaryCandidate.trim()
      ? debugLockedInvariantsSummaryCandidate.trim()
      : null;
  const debugVariantMutationAxis =
    debugVariantMutationAxisCandidate === "composition" ||
    debugVariantMutationAxisCandidate === "motif_emphasis" ||
    debugVariantMutationAxisCandidate === "typography_energy"
      ? debugVariantMutationAxisCandidate
      : null;

  const designSpec = (meta as { designSpec?: unknown }).designSpec;
  if (!designSpec || typeof designSpec !== "object" || Array.isArray(designSpec)) {
    return {
      ...fallback,
      roundHasFallback: roundHasFallbackCandidate === true,
      roundStatus: isRoundStatus(roundStatusCandidate) ? roundStatusCandidate : null,
      roundCompletedCount:
        typeof roundCompletedCountCandidate === "number" && Number.isFinite(roundCompletedCountCandidate)
          ? roundCompletedCountCandidate
          : null,
      roundAttemptCount:
        typeof roundAttemptCountCandidate === "number" && Number.isFinite(roundAttemptCountCandidate)
          ? roundAttemptCountCandidate
          : null,
      roundRequiredCompletedCount:
        typeof roundRequiredCompletedCountCandidate === "number" && Number.isFinite(roundRequiredCompletedCountCandidate)
          ? roundRequiredCompletedCountCandidate
          : null,
      roundFailureReason:
        roundFailureReasonCandidate === "INSUFFICIENT_NONFALLBACK_OPTIONS" ||
        roundFailureReasonCandidate === "RATE_LIMIT" ||
        roundFailureReasonCandidate === "BUDGET" ||
        roundFailureReasonCandidate === "UNKNOWN"
          ? roundFailureReasonCandidate
          : null,
      debugBackgroundAnchorSrc,
      debugLockupAnchorSrc,
      debugBackgroundSource:
        debugBackgroundSourceCandidate === "generated" ||
        debugBackgroundSourceCandidate === "reused" ||
        debugBackgroundSourceCandidate === "fallback"
          ? debugBackgroundSourceCandidate
          : null,
      debugLockupSource:
        debugLockupSourceCandidate === "generated" ||
        debugLockupSourceCandidate === "reused" ||
        debugLockupSourceCandidate === "fallback"
          ? debugLockupSourceCandidate
          : null,
      debugBackgroundFailureReason:
        isBackgroundFailureReason(debugBackgroundFailureReasonCandidate) ? debugBackgroundFailureReasonCandidate : null,
      debugWarning: debugWarning && debugWarning.trim() ? debugWarning.trim() : null,
      debugImageCalls,
      debugRateLimitWaitMs,
      debugRefinementChainId,
      debugAnchorDirectionFingerprint,
      debugLockedInvariantsSummary,
      debugVariantMutationAxis,
      debugEliminatedChecks,
      debugBestEffortBackground
    };
  }

  const nestedDirectionSpec = (
    designSpec as {
      directionSpec?:
        | {
            wantsTitleStage?: unknown;
            wantsSeriesMark?: unknown;
            styleBucket?: unknown;
            styleTone?: unknown;
            styleMedium?: unknown;
            motifScope?: unknown;
            styleFamily?: unknown;
            lockupLayout?: unknown;
            motifFocus?: unknown;
            referenceId?: unknown;
            referenceCluster?: unknown;
            variationTemplateKey?: unknown;
          }
        | null;
    }
  ).directionSpec;
  const directWantsTitleStage = (designSpec as { wantsTitleStage?: unknown }).wantsTitleStage;
  const directWantsSeriesMark = (designSpec as { wantsSeriesMark?: unknown }).wantsSeriesMark;
  const directStyleBucket = (designSpec as { styleBucket?: unknown }).styleBucket;
  const directStyleTone = (designSpec as { styleTone?: unknown }).styleTone;
  const directStyleMedium = (designSpec as { styleMedium?: unknown }).styleMedium;
  const directMotifScope = (designSpec as { motifScope?: unknown }).motifScope;
  const directStyleFamily = (designSpec as { styleFamily?: unknown }).styleFamily;
  const directLockupLayout = (designSpec as { lockupLayout?: unknown }).lockupLayout;
  const directMotifFocus = (designSpec as { motifFocus?: unknown }).motifFocus;
  const directReferenceId = (designSpec as { referenceId?: unknown }).referenceId;
  const directReferenceCluster = (designSpec as { referenceCluster?: unknown }).referenceCluster;
  const directVariationTemplateKey = (designSpec as { variationTemplateKey?: unknown }).variationTemplateKey;
  const directTemplateKey = (designSpec as { templateKey?: unknown }).templateKey;
  const directTypeRegion = (designSpec as { typeRegion?: unknown }).typeRegion;
  const directMotifRegion = (designSpec as { motifRegion?: unknown }).motifRegion;
  const directTitleIntegrationMode = (designSpec as { titleIntegrationMode?: unknown }).titleIntegrationMode;
  const directRefinementChainId = (designSpec as { refinementChainId?: unknown }).refinementChainId;
  const directAnchorDirectionFingerprint = (designSpec as { anchorDirectionFingerprint?: unknown }).anchorDirectionFingerprint;
  const directLockedInvariantsSummary = (designSpec as { lockedInvariantsSummary?: unknown }).lockedInvariantsSummary;
  const directVariantMutationAxis = (designSpec as { variantMutationAxis?: unknown }).variantMutationAxis;
  const directRefinement = (designSpec as { refinement?: unknown }).refinement;
  const directRefinementObject =
    directRefinement && typeof directRefinement === "object" && !Array.isArray(directRefinement)
      ? (directRefinement as {
          refinementChainId?: unknown;
          anchorDirectionFingerprint?: unknown;
          lockedInvariantsSummary?: unknown;
          variantMutationAxis?: unknown;
        })
      : null;
  const nestedDesignSpec = (designSpec as { designSpec?: unknown }).designSpec;
  const nestedComposition =
    nestedDesignSpec && typeof nestedDesignSpec === "object" && !Array.isArray(nestedDesignSpec)
      ? (nestedDesignSpec as { composition?: unknown }).composition
      : null;
  const nestedTemplateKey =
    nestedComposition && typeof nestedComposition === "object" && !Array.isArray(nestedComposition)
      ? (nestedComposition as { templateKey?: unknown }).templateKey
      : null;
  const nestedTypeRegion =
    nestedComposition && typeof nestedComposition === "object" && !Array.isArray(nestedComposition)
      ? (nestedComposition as { typeRegion?: unknown }).typeRegion
      : null;
  const nestedMotifRegion =
    nestedComposition && typeof nestedComposition === "object" && !Array.isArray(nestedComposition)
      ? (nestedComposition as { motifRegion?: unknown }).motifRegion
      : null;
  const nestedTitleIntegrationMode =
    nestedDesignSpec && typeof nestedDesignSpec === "object" && !Array.isArray(nestedDesignSpec)
      ? (nestedDesignSpec as { titleIntegrationMode?: unknown }).titleIntegrationMode
      : null;
  const nestedWantsTitleStage = nestedDirectionSpec?.wantsTitleStage;
  const nestedWantsSeriesMark = nestedDirectionSpec?.wantsSeriesMark;
  const nestedStyleBucket = nestedDirectionSpec?.styleBucket;
  const nestedStyleTone = nestedDirectionSpec?.styleTone;
  const nestedStyleMedium = nestedDirectionSpec?.styleMedium;
  const nestedMotifScope = nestedDirectionSpec?.motifScope;
  const nestedStyleFamily = nestedDirectionSpec?.styleFamily;
  const nestedLockupLayout = nestedDirectionSpec?.lockupLayout;
  const nestedMotifFocus = nestedDirectionSpec?.motifFocus;
  const nestedReferenceId = nestedDirectionSpec?.referenceId;
  const nestedReferenceCluster = nestedDirectionSpec?.referenceCluster;
  const nestedVariationTemplateKey = nestedDirectionSpec?.variationTemplateKey;
  const nestedVariantMutationAxis = nestedDirectionSpec?.refinementMutationAxis;

  const styleFamilyCandidate = isStyleFamilyKey(directStyleFamily)
    ? directStyleFamily
    : isStyleFamilyKey(nestedStyleFamily)
      ? nestedStyleFamily
      : null;
  const styleBucketCandidate = isStyleBucketKey(directStyleBucket)
    ? directStyleBucket
    : isStyleBucketKey(nestedStyleBucket)
      ? nestedStyleBucket
      : styleFamilyCandidate
        ? STYLE_FAMILY_BANK[styleFamilyCandidate].bucket
        : null;
  const styleToneCandidate = isStyleToneKey(directStyleTone)
    ? directStyleTone
    : isStyleToneKey(nestedStyleTone)
      ? nestedStyleTone
      : styleFamilyCandidate
        ? STYLE_FAMILY_BANK[styleFamilyCandidate].tone
        : null;
  const styleMediumCandidate = isStyleMediumKey(directStyleMedium)
    ? directStyleMedium
    : isStyleMediumKey(nestedStyleMedium)
      ? nestedStyleMedium
      : styleFamilyCandidate
        ? STYLE_FAMILY_BANK[styleFamilyCandidate].medium
        : null;
  const motifScopeCandidate =
    directMotifScope === "whole_book" || directMotifScope === "multi_passage" || directMotifScope === "specific_passage"
      ? directMotifScope
      : nestedMotifScope === "whole_book" || nestedMotifScope === "multi_passage" || nestedMotifScope === "specific_passage"
        ? nestedMotifScope
        : null;
  const lockupLayoutCandidate = typeof directLockupLayout === "string" ? directLockupLayout : nestedLockupLayout;
  const motifFocusCandidate = Array.isArray(directMotifFocus) ? directMotifFocus : nestedMotifFocus;
  const motifFocus = Array.isArray(motifFocusCandidate)
    ? motifFocusCandidate
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 2)
    : [];
  const referenceIdCandidate =
    typeof directReferenceId === "string"
      ? directReferenceId
      : typeof nestedReferenceId === "string"
        ? nestedReferenceId
        : null;
  const referenceClusterCandidate =
    typeof directReferenceCluster === "string"
      ? directReferenceCluster
      : typeof nestedReferenceCluster === "string"
        ? nestedReferenceCluster
        : null;
  const variationTemplateKeyCandidate =
    typeof directVariationTemplateKey === "string"
      ? directVariationTemplateKey
      : typeof nestedVariationTemplateKey === "string"
        ? nestedVariationTemplateKey
        : null;
  const templateKeyCandidate =
    typeof nestedTemplateKey === "string"
      ? nestedTemplateKey
      : typeof directTemplateKey === "string"
        ? directTemplateKey
        : variationTemplateKeyCandidate;
  const typeRegionCandidate =
    typeof nestedTypeRegion === "string"
      ? nestedTypeRegion
      : typeof directTypeRegion === "string"
        ? directTypeRegion
        : null;
  const motifRegionCandidate =
    typeof nestedMotifRegion === "string"
      ? nestedMotifRegion
      : typeof directMotifRegion === "string"
        ? directMotifRegion
        : null;
  const titleIntegrationModeCandidate =
    typeof nestedTitleIntegrationMode === "string"
      ? nestedTitleIntegrationMode
      : typeof directTitleIntegrationMode === "string"
        ? directTitleIntegrationMode
        : null;

  return {
    wantsTitleStage: directWantsTitleStage === true || nestedWantsTitleStage === true,
    wantsSeriesMark: directWantsSeriesMark === true || nestedWantsSeriesMark === true,
    optionStatus: resolveOptionGenerationStatus(output, dbStatus),
    roundHasFallback: roundHasFallbackCandidate === true,
    roundStatus: isRoundStatus(roundStatusCandidate) ? roundStatusCandidate : null,
    roundCompletedCount:
      typeof roundCompletedCountCandidate === "number" && Number.isFinite(roundCompletedCountCandidate)
        ? roundCompletedCountCandidate
        : null,
    roundAttemptCount:
      typeof roundAttemptCountCandidate === "number" && Number.isFinite(roundAttemptCountCandidate)
        ? roundAttemptCountCandidate
        : null,
    roundRequiredCompletedCount:
      typeof roundRequiredCompletedCountCandidate === "number" && Number.isFinite(roundRequiredCompletedCountCandidate)
        ? roundRequiredCompletedCountCandidate
        : null,
    roundFailureReason:
      roundFailureReasonCandidate === "INSUFFICIENT_NONFALLBACK_OPTIONS" ||
      roundFailureReasonCandidate === "RATE_LIMIT" ||
      roundFailureReasonCandidate === "BUDGET" ||
      roundFailureReasonCandidate === "UNKNOWN"
        ? roundFailureReasonCandidate
        : null,
    styleBucket: styleBucketCandidate,
    styleTone: styleToneCandidate,
    styleMedium: styleMediumCandidate,
    motifScope: motifScopeCandidate,
    styleFamilyName: styleFamilyCandidate ? STYLE_FAMILY_BANK[styleFamilyCandidate].name : null,
    lockupLayout: typeof lockupLayoutCandidate === "string" && lockupLayoutCandidate.trim() ? lockupLayoutCandidate : null,
    motifFocus,
    referenceId: referenceIdCandidate && referenceIdCandidate.trim() ? referenceIdCandidate.trim() : null,
    referenceCluster: referenceClusterCandidate && referenceClusterCandidate.trim() ? referenceClusterCandidate.trim() : null,
    variationTemplateKey:
      variationTemplateKeyCandidate && variationTemplateKeyCandidate.trim() ? variationTemplateKeyCandidate.trim() : null,
    debugTemplateKey: templateKeyCandidate && templateKeyCandidate.trim() ? templateKeyCandidate.trim() : null,
    debugTypeRegion: typeRegionCandidate && typeRegionCandidate.trim() ? typeRegionCandidate.trim() : null,
    debugMotifRegion: motifRegionCandidate && motifRegionCandidate.trim() ? motifRegionCandidate.trim() : null,
    debugTitleIntegrationMode:
      titleIntegrationModeCandidate && titleIntegrationModeCandidate.trim() ? titleIntegrationModeCandidate.trim() : null,
    debugBackgroundAnchorSrc,
    debugLockupAnchorSrc,
    debugBackgroundSource:
      debugBackgroundSourceCandidate === "generated" ||
      debugBackgroundSourceCandidate === "reused" ||
      debugBackgroundSourceCandidate === "fallback"
        ? debugBackgroundSourceCandidate
        : null,
    debugLockupSource:
      debugLockupSourceCandidate === "generated" ||
      debugLockupSourceCandidate === "reused" ||
      debugLockupSourceCandidate === "fallback"
        ? debugLockupSourceCandidate
        : null,
    debugBackgroundFailureReason:
      isBackgroundFailureReason(debugBackgroundFailureReasonCandidate) ? debugBackgroundFailureReasonCandidate : null,
    debugWarning: debugWarning && debugWarning.trim() ? debugWarning.trim() : null,
    debugImageCalls,
    debugRateLimitWaitMs,
    debugRefinementChainId:
      debugRefinementChainId ||
      (typeof directRefinementObject?.refinementChainId === "string" && directRefinementObject.refinementChainId.trim()
        ? directRefinementObject.refinementChainId.trim()
        : typeof directRefinementChainId === "string" && directRefinementChainId.trim()
          ? directRefinementChainId.trim()
          : null),
    debugAnchorDirectionFingerprint:
      debugAnchorDirectionFingerprint ||
      (typeof directRefinementObject?.anchorDirectionFingerprint === "string" && directRefinementObject.anchorDirectionFingerprint.trim()
        ? directRefinementObject.anchorDirectionFingerprint.trim()
        : typeof directAnchorDirectionFingerprint === "string" && directAnchorDirectionFingerprint.trim()
          ? directAnchorDirectionFingerprint.trim()
          : null),
    debugLockedInvariantsSummary:
      debugLockedInvariantsSummary ||
      (typeof directRefinementObject?.lockedInvariantsSummary === "string" && directRefinementObject.lockedInvariantsSummary.trim()
        ? directRefinementObject.lockedInvariantsSummary.trim()
        : typeof directLockedInvariantsSummary === "string" && directLockedInvariantsSummary.trim()
          ? directLockedInvariantsSummary.trim()
          : null),
    debugVariantMutationAxis:
      debugVariantMutationAxis ||
      (directRefinementObject?.variantMutationAxis === "composition" ||
      directRefinementObject?.variantMutationAxis === "motif_emphasis" ||
      directRefinementObject?.variantMutationAxis === "typography_energy"
        ? directRefinementObject.variantMutationAxis
        : directVariantMutationAxis === "composition" ||
            directVariantMutationAxis === "motif_emphasis" ||
            directVariantMutationAxis === "typography_energy"
          ? directVariantMutationAxis
          : nestedVariantMutationAxis === "composition" ||
              nestedVariantMutationAxis === "motif_emphasis" ||
              nestedVariantMutationAxis === "typography_energy"
            ? nestedVariantMutationAxis
            : null),
    debugEliminatedChecks,
    debugBestEffortBackground
  };
}

type PreviewShape = "square" | "wide" | "tall";

function getGenerationPreviewUrl(
  projectId: string,
  generationId: string,
  shape: PreviewShape,
  updatedAt: Date,
  assetUrl?: string,
  options?: { debugStage?: boolean }
): string {
  if (options?.debugStage) {
    return `/api/projects/${projectId}/generations/${generationId}/preview?shape=${shape}&debugStage=1&v=${updatedAt.getTime()}`;
  }

  if (assetUrl) {
    const separator = assetUrl.includes("?") ? "&" : "?";
    return `${assetUrl}${separator}v=${updatedAt.getTime()}`;
  }

  return `/api/projects/${projectId}/generations/${generationId}/preview?shape=${shape}&v=${updatedAt.getTime()}`;
}

function DeliverableDownloadLink({
  href,
  label,
  disabled
}: {
  href: string;
  label: string;
  disabled: boolean;
}) {
  if (disabled) {
    return (
      <span className="inline-flex cursor-not-allowed rounded-md border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-400">
        {label}
      </span>
    );
  }

  return (
    <a href={href} className="inline-flex rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
      {label}
    </a>
  );
}

export default async function ProjectGenerationsPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ debugStage?: string }>;
}) {
  // Placeholder route protection for generation flow.
  const session = await requireSession();
  const { id } = await params;
  const { debugStage } = await searchParams;
  const debugStageEnabled = process.env.NODE_ENV !== "production" && debugStage === "1";

  const project = await prisma.project.findFirst({
    where: {
      id,
      organizationId: session.organizationId
    },
    select: {
      id: true,
      series_title: true,
      brandMode: true,
      finalDesign: {
        select: {
          id: true,
          generationId: true,
          round: true,
          optionKey: true,
          optionLabel: true,
          updatedAt: true
        }
      }
    }
  });

  if (!project) {
    notFound();
  }

  const generations = await prisma.generation.findMany({
    where: {
      projectId: project.id
    },
    select: {
      id: true,
      round: true,
      status: true,
      output: true,
      createdAt: true,
      updatedAt: true,
      assets: {
        select: {
          kind: true,
          slot: true,
          file_path: true
        }
      }
    },
    orderBy: [{ round: "desc" }, { createdAt: "asc" }]
  });

  const rounds = new Map<number, typeof generations>();
  for (const generation of generations) {
    const existing = rounds.get(generation.round) || [];
    existing.push(generation);
    rounds.set(generation.round, existing);
  }

  const roundEntries = Array.from(rounds.entries()).map(([round, roundGenerations]) => [
    round,
    [...roundGenerations].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  ] as const);

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Project Generations</p>
          <h1 className="text-2xl font-semibold">{project.series_title}</h1>
        </div>
        <Link href={`/app/projects/${project.id}`} className="text-sm text-slate-600">
          Back to project
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Final Deliverables</h2>
            <p className="text-xs text-slate-500">Available after you finalize a design.</p>
            {project.finalDesign ? (
              <p className="text-sm text-slate-600">
                Approved: {project.finalDesign.optionLabel} from round {project.finalDesign.round} (updated{" "}
                {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(project.finalDesign.updatedAt)})
              </p>
            ) : (
              <p className="text-sm text-slate-600">No final design approved yet.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <DeliverableDownloadLink href={`/api/projects/${project.id}/final/pptx`} label="Download PPTX" disabled={!project.finalDesign} />
            <DeliverableDownloadLink href={`/api/projects/${project.id}/final/svg`} label="Download SVG" disabled={!project.finalDesign} />
            <DeliverableDownloadLink href={`/api/projects/${project.id}/final/bundle`} label="Download ZIP" disabled={!project.finalDesign} />
          </div>
          {!project.finalDesign ? <p className="w-full text-right text-xs text-slate-500">Finalize to unlock downloads.</p> : null}
        </div>
      </div>

      {roundEntries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-slate-600">No generations yet. Start Round 1 from the project overview page.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {roundEntries.map(([round, roundGenerations], roundIndex) => {
            const roundDesignSummaries = roundGenerations.map((generation) =>
              readDesignSpecSummary(generation.output, generation.status)
            );
            const persistedRoundStatus =
              roundDesignSummaries.find((summary) => summary.roundStatus === "FAILED")?.roundStatus ||
              roundDesignSummaries.find((summary) => summary.roundStatus === "PARTIAL")?.roundStatus ||
              roundDesignSummaries.find((summary) => summary.roundStatus === "COMPLETED")?.roundStatus ||
              null;
            const hasFailedOptions = roundDesignSummaries.some((summary) => summary.optionStatus !== "COMPLETED");
            const persistedCompletedCount = roundDesignSummaries.find((summary) => summary.roundCompletedCount !== null)?.roundCompletedCount ?? null;
            const persistedAttemptCount = roundDesignSummaries.find((summary) => summary.roundAttemptCount !== null)?.roundAttemptCount ?? null;
            const persistedRequiredCompletedCount =
              roundDesignSummaries.find((summary) => summary.roundRequiredCompletedCount !== null)?.roundRequiredCompletedCount ??
              REQUIRED_COMPLETED_OPTIONS_PER_ROUND;
            const roundFailureReason =
              roundDesignSummaries.find((summary) => summary.roundFailureReason !== null)?.roundFailureReason || null;
            const computedCompletedCount = roundDesignSummaries.filter((summary) => summary.optionStatus === "COMPLETED").length;
            const roundCompletedCount = persistedCompletedCount ?? computedCompletedCount;
            const computedRoundStatus = persistedRoundStatus || (hasFailedOptions
              ? roundDesignSummaries.some((summary) => summary.optionStatus === "COMPLETED")
                ? "PARTIAL"
                : "FAILED"
              : "COMPLETED");
            const roundHasFallback = roundDesignSummaries.some(
              (summary) => summary.roundHasFallback || summary.optionStatus === "FALLBACK"
            );
            const roundNeedsRetry =
              computedRoundStatus === "FAILED" || roundCompletedCount < persistedRequiredCompletedCount;
            const retryHref = round === 1 ? `/app/projects/${project.id}` : `/app/projects/${project.id}/feedback?round=${round}`;
            const roundFailureMessage =
              roundFailureReason === "RATE_LIMIT"
                ? "Rate limit reached before 3 real options were completed."
                : roundFailureReason === "BUDGET"
                  ? "Generation budget was reached before 3 real options were completed."
                  : "Couldn’t produce 3 real options. Retry.";

            return (
              <div key={round} className="space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold">Round {round}</h2>
                  {roundIndex === 0 ? (
                    <span className="rounded-full bg-pine/10 px-2 py-0.5 text-xs font-medium text-pine">Latest</span>
                  ) : null}
                  {computedRoundStatus === "PARTIAL" ? (
                    <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Partial
                    </span>
                  ) : null}
                  {computedRoundStatus === "FAILED" ? (
                    <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-800">
                      Failed
                    </span>
                  ) : null}
                  {computedRoundStatus === "COMPLETED" ? (
                    <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                      Completed
                    </span>
                  ) : null}
                  {roundHasFallback ? (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Contains fallback options
                    </span>
                  ) : null}
                </div>
                {roundNeedsRetry ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                    <p className="text-sm text-rose-900">
                      {roundFailureMessage}
                      {typeof persistedAttemptCount === "number" ? ` Attempts: ${persistedAttemptCount}.` : ""}
                      {typeof roundCompletedCount === "number" ? ` Completed: ${roundCompletedCount}/${persistedRequiredCompletedCount}.` : ""}
                    </p>
                    <Link
                      href={retryHref}
                      className="inline-flex rounded-md border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100"
                    >
                      Retry Round
                    </Link>
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-3">
                  {roundGenerations.map((generation, optionIndex) => {
                  const optionKey = String.fromCharCode(65 + optionIndex);
                  const label = optionLabel(optionIndex);
                  const tintClass = OPTION_TINTS[optionIndex % OPTION_TINTS.length];
                  const preview = readAssetPreview(generation.assets);
                  const isApprovedFinal =
                    project.finalDesign?.generationId === generation.id ||
                    (project.finalDesign?.round === round && project.finalDesign.optionKey === optionKey);
                  const styleRefCount = (
                    generation.output as { meta?: { styleRefCount?: unknown } } | null
                  )?.meta?.styleRefCount;
                  const designSpecSummary =
                    roundDesignSummaries[optionIndex] || readDesignSpecSummary(generation.output, generation.status);
                  const previewUrls = {
                    square: getGenerationPreviewUrl(project.id, generation.id, "square", generation.updatedAt, preview.square, {
                      debugStage: debugStageEnabled
                    }),
                    wide: getGenerationPreviewUrl(project.id, generation.id, "wide", generation.updatedAt, preview.wide, {
                      debugStage: debugStageEnabled
                    }),
                    tall: getGenerationPreviewUrl(project.id, generation.id, "tall", generation.updatedAt, preview.tall, {
                      debugStage: debugStageEnabled
                    })
                  };
                  const finalizeAction = approveFinalDesignAction.bind(null, project.id, generation.id, optionKey);

                  return (
                    <DirectionOptionCard
                      key={generation.id}
                      projectId={project.id}
                      round={round}
                      generationId={generation.id}
                      generationStatus={designSpecSummary.optionStatus}
                      optionLabel={label}
                      tintClass={tintClass}
                      isApprovedFinal={isApprovedFinal}
                      styleRefCount={typeof styleRefCount === "number" ? styleRefCount : null}
                      isTitleStage={designSpecSummary.wantsTitleStage}
                      wantsSeriesMark={designSpecSummary.wantsSeriesMark}
                      styleBucket={designSpecSummary.styleBucket}
                      styleTone={designSpecSummary.styleTone}
                      styleMedium={designSpecSummary.styleMedium}
                      motifScope={designSpecSummary.motifScope}
                      styleFamilyName={designSpecSummary.styleFamilyName}
                      lockupLayout={designSpecSummary.lockupLayout}
                      motifFocus={designSpecSummary.motifFocus}
                      brandMode={project.brandMode === "brand" ? "brand" : "fresh"}
                      debugReferenceId={designSpecSummary.referenceId}
                      debugReferenceCluster={designSpecSummary.referenceCluster}
                      debugVariationTemplateKey={designSpecSummary.variationTemplateKey}
                      debugTemplateKey={designSpecSummary.debugTemplateKey}
                      debugTypeRegion={designSpecSummary.debugTypeRegion}
                      debugMotifRegion={designSpecSummary.debugMotifRegion}
                      debugTitleIntegrationMode={designSpecSummary.debugTitleIntegrationMode}
                      debugBackgroundAnchorSrc={designSpecSummary.debugBackgroundAnchorSrc}
                      debugLockupAnchorSrc={designSpecSummary.debugLockupAnchorSrc}
                      debugBackgroundSource={designSpecSummary.debugBackgroundSource}
                      debugLockupSource={designSpecSummary.debugLockupSource}
                      debugBackgroundFailureReason={designSpecSummary.debugBackgroundFailureReason}
                      debugWarning={designSpecSummary.debugWarning}
                      debugImageCalls={designSpecSummary.debugImageCalls}
                      debugRateLimitWaitMs={designSpecSummary.debugRateLimitWaitMs}
                      debugRefinementChainId={designSpecSummary.debugRefinementChainId}
                      debugAnchorDirectionFingerprint={designSpecSummary.debugAnchorDirectionFingerprint}
                      debugLockedInvariantsSummary={designSpecSummary.debugLockedInvariantsSummary}
                      debugVariantMutationAxis={designSpecSummary.debugVariantMutationAxis}
                      debugEliminatedChecks={designSpecSummary.debugEliminatedChecks}
                      debugBestEffortBackground={designSpecSummary.debugBestEffortBackground}
                      showDebugChips={debugStageEnabled}
                      previewUrls={previewUrls}
                      finalizeAction={finalizeAction}
                    />
                  );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
