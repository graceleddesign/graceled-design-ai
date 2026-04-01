import type { AiErrorClass, AiModelKey, AiOperationKey, AiProviderKey } from "@/lib/ai-harness/core/types";

type ProviderErrorContext = {
  providerKey: AiProviderKey;
  modelKey: AiModelKey;
  operationKey: AiOperationKey;
};

function readErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) {
    return null;
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function readErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code.trim() ? code.trim() : null;
}

function readErrorType(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("type" in error)) {
    return null;
  }

  const type = (error as { type?: unknown }).type;
  return typeof type === "string" && type.trim() ? type.trim() : null;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }

  return "Unknown provider error";
}

function readProviderRequestId(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  if ("request_id" in error) {
    const requestId = (error as { request_id?: unknown }).request_id;
    if (typeof requestId === "string" && requestId.trim()) {
      return requestId.trim();
    }
  }

  if ("requestId" in error) {
    const requestId = (error as { requestId?: unknown }).requestId;
    if (typeof requestId === "string" && requestId.trim()) {
      return requestId.trim();
    }
  }

  return null;
}

function messageLooksLikeModelIssue(message: string): boolean {
  return (
    /\bmodel\b.*\b(not found|does not exist|invalid|unavailable|unsupported)\b/i.test(message) ||
    /\bimage_generation\b.*\b(not supported|unsupported)\b/i.test(message)
  );
}

function messageLooksLikeQuotaIssue(message: string): boolean {
  return /\b(rate limit|too many requests|insufficient[_ -]?quota|quota exceeded)\b/i.test(message);
}

function messageLooksLikeMisconfiguration(message: string): boolean {
  return (
    /\b(openai_api_key|api key|authentication|unauthorized|access denied|permission)\b/i.test(message) ||
    /\bconfiguration\b/i.test(message) ||
    /\bopenai image previews enabled\b/i.test(message)
  );
}

function messageLooksLikeTimeout(message: string, code: string | null): boolean {
  return /\b(timeout|timed out|deadline exceeded)\b/i.test(`${message} ${code ?? ""}`);
}

function messageLooksLikeTransientIssue(message: string, code: string | null): boolean {
  return /\b(network|fetch failed|temporarily unavailable|connection reset|socket hang up|econnreset|service unavailable)\b/i.test(
    `${message} ${code ?? ""}`
  );
}

function classifyProviderErrorClass(error: unknown): Exclude<AiErrorClass, "VALIDATION_FAILED"> {
  const status = readErrorStatus(error);
  const code = readErrorCode(error)?.toLowerCase() || "";
  const type = readErrorType(error)?.toLowerCase() || "";
  const message = readErrorMessage(error);

  if (
    status === 429 ||
    code.includes("rate_limit") ||
    code.includes("insufficient_quota") ||
    type.includes("rate_limit") ||
    messageLooksLikeQuotaIssue(message)
  ) {
    return "QUOTA_EXCEEDED";
  }

  if (
    status === 404 ||
    code === "model_not_found" ||
    code.includes("unsupported_model") ||
    messageLooksLikeModelIssue(message)
  ) {
    return "MODEL_UNAVAILABLE";
  }

  if (
    status === 401 ||
    status === 403 ||
    type.includes("authentication") ||
    type.includes("permission") ||
    messageLooksLikeMisconfiguration(message)
  ) {
    return "MISCONFIGURED_PROVIDER";
  }

  if (status === 408 || messageLooksLikeTimeout(message, code)) {
    return "TIMEOUT";
  }

  if ((status !== null && status >= 500) || messageLooksLikeTransientIssue(message, code)) {
    return "TRANSIENT_PROVIDER_FAILURE";
  }

  return "UNKNOWN_PROVIDER_ERROR";
}

export class AiProviderError extends Error {
  readonly errorClass: Exclude<AiErrorClass, "VALIDATION_FAILED">;
  readonly providerKey: AiProviderKey;
  readonly modelKey: AiModelKey;
  readonly operationKey: AiOperationKey;
  readonly statusCode: number | null;
  readonly providerErrorCode: string | null;
  readonly providerRequestId: string | null;
  readonly rawErrorType: string | null;

  constructor(params: {
    message: string;
    errorClass: Exclude<AiErrorClass, "VALIDATION_FAILED">;
    providerKey: AiProviderKey;
    modelKey: AiModelKey;
    operationKey: AiOperationKey;
    statusCode?: number | null;
    providerErrorCode?: string | null;
    providerRequestId?: string | null;
    rawErrorType?: string | null;
    cause?: unknown;
  }) {
    super(params.message, params.cause ? { cause: params.cause } : undefined);
    this.name = "AiProviderError";
    this.errorClass = params.errorClass;
    this.providerKey = params.providerKey;
    this.modelKey = params.modelKey;
    this.operationKey = params.operationKey;
    this.statusCode = params.statusCode ?? null;
    this.providerErrorCode = params.providerErrorCode ?? null;
    this.providerRequestId = params.providerRequestId ?? null;
    this.rawErrorType = params.rawErrorType ?? null;
  }
}

export class AiValidationError extends Error {
  readonly errorClass = "VALIDATION_FAILED" as const;
  readonly evalKey: string | null;

  constructor(params: { message: string; evalKey?: string | null; cause?: unknown }) {
    super(params.message, params.cause ? { cause: params.cause } : undefined);
    this.name = "AiValidationError";
    this.evalKey = params.evalKey ?? null;
  }
}

export function isAiProviderError(error: unknown): error is AiProviderError {
  return error instanceof AiProviderError;
}

export function isAiValidationError(error: unknown): error is AiValidationError {
  return error instanceof AiValidationError;
}

export function readAiErrorClass(error: unknown): AiErrorClass | null {
  if (isAiProviderError(error) || isAiValidationError(error)) {
    return error.errorClass;
  }

  return null;
}

export function createInvalidResponseError(
  context: ProviderErrorContext,
  message: string,
  cause?: unknown
): AiProviderError {
  return new AiProviderError({
    ...context,
    message,
    errorClass: "INVALID_RESPONSE",
    cause
  });
}

export function createProviderConfigurationError(
  context: ProviderErrorContext,
  message: string,
  cause?: unknown
): AiProviderError {
  return new AiProviderError({
    ...context,
    message,
    errorClass: "MISCONFIGURED_PROVIDER",
    cause
  });
}

export function createModelUnavailableError(context: ProviderErrorContext, message: string, cause?: unknown): AiProviderError {
  return new AiProviderError({
    ...context,
    message,
    errorClass: "MODEL_UNAVAILABLE",
    cause
  });
}

export function normalizeProviderError(error: unknown, context: ProviderErrorContext): AiProviderError {
  if (isAiProviderError(error)) {
    return error;
  }

  return new AiProviderError({
    ...context,
    message: readErrorMessage(error),
    errorClass: classifyProviderErrorClass(error),
    statusCode: readErrorStatus(error),
    providerErrorCode: readErrorCode(error),
    providerRequestId: readProviderRequestId(error),
    rawErrorType: readErrorType(error),
    cause: error
  });
}
