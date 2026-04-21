import "server-only";

import { runWithGptImage429Retry, runWithGptImageBudget } from "@/lib/gptImageRateLimit";
import {
  extractGeneratedImageB64,
  normalizeImageProviderError,
  resolveImageProviderConfig
} from "@/lib/image-provider";
import { getOpenAI } from "@/lib/openai";

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

export async function generatePngFromPrompt(params: {
  prompt: string;
  size: OpenAiImageSize;
  quality?: OpenAiImageQuality;
  references?: OpenAiImageReference[];
  disable429Retry?: boolean;
  meta?: {
    debug?: {
      rateLimitWaitMs?: number;
    };
  };
}): Promise<Buffer> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const quality = normalizeQuality(process.env.OPENAI_IMAGE_QUALITY?.trim(), params.quality ?? DEFAULT_IMAGE_QUALITY);
  const providerConfig = resolveImageProviderConfig();

  try {
    const runImageCall = () =>
      runWithGptImageBudget(
        () =>
          getOpenAI().images.generate({
            model: providerConfig.model,
            prompt: params.prompt,
            size: params.size,
            quality,
            background: "opaque",
            n: 1
          }),
        params.meta
      );
    const response = params.disable429Retry ? await runImageCall() : await runWithGptImage429Retry(runImageCall, params.meta);

    const b64 = extractGeneratedImageB64(response);
    return Buffer.from(b64, "base64");
  } catch (error) {
    throw normalizeImageProviderError(error, providerConfig);
  }
}
