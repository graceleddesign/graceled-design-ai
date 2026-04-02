import "server-only";

import { getOpenAI } from "@/lib/openai";
import { type ProviderFailureReason } from "@/lib/generation-state";

export type ImageProviderName = "openai";
export type ImageProviderSize = "1024x1024" | "1536x1024" | "1024x1536";
export type ImageProviderQuality = "low" | "medium" | "high";

export type ImageProviderConfig = {
  provider: ImageProviderName;
  model: string;
  providerPath: string;
  defaultModel: string;
  usingDefaultModel: boolean;
};

export type ImageProviderPreflightResult = {
  ok: boolean;
  provider: ImageProviderName;
  model: string;
  providerPath: string;
  checkedAt: string;
  failureReason: ProviderFailureReason | null;
  message: string | null;
};

const DEFAULT_IMAGE_MODEL = "gpt-4.1-mini";
const PREFLIGHT_PROMPT =
  "Provider preflight: abstract gradient background only, no text, no letters, no words, no logos, no watermarks.";

let preflightCache:
  | {
      key: string;
      expiresAt: number;
      promise: Promise<ImageProviderPreflightResult>;
    }
  | null = null;

function readErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) {
    return null;
  }

  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }

  return "Unknown image provider error";
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

function messageLooksLikeModelIssue(message: string): boolean {
  return (
    /\bmodel\b.*\b(not found|does not exist|invalid|unavailable|unsupported)\b/i.test(message) ||
    /\bimage_generation\b.*\b(not supported|unsupported)\b/i.test(message) ||
    /\b404\b/i.test(message)
  );
}

function messageLooksLikeQuotaIssue(message: string): boolean {
  return /\b(rate limit|too many requests|insufficient[_ -]?quota|quota exceeded|quota)\b/i.test(message);
}

function messageLooksLikeAuthOrConfigIssue(message: string): boolean {
  return (
    /\b(openai_api_key|api key|authentication|unauthorized|not authorized|access denied|permission)\b/i.test(message) ||
    /\borganization\b.*\bverification\b/i.test(message) ||
    /\bopenai_image_previews_enabled\b/i.test(message)
  );
}

function messageLooksLikeTransientIssue(message: string, code: string | null): boolean {
  const combined = `${message} ${code ?? ""}`;
  return /\b(timeout|timed out|temporarily unavailable|connection reset|socket hang up|fetch failed|network)\b/i.test(combined);
}

function isImagePreviewGenerationEnabled(): boolean {
  const raw = process.env.OPENAI_IMAGE_PREVIEWS_ENABLED?.trim().toLowerCase();
  if (!raw) {
    return true;
  }

  return !["0", "false", "off", "no"].includes(raw);
}

export function resolveImageProviderConfig(): ImageProviderConfig {
  const envModel = process.env.OPENAI_IMAGE_MODEL?.trim() || "";
  const model = envModel || DEFAULT_IMAGE_MODEL;

  return {
    provider: "openai",
    model,
    providerPath: `openai:${model}`,
    defaultModel: DEFAULT_IMAGE_MODEL,
    usingDefaultModel: !envModel
  };
}

export function extractGeneratedImageB64(response: unknown): string {
  if (!response || typeof response !== "object" || !("output" in response)) {
    throw new Error("OpenAI response did not include output items");
  }

  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    throw new Error("OpenAI response output is not an array");
  }

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    if ((item as { type?: unknown }).type !== "image_generation_call") {
      continue;
    }

    const result = (item as { result?: unknown }).result;
    if (typeof result === "string" && result.trim()) {
      return result;
    }
  }

  throw new Error("OpenAI response had no image_generation_call result");
}

export function classifyImageProviderFailureReason(error: unknown): ProviderFailureReason {
  const status = readErrorStatus(error);
  const message = readErrorMessage(error);
  const code = readErrorCode(error);
  const type = readErrorType(error);
  const lowerCode = code?.toLowerCase() || "";
  const lowerType = type?.toLowerCase() || "";

  if (
    status === 429 ||
    lowerCode.includes("rate_limit") ||
    lowerCode.includes("insufficient_quota") ||
    lowerType.includes("rate_limit") ||
    messageLooksLikeQuotaIssue(message)
  ) {
    return "PROVIDER_QUOTA_OR_RATE_LIMIT";
  }

  if (
    status === 404 ||
    lowerCode === "model_not_found" ||
    lowerCode.includes("unsupported_model") ||
    messageLooksLikeModelIssue(message) ||
    (status === 400 && /\bmodel\b/i.test(message))
  ) {
    return "PROVIDER_MODEL_UNAVAILABLE";
  }

  if (
    status === 401 ||
    status === 403 ||
    messageLooksLikeAuthOrConfigIssue(message) ||
    lowerType.includes("authentication") ||
    lowerType.includes("permission")
  ) {
    return "PROVIDER_AUTH_OR_CONFIG_ERROR";
  }

  if ((status !== null && status >= 500) || status === 408 || messageLooksLikeTransientIssue(message, code)) {
    return "PROVIDER_TRANSIENT_ERROR";
  }

  return "PROVIDER_TRANSIENT_ERROR";
}

