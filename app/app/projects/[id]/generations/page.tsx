import Link from "next/link";
import { notFound } from "next/navigation";
import { approveFinalDesignAction } from "@/app/app/projects/actions";
import { DirectionOptionCard } from "@/components/direction-option-card";
import { requireSession } from "@/lib/auth";
import {
  type GenerationFailureReason,
  type GenerationLifecycleState,
  type GenerationOptionStatus,
  type GenerationRoundFailureReason,
  type GenerationRoundStatus,
  type ProviderFailureReason,
  isGenerationFailureReason,
  isGenerationLifecycleState,
  isGenerationRoundFailureReason,
  isGenerationRoundStatus,
  isProviderFailureReason,
  resolveGenerationLifecycleState
} from "@/lib/generation-state";
import { optionLabel } from "@/lib/option-label";
import { prisma } from "@/lib/prisma";
import {
  resolveProductionValidOption,
  resolveProductionValidOptionStatus,
  summarizeProductionInvalidReasons,
  type ProductionValidationFailedChecks
} from "@/lib/production-valid-option";
import {
  isStyleBucketKey,
  isStyleFamilyKey,
  isStyleMediumKey,
  isStyleToneKey,
  STYLE_FAMILY_BANK
} from "@/lib/style-family-bank";
type AspectAssetStatus = "ok" | "missing" | "placeholder";
type DebugAspectAssets = {
  widescreen: AspectAssetStatus;
  square: AspectAssetStatus;
  vertical: AspectAssetStatus;
};

type DebugFinalistCanonicalization = {
  attempted: boolean;
  succeeded: boolean | null;
  aspectRecoveryAttemptsByShape: Record<"square" | "wide" | "tall", number>;
  aspectRecoveryReasonsByShape: Record<"square" | "wide" | "tall", string[]>;
  canonicalAssetPathsByShape: Record<"square" | "wide" | "tall", string | null>;
  canonicalizationFailureReasons: string[];
};

type OptionDesignSpecSummary = {
  optionStatus: GenerationOptionStatus;
  generationLifecycleState: GenerationLifecycleState;
  roundHasFallback: boolean;
  roundStatus: GenerationRoundStatus | null;
  roundCompletedCount: number | null;
  roundAttemptCount: number | null;
  roundRequiredCompletedCount: number | null;
  roundFailureReason: GenerationRoundFailureReason | null;
  roundOperationalFailureReason: ProviderFailureReason | null;
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
  debugBackgroundFailureReason: GenerationFailureReason | null;
  debugAspectAssets: DebugAspectAssets | null;
  debugFinalistCanonicalization: DebugFinalistCanonicalization | null;
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
    failureReason: GenerationFailureReason | null;
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

const BACKGROUND_CHECK_KEYS = ["textOk", "scaffoldOk", "motifOk", "toneOk"] as const;
const ROUND1_IMAGE_CALL_CAP_WARNING = "Image call cap reached; returning best available.";
const REQUIRED_COMPLETED_OPTIONS_PER_ROUND = 3;
const ASPECT_ASSET_PLACEHOLDER_PATH_PATTERN = /(fallback|placeholder|wireframe|guide|debug|stage|scaffold)/i;

type BackgroundCheckKey = (typeof BACKGROUND_CHECK_KEYS)[number];

function isAspectAssetStatus(value: unknown): value is AspectAssetStatus {
  return value === "ok" || value === "missing" || value === "placeholder";
}

function normalizeAssetPathForCompletenessCheck(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.split("?")[0]?.trim() || null;
}

function parseDebugAspectAssets(output: unknown): DebugAspectAssets | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }

  const meta = (output as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return null;
  }

  const debug = (meta as { debug?: unknown }).debug;
  if (!debug || typeof debug !== "object" || Array.isArray(debug)) {
    return null;
  }

  const aspectAssets = (debug as { aspectAssets?: unknown }).aspectAssets;
  if (!aspectAssets || typeof aspectAssets !== "object" || Array.isArray(aspectAssets)) {
    return null;
  }

  const value = aspectAssets as Record<string, unknown>;
  const widescreen = value.widescreen;
  const square = value.square;
  const vertical = value.vertical;
  if (!isAspectAssetStatus(widescreen) || !isAspectAssetStatus(square) || !isAspectAssetStatus(vertical)) {
    return null;
  }

  return {
    widescreen,
    square,
    vertical
  };
}

