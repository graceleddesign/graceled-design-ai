import "server-only";

import { runWithGptImage429Retry, runWithGptImageBudget } from "@/lib/gptImageRateLimit";
import {
  extractGeneratedImageB64,
  normalizeImageProviderError,
  resolveImageProviderConfig
} from "@/lib/image-provider";
import { openai } from "@/lib/openai";

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

    const runImageCall = () =>
      runWithGptImageBudget(
        () =>
          openai.responses.create({
            model: providerConfig.model,
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
    const response = params.disable429Retry ? await runImageCall() : await runWithGptImage429Retry(runImageCall, params.meta);

    const b64 = extractGeneratedImageB64(response);
    return Buffer.from(b64, "base64");
  } catch (error) {
    throw normalizeImageProviderError(error, providerConfig);
  }
}
