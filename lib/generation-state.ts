export const PROVIDER_FAILURE_REASONS = [
  "PROVIDER_MODEL_UNAVAILABLE",
  "PROVIDER_QUOTA_OR_RATE_LIMIT",
  "PROVIDER_AUTH_OR_CONFIG_ERROR",
  "PROVIDER_TRANSIENT_ERROR"
] as const;

export type ProviderFailureReason = (typeof PROVIDER_FAILURE_REASONS)[number];

export const GENERATION_FAILURE_REASONS = [
  "ALL_TEXT",
  "ALL_SCAFFOLD",
  ...PROVIDER_FAILURE_REASONS,
  "BUDGET",
  "MISSING_ASPECT_ASSET",
  "UNKNOWN"
] as const;

export type GenerationFailureReason = (typeof GENERATION_FAILURE_REASONS)[number];

export type GenerationOptionStatus = "IN_PROGRESS" | "COMPLETED" | "FAILED_GENERATION" | "FALLBACK";
export type GenerationRoundStatus = "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED";
export type GenerationRoundFailureReason = "ROUND_ABORTED_PROVIDER_FAILURE" | "ROUND_INSUFFICIENT_VALID_OPTIONS" | "UNKNOWN";
export type GenerationLifecycleState =
  | "GENERATION_IN_PROGRESS"
  | "GENERATION_COMPLETED"
  | "GENERATION_FAILED_PROVIDER"
  | "GENERATION_FAILED_CREATIVE";
export type PersistedGenerationExecutionPhase = "RUNNING" | "SETTLED";
export type PersistedGenerationExecutionState = {
  version: 1;
  phase: PersistedGenerationExecutionPhase;
  activeAttemptToken: string | null;
  activeAttemptNumber: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isProviderFailureReason(value: unknown): value is ProviderFailureReason {
  return typeof value === "string" && PROVIDER_FAILURE_REASONS.includes(value as ProviderFailureReason);
}

export function isGenerationFailureReason(value: unknown): value is GenerationFailureReason {
  return typeof value === "string" && GENERATION_FAILURE_REASONS.includes(value as GenerationFailureReason);
}

export function isGenerationRoundStatus(value: unknown): value is GenerationRoundStatus {
  return value === "RUNNING" || value === "COMPLETED" || value === "PARTIAL" || value === "FAILED";
}

export function isGenerationRoundFailureReason(value: unknown): value is GenerationRoundFailureReason {
  return value === "ROUND_ABORTED_PROVIDER_FAILURE" || value === "ROUND_INSUFFICIENT_VALID_OPTIONS" || value === "UNKNOWN";
}

export function isGenerationLifecycleState(value: unknown): value is GenerationLifecycleState {
  return (
    value === "GENERATION_IN_PROGRESS" ||
    value === "GENERATION_COMPLETED" ||
    value === "GENERATION_FAILED_PROVIDER" ||
    value === "GENERATION_FAILED_CREATIVE"
  );
}

export function isGenerationDbInProgress(dbStatus: string | null | undefined): boolean {
  return dbStatus === "RUNNING" || dbStatus === "QUEUED";
}

export function isTerminalGenerationDbStatus(status: string | null | undefined): status is "COMPLETED" | "FAILED" {
  return status === "COMPLETED" || status === "FAILED";
}

export function isPersistedGenerationExecutionPhase(value: unknown): value is PersistedGenerationExecutionPhase {
  return value === "RUNNING" || value === "SETTLED";
}

export function readPersistedGenerationExecutionState(output: unknown): PersistedGenerationExecutionState | null {
  if (!isRecord(output)) {
    return null;
  }

  const meta = isRecord(output.meta) ? output.meta : null;
  if (!meta) {
    return null;
  }

  const execution = isRecord(meta.execution) ? meta.execution : null;
  if (!execution || execution.version !== 1 || !isPersistedGenerationExecutionPhase(execution.phase)) {
    return null;
  }

  const activeAttemptToken =
    typeof execution.activeAttemptToken === "string" && execution.activeAttemptToken.trim()
      ? execution.activeAttemptToken.trim()
      : null;
  const activeAttemptNumber =
    typeof execution.activeAttemptNumber === "number" && Number.isFinite(execution.activeAttemptNumber)
      ? execution.activeAttemptNumber
      : null;

  return {
    version: 1,
    phase: execution.phase,
    activeAttemptToken,
    activeAttemptNumber
  };
}

export function isPersistedGenerationExecutionActive(output: unknown): boolean {
  const execution = readPersistedGenerationExecutionState(output);
  return execution?.phase === "RUNNING";
}

export function resolveGenerationLifecycleState(params: {
  dbStatus?: string | null;
  optionStatus?: GenerationOptionStatus | null;
  failureReason?: GenerationFailureReason | null;
}): GenerationLifecycleState {
  if (isGenerationDbInProgress(params.dbStatus) || params.optionStatus === "IN_PROGRESS") {
    return "GENERATION_IN_PROGRESS";
  }

  if (params.optionStatus === "COMPLETED") {
    return "GENERATION_COMPLETED";
  }

  if (isProviderFailureReason(params.failureReason)) {
    return "GENERATION_FAILED_PROVIDER";
  }

  return "GENERATION_FAILED_CREATIVE";
}