function deriveAspectAssetsFromPreview(output: unknown): DebugAspectAssets | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }

  const preview = (output as { preview?: unknown }).preview;
  if (!preview || typeof preview !== "object" || Array.isArray(preview)) {
    return null;
  }

  const previewRecord = preview as Record<string, unknown>;
  const rawByAspect = {
    widescreen: normalizeAssetPathForCompletenessCheck(previewRecord.widescreen_main),
    square: normalizeAssetPathForCompletenessCheck(previewRecord.square_main),
    vertical: normalizeAssetPathForCompletenessCheck(previewRecord.vertical_main)
  } as const;
  const nonNullPaths = Object.values(rawByAspect).filter((value): value is string => Boolean(value));
  const normalizedPathCounts = new Map<string, number>();
  for (const pathValue of nonNullPaths) {
    const normalized = pathValue.replace(/^\/+/, "").toLowerCase();
    normalizedPathCounts.set(normalized, (normalizedPathCounts.get(normalized) || 0) + 1);
  }

  const classify = (pathValue: string | null): AspectAssetStatus => {
    if (!pathValue) {
      return "missing";
    }
    if (ASPECT_ASSET_PLACEHOLDER_PATH_PATTERN.test(pathValue)) {
      return "placeholder";
    }
    const normalized = pathValue.replace(/^\/+/, "").toLowerCase();
    if ((normalizedPathCounts.get(normalized) || 0) > 1) {
      return "placeholder";
    }
    return "ok";
  };

  return {
    widescreen: classify(rawByAspect.widescreen),
    square: classify(rawByAspect.square),
    vertical: classify(rawByAspect.vertical)
  };
}

function parseDebugFinalistCanonicalization(debug: unknown): DebugFinalistCanonicalization | null {
  if (!debug || typeof debug !== "object" || Array.isArray(debug)) {
    return null;
  }

  const value = debug as {
    finalistCanonicalizationAttempted?: unknown;
    finalistCanonicalizationSucceeded?: unknown;
    aspectRecoveryAttemptsByShape?: unknown;
    aspectRecoveryReasonsByShape?: unknown;
    canonicalAssetPathsByShape?: unknown;
    canonicalizationFailureReasons?: unknown;
  };
  const attempted = value.finalistCanonicalizationAttempted === true;
  const succeededCandidate = value.finalistCanonicalizationSucceeded;
  const succeeded =
    succeededCandidate === true ? true : succeededCandidate === false ? false : null;
  const attemptsObject =
    value.aspectRecoveryAttemptsByShape && typeof value.aspectRecoveryAttemptsByShape === "object" && !Array.isArray(value.aspectRecoveryAttemptsByShape)
      ? (value.aspectRecoveryAttemptsByShape as Record<string, unknown>)
      : null;
  const reasonsObject =
    value.aspectRecoveryReasonsByShape && typeof value.aspectRecoveryReasonsByShape === "object" && !Array.isArray(value.aspectRecoveryReasonsByShape)
      ? (value.aspectRecoveryReasonsByShape as Record<string, unknown>)
      : null;
  const assetPathsObject =
    value.canonicalAssetPathsByShape && typeof value.canonicalAssetPathsByShape === "object" && !Array.isArray(value.canonicalAssetPathsByShape)
      ? (value.canonicalAssetPathsByShape as Record<string, unknown>)
      : null;
  const canonicalizationFailureReasons = Array.isArray(value.canonicalizationFailureReasons)
    ? value.canonicalizationFailureReasons.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
  if (!attempted && succeeded === null && !attemptsObject && !reasonsObject && !assetPathsObject && canonicalizationFailureReasons.length === 0) {
    return null;
  }

  const readAttemptCount = (shape: "square" | "wide" | "tall"): number => {
    const candidate = attemptsObject?.[shape];
    return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : 0;
  };
  const readReasonList = (shape: "square" | "wide" | "tall"): string[] => {
    const candidate = reasonsObject?.[shape];
    return Array.isArray(candidate)
      ? candidate.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [];
  };
  const readAssetPath = (shape: "square" | "wide" | "tall"): string | null => normalizeAssetPathForCompletenessCheck(assetPathsObject?.[shape]);

  return {
    attempted,
    succeeded,
    aspectRecoveryAttemptsByShape: {
      square: readAttemptCount("square"),
      wide: readAttemptCount("wide"),
      tall: readAttemptCount("tall")
    },
    aspectRecoveryReasonsByShape: {
      square: readReasonList("square"),
      wide: readReasonList("wide"),
      tall: readReasonList("tall")
    },
    canonicalAssetPathsByShape: {
      square: readAssetPath("square"),
      wide: readAssetPath("wide"),
      tall: readAssetPath("tall")
    },
    canonicalizationFailureReasons
  };
}

