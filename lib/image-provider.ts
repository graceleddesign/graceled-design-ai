import "server-only";

import { getOpenAI } from "@/lib/openai";
import { type ProviderFailureReason } from "@/lib/generation-state";
import { runWithGptImage429Retry, runWithGptImageBudget } from "@/lib/gptImageRateLimit";
import { generateFalImage } from "@/lib/fal-image";

export type ImageProviderName = "openai" | "fal";
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

const DEFAULT_IMAGE_MODEL = "gpt-image-1";
export const PREFLIGHT_PROMPT =
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
  if (process.env.FAL_API_KEY?.trim()) {
    return {
      provider: "fal",
      model: "flux-dev",
      providerPath: "fal:flux-dev",
      defaultModel: "flux-dev",
      usingDefaultModel: true
    };
  }

  const envModel = process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
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
  if (!response || typeof response !== "object" || !("data" in response)) {
    throw new Error("OpenAI images response did not include data");
  }

  const data = (response as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("OpenAI images response data is empty");
  }

  const first = data[0];
  if (!first || typeof first !== "object") {
    throw new Error("OpenAI images response data[0] is not an object");
  }

  const b64 = (first as { b64_json?: unknown }).b64_json;
  if (typeof b64 === "string" && b64.trim()) {
    return b64;
  }

  throw new Error("OpenAI images response had no b64_json");
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

  if (status === 400) {
    return "PROVIDER_CONTENT_POLICY";
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

  if (config.provider === "fal") {
    return {
      ok: true,
      provider: "fal",
      model: config.model,
      providerPath: config.providerPath,
      checkedAt: new Date().toISOString(),
      failureReason: null,
      message: null
    };
  }

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
      const response = await getOpenAI().images.generate({
        model: config.model,
        prompt: PREFLIGHT_PROMPT,
        size: params?.size ?? "1024x1024",
        quality: params?.quality ?? "low",
        n: 1
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

function deriveOpenAISize(width: number, height: number): ImageProviderSize {
  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.15) return "1024x1024";
  if (ratio > 1) return "1536x1024";
  return "1024x1536";
}

export async function generateProviderImageBuffer(
  prompt: string,
  width: number,
  height: number,
  quality?: "low" | "medium" | "high" | "auto"
): Promise<Buffer> {
  if (process.env.FAL_API_KEY?.trim()) {
    try {
      const b64 = await generateFalImage(prompt, width, height);
      return Buffer.from(b64, "base64");
    } catch (falError) {
      console.error("[FAL DEBUG] Raw fal error:", falError);
      throw falError;
    }
  }

  const config = resolveImageProviderConfig();
  const size = deriveOpenAISize(width, height);
  const q = (quality === "auto" ? "high" : quality) ?? "medium";
  const style = process.env.OPENAI_IMAGE_STYLE?.trim() || "";

  try {
    const response = await runWithGptImage429Retry(() =>
      runWithGptImageBudget(() =>
        getOpenAI().images.generate({
          model: config.model,
          prompt,
          size,
          quality: q,
          background: "opaque",
          ...(style ? { style } : {})
        } as never)
      )
    );
    const b64 = extractGeneratedImageB64(response);
    return Buffer.from(b64, "base64");
  } catch (error) {
    throw normalizeImageProviderError(error, config);
  }
}
