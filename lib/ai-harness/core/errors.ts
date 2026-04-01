import type { AiErrorClass, AiModelKey, AiOperationKey, AiProviderKey } from "@/lib/ai-harness/core/types";

type ProviderErrorContext = {
  providerKey: AiProviderKey;
  modelKey: AiModelKey;
  operationKey: AiOperationKey;
  providerModel?: string | null;
  providerConfigVersion?: string | null;
};

type ErrorRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ErrorRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectErrorObjects(error: unknown): ErrorRecord[] {
  const objects: ErrorRecord[] = [];
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!isRecord(current) || seen.has(current)) {
      continue;
    }

    seen.add(current);
    objects.push(current);

    const response = isRecord(current.response) ? current.response : null;
    const nested = [current.error, current.cause, current.body, response, response?.error, response?.data, response?.body];
    for (const candidate of nested) {
      if (candidate !== null && typeof candidate !== "undefined") {
        queue.push(candidate);
      }
    }
  }

  return objects;
}

function readFirstNumberProperty(objects: ErrorRecord[], keys: string[]): number | null {
  for (const object of objects) {
    for (const key of keys) {
      const value = object[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }
  }

  return null;
}

function readFirstStringProperty(objects: ErrorRecord[], keys: string[]): string | null {
  for (const object of objects) {
    for (const key of keys) {
      const value = object[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }

  return null;
}

function readHeaderValue(headers: unknown, key: string): string | null {
  const normalizedKey = key.toLowerCase();

  if (!headers) {
    return null;
  }

  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    const value = headers.get(key);
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (!Array.isArray(entry) || entry.length < 2) {
        continue;
      }

      const [headerKey, headerValue] = entry;
      if (typeof headerKey !== "string" || headerKey.toLowerCase() !== normalizedKey) {
        continue;
      }
      if (typeof headerValue === "string" && headerValue.trim()) {
        return headerValue.trim();
      }
    }

    return null;
  }

  if (!isRecord(headers)) {
    return null;
  }

  for (const [headerKey, headerValue] of Object.entries(headers)) {
    if (headerKey.toLowerCase() !== normalizedKey) {
      continue;
    }

    if (typeof headerValue === "string" && headerValue.trim()) {
      return headerValue.trim();
    }

    if (Array.isArray(headerValue)) {
      const firstString = headerValue.find(
        (value): value is string => typeof value === "string" && value.trim().length > 0
      );
      if (firstString) {
        return firstString.trim();
      }
    }
  }

  return null;
}

function readErrorStatus(error: unknown): number | null {
  return readFirstNumberProperty(collectErrorObjects(error), ["status", "statusCode"]);
}

function readErrorCode(error: unknown): string | null {
  return readFirstStringProperty(collectErrorObjects(error), ["code", "errorCode"]);
}

function readErrorType(error: unknown): string | null {
  return readFirstStringProperty(collectErrorObjects(error), ["type", "errorType"]);
}

function readErrorName(error: unknown): string | null {
  if (error instanceof Error && error.name.trim()) {
    return error.name.trim();
  }

  return readFirstStringProperty(collectErrorObjects(error), ["name"]);
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  const message =
    readFirstStringProperty(collectErrorObjects(error), ["message", "detail", "error_description"]) || "Unknown provider error";
  return message;
}

function readProviderRequestId(error: unknown): string | null {
  const objects = collectErrorObjects(error);
  const directRequestId = readFirstStringProperty(objects, ["request_id", "requestId"]);
  if (directRequestId) {
    return directRequestId;
  }

  for (const object of objects) {
    const response = isRecord(object.response) ? object.response : null;
    const headerSources = [object.headers, response?.headers];
    for (const headers of headerSources) {
      const requestId = readHeaderValue(headers, "x-request-id") || readHeaderValue(headers, "request-id");
      if (requestId) {
        return requestId;
      }
    }
  }

  return null;
}

function messageLooksLikeModelIssue(message: string): boolean {
  return (
    /\bmodel\b.*\b(not found|does not exist|invalid|unavailable|unsupported|unknown|unrecognized)\b/i.test(message) ||
    /\bimage_generation\b.*\b(not supported|unsupported)\b/i.test(message) ||
    /\bdoes not support\b.*\bimage\b/i.test(message)
  );
}

function messageLooksLikeQuotaIssue(message: string): boolean {
  return /\b(rate limit|too many requests|insufficient[_ -]?quota|quota exceeded|billing hard limit)\b/i.test(message);
}

function messageLooksLikeMisconfiguration(message: string): boolean {
  return (
    /\b(openai_api_key|api key|authentication|unauthorized|access denied|permission)\b/i.test(message) ||
    /\bconfiguration\b/i.test(message) ||
    /\bopenai image previews enabled\b/i.test(message) ||
    /\borganization\b.*\bverification\b/i.test(message)
  );
}

function messageLooksLikeTimeout(message: string, code: string | null, name: string | null): boolean {
  return /\b(timeout|timed out|deadline exceeded|etimedout|aborterror|connection timeout)\b/i.test(
    `${message} ${code ?? ""} ${name ?? ""}`
  );
}

function messageLooksLikeTransientIssue(message: string, code: string | null, name: string | null): boolean {
  return /\b(network|fetch failed|temporarily unavailable|connection reset|socket hang up|econnreset|econnrefused|enotfound|eai_again|service unavailable|bad gateway)\b/i.test(
    `${message} ${code ?? ""} ${name ?? ""}`
  );
}

function classifyProviderErrorClass(error: unknown): Exclude<AiErrorClass, "VALIDATION_FAILED"> {
  const status = readErrorStatus(error);
  const code = readErrorCode(error)?.toLowerCase() || "";
  const type = readErrorType(error)?.toLowerCase() || "";
  const name = readErrorName(error)?.toLowerCase() || "";
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
    code === "invalid_model" ||
    code.includes("unsupported_model") ||
    code.includes("model_unsupported") ||
    messageLooksLikeModelIssue(message) ||
    (status === 400 && /\bmodel\b/i.test(message))
  ) {
    return "MODEL_UNAVAILABLE";
  }

  if (
    status === 401 ||
    status === 403 ||
    code.includes("auth") ||
    code.includes("permission") ||
    code.includes("api_key") ||
    type.includes("authentication") ||
    type.includes("permission") ||
    messageLooksLikeMisconfiguration(message)
  ) {
    return "MISCONFIGURED_PROVIDER";
  }

  if (status === 408 || messageLooksLikeTimeout(message, code, name)) {
    return "TIMEOUT";
  }

  if ((status !== null && status >= 500) || messageLooksLikeTransientIssue(message, code, name)) {
    return "TRANSIENT_PROVIDER_FAILURE";
  }

  return "UNKNOWN_PROVIDER_ERROR";
}