function resolveOptionGenerationStatus(
  output: unknown,
  dbStatus?: string,
  assets?: Array<{ kind: string; slot: string | null; file_path: string }>
): GenerationOptionStatus {
  return resolveProductionValidOptionStatus({
    output,
    dbStatus,
    assets
  });
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

function readDesignSpecSummary(
  output: unknown,
  optionStatus: GenerationOptionStatus,
  dbStatus?: string | null
): OptionDesignSpecSummary {
  const fallback: OptionDesignSpecSummary = {
    optionStatus,
    generationLifecycleState: resolveGenerationLifecycleState({
      dbStatus,
      optionStatus
    }),
    roundHasFallback: false,
    roundStatus: null,
    roundCompletedCount: null,
    roundAttemptCount: null,
    roundRequiredCompletedCount: null,
    roundFailureReason: null,
    roundOperationalFailureReason: null,
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
    debugAspectAssets: null,
    debugFinalistCanonicalization: null,
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
  const roundOperationalFailureReasonCandidate = debugObject
    ? (debugObject as { roundOperationalFailureReason?: unknown }).roundOperationalFailureReason
    : null;
  const debugBackgroundSourceCandidate = debugObject
    ? (debugObject as { backgroundSource?: unknown }).backgroundSource
    : null;
  const debugLockupSourceCandidate = debugObject ? (debugObject as { lockupSource?: unknown }).lockupSource : null;
  const debugBackgroundFailureReasonCandidate = debugObject
    ? (debugObject as { backgroundFailureReason?: unknown }).backgroundFailureReason
    : null;
  const generationLifecycleStateCandidate = debugObject
    ? (debugObject as { generationLifecycleState?: unknown }).generationLifecycleState
    : null;
  const debugAspectAssets = parseDebugAspectAssets(output) || deriveAspectAssetsFromPreview(output);
  const debugFinalistCanonicalization = parseDebugFinalistCanonicalization(debugObject);
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
  const latestAttemptFailureReason = isGenerationFailureReason(latestAttemptFailureReasonCandidate)
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
            failureReason: latestAttemptFailureReason || (isGenerationFailureReason(debugBackgroundFailureReasonCandidate)
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
      roundStatus: isGenerationRoundStatus(roundStatusCandidate) ? roundStatusCandidate : null,
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
      roundFailureReason: isGenerationRoundFailureReason(roundFailureReasonCandidate) ? roundFailureReasonCandidate : null,
      roundOperationalFailureReason: isProviderFailureReason(roundOperationalFailureReasonCandidate)
        ? roundOperationalFailureReasonCandidate
        : null,
      generationLifecycleState: optionStatus === "IN_PROGRESS"
        ? "GENERATION_IN_PROGRESS"
        : isGenerationLifecycleState(generationLifecycleStateCandidate)
        ? generationLifecycleStateCandidate
        : resolveGenerationLifecycleState({
            dbStatus,
            optionStatus,
            failureReason: isGenerationFailureReason(debugBackgroundFailureReasonCandidate) ? debugBackgroundFailureReasonCandidate : null
          }),
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
      debugBackgroundFailureReason: isGenerationFailureReason(debugBackgroundFailureReasonCandidate) ? debugBackgroundFailureReasonCandidate : null,
      debugAspectAssets,
      debugFinalistCanonicalization,
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
    optionStatus,
    generationLifecycleState: optionStatus === "IN_PROGRESS"
      ? "GENERATION_IN_PROGRESS"
      : isGenerationLifecycleState(generationLifecycleStateCandidate)
      ? generationLifecycleStateCandidate
      : resolveGenerationLifecycleState({
          dbStatus,
          optionStatus,
          failureReason: isGenerationFailureReason(debugBackgroundFailureReasonCandidate) ? debugBackgroundFailureReasonCandidate : null
        }),
    roundHasFallback: roundHasFallbackCandidate === true,
    roundStatus: isGenerationRoundStatus(roundStatusCandidate) ? roundStatusCandidate : null,
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
    roundFailureReason: isGenerationRoundFailureReason(roundFailureReasonCandidate) ? roundFailureReasonCandidate : null,
    roundOperationalFailureReason: isProviderFailureReason(roundOperationalFailureReasonCandidate)
      ? roundOperationalFailureReasonCandidate
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
    debugBackgroundFailureReason: isGenerationFailureReason(debugBackgroundFailureReasonCandidate) ? debugBackgroundFailureReasonCandidate : null,
    debugAspectAssets,
    debugFinalistCanonicalization,
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
  options?: { debugStage?: boolean }
): string {
  if (options?.debugStage) {
    return `/api/projects/${projectId}/generations/${generationId}/preview?shape=${shape}&debugStage=1&v=${updatedAt.getTime()}`;
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
  const generationValidationById = new Map(
    generations.map((generation) => [
      generation.id,
      resolveProductionValidOption({
        output: generation.output,
        dbStatus: generation.status,
        assets: generation.assets
      })
    ])
  );
  const finalDesignGeneration = project.finalDesign?.generationId
    ? generations.find((generation) => generation.id === project.finalDesign?.generationId) || null
    : null;
  const finalDesignValidation = finalDesignGeneration ? generationValidationById.get(finalDesignGeneration.id) || null : null;
  const finalDesignDownloadsEnabled = Boolean(project.finalDesign && finalDesignValidation?.valid);
  const finalBundleDownloadsEnabled = Boolean(project.finalDesign && finalDesignValidation?.export.eligible);
  const finalDesignInvalidReasonLabels = finalDesignValidation
    ? summarizeProductionInvalidReasons(finalDesignValidation.invalidReasons, 3)
    : [];
  const finalBundleInvalidReasonLabels = finalDesignValidation
    ? summarizeProductionInvalidReasons(finalDesignValidation.export.invalidReasons, 3)
    : [];

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
            <DeliverableDownloadLink href={`/api/projects/${project.id}/final/pptx`} label="Download PPTX" disabled={!finalDesignDownloadsEnabled} />
            <DeliverableDownloadLink href={`/api/projects/${project.id}/final/svg`} label="Download SVG" disabled={!finalDesignDownloadsEnabled} />
            <DeliverableDownloadLink href={`/api/projects/${project.id}/final/bundle`} label="Download ZIP" disabled={!finalBundleDownloadsEnabled} />
          </div>
          {!project.finalDesign ? (
            <p className="w-full text-right text-xs text-slate-500">Finalize to unlock downloads.</p>
          ) : !finalDesignDownloadsEnabled ? (
            <p className="w-full text-right text-xs text-rose-600">
              Approved design is not production-valid anymore.
              {finalDesignGeneration
                ? ` ${finalDesignInvalidReasonLabels.join(" · ") || "Re-finalize a canonical option."}`
                : " Approved source generation is missing. Re-finalize a canonical option."}
            </p>
          ) : !finalBundleDownloadsEnabled ? (
            <p className="w-full text-right text-xs text-rose-600">
              ZIP export is blocked. {finalBundleInvalidReasonLabels.join(" · ") || "Canonical bundle assets are incomplete."}
            </p>
          ) : null}
        </div>
      </div>

      {roundEntries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-slate-600">No generations yet. Start Round 1 from the project overview page.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {roundEntries.map(([round, roundGenerations], roundIndex) => {
            const roundDesignSummaries = roundGenerations.map((generation) => {
              const validation = generationValidationById.get(generation.id);
              return readDesignSpecSummary(
                generation.output,
                validation?.status ?? resolveOptionGenerationStatus(generation.output, generation.status, generation.assets),
                generation.status
              );
            });
            const roundHasActiveGenerations = roundDesignSummaries.some((summary) => summary.optionStatus === "IN_PROGRESS");
            const persistedAttemptCount = roundDesignSummaries.find((summary) => summary.roundAttemptCount !== null)?.roundAttemptCount ?? null;
            const persistedRequiredCompletedCount =
              roundDesignSummaries.find((summary) => summary.roundRequiredCompletedCount !== null)?.roundRequiredCompletedCount ??
              REQUIRED_COMPLETED_OPTIONS_PER_ROUND;
            const roundFailureReason =
              roundDesignSummaries.find((summary) => summary.roundFailureReason !== null)?.roundFailureReason || null;
            const roundOperationalFailureReason =
              roundDesignSummaries.find((summary) => summary.roundOperationalFailureReason !== null)?.roundOperationalFailureReason || null;
            const computedCompletedCount = roundDesignSummaries.filter((summary) => summary.optionStatus === "COMPLETED").length;
            const roundCompletedCount = computedCompletedCount;
            const computedRoundStatus: GenerationRoundStatus = roundHasActiveGenerations
              ? "RUNNING"
              : roundCompletedCount >= persistedRequiredCompletedCount
                ? "COMPLETED"
                : roundCompletedCount > 0
                  ? "PARTIAL"
                  : "FAILED";
            const roundHasFallback = roundDesignSummaries.some((summary) => summary.optionStatus === "FALLBACK");
            const roundNeedsRetry =
              computedRoundStatus !== "RUNNING" &&
              (computedRoundStatus === "FAILED" || roundCompletedCount < persistedRequiredCompletedCount);
            const retryHref = round === 1 ? `/app/projects/${project.id}` : `/app/projects/${project.id}/feedback?round=${round}`;
            const roundFailureMessage =
              roundFailureReason === "ROUND_ABORTED_PROVIDER_FAILURE"
                ? roundOperationalFailureReason === "PROVIDER_MODEL_UNAVAILABLE"
                  ? "The configured image model was unavailable, so the round aborted before 3 valid options could finish."
                  : roundOperationalFailureReason === "PROVIDER_QUOTA_OR_RATE_LIMIT"
                    ? "Image generation hit quota or rate limits, so the round aborted before 3 valid options could finish."
                    : roundOperationalFailureReason === "PROVIDER_AUTH_OR_CONFIG_ERROR"
                      ? "Image provider auth or config failed, so the round aborted before 3 valid options could finish."
                      : "The image provider failed upstream, so the round aborted before 3 valid options could finish."
                : "Couldn’t produce 3 valid options after a live provider path. Retry.";

            return (
              <div key={round} className="space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold">Round {round}</h2>
                  {roundIndex === 0 ? (
                    <span className="rounded-full bg-pine/10 px-2 py-0.5 text-xs font-medium text-pine">Latest</span>
                  ) : null}
                  {computedRoundStatus === "RUNNING" ? (
                    <span className="rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800">
                      In progress
                    </span>
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
                {computedRoundStatus === "RUNNING" ? (
                  <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                    Round work is still in flight. In-progress options are intentionally shown as generating instead of settled fallback failures.
                  </div>
                ) : null}
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
                  const generationValidation =
                    generationValidationById.get(generation.id) ||
                    resolveProductionValidOption({
                      output: generation.output,
                      dbStatus: generation.status,
                      assets: generation.assets
                    });
                  const isApprovedFinal =
                    project.finalDesign?.generationId === generation.id ||
                    (project.finalDesign?.round === round && project.finalDesign.optionKey === optionKey);
                  const styleRefCount = (
                    generation.output as { meta?: { styleRefCount?: unknown } } | null
                  )?.meta?.styleRefCount;
                  const designSpecSummary =
                    roundDesignSummaries[optionIndex] || readDesignSpecSummary(generation.output, generationValidation.status, generation.status);
                  const previewUrls = {
                    square: getGenerationPreviewUrl(project.id, generation.id, "square", generation.updatedAt, {
                      debugStage: debugStageEnabled
                    }),
                    wide: getGenerationPreviewUrl(project.id, generation.id, "wide", generation.updatedAt, {
                      debugStage: debugStageEnabled
                    }),
                    tall: getGenerationPreviewUrl(project.id, generation.id, "tall", generation.updatedAt, {
                      debugStage: debugStageEnabled
                    })
                  };
                  const previewModeByFormat = {
                    square: generationValidation.preview.square.mode,
                    wide: generationValidation.preview.wide.mode,
                    tall: generationValidation.preview.tall.mode
                  } as const;
                  const failedChecks: ProductionValidationFailedChecks = generationValidation.failedChecks;
                  const finalizeAction = approveFinalDesignAction.bind(null, project.id, generation.id, optionKey);

                  return (
                    <DirectionOptionCard
                      key={generation.id}
                      projectId={project.id}
                      round={round}
                      generationId={generation.id}
                      generationStatus={designSpecSummary.optionStatus}
                      generationLifecycleState={designSpecSummary.generationLifecycleState}
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
                      debugAspectAssets={designSpecSummary.debugAspectAssets}
                      debugFinalistCanonicalization={designSpecSummary.debugFinalistCanonicalization}
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
                      previewModeByFormat={previewModeByFormat}
                      invalidReasons={generationValidation.invalidReasons}
                      failedChecks={failedChecks}
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
