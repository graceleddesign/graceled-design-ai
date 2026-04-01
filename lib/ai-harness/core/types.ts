import type { Prisma } from "@prisma/client";

export const AI_PROVIDER_KEYS = ["openai_image", "openai_text"] as const;
export type AiProviderKey = (typeof AI_PROVIDER_KEYS)[number];

export const AI_MODEL_KEYS = ["openai_image_default", "openai_text_default"] as const;
export type AiModelKey = (typeof AI_MODEL_KEYS)[number];

export const AI_OPERATION_KEYS = ["generate_background_image", "generate_lockup_text", "generate_copy"] as const;
export type AiOperationKey = (typeof AI_OPERATION_KEYS)[number];

export const AI_RUN_STATUSES = ["RUNNING", "COMPLETED", "FAILED"] as const;
export type AiRunStatus = (typeof AI_RUN_STATUSES)[number];

export const AI_ERROR_CLASSES = [
  "MODEL_UNAVAILABLE",
  "QUOTA_EXCEEDED",
  "TRANSIENT_PROVIDER_FAILURE",
  "MISCONFIGURED_PROVIDER",
  "TIMEOUT",
  "INVALID_RESPONSE",
  "VALIDATION_FAILED",
  "UNKNOWN_PROVIDER_ERROR"
] as const;
export type AiErrorClass = (typeof AI_ERROR_CLASSES)[number];

export type AiJsonValue = Prisma.JsonValue;
export type AiInputJsonValue = Prisma.InputJsonValue;

export type AiProviderDefinition = {
  key: AiProviderKey;
  name: string;
  enabled: boolean;
  supportedOperations: readonly AiOperationKey[];
};

export type AiModelDefinition = {
  key: AiModelKey;
  providerKey: AiProviderKey;
  enabled: boolean;
  supportedOperations: readonly AiOperationKey[];
  providerModel: string;
};

export type AiOperationDefinition = {
  key: AiOperationKey;
  providerKey: AiProviderKey;
  defaultModelKey: AiModelKey;
  enabled: boolean;
};

export type AiOperationRoute = {
  operation: AiOperationDefinition;
  provider: AiProviderDefinition;
  model: AiModelDefinition;
  providerConfigVersion: string;
};

export type AiRunRecord = {
  id: string;
  productKey: string;
  featureKey: string;
  projectId: string | null;
  generationId: string | null;
  round: number | null;
  laneKey: string | null;
  benchmarkCaseKey: string | null;
  status: AiRunStatus;
  startedAt: Date;
  completedAt: Date | null;
  metadataJson: AiJsonValue | null;
};

export type AiAttemptRecord = {
  id: string;
  runId: string;
  providerKey: AiProviderKey;
  modelKey: AiModelKey;
  operationKey: AiOperationKey;
  promptVersion: string;
  requestHash: string;
  providerRequestId: string | null;
  startedAt: Date;
  completedAt: Date | null;
  latencyMs: number | null;
  success: boolean;
  errorClass: AiErrorClass | null;
  providerStatusCode: number | null;
  outputJson: AiJsonValue | null;
};

export type AiEvalResultRecord = {
  id: string;
  runId: string;
  attemptId: string | null;
  evalKey: string;
  passed: boolean;
  score: number | null;
  reasonKey: string | null;
  detailsJson: AiJsonValue | null;
  createdAt: Date;
};

export type BenchmarkCaseRecord = {
  id: string;
  caseKey: string;
  name: string;
  inputJson: AiJsonValue;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type BenchmarkRunRecord = {
  id: string;
  caseKey: string;
  runId: string;
  codeVersion: string | null;
  providerConfigVersion: string | null;
  summaryJson: AiJsonValue | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AiRunCreateInput = {
  productKey: string;
  featureKey: string;
  projectId?: string | null;
  generationId?: string | null;
  round?: number | null;
  laneKey?: string | null;
  benchmarkCaseKey?: string | null;
  metadataJson?: AiInputJsonValue | null;
};

export type AiRunCompleteInput = {
  id: string;
  status: Exclude<AiRunStatus, "RUNNING">;
  metadataJson?: AiInputJsonValue | null;
};

export type AiAttemptCreateInput = {
  runId: string;
  providerKey: AiProviderKey;
  modelKey: AiModelKey;
  operationKey: AiOperationKey;
  promptVersion: string;
  requestHash: string;
  providerRequestId?: string | null;
  startedAt?: Date;
};

export type AiAttemptSuccessInput = {
  id: string;
  providerRequestId?: string | null;
  outputJson?: AiInputJsonValue | null;
  completedAt?: Date;
};

export type AiAttemptFailureInput = {
  id: string;
  errorClass: Exclude<AiErrorClass, "VALIDATION_FAILED">;
  providerStatusCode?: number | null;
  outputJson?: AiInputJsonValue | null;
  completedAt?: Date;
};

export type AiEvalPersistInput = {
  runId: string;
  attemptId?: string | null;
  evalKey: string;
  passed: boolean;
  score?: number | null;
  reasonKey?: string | null;
  detailsJson?: AiInputJsonValue | null;
};

export type AiBenchmarkCaseDefinition = {
  caseKey: string;
  name: string;
  inputJson: AiInputJsonValue;
  enabled?: boolean;
};

export type AiAttemptTrace<TOutput> = {
  run: AiRunRecord;
  attempt: AiAttemptRecord;
  route: AiOperationRoute;
  output: TOutput;
};