export class AiProviderError extends Error {
  readonly errorClass: Exclude<AiErrorClass, "VALIDATION_FAILED">;
  readonly providerKey: AiProviderKey;
  readonly modelKey: AiModelKey;
  readonly operationKey: AiOperationKey;
  readonly providerModel: string | null;
  readonly providerConfigVersion: string | null;
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
    providerModel?: string | null;
    providerConfigVersion?: string | null;
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
    this.providerModel = params.providerModel ?? null;
    this.providerConfigVersion = params.providerConfigVersion ?? null;
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

export type AiProviderErrorMetadata = {
  errorClass: Exclude<AiErrorClass, "VALIDATION_FAILED">;
  providerKey: AiProviderKey;
  modelKey: AiModelKey;
  operationKey: AiOperationKey;
  providerModel: string | null;
  providerConfigVersion: string | null;
  statusCode: number | null;
  providerErrorCode: string | null;
  providerRequestId: string | null;
  rawErrorType: string | null;
};

export function isAiProviderError(error: unknown): error is AiProviderError {
  return error instanceof AiProviderError;
}

export function isAiValidationError(error: unknown): error is AiValidationError {
  return error instanceof AiValidationError;
}

export function readAiProviderErrorMetadata(error: unknown): AiProviderErrorMetadata | null {
  if (!isAiProviderError(error)) {
    return null;
  }

  return {
    errorClass: error.errorClass,
    providerKey: error.providerKey,
    modelKey: error.modelKey,
    operationKey: error.operationKey,
    providerModel: error.providerModel,
    providerConfigVersion: error.providerConfigVersion,
    statusCode: error.statusCode,
    providerErrorCode: error.providerErrorCode,
    providerRequestId: error.providerRequestId,
    rawErrorType: error.rawErrorType
  };
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
