import { normalizeDesignDoc, type DesignDoc } from "@/lib/design-doc";
import { type GenerationFailureReason, type GenerationOptionStatus } from "@/lib/generation-state";

export const ASPECT_ASSET_PLACEHOLDER_PATH_PATTERN = /(fallback|placeholder|wireframe|guide|debug|stage|scaffold)/i;
const ASPECT_ASSET_DERIVED_PATH_PATTERN = /(^|[-_/])derived([\-_.\/]|$)/i;

export type AspectAssetStatus = "ok" | "missing" | "placeholder";
export type OutputAspect = "widescreen" | "square" | "vertical";
export type PreviewShape = "square" | "wide" | "tall";
export type DebugAssetSource = "generated" | "reused" | "fallback" | "unknown";
export type AspectAssetProvenance = "rendered" | "derived" | "fallback" | "unknown";
export type PreviewMode = "canonical_asset" | "fallback_asset" | "fallback_composite" | "fallback_design_doc";

export type GenerationAssetRecord = {
  kind: string;
  slot: string | null;
  file_path: string;
};

export type ProductionBackgroundValidationEvidence = {
  source: DebugAssetSource;
  sourceGenerationId: string | null;
  textFree: boolean | null;
  scaffoldFree: boolean | null;
  motifPresent: boolean | null;
  toneFit: boolean | null;
  referenceFit: boolean | null;
};

export type ProductionLockupValidationEvidence = {
  source: DebugAssetSource;
  sourceGenerationId: string | null;
  textIntegrity: boolean | null;
  fitPass: boolean | null;
  insideTitleSafeWithMargin: boolean | null;
  notTooSmall: boolean | null;
};

export type ProductionValidationFailedChecks = {
  background: string[];
  lockup: string[];
  aspects: Record<OutputAspect, string[]>;
  provenance: string[];
  preview: Record<PreviewShape, string[]>;
  finalize: string[];
  export: string[];
  exportMissingSlots: Array<"square" | "wide" | "tall" | "lockup" | "design_doc">;
};

export type ProductionFinalizeValidationResult = {
  eligible: boolean;
  invalidReasons: string[];
};

export type ProductionExportValidationResult = {
  eligible: boolean;
  invalidReasons: string[];
  bundleComplete: boolean;
  missingSlots: Array<"square" | "wide" | "tall" | "lockup" | "design_doc">;
};

export type PreviewValidationSource =
  | "final_asset"
  | "fallback_preview_asset"
  | "background_lockup_composite"
  | "design_doc";

export type PreviewValidationResult = {
  canonical: boolean;
  mode: PreviewMode;
  assetPath: string | null;
  invalidReasons: string[];
  source: PreviewValidationSource;
};

export type ProductionValidationSnapshot = {
  version: 1;
  background?: ProductionBackgroundValidationEvidence;
  lockup?: ProductionLockupValidationEvidence;
  aspects?: Partial<
    Record<
      OutputAspect,
      {
        provenance: AspectAssetProvenance;
      }
        >
      >;
  isProductionValid?: boolean;
  invalidReasons?: string[];
  failedChecks?: ProductionValidationFailedChecks;
  preview?: Record<PreviewShape, PreviewValidationResult>;
  previewCanonicality?: Record<PreviewShape, boolean>;
  previewMode?: Record<PreviewShape, PreviewMode>;
  hasCanonicalDesignDoc?: boolean;
  finalize?: ProductionFinalizeValidationResult;
  export?: ProductionExportValidationResult;
};

type AspectValidationResult = {
  status: AspectAssetStatus;
  provenance: AspectAssetProvenance;
  valid: boolean;
  path: string | null;
  invalidReasons: string[];
  reasons: string[];
};

type ComponentValidationResult<T> = T & {
  valid: boolean;
  invalidReasons: string[];
  reasons: string[];
};

export type BackgroundAcceptanceChecks = {
  sourceCanonical: boolean;
  textFree: boolean | null;
  scaffoldFree: boolean | null;
  motifPresent: boolean | null;
  toneFit: boolean | null;
  referenceFit: boolean | null;
};

export type BackgroundAcceptanceResult = {
  accepted: boolean;
  valid: boolean;
  invalidReasons: string[];
  reasons: string[];
  checks: BackgroundAcceptanceChecks;
  evidence: ProductionBackgroundValidationEvidence;
};

export type LockupAcceptanceChecks = {
  sourceCanonical: boolean;
  textIntegrity: boolean | null;
  fitPass: boolean | null;
  insideTitleSafeWithMargin: boolean | null;
  notTooSmall: boolean | null;
  validationEvidencePresent: boolean;
  reuseEvidencePresent: boolean;
};

export type LockupAcceptanceResult = {
  accepted: boolean;
  valid: boolean;
  invalidReasons: string[];
  reasons: string[];
  checks: LockupAcceptanceChecks;
  evidence: ProductionLockupValidationEvidence;
};

export type ProductionValidOptionResult = {
  valid: boolean;
  isProductionValid: boolean;
  status: GenerationOptionStatus;
  invalidReasons: string[];
  reasons: string[];
  hasCanonicalDesignDoc: boolean;
  background: ComponentValidationResult<ProductionBackgroundValidationEvidence>;
  lockup: ComponentValidationResult<ProductionLockupValidationEvidence>;
  aspects: Record<OutputAspect, AspectValidationResult>;
  preview: Record<PreviewShape, PreviewValidationResult>;
  previewCanonicality: Record<PreviewShape, boolean>;
  previewMode: Record<PreviewShape, PreviewMode>;
  failedChecks: ProductionValidationFailedChecks;
  finalize: ProductionFinalizeValidationResult;
  export: ProductionExportValidationResult;
};

