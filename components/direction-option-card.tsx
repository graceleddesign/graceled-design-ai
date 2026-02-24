"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { GenerationPreviewPane } from "@/components/generation-preview-pane";

type DirectionPreviewFormat = "wide" | "square" | "tall";
type AspectAssetStatus = "ok" | "missing" | "placeholder";

const PREVIEW_FORMATS: readonly DirectionPreviewFormat[] = ["wide", "square", "tall"];

const FORMAT_META: Record<
  DirectionPreviewFormat,
  { label: string; aspectClass: string; width: number; height: number; heroAspectClass?: string }
> = {
  wide: {
    label: "Widescreen",
    aspectClass: "aspect-[16/9]",
    heroAspectClass: "aspect-[16/9]",
    width: 1920,
    height: 1080
  },
  square: {
    label: "Square",
    aspectClass: "aspect-square",
    width: 1080,
    height: 1080
  },
  tall: {
    label: "Vertical",
    aspectClass: "aspect-[9/16]",
    width: 1080,
    height: 1920
  }
};

type DirectionOptionCardProps = {
  projectId: string;
  round: number;
  generationId: string;
  generationStatus: "COMPLETED" | "FAILED_GENERATION" | "FALLBACK";
  optionLabel: string;
  tintClass: string;
  isApprovedFinal: boolean;
  styleRefCount: number | null;
  isTitleStage?: boolean;
  wantsSeriesMark?: boolean;
  lockupLayout?: string | null;
  motifFocus?: string[];
  styleFamilyName?: string | null;
  styleBucket?: string | null;
  styleTone?: string | null;
  styleMedium?: string | null;
  motifScope?: "whole_book" | "multi_passage" | "specific_passage" | null;
  brandMode?: "brand" | "fresh";
  debugReferenceId?: string | null;
  debugReferenceCluster?: string | null;
  debugVariationTemplateKey?: string | null;
  debugTemplateKey?: string | null;
  debugTypeRegion?: string | null;
  debugMotifRegion?: string | null;
  debugTitleIntegrationMode?: string | null;
  debugBackgroundAnchorSrc?: string | null;
  debugLockupAnchorSrc?: string | null;
  debugBackgroundSource?: "generated" | "reused" | "fallback" | null;
  debugLockupSource?: "generated" | "reused" | "fallback" | null;
  debugBackgroundFailureReason?:
    | "ALL_TEXT"
    | "ALL_SCAFFOLD"
    | "API_ERROR"
    | "RATE_LIMIT"
    | "BUDGET"
    | "MISSING_ASPECT_ASSET"
    | "UNKNOWN"
    | null;
  debugAspectAssets?: {
    widescreen: AspectAssetStatus;
    square: AspectAssetStatus;
    vertical: AspectAssetStatus;
  } | null;
  debugWarning?: string | null;
  debugImageCalls?: {
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
  debugRateLimitWaitMs?: number | null;
  debugRefinementChainId?: string | null;
  debugAnchorDirectionFingerprint?: string | null;
  debugLockedInvariantsSummary?: string | null;
  debugVariantMutationAxis?: "composition" | "motif_emphasis" | "typography_energy" | null;
  debugEliminatedChecks?: string[];
  debugBestEffortBackground?: {
    imageUrl: string;
    score: number | null;
    failedChecks: Array<"textOk" | "scaffoldOk" | "motifOk" | "toneOk">;
    failureReason:
      | "ALL_TEXT"
      | "ALL_SCAFFOLD"
      | "API_ERROR"
      | "RATE_LIMIT"
      | "BUDGET"
      | "MISSING_ASPECT_ASSET"
      | "UNKNOWN"
      | null;
    eligibleCount: number;
    totalCandidates: number;
    failureCounts: {
      textOk: number;
      scaffoldOk: number;
      motifOk: number;
      toneOk: number;
    };
  } | null;
  showDebugChips?: boolean;
  previewUrls: Record<DirectionPreviewFormat, string>;
  finalizeAction: () => Promise<void>;
};

export function DirectionOptionCard({
  projectId,
  round,
  generationId,
  generationStatus,
  optionLabel,
  tintClass,
  isApprovedFinal,
  styleRefCount,
  isTitleStage = false,
  wantsSeriesMark = false,
  lockupLayout = null,
  motifFocus = [],
  styleFamilyName = null,
  styleBucket = null,
  styleTone = null,
  styleMedium = null,
  motifScope = null,
  brandMode,
  debugReferenceId = null,
  debugReferenceCluster = null,
  debugVariationTemplateKey = null,
  debugTemplateKey = null,
  debugTypeRegion = null,
  debugMotifRegion = null,
  debugTitleIntegrationMode = null,
  debugBackgroundAnchorSrc = null,
  debugLockupAnchorSrc = null,
  debugBackgroundSource = null,
  debugLockupSource = null,
  debugBackgroundFailureReason = null,
  debugAspectAssets = null,
  debugWarning = null,
  debugImageCalls = null,
  debugRateLimitWaitMs = null,
  debugRefinementChainId = null,
  debugAnchorDirectionFingerprint = null,
  debugLockedInvariantsSummary = null,
  debugVariantMutationAxis = null,
  debugEliminatedChecks = [],
  debugBestEffortBackground = null,
  showDebugChips = false,
  previewUrls,
  finalizeAction
}: DirectionOptionCardProps) {
  const [activeFormat, setActiveFormat] = useState<DirectionPreviewFormat>("wide");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [showBestEffortBackground, setShowBestEffortBackground] = useState(false);
  const finalizeFormRef = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const canRefineOrFinalize = generationStatus === "COMPLETED";
  const isFallbackOption = generationStatus === "FALLBACK";
  const isFailedOption = generationStatus === "FAILED_GENERATION";
  const showGenerationFailureWarning = isFallbackOption || isFailedOption;
  const activeMeta = FORMAT_META[activeFormat];
  const infoChips = [
    isTitleStage ? "Title-Integrated" : null,
    wantsSeriesMark ? "Series Mark Attempt" : null,
    styleBucket ? `Bucket: ${styleBucket}` : null,
    styleTone ? `Tone: ${styleTone}` : null,
    styleMedium ? `Medium: ${styleMedium}` : null,
    motifScope ? `Motif scope: ${motifScope}` : null,
    styleFamilyName ? `Style: ${styleFamilyName}` : null,
    lockupLayout ? `Lockup Layout: ${lockupLayout}` : null,
    motifFocus.length > 0 ? `Motif focus: ${motifFocus.join(" + ")}` : null,
    brandMode ? `Mode: ${brandMode === "brand" ? "Brand-aligned" : "Fresh"}` : null,
    showDebugChips && debugReferenceId ? `Ref ID: ${debugReferenceId}` : null,
    showDebugChips && debugReferenceCluster ? `Ref cluster: ${debugReferenceCluster}` : null,
    showDebugChips && debugVariationTemplateKey ? `Template: ${debugVariationTemplateKey}` : null,
    showDebugChips && debugTemplateKey ? `DesignSpec template: ${debugTemplateKey}` : null,
    showDebugChips && debugTypeRegion ? `Type region: ${debugTypeRegion}` : null,
    showDebugChips && debugMotifRegion ? `Motif region: ${debugMotifRegion}` : null,
    showDebugChips && debugTitleIntegrationMode ? `Integration: ${debugTitleIntegrationMode}` : null,
    showDebugChips && debugBackgroundSource ? `Background src: ${debugBackgroundSource}` : null,
    showDebugChips && debugLockupSource ? `Lockup src: ${debugLockupSource}` : null,
    showDebugChips && debugBackgroundFailureReason ? `Background fail: ${debugBackgroundFailureReason}` : null,
    showDebugChips && debugImageCalls
      ? `Image calls: ${debugImageCalls.total} (retry ${debugImageCalls.retries})`
      : null,
    showDebugChips && debugImageCalls
      ? `Stage calls: bg ${debugImageCalls.byStage.background} / lockup ${debugImageCalls.byStage.lockup}`
      : null,
    showDebugChips && debugImageCalls
      ? `Aspect calls: wide ${debugImageCalls.byAspect.wide}, square ${debugImageCalls.byAspect.square}, vertical ${debugImageCalls.byAspect.vertical}`
      : null,
    showDebugChips && typeof debugRateLimitWaitMs === "number" ? `Rate-limit wait: ${Math.round(debugRateLimitWaitMs)}ms` : null,
    showDebugChips && debugRefinementChainId ? `Refine chain: ${debugRefinementChainId}` : null,
    showDebugChips && debugAnchorDirectionFingerprint ? `Anchor fp: ${debugAnchorDirectionFingerprint.slice(0, 12)}` : null,
    showDebugChips && debugLockedInvariantsSummary ? `Locked: ${debugLockedInvariantsSummary}` : null,
    showDebugChips && debugVariantMutationAxis ? `Mutated axis: ${debugVariantMutationAxis}` : null,
    showDebugChips && debugEliminatedChecks.length > 0
      ? `Eliminated by: ${debugEliminatedChecks.join(", ")}`
      : null,
    showDebugChips && (debugBackgroundAnchorSrc || debugLockupAnchorSrc) ? "Anchor sources attached" : null
  ].filter((chip): chip is string => Boolean(chip));
  const canShowBestEffortBackground =
    showDebugChips && debugBackgroundSource === "fallback" && Boolean(debugBestEffortBackground?.imageUrl);
  const aspectCompletenessLine =
    showDebugChips && debugAspectAssets
      ? `Aspect completeness: wide ${debugAspectAssets.widescreen}, square ${debugAspectAssets.square}, vertical ${debugAspectAssets.vertical}`
      : null;

  useEffect(() => {
    if (!isConfirmOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsConfirmOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isConfirmOpen]);

  const handleFinalizeConfirm = () => {
    if (!canRefineOrFinalize) {
      return;
    }
    setIsConfirmOpen(false);
    finalizeFormRef.current?.requestSubmit();
  };

  return (
    <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">{optionLabel}</h3>
          <div className="flex items-center gap-2">
            {isFallbackOption ? (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                Generation failed (fallback)
              </span>
            ) : null}
            {isFailedOption ? (
              <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-800">
                Generation failed
              </span>
            ) : null}
            {isApprovedFinal ? <span className="rounded-full bg-pine/10 px-2 py-0.5 text-xs font-medium text-pine">Final</span> : null}
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-sm text-slate-600">
            {typeof styleRefCount === "number" ? `${styleRefCount} style refs` : "Auto-selected style references"}
          </p>
          {infoChips.map((chip) => (
            <span key={chip} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600">
              {chip}
            </span>
          ))}
        </div>
        {aspectCompletenessLine ? <p className="mt-1 text-xs text-slate-600">{aspectCompletenessLine}</p> : null}
      </div>

      <div className="space-y-2">
        <GenerationPreviewPane
          label={activeMeta.label}
          imageUrl={previewUrls[activeFormat]}
          aspectClass={activeMeta.heroAspectClass ?? activeMeta.aspectClass}
          tintClass={tintClass}
          width={activeMeta.width}
          height={activeMeta.height}
          labelClassName="bg-white/70 text-[9px] text-slate-600"
        />

        <div className="grid grid-cols-2 gap-2">
          {PREVIEW_FORMATS.filter((format) => format !== activeFormat).map((format) => {
            const formatMeta = FORMAT_META[format];
            return (
              <button
                key={format}
                type="button"
                onClick={() => setActiveFormat(format)}
                aria-label={`Show ${formatMeta.label} preview for ${optionLabel}`}
                className="rounded-md border border-slate-200 p-1 text-left transition hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2"
              >
                <GenerationPreviewPane
                  label={formatMeta.label}
                  imageUrl={previewUrls[format]}
                  aspectClass={formatMeta.aspectClass}
                  tintClass={tintClass}
                  width={formatMeta.width}
                  height={formatMeta.height}
                  showLabel={false}
                  className="border-slate-100"
                />
                <span className="mt-1 block px-1 text-[11px] font-medium text-slate-500">{formatMeta.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {canShowBestEffortBackground && debugBestEffortBackground ? (
        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2.5">
          <button
            type="button"
            onClick={() => setShowBestEffortBackground((current) => !current)}
            className="text-xs font-semibold text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
          >
            {showBestEffortBackground ? "Hide best-effort background" : "Show best-effort background"}
          </button>
          {showBestEffortBackground ? (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Best-effort candidate (failed eligibility)
              </p>
              <GenerationPreviewPane
                label="Best-effort"
                imageUrl={debugBestEffortBackground.imageUrl}
                aspectClass={FORMAT_META.wide.aspectClass}
                tintClass={tintClass}
                width={FORMAT_META.wide.width}
                height={FORMAT_META.wide.height}
                labelClassName="bg-white/70 text-[9px] text-slate-600"
              />
              <p className="text-[11px] text-slate-700">
                Failed checks:{" "}
                {debugBestEffortBackground.failedChecks.length > 0 ? debugBestEffortBackground.failedChecks.join(", ") : "none"}
              </p>
              <p className="text-[11px] text-slate-700">
                failureReason: {debugBestEffortBackground.failureReason || debugBackgroundFailureReason || "UNKNOWN"}
              </p>
              <p className="text-[11px] text-slate-700">
                eligibleCount: {debugBestEffortBackground.eligibleCount} | totalCandidates: {debugBestEffortBackground.totalCandidates}
              </p>
              <p className="text-[11px] text-slate-700">
                per-check failures: textOk={debugBestEffortBackground.failureCounts.textOk}, scaffoldOk=
                {debugBestEffortBackground.failureCounts.scaffoldOk}, motifOk={debugBestEffortBackground.failureCounts.motifOk}, toneOk=
                {debugBestEffortBackground.failureCounts.toneOk}
              </p>
              {typeof debugBestEffortBackground.score === "number" ? (
                <p className="text-[11px] text-slate-700">bestScore: {debugBestEffortBackground.score.toFixed(4)}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {showDebugChips && debugWarning ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          {debugWarning}
        </div>
      ) : null}
      {showGenerationFailureWarning ? (
        <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-900">
          {isFallbackOption ? "Generation failed (fallback)" : "Generation failed."}
        </div>
      ) : null}

      {showDebugChips && (debugBackgroundAnchorSrc || debugLockupAnchorSrc) ? (
        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Reference Anchors</p>
          {debugBackgroundAnchorSrc ? (
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-slate-600">Visual anchor src</p>
              <a
                href={debugBackgroundAnchorSrc}
                target="_blank"
                rel="noreferrer"
                className="block break-all text-[11px] text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
              >
                {debugBackgroundAnchorSrc}
              </a>
            </div>
          ) : null}
          {debugLockupAnchorSrc ? (
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-slate-600">Typography anchor src</p>
              <a
                href={debugLockupAnchorSrc}
                target="_blank"
                rel="noreferrer"
                className="block break-all text-[11px] text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
              >
                {debugLockupAnchorSrc}
              </a>
            </div>
          ) : null}
          <Image
            src={debugBackgroundAnchorSrc || debugLockupAnchorSrc || ""}
            alt={`${optionLabel} reference anchor thumbnail`}
            width={160}
            height={80}
            unoptimized
            className="h-20 w-auto max-w-full rounded border border-slate-200 bg-white object-contain"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {canRefineOrFinalize ? (
          <Link
            href={`/app/projects/${projectId}/feedback?round=${round}&generationId=${generationId}`}
            className="inline-flex rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
          >
            Refine this direction
          </Link>
        ) : (
          <span className="inline-flex cursor-not-allowed rounded-md border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-400">
            Refine this direction
          </span>
        )}
        <form ref={finalizeFormRef} action={finalizeAction}>
          <button
            type="button"
            disabled={!canRefineOrFinalize}
            onClick={() => {
              if (!canRefineOrFinalize) {
                return;
              }
              setIsConfirmOpen(true);
            }}
            className="inline-flex rounded-md bg-pine px-3 py-1.5 text-sm font-medium text-white hover:bg-pine/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Finalize &amp; Export
          </button>
          <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
            Finalize
          </button>
        </form>
      </div>

      {isConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/45" aria-hidden="true" onClick={() => setIsConfirmOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <h4 id={titleId} className="text-base font-semibold text-slate-900">
              Finalize this design?
            </h4>
            <p id={descriptionId} className="mt-2 text-sm text-slate-600">
              We&apos;ll generate your full downloadable package (all sizes + templates).
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setIsConfirmOpen(false)}
                className="inline-flex rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFinalizeConfirm}
                className="inline-flex rounded-md bg-pine px-3 py-1.5 text-sm font-medium text-white hover:bg-pine/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-2"
              >
                Finalize
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
