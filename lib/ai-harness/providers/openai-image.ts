import "server-only";

import { createHash } from "crypto";
import { runWithGptImage429Retry, runWithGptImageBudget, type GptImageDebugMeta } from "@/lib/gptImageRateLimit";
import { getOpenAI } from "@/lib/openai";
import {
  createInvalidResponseError,
  createProviderConfigurationError
} from "@/lib/ai-harness/core/errors";
import { resolveOperationRoute } from "@/lib/ai-harness/core/registry";
import { traceAiProviderCall } from "@/lib/ai-harness/core/tracing";
import type {
  AiAttemptTrace,
  AiModelKey,
  AiOperationKey,
  AiRunRecord
} from "@/lib/ai-harness/core/types";

export type OpenAiImageSize = "1024x1024" | "1536x1024" | "1024x1536";
export type OpenAiImageQuality = "low" | "medium" | "high";
export type OpenAiImageReference = {
  dataUrl: string;
};

const DEFAULT_IMAGE_QUALITY: OpenAiImageQuality = "medium";

function normalizeQuality(value: string | undefined, fallback: OpenAiImageQuality = DEFAULT_IMAGE_QUALITY): OpenAiImageQuality {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return fallback;
}

function readProviderRequestId(response: unknown): string | null {
  if (!response || typeof response !== "object" || !("id" in response)) {
    return null;
  }

  const value = (response as { id?: unknown }).id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hashReferenceImage(dataUrl: string): string {
  return createHash("sha256").update(dataUrl).digest("hex");
}

function extractGeneratedImageB64(response: unknown): string {
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

export async function generateImageWithOpenAiHarness(params: {
  run: AiRunRecord;
  operationKey: Extract<AiOperationKey, "generate_background_image">;
  promptVersion: string;
  prompt: string;
  size: OpenAiImageSize;
  quality?: OpenAiImageQuality;
  references?: OpenAiImageReference[];
  modelKey?: AiModelKey | null;
  disable429Retry?: boolean;
  assertActive?: () => Promise<void> | void;
  meta?: {
    debug?: GptImageDebugMeta;
  };
}): Promise<AiAttemptTrace<{ imagePng: Buffer; providerRequestId: string | null }>> {
  const route = resolveOperationRoute({
    operationKey: params.operationKey,
    modelKey: params.modelKey ?? null
  });

  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw createProviderConfigurationError(
      {
        providerKey: route.provider.key,
        modelKey: route.model.key,
        operationKey: route.operation.key,
        providerModel: route.model.providerModel,
        providerConfigVersion: route.providerConfigVersion
      },
      "OPENAI_API_KEY is not configured"
    );
  }

  const quality = normalizeQuality(process.env.OPENAI_IMAGE_QUALITY?.trim(), params.quality ?? DEFAULT_IMAGE_QUALITY);

  return traceAiProviderCall({
    run: params.run,
    route,
    promptVersion: params.promptVersion,
    assertActive: params.assertActive,
    requestBody: {
      prompt: params.prompt,
      size: params.size,
      quality,
      referenceHashes: (params.references || []).map((reference) => hashReferenceImage(reference.dataUrl))
    },
    call: async () => {
      const runImageRequest = () =>
        runWithGptImageBudget(
          () =>
            getOpenAI().images.generate({
              model: route.model.providerModel,
              prompt: params.prompt,
              size: params.size,
              quality,
              background: "opaque",
              n: 1
            }),
          params.meta
        );
      const response = params.disable429Retry ? await runImageRequest() : await runWithGptImage429Retry(runImageRequest, params.meta);

      let imageB64 = "";
      try {
        imageB64 = extractGeneratedImageB64(response);
      } catch (error) {
        throw createInvalidResponseError(
          {
            providerKey: route.provider.key,
            modelKey: route.model.key,
            operationKey: route.operation.key,
            providerModel: route.model.providerModel,
            providerConfigVersion: route.providerConfigVersion
          },
          "OpenAI image response did not include generated image output",
          error
        );
      }

      const imagePng = Buffer.from(imageB64, "base64");
      const providerRequestId = readProviderRequestId(response);

      return {
        output: {
          imagePng,
          providerRequestId
        },
        providerRequestId,
        outputJson: {
          mimeType: "image/png",
          bytes: imagePng.byteLength,
          size: params.size,
          quality,
          referenceCount: (params.references || []).length
        }
      };
    }
  });
}
