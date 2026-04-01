import "server-only";

import { createHash } from "crypto";
import { runWithGptImage429Retry, runWithGptImageBudget, type GptImageDebugMeta } from "@/lib/gptImageRateLimit";
import { openai } from "@/lib/openai";
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
        operationKey: route.operation.key
      },
      "OPENAI_API_KEY is not configured"
    );
  }

  const quality = normalizeQuality(process.env.OPENAI_IMAGE_QUALITY?.trim(), params.quality ?? DEFAULT_IMAGE_QUALITY);
  const referenceItems = (params.references || [])
    .map((reference) => reference.dataUrl?.trim())
    .filter((value): value is string => Boolean(value) && /^data:image\//i.test(value))
    .map((imageUrl) => ({ type: "input_image" as const, image_url: imageUrl, detail: "high" as const }));
  const input =
    referenceItems.length > 0
      ? [
          {
            role: "user" as const,
            content: [{ type: "input_text" as const, text: params.prompt }, ...referenceItems]
          }
        ]
      : params.prompt;

  return traceAiProviderCall({
    run: params.run,
    route,
    promptVersion: params.promptVersion,
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
            openai.responses.create({
              model: route.model.providerModel,
              input,
              tool_choice: { type: "image_generation" },
              tools: [
                {
                  type: "image_generation",
                  size: params.size,
                  quality,
                  background: "opaque"
                }
              ]
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
            operationKey: route.operation.key
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
          referenceCount: referenceItems.length
        }
      };
    }
  });
}