const OUTPUT_ASPECTS: readonly OutputAspect[] = ["widescreen", "square", "vertical"];
const PREVIEW_SHAPES: readonly PreviewShape[] = ["square", "wide", "tall"];
const ASPECT_BY_SHAPE: Record<PreviewShape, OutputAspect> = {
  square: "square",
  wide: "widescreen",
  tall: "vertical"
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAspectAssetStatus(value: unknown): value is AspectAssetStatus {
  return value === "ok" || value === "missing" || value === "placeholder";
}

function isDebugAssetSource(value: unknown): value is DebugAssetSource {
  return value === "generated" || value === "reused" || value === "fallback" || value === "unknown";
}

function isAspectAssetProvenance(value: unknown): value is AspectAssetProvenance {
  return value === "rendered" || value === "derived" || value === "fallback" || value === "unknown";
}

function isPreviewMode(value: unknown): value is PreviewMode {
  return value === "canonical_asset" || value === "fallback_asset" || value === "fallback_composite" || value === "fallback_design_doc";
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

export function normalizeAssetPathForCompletenessCheck(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.split("?")[0]?.trim() || null;
}

function readOutputMeta(output: unknown): Record<string, unknown> | null {
  if (!isRecord(output)) {
    return null;
  }

  const meta = output.meta;
  return isRecord(meta) ? meta : null;
}

function readOutputDebug(output: unknown): Record<string, unknown> | null {
  const meta = readOutputMeta(output);
  if (!meta) {
    return null;
  }

  const debug = meta.debug;
  return isRecord(debug) ? debug : null;
}

function readNestedRecord(object: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  if (!object) {
    return null;
  }
  const value = object[key];
  return isRecord(value) ? value : null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function readBooleanOrNull(value: unknown): boolean | null {
  if (value === true) {
    return true;
  }
  if (value === false) {
    return false;
  }
  return null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function dedupeReasons(reasons: string[]): string[] {
  return [...new Set(reasons.filter((reason) => reason.trim().length > 0))];
}

function addReason(reasons: string[], reason: string | null | undefined) {
  if (!reason || !reason.trim()) {
    return;
  }
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

function formatAspectLabel(aspect: string | null | undefined): string {
  if (aspect === "widescreen") {
    return "Widescreen";
  }
  if (aspect === "square") {
    return "Square";
  }
  if (aspect === "vertical") {
    return "Vertical";
  }
  return "Aspect";
}

function formatPreviewModeLabel(mode: string | null | undefined): string {
  if (mode === "canonical_asset") {
    return "canonical asset preview";
  }
  if (mode === "fallback_asset") {
    return "fallback asset preview";
  }
  if (mode === "fallback_composite") {
    return "fallback composite preview";
  }
  if (mode === "fallback_design_doc") {
    return "fallback design-doc preview";
  }
  return "non-canonical preview";
}

function formatBackgroundFailureReasonLabel(reason: GenerationFailureReason | string | null | undefined): string {
  if (reason === "ALL_TEXT") {
    return "all candidates contained text";
  }
  if (reason === "ALL_SCAFFOLD") {
    return "all candidates looked scaffold-like";
  }
  if (reason === "PROVIDER_MODEL_UNAVAILABLE") {
    return "configured image model was unavailable";
  }
  if (reason === "PROVIDER_QUOTA_OR_RATE_LIMIT") {
    return "image generation quota or rate limit was hit";
  }
  if (reason === "PROVIDER_AUTH_OR_CONFIG_ERROR") {
    return "image provider auth or config failed";
  }
  if (reason === "PROVIDER_TRANSIENT_ERROR") {
    return "image provider had a transient upstream failure";
  }
  if (reason === "BUDGET") {
    return "image generation budget was exhausted";
  }
  if (reason === "MISSING_ASPECT_ASSET") {
    return "required aspect asset was missing";
  }
  if (reason === "UNKNOWN") {
    return "background generation failed for an unknown reason";
  }
  return reason ? reason.toLowerCase().replace(/_/g, " ") : "unknown background generation failure";
}

function formatStatusFailureReasonLabel(reason: string): string {
  if (reason === "generation_output_missing") {
    return "Generation output is missing";
  }
  if (reason === "generation_db_status_failed") {
    return "Generation is marked failed";
  }
  if (reason === "generation_db_status_running") {
    return "Generation is still in progress";
  }
  if (reason === "generation_db_status_queued") {
    return "Generation is still queued";
  }
  return reason.replace(/_/g, " ");
}

export function formatProductionInvalidReason(reason: string): string {
  const [code, detail] = reason.split(":");

  if (code === "missing_required_aspect") {
    return `${formatAspectLabel(detail)} aspect is missing`;
  }
  if (code === "aspect_placeholder_like") {
    return `${formatAspectLabel(detail)} aspect looks placeholder-like`;
  }
  if (code === "aspect_noncanonical") {
    return `${formatAspectLabel(detail)} aspect is non-canonical`;
  }
  if (code === "aspect_fallback_provenance") {
    return `${formatAspectLabel(detail)} aspect came from fallback provenance`;
  }
  if (code === "derived_aspect_not_valid") {
    return `${formatAspectLabel(detail)} aspect is derived, not canonical`;
  }
  if (code === "background_text_detected") {
    return "Background contains text";
  }
  if (code === "background_text_check_missing") {
    return "Background text-free acceptance evidence is missing";
  }
  if (code === "background_scaffold_like") {
    return "Background still looks scaffold-like";
  }
  if (code === "background_scaffold_check_missing") {
    return "Background scaffold rejection evidence is missing";
  }
  if (code === "background_blank_or_motif_weak") {
    return "Background motif is too weak or blank-like";
  }
  if (code === "background_motif_check_missing") {
    return "Background motif-presence evidence is missing";
  }
  if (code === "background_tone_fit_failed") {
    return "Background tone fit failed";
  }
  if (code === "background_reference_fit_failed") {
    return "Background reference fit failed";
  }
  if (code === "background_not_canonical") {
    return "Background source is non-canonical";
  }
  if (code === "background_reuse_unvalidated") {
    return "Reused background was not fully validated";
  }
  if (code === "background_generation_failed") {
    return `Background generation failed: ${formatBackgroundFailureReasonLabel(detail)}`;
  }
  if (code === "lockup_text_integrity_failed") {
    return "Lockup text integrity failed";
  }
  if (code === "lockup_fit_failed") {
    return "Lockup fit validation failed";
  }
  if (code === "lockup_missing_validation_evidence") {
    return "Lockup validation evidence is missing";
  }
  if (code === "lockup_reuse_unvalidated") {
    return "Reused lockup was not fully validated";
  }
  if (code === "lockup_fallback_provenance") {
    return "Lockup came from fallback provenance";
  }
  if (code === "lockup_not_canonical") {
    return "Lockup source is non-canonical";
  }
  if (code === "preview_noncanonical") {
    return "Preview is non-canonical";
  }
  if (code === "fallback_preview_mode") {
    return `Preview is using ${formatPreviewModeLabel(detail)}`;
  }
  if (code === "fallback_design_doc_used") {
    return "Preview is rendering from fallback design doc";
  }
  if (code === "missing_canonical_design_doc") {
    return "Canonical design doc is missing";
  }
  if (code === "fallback_asset_provenance") {
    return "Preview asset comes from fallback provenance";
  }
  if (code === "finalize_blocked_noncanonical") {
    return "Finalize is blocked because the option is non-canonical";
  }
  if (code === "export_blocked_noncanonical") {
    return "Export is blocked because the option is non-canonical";
  }
  if (code === "export_incomplete_bundle") {
    return "Export bundle is missing required canonical assets";
  }
  if (code === "final_design_invalid") {
    return "Stored final design data is invalid";
  }
  if (
    code === "generation_output_missing" ||
    code === "generation_db_status_failed" ||
    code === "generation_db_status_running" ||
    code === "generation_db_status_queued"
  ) {
    return formatStatusFailureReasonLabel(code);
  }

  return reason.replace(/_/g, " ");
}

export function summarizeProductionInvalidReasons(reasons: string[], limit = 3): string[] {
  const labels = dedupeReasons(reasons).map((reason) => formatProductionInvalidReason(reason));
  return [...new Set(labels)].slice(0, limit);
}

export function buildProductionBlockedMessage(actionLabel: string, reasons: string[], limit = 3): string {
  const summarized = summarizeProductionInvalidReasons(reasons, limit);
  if (summarized.length === 0) {
    return `${actionLabel} blocked by production-validity checks.`;
  }
  return `${actionLabel} blocked: ${summarized.join("; ")}.`;
}

function readBackgroundSource(output: unknown): DebugAssetSource {
  const debug = readOutputDebug(output);
  const candidate = debug?.backgroundSource;
  return isDebugAssetSource(candidate) ? candidate : "unknown";
}

function readLockupSource(output: unknown): DebugAssetSource {
  const debug = readOutputDebug(output);
  const candidate = debug?.lockupSource;
  return isDebugAssetSource(candidate) ? candidate : "unknown";
}

function readSourceGenerationId(output: unknown, key: "reusedBackgroundFromGenerationId" | "reusedLockupFromGenerationId"): string | null {
  const meta = readOutputMeta(output);
  const designSpec = readNestedRecord(meta, "designSpec");
  return readString(designSpec?.[key]);
}

function readBackgroundFailureReason(output: unknown): string | null {
  const debug = readOutputDebug(output);
  return readString(debug?.backgroundFailureReason);
}

export function readAspectAssetsFromOutput(output: unknown): Record<OutputAspect, AspectAssetStatus> | null {
  const debug = readOutputDebug(output);
  const aspectAssets = readNestedRecord(debug, "aspectAssets");
  if (!aspectAssets) {
    return null;
  }

  const widescreen = aspectAssets.widescreen;
  const square = aspectAssets.square;
  const vertical = aspectAssets.vertical;
  if (!isAspectAssetStatus(widescreen) || !isAspectAssetStatus(square) || !isAspectAssetStatus(vertical)) {
    return null;
  }

  return {
    widescreen,
    square,
    vertical
  };
}

function readPreviewPathsFromOutput(output: unknown): Record<OutputAspect, string | null> {
  if (!isRecord(output)) {
    return {
      widescreen: null,
      square: null,
      vertical: null
    };
  }

  const preview = isRecord(output.preview) ? output.preview : null;
  return {
    widescreen: normalizeAssetPathForCompletenessCheck(preview?.widescreen_main),
    square: normalizeAssetPathForCompletenessCheck(preview?.square_main),
    vertical: normalizeAssetPathForCompletenessCheck(preview?.vertical_main)
  };
}

function readFallbackPreviewPathsFromOutput(output: unknown): Record<PreviewShape, string | null> {
  const debug = readOutputDebug(output);
  const fallbackPreview = readNestedRecord(debug, "fallbackPreview");
  return {
    square: normalizeAssetPathForCompletenessCheck(fallbackPreview?.square),
    wide: normalizeAssetPathForCompletenessCheck(fallbackPreview?.wide),
    tall: normalizeAssetPathForCompletenessCheck(fallbackPreview?.tall)
  };
}

function readAspectProvenance(output: unknown): Partial<Record<OutputAspect, AspectAssetProvenance>> {
  const meta = readOutputMeta(output);
  const productionValidation = readNestedRecord(meta, "productionValidation");
  const aspects = readNestedRecord(productionValidation, "aspects");
  if (!aspects) {
    return {};
  }

  const result: Partial<Record<OutputAspect, AspectAssetProvenance>> = {};
  for (const aspect of OUTPUT_ASPECTS) {
    const aspectValue = readNestedRecord(aspects, aspect);
    const provenanceCandidate = aspectValue?.provenance;
    if (isAspectAssetProvenance(provenanceCandidate)) {
      result[aspect] = provenanceCandidate;
    }
  }

  return result;
}

function inferAspectProvenance(pathValue: string | null): AspectAssetProvenance {
  if (!pathValue) {
    return "unknown";
  }
  if (ASPECT_ASSET_PLACEHOLDER_PATH_PATTERN.test(pathValue)) {
    return "fallback";
  }
  if (ASPECT_ASSET_DERIVED_PATH_PATTERN.test(pathValue)) {
    return "derived";
  }
  return "rendered";
}

function deriveAspectAssetsFromPaths(pathsByAspect: Record<OutputAspect, string | null>): Record<OutputAspect, AspectAssetStatus> {
  const nonNullPaths = Object.values(pathsByAspect).filter((value): value is string => Boolean(value));
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
    widescreen: classify(pathsByAspect.widescreen),
    square: classify(pathsByAspect.square),
    vertical: classify(pathsByAspect.vertical)
  };
}

function readFinalAssetPaths(assets: GenerationAssetRecord[] | undefined): Record<PreviewShape, string | null> {
  const find = (shape: PreviewShape): string | null => {
    if (!assets) {
      return null;
    }

    const match = assets.find((asset) => {
      if (asset.kind.trim().toUpperCase() !== "IMAGE") {
        return false;
      }

      const slot = (asset.slot || "").trim().toLowerCase();
      if (!slot || !asset.file_path?.trim()) {
        return false;
      }

      if (shape === "square") {
        return slot === "square" || slot === "square_main";
      }
      if (shape === "wide") {
        return slot === "wide" || slot === "wide_main" || slot === "widescreen" || slot === "widescreen_main";
      }
      return slot === "tall" || slot === "tall_main" || slot === "vertical" || slot === "vertical_main";
    });

    return match ? normalizeAssetPathForCompletenessCheck(match.file_path) : null;
  };

  return {
    square: find("square"),
    wide: find("wide"),
    tall: find("tall")
  };
}

function readBackgroundAssetPaths(assets: GenerationAssetRecord[] | undefined): Record<PreviewShape, string | null> {
  const find = (shape: PreviewShape): string | null => {
    if (!assets) {
      return null;
    }

    const match = assets.find((asset) => {
      const slot = (asset.slot || "").trim().toLowerCase();
      if (!slot || !asset.file_path?.trim()) {
        return false;
      }

      const isBackgroundKind = asset.kind.trim().toUpperCase() === "BACKGROUND" || asset.kind.trim().toUpperCase() === "IMAGE";
      if (!isBackgroundKind) {
        return false;
      }

      if (shape === "square") {
        return slot === "square_bg";
      }
      if (shape === "wide") {
        return slot === "wide_bg" || slot === "widescreen_bg";
      }
      return slot === "tall_bg" || slot === "vertical_bg";
    });

    return match ? normalizeAssetPathForCompletenessCheck(match.file_path) : null;
  };

  return {
    square: find("square"),
    wide: find("wide"),
    tall: find("tall")
  };
}

function readLockupAssetPath(assets: GenerationAssetRecord[] | undefined): string | null {
  if (!assets) {
    return null;
  }

  const match = assets.find((asset) => {
    const slot = (asset.slot || "").trim().toLowerCase();
    if (!slot || !asset.file_path?.trim()) {
      return false;
    }

    return slot === "series_lockup" || asset.kind.trim().toUpperCase() === "LOCKUP";
  });

  return match ? normalizeAssetPathForCompletenessCheck(match.file_path) : null;
}

function readPersistedBackgroundValidation(output: unknown): ProductionBackgroundValidationEvidence | null {
  const meta = readOutputMeta(output);
  const productionValidation = readNestedRecord(meta, "productionValidation");
  const background = readNestedRecord(productionValidation, "background");
  if (!background) {
    return null;
  }

  const source = isDebugAssetSource(background.source) ? background.source : "unknown";
  return {
    source,
    sourceGenerationId: readString(background.sourceGenerationId),
    textFree: readBooleanOrNull(background.textFree),
    scaffoldFree: readBooleanOrNull(background.scaffoldFree),
    motifPresent: readBooleanOrNull(background.motifPresent),
    toneFit: readBooleanOrNull(background.toneFit),
    referenceFit: readBooleanOrNull(background.referenceFit)
  };
}

function readPersistedLockupValidation(output: unknown): ProductionLockupValidationEvidence | null {
  const meta = readOutputMeta(output);
  const productionValidation = readNestedRecord(meta, "productionValidation");
  const lockup = readNestedRecord(productionValidation, "lockup");
  if (!lockup) {
    return null;
  }

  const source = isDebugAssetSource(lockup.source) ? lockup.source : "unknown";
  return {
    source,
    sourceGenerationId: readString(lockup.sourceGenerationId),
    textIntegrity: readBooleanOrNull(lockup.textIntegrity),
    fitPass: readBooleanOrNull(lockup.fitPass),
    insideTitleSafeWithMargin: readBooleanOrNull(lockup.insideTitleSafeWithMargin),
    notTooSmall: readBooleanOrNull(lockup.notTooSmall)
  };
}

function readSelectedBackgroundCandidateChecks(output: unknown): {
  textFree: boolean | null;
  scaffoldFree: boolean | null;
  motifPresent: boolean | null;
  toneFit: boolean | null;
  referenceFit: boolean | null;
} | null {
  const debug = readOutputDebug(output);
  const attempts = debug?.backgroundAttempts;
  if (!Array.isArray(attempts)) {
    return null;
  }

  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index];
    if (!isRecord(attempt)) {
      continue;
    }

    const winnerIndex = typeof attempt.winnerIndex === "number" && Number.isFinite(attempt.winnerIndex) ? attempt.winnerIndex : null;
    const candidates = Array.isArray(attempt.candidates) ? attempt.candidates : [];
    if (winnerIndex === null || !isRecord(candidates[winnerIndex])) {
      continue;
    }

    const checks = readNestedRecord(candidates[winnerIndex] as Record<string, unknown>, "checks");
    if (!checks) {
      continue;
    }

    return {
      textFree: readBooleanOrNull(checks.textOk),
      scaffoldFree: readBooleanOrNull(checks.scaffoldOk),
      motifPresent: readBooleanOrNull(checks.motifOk),
      toneFit: readBooleanOrNull(checks.toneOk),
      referenceFit:
        readBooleanOrNull(checks.referenceFit) ??
        readBooleanOrNull(checks.referenceOk) ??
        readBooleanOrNull(checks.referencePass)
    };
  }

  return null;
}

function readToneCheckPassed(output: unknown): boolean | null {
  const meta = readOutputMeta(output);
  const toneCheck = readNestedRecord(meta, "toneCheck");
  return readBooleanOrNull(toneCheck?.passed);
}

function readBackgroundTextDetected(output: unknown): boolean | null {
  const meta = readOutputMeta(output);
  const backgroundTextCheck = readNestedRecord(meta, "backgroundTextCheck");
  return readBooleanOrNull(backgroundTextCheck?.detected);
}

function inferBackgroundValidation(output: unknown): ProductionBackgroundValidationEvidence {
  const persisted = readPersistedBackgroundValidation(output);
  if (persisted) {
    return persisted;
  }

  const source = readBackgroundSource(output);
  const candidateChecks = readSelectedBackgroundCandidateChecks(output);
  return {
    source,
    sourceGenerationId: readSourceGenerationId(output, "reusedBackgroundFromGenerationId"),
    textFree: candidateChecks?.textFree ?? (readBackgroundTextDetected(output) === null ? null : readBackgroundTextDetected(output) === false),
    scaffoldFree: candidateChecks?.scaffoldFree ?? null,
    motifPresent: candidateChecks?.motifPresent ?? null,
    toneFit: candidateChecks?.toneFit ?? readToneCheckPassed(output),
    referenceFit: candidateChecks?.referenceFit ?? null
  };
}

export function evaluateBackgroundAcceptance(params: {
  evidence: ProductionBackgroundValidationEvidence;
  backgroundFailureReason?: string | null;
}): BackgroundAcceptanceResult {
  const { evidence } = params;
  const invalidReasons: string[] = [];
  const backgroundFailureReason = params.backgroundFailureReason || null;

  if (evidence.source === "fallback") {
    addReason(invalidReasons, "background_not_canonical");
  }
  if (backgroundFailureReason) {
    if (backgroundFailureReason === "ALL_TEXT") {
      addReason(invalidReasons, "background_text_detected");
    } else if (backgroundFailureReason === "ALL_SCAFFOLD") {
      addReason(invalidReasons, "background_scaffold_like");
    } else {
      addReason(invalidReasons, `background_generation_failed:${backgroundFailureReason}`);
    }
  }

  if (evidence.textFree === false) {
    addReason(invalidReasons, "background_text_detected");
  } else if (evidence.textFree !== true) {
    addReason(invalidReasons, "background_text_check_missing");
  }

  if (evidence.scaffoldFree === false) {
    addReason(invalidReasons, "background_scaffold_like");
  } else if (evidence.scaffoldFree !== true) {
    addReason(invalidReasons, "background_scaffold_check_missing");
  }

  if (evidence.motifPresent === false) {
    addReason(invalidReasons, "background_blank_or_motif_weak");
  } else if (evidence.motifPresent !== true) {
    addReason(invalidReasons, "background_motif_check_missing");
  }

  if (evidence.toneFit === false) {
    addReason(invalidReasons, "background_tone_fit_failed");
  }
  if (evidence.referenceFit === false) {
    addReason(invalidReasons, "background_reference_fit_failed");
  }
  if (
    evidence.source === "reused" &&
    (evidence.textFree !== true || evidence.scaffoldFree !== true || evidence.motifPresent !== true)
  ) {
    addReason(invalidReasons, "background_reuse_unvalidated");
  }

  return {
    accepted: invalidReasons.length === 0,
    valid: invalidReasons.length === 0,
    invalidReasons,
    reasons: invalidReasons,
    checks: {
      sourceCanonical: evidence.source !== "fallback",
      textFree: evidence.textFree,
      scaffoldFree: evidence.scaffoldFree,
      motifPresent: evidence.motifPresent,
      toneFit: evidence.toneFit,
      referenceFit: evidence.referenceFit
    },
    evidence
  };
}

function readLockupRerankChecks(output: unknown): {
  textIntegrity: boolean | null;
  fitPass: boolean | null;
  insideTitleSafeWithMargin: boolean | null;
  notTooSmall: boolean | null;
} | null {
  const meta = readOutputMeta(output);
  const rerank = readNestedRecord(meta, "rerank");
  const winnerIndex = typeof rerank?.lockupWinnerIndex === "number" && Number.isFinite(rerank.lockupWinnerIndex)
    ? rerank.lockupWinnerIndex
    : null;
  const candidates = Array.isArray(rerank?.lockupCandidates) ? rerank.lockupCandidates : [];
  if (winnerIndex === null || !isRecord(candidates[winnerIndex])) {
    return null;
  }

  const checks = readNestedRecord(candidates[winnerIndex] as Record<string, unknown>, "checks");
  if (!checks) {
    return null;
  }

  return {
    textIntegrity: readBooleanOrNull(checks.textIntegrity),
    fitPass: readBooleanOrNull(checks.fitPass),
    insideTitleSafeWithMargin: readBooleanOrNull(checks.insideTitleSafeWithMargin),
    notTooSmall: readBooleanOrNull(checks.notTooSmall)
  };
}

function readLockupTextIntegrity(output: unknown): boolean | null {
  const meta = readOutputMeta(output);
  const lockupValidation = readNestedRecord(meta, "lockupValidation");
  return readBooleanOrNull(lockupValidation?.ok);
}

function inferLockupValidation(output: unknown): ProductionLockupValidationEvidence {
  const persisted = readPersistedLockupValidation(output);
  if (persisted) {
    return persisted;
  }

  const source = readLockupSource(output);
  const rerankChecks = readLockupRerankChecks(output);
  return {
    source,
    sourceGenerationId: readSourceGenerationId(output, "reusedLockupFromGenerationId"),
    textIntegrity: rerankChecks?.textIntegrity ?? readLockupTextIntegrity(output),
    fitPass: rerankChecks?.fitPass ?? null,
    insideTitleSafeWithMargin: rerankChecks?.insideTitleSafeWithMargin ?? null,
    notTooSmall: rerankChecks?.notTooSmall ?? null
  };
}

function normalizeLockupFitPass(evidence: ProductionLockupValidationEvidence): boolean | null {
  if (evidence.fitPass === true) {
    if (evidence.insideTitleSafeWithMargin === false || evidence.notTooSmall === false) {
      return false;
    }
    return true;
  }
  if (evidence.fitPass === false) {
    return false;
  }
  if (evidence.insideTitleSafeWithMargin === false || evidence.notTooSmall === false) {
    return false;
  }
  if (evidence.insideTitleSafeWithMargin === true && evidence.notTooSmall === true) {
    return true;
  }
  return null;
}

export function evaluateLockupAcceptance(params: {
  evidence: ProductionLockupValidationEvidence;
}): LockupAcceptanceResult {
  const { evidence } = params;
  const invalidReasons: string[] = [];
  const normalizedFitPass = normalizeLockupFitPass(evidence);
  const sourceCanonical = evidence.source === "generated" || evidence.source === "reused";
  const validationEvidencePresent = evidence.textIntegrity !== null && normalizedFitPass !== null;
  const reuseEvidencePresent =
    evidence.source !== "reused" ||
    (Boolean(evidence.sourceGenerationId) && evidence.textIntegrity !== null && normalizedFitPass !== null);

  if (evidence.source === "fallback") {
    addReason(invalidReasons, "lockup_fallback_provenance");
    addReason(invalidReasons, "lockup_not_canonical");
  } else if (!sourceCanonical) {
    addReason(invalidReasons, "lockup_not_canonical");
  }

  if (evidence.textIntegrity === false) {
    addReason(invalidReasons, "lockup_text_integrity_failed");
  } else if (evidence.textIntegrity !== true) {
    addReason(invalidReasons, "lockup_missing_validation_evidence");
  }

  if (normalizedFitPass === false) {
    addReason(invalidReasons, "lockup_fit_failed");
  } else if (normalizedFitPass !== true) {
    addReason(invalidReasons, "lockup_missing_validation_evidence");
  }

  if (evidence.source === "reused" && (!reuseEvidencePresent || evidence.textIntegrity !== true || normalizedFitPass !== true)) {
    addReason(invalidReasons, "lockup_reuse_unvalidated");
  }

  const reasons = dedupeReasons(invalidReasons);

  return {
    accepted: reasons.length === 0,
    valid: reasons.length === 0,
    invalidReasons: reasons,
    reasons,
    checks: {
      sourceCanonical,
      textIntegrity: evidence.textIntegrity,
      fitPass: normalizedFitPass,
      insideTitleSafeWithMargin: evidence.insideTitleSafeWithMargin,
      notTooSmall: evidence.notTooSmall,
      validationEvidencePresent,
      reuseEvidencePresent
    },
    evidence
  };
}

function validateBackground(output: unknown): ComponentValidationResult<ProductionBackgroundValidationEvidence> {
  const evidence = inferBackgroundValidation(output);
  const acceptance = evaluateBackgroundAcceptance({
    evidence,
    backgroundFailureReason: readBackgroundFailureReason(output)
  });

  return {
    ...evidence,
    valid: acceptance.accepted,
    invalidReasons: acceptance.invalidReasons,
    reasons: acceptance.reasons
  };
}

function validateLockup(output: unknown): ComponentValidationResult<ProductionLockupValidationEvidence> {
  const evidence = inferLockupValidation(output);
  const acceptance = evaluateLockupAcceptance({
    evidence
  });

  return {
    ...evidence,
    valid: acceptance.accepted,
    invalidReasons: acceptance.invalidReasons,
    reasons: acceptance.reasons
  };
}

function validateAspects(params: {
  output: unknown;
  assets?: GenerationAssetRecord[];
}): Record<OutputAspect, AspectValidationResult> {
  const previewPaths = readPreviewPathsFromOutput(params.output);
  const finalAssetPaths = readFinalAssetPaths(params.assets);
  const pathByAspect: Record<OutputAspect, string | null> = {
    widescreen: finalAssetPaths.wide || previewPaths.widescreen,
    square: finalAssetPaths.square || previewPaths.square,
    vertical: finalAssetPaths.tall || previewPaths.vertical
  };
  const statuses = readAspectAssetsFromOutput(params.output) || deriveAspectAssetsFromPaths(pathByAspect);
  const persistedProvenance = readAspectProvenance(params.output);

  const results = {} as Record<OutputAspect, AspectValidationResult>;
  for (const aspect of OUTPUT_ASPECTS) {
    const path = pathByAspect[aspect];
    const provenance = persistedProvenance[aspect] || inferAspectProvenance(path);
    const invalidReasons: string[] = [];
    const status = statuses[aspect];

    if (status === "missing") {
      addReason(invalidReasons, `missing_required_aspect:${aspect}`);
    }
    if (status === "placeholder") {
      addReason(invalidReasons, `aspect_placeholder_like:${aspect}`);
    }
    if (provenance !== "rendered" || status !== "ok") {
      addReason(invalidReasons, `aspect_noncanonical:${aspect}`);
    }
    if (provenance === "derived") {
      addReason(invalidReasons, `derived_aspect_not_valid:${aspect}`);
    }
    if (provenance === "fallback") {
      addReason(invalidReasons, `aspect_fallback_provenance:${aspect}`);
    }

    results[aspect] = {
      status,
      provenance,
      valid: invalidReasons.length === 0,
      path,
      invalidReasons,
      reasons: invalidReasons
    };
  }

  return results;
}

export function readCanonicalDesignDocFromOutput(output: unknown): DesignDoc | null {
  if (!isRecord(output)) {
    return null;
  }

  const nested = normalizeDesignDoc(output.designDoc);
  if (nested) {
    return nested;
  }

  return normalizeDesignDoc(output);
}

function readFallbackLikeStatus(output: unknown): boolean {
  if (!isRecord(output)) {
    return false;
  }

  const directStatus = output.status;
  if (directStatus === "FALLBACK") {
    return true;
  }

  return readBackgroundSource(output) === "fallback" || readLockupSource(output) === "fallback";
}

export function resolveProductionValidOption(params: {
  output: unknown;
  dbStatus?: string | null;
  assets?: GenerationAssetRecord[];
}): ProductionValidOptionResult {
  const background = validateBackground(params.output);
  const lockup = validateLockup(params.output);
  const aspects = validateAspects({
    output: params.output,
    assets: params.assets
  });
  const hasCanonicalDesignDoc = Boolean(readCanonicalDesignDocFromOutput(params.output));
  const fallbackPreviewPaths = readFallbackPreviewPathsFromOutput(params.output);
  const finalAssetPaths = readFinalAssetPaths(params.assets);
  const backgroundAssetPaths = readBackgroundAssetPaths(params.assets);
  const lockupAssetPath = readLockupAssetPath(params.assets);
  const fallbackLike = readFallbackLikeStatus(params.output);
  const dbInProgress = params.dbStatus === "RUNNING" || params.dbStatus === "QUEUED";
  const dbFailedLike = params.dbStatus === "FAILED" || dbInProgress || !params.output;
  const valid =
    !dbInProgress &&
    !fallbackLike &&
    !dbFailedLike &&
    hasCanonicalDesignDoc &&
    background.valid &&
    lockup.valid &&
    OUTPUT_ASPECTS.every((aspect) => aspects[aspect].valid);

  const preview = {} as Record<PreviewShape, PreviewValidationResult>;
  const previewCanonicality = {} as Record<PreviewShape, boolean>;
  const previewMode = {} as Record<PreviewShape, PreviewMode>;
  const previewFailedChecks = {} as Record<PreviewShape, string[]>;
  for (const shape of PREVIEW_SHAPES) {
    const aspect = ASPECT_BY_SHAPE[shape];
    const finalAssetPath = finalAssetPaths[shape];
    const fallbackPreviewPath = fallbackPreviewPaths[shape];
    const canonical = valid && aspects[aspect].valid && Boolean(finalAssetPath);
    const shapeInvalidReasons = dedupeReasons(aspects[aspect].invalidReasons);

    if (canonical) {
      preview[shape] = {
        canonical: true,
        mode: "canonical_asset",
        assetPath: finalAssetPath,
        invalidReasons: [],
        source: "final_asset"
      };
      previewCanonicality[shape] = true;
      previewMode[shape] = "canonical_asset";
      previewFailedChecks[shape] = [];
      continue;
    }

    if (finalAssetPath) {
      const invalidReasons = dedupeReasons([
        ...shapeInvalidReasons,
        "preview_noncanonical",
        "fallback_preview_mode:fallback_asset"
      ]);
      preview[shape] = {
        canonical: false,
        mode: "fallback_asset",
        assetPath: finalAssetPath,
        invalidReasons,
        source: "final_asset"
      };
      previewCanonicality[shape] = false;
      previewMode[shape] = "fallback_asset";
      previewFailedChecks[shape] = invalidReasons;
      continue;
    }

    if (fallbackPreviewPath) {
      const invalidReasons = dedupeReasons([
        ...shapeInvalidReasons,
        "preview_noncanonical",
        "fallback_preview_mode:fallback_asset",
        "fallback_asset_provenance"
      ]);
      preview[shape] = {
        canonical: false,
        mode: "fallback_asset",
        assetPath: fallbackPreviewPath,
        invalidReasons,
        source: "fallback_preview_asset"
      };
      previewCanonicality[shape] = false;
      previewMode[shape] = "fallback_asset";
      previewFailedChecks[shape] = invalidReasons;
      continue;
    }

    if (backgroundAssetPaths[shape] && lockupAssetPath) {
      const invalidReasons = dedupeReasons([
        ...shapeInvalidReasons,
        "preview_noncanonical",
        "fallback_preview_mode:fallback_composite"
      ]);
      preview[shape] = {
        canonical: false,
        mode: "fallback_composite",
        assetPath: null,
        invalidReasons,
        source: "background_lockup_composite"
      };
      previewCanonicality[shape] = false;
      previewMode[shape] = "fallback_composite";
      previewFailedChecks[shape] = invalidReasons;
      continue;
    }

    const invalidReasons = dedupeReasons([
      ...shapeInvalidReasons,
      "preview_noncanonical",
      "fallback_preview_mode:fallback_design_doc",
      "fallback_design_doc_used"
    ]);
    preview[shape] = {
      canonical: false,
      mode: "fallback_design_doc",
      assetPath: null,
      invalidReasons,
      source: "design_doc"
    };
    previewCanonicality[shape] = false;
    previewMode[shape] = "fallback_design_doc";
    previewFailedChecks[shape] = invalidReasons;
  }

  const provenanceReasons: string[] = [];
  if (!hasCanonicalDesignDoc) {
    addReason(provenanceReasons, "missing_canonical_design_doc");
  }
  if (PREVIEW_SHAPES.some((shape) => !preview[shape].canonical)) {
    addReason(provenanceReasons, "preview_noncanonical");
  }
  if (PREVIEW_SHAPES.some((shape) => preview[shape].mode !== "canonical_asset")) {
    const modes = [...new Set(PREVIEW_SHAPES.map((shape) => preview[shape].mode).filter((mode) => mode !== "canonical_asset"))];
    for (const mode of modes) {
      addReason(provenanceReasons, `fallback_preview_mode:${mode}`);
    }
  }
  if (PREVIEW_SHAPES.some((shape) => preview[shape].source === "fallback_preview_asset")) {
    addReason(provenanceReasons, "fallback_asset_provenance");
  }
  if (PREVIEW_SHAPES.some((shape) => preview[shape].mode === "fallback_design_doc")) {
    addReason(provenanceReasons, "fallback_design_doc_used");
  }
  if (!params.output) {
    addReason(provenanceReasons, "generation_output_missing");
  } else if (params.dbStatus === "RUNNING") {
    addReason(provenanceReasons, "generation_db_status_running");
  } else if (params.dbStatus === "QUEUED") {
    addReason(provenanceReasons, "generation_db_status_queued");
  } else if (
    params.dbStatus === "FAILED" &&
    !fallbackLike &&
    background.invalidReasons.length === 0 &&
    lockup.invalidReasons.length === 0 &&
    OUTPUT_ASPECTS.every((aspect) => aspects[aspect].invalidReasons.length === 0) &&
    hasCanonicalDesignDoc
  ) {
    addReason(provenanceReasons, "generation_db_status_failed");
  }

  const invalidReasons = dedupeReasons([
    ...background.invalidReasons,
    ...lockup.invalidReasons,
    ...OUTPUT_ASPECTS.flatMap((aspect) => aspects[aspect].invalidReasons),
    ...provenanceReasons
  ]);

  const exportMissingSlots: ProductionExportValidationResult["missingSlots"] = [];
  if (!hasCanonicalDesignDoc) {
    exportMissingSlots.push("design_doc");
  }
  if (!finalAssetPaths.square) {
    exportMissingSlots.push("square");
  }
  if (!finalAssetPaths.wide) {
    exportMissingSlots.push("wide");
  }
  if (!finalAssetPaths.tall) {
    exportMissingSlots.push("tall");
  }
  if (!lockupAssetPath) {
    exportMissingSlots.push("lockup");
  }

  const finalizeInvalidReasons = valid ? [] : dedupeReasons(["finalize_blocked_noncanonical", ...invalidReasons]);
  const bundleComplete = exportMissingSlots.length === 0;
  const exportInvalidReasons = dedupeReasons([
    ...(!valid ? ["export_blocked_noncanonical", ...invalidReasons] : []),
    ...(!bundleComplete ? ["export_incomplete_bundle"] : [])
  ]);
  const failedChecks: ProductionValidationFailedChecks = {
    background: background.invalidReasons,
    lockup: lockup.invalidReasons,
    aspects: Object.fromEntries(OUTPUT_ASPECTS.map((aspect) => [aspect, aspects[aspect].invalidReasons])) as Record<OutputAspect, string[]>,
    provenance: provenanceReasons,
    preview: previewFailedChecks,
    finalize: finalizeInvalidReasons,
    export: exportInvalidReasons,
    exportMissingSlots
  };
  const status: GenerationOptionStatus = dbInProgress ? "IN_PROGRESS" : fallbackLike ? "FALLBACK" : valid ? "COMPLETED" : "FAILED_GENERATION";

  return {
    valid,
    isProductionValid: valid,
    status,
    invalidReasons,
    reasons: invalidReasons,
    hasCanonicalDesignDoc,
    background,
    lockup,
    aspects,
    preview,
    previewCanonicality,
    previewMode,
    failedChecks,
    finalize: {
      eligible: finalizeInvalidReasons.length === 0,
      invalidReasons: finalizeInvalidReasons
    },
    export: {
      eligible: exportInvalidReasons.length === 0,
      invalidReasons: exportInvalidReasons,
      bundleComplete,
      missingSlots: exportMissingSlots
    }
  };
}

export function toPersistedProductionValidationSnapshot(result: ProductionValidOptionResult): ProductionValidationSnapshot {
  return {
    version: 1,
    background: {
      source: result.background.source,
      sourceGenerationId: result.background.sourceGenerationId,
      textFree: result.background.textFree,
      scaffoldFree: result.background.scaffoldFree,
      motifPresent: result.background.motifPresent,
      toneFit: result.background.toneFit,
      referenceFit: result.background.referenceFit
    },
    lockup: {
      source: result.lockup.source,
      sourceGenerationId: result.lockup.sourceGenerationId,
      textIntegrity: result.lockup.textIntegrity,
      fitPass: result.lockup.fitPass,
      insideTitleSafeWithMargin: result.lockup.insideTitleSafeWithMargin,
      notTooSmall: result.lockup.notTooSmall
    },
    aspects: Object.fromEntries(
      OUTPUT_ASPECTS.map((aspect) => [aspect, { provenance: result.aspects[aspect].provenance }])
    ) as ProductionValidationSnapshot["aspects"],
    isProductionValid: result.isProductionValid,
    invalidReasons: result.invalidReasons,
    failedChecks: result.failedChecks,
    preview: result.preview,
    previewCanonicality: result.previewCanonicality,
    previewMode: result.previewMode,
    hasCanonicalDesignDoc: result.hasCanonicalDesignDoc,
    finalize: result.finalize,
    export: result.export
  };
}

export function readProductionValidationEvidence(output: unknown): ProductionValidationSnapshot | null {
  const meta = readOutputMeta(output);
  const productionValidation = readNestedRecord(meta, "productionValidation");
  if (!productionValidation) {
    return null;
  }

  const version = productionValidation.version;
  if (version !== 1) {
    return null;
  }

  const background = readPersistedBackgroundValidation(output);
  const lockup = readPersistedLockupValidation(output);
  const aspects = readAspectProvenance(output);
  const snapshot: ProductionValidationSnapshot = {
    version: 1,
    ...(background ? { background } : {}),
    ...(lockup ? { lockup } : {}),
    ...(Object.keys(aspects).length > 0
      ? {
          aspects: Object.fromEntries(
            Object.entries(aspects).map(([aspect, provenance]) => [aspect, { provenance }])
          ) as ProductionValidationSnapshot["aspects"]
        }
      : {})
  };

  const isProductionValid = readBooleanOrNull(productionValidation.isProductionValid);
  if (isProductionValid !== null) {
    snapshot.isProductionValid = isProductionValid;
  }

  const hasCanonicalDesignDoc = readBooleanOrNull(productionValidation.hasCanonicalDesignDoc);
  if (hasCanonicalDesignDoc !== null) {
    snapshot.hasCanonicalDesignDoc = hasCanonicalDesignDoc;
  }

  const invalidReasons = readStringArray(productionValidation.invalidReasons);
  if (invalidReasons.length > 0) {
    snapshot.invalidReasons = invalidReasons;
  }

  return snapshot;
}

export function resolveProductionValidOptionStatus(params: {
  output: unknown;
  dbStatus?: string | null;
  assets?: GenerationAssetRecord[];
}): GenerationOptionStatus {
  return resolveProductionValidOption(params).status;
}

export function isProductionValidOption(params: {
  output: unknown;
  dbStatus?: string | null;
  assets?: GenerationAssetRecord[];
}): boolean {
  return resolveProductionValidOption(params).valid;
}

export function toAssetUrl(assetPath: string): string {
  return normalizeAssetUrl(assetPath);
}