export class ImageProviderError extends Error {
  readonly failureReason: ProviderFailureReason;
  readonly provider: ImageProviderName;
  readonly model: string;
  readonly providerPath: string;
  readonly status: number | null;
  readonly code: string | null;

  constructor(params: {
    message: string;
    failureReason: ProviderFailureReason;
    provider: ImageProviderName;
    model: string;
    providerPath: string;
    status: number | null;
    code: string | null;
    cause?: unknown;
  }) {
    super(params.message, params.cause ? { cause: params.cause } : undefined);
    this.name = "ImageProviderError";
    this.failureReason = params.failureReason;
    this.provider = params.provider;
    this.model = params.model;
    this.providerPath = params.providerPath;
    this.status = params.status;
    this.code = params.code;
  }
}

export function normalizeImageProviderError(error: unknown, config = resolveImageProviderConfig()): ImageProviderError {
  if (error instanceof ImageProviderError) {
    return error;
  }

  return new ImageProviderError({
    message: readErrorMessage(error),
    failureReason: classifyImageProviderFailureReason(error),
    provider: config.provider,
    model: config.model,
    providerPath: config.providerPath,
    status: readErrorStatus(error),
    code: readErrorCode(error),
    cause: error
  });
}

export async function preflightImageProvider(params?: {
  size?: ImageProviderSize;
  quality?: ImageProviderQuality;
  ttlMs?: number;
}): Promise<ImageProviderPreflightResult> {
  const config = resolveImageProviderConfig();
  const ttlMs = Math.max(0, params?.ttlMs ?? 30_000);
  const cacheKey = `${config.providerPath}|${process.env.OPENAI_API_KEY ? "key" : "nokey"}|${process.env.OPENAI_IMAGE_PREVIEWS_ENABLED || ""}`;

  if (preflightCache && preflightCache.key === cacheKey && preflightCache.expiresAt > Date.now()) {
    return preflightCache.promise;
  }

  const promise = (async (): Promise<ImageProviderPreflightResult> => {
    const checkedAt = new Date().toISOString();

    if (!isImagePreviewGenerationEnabled()) {
      return {
        ok: false,
        provider: config.provider,
        model: config.model,
        providerPath: config.providerPath,
        checkedAt,
        failureReason: "PROVIDER_AUTH_OR_CONFIG_ERROR",
        message: "OPENAI_IMAGE_PREVIEWS_ENABLED is disabled"
      };
    }

    if (!process.env.OPENAI_API_KEY?.trim()) {
      return {
        ok: false,
        provider: config.provider,
        model: config.model,
        providerPath: config.providerPath,
        checkedAt,
        failureReason: "PROVIDER_AUTH_OR_CONFIG_ERROR",
        message: "OPENAI_API_KEY is not configured"
      };
    }

    try {
      const response = await getOpenAI().responses.create({
        model: config.model,
        input: PREFLIGHT_PROMPT,
        tool_choice: { type: "image_generation" },
        tools: [
          {
            type: "image_generation",
            size: params?.size ?? "1024x1024",
            quality: params?.quality ?? "low",
            background: "opaque"
          }
        ]
      });
      extractGeneratedImageB64(response);

      return {
        ok: true,
        provider: config.provider,
        model: config.model,
        providerPath: config.providerPath,
        checkedAt,
        failureReason: null,
        message: null
      };
    } catch (error) {
      const normalizedError = normalizeImageProviderError(error, config);
      return {
        ok: false,
        provider: config.provider,
        model: config.model,
        providerPath: config.providerPath,
        checkedAt,
        failureReason: normalizedError.failureReason,
        message: normalizedError.message
      };
    }
  })();

  preflightCache = {
    key: cacheKey,
    expiresAt: Date.now() + ttlMs,
    promise
  };

  return promise;
}
