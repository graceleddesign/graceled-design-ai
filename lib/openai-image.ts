import "server-only";

import { openai } from "@/lib/openai";

export type OpenAiImageSize = "1024x1024" | "1536x1024" | "1024x1536";
export type OpenAiImageQuality = "low" | "medium" | "high";

const DEFAULT_IMAGE_MODEL = "gpt-image-1-mini";
const DEFAULT_IMAGE_QUALITY: OpenAiImageQuality = "medium";

function normalizeQuality(value: string | undefined, fallback: OpenAiImageQuality = DEFAULT_IMAGE_QUALITY): OpenAiImageQuality {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return fallback;
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

function imageGenerationModelCandidates(): string[] {
  const requested = process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
  const fallbackMain = process.env.OPENAI_MAIN_MODEL?.trim() || "";

  return Array.from(new Set([requested, fallbackMain, "gpt-4.1-mini", "gpt-4o-mini"].filter(Boolean)));
}

export async function generatePngFromPrompt(params: {
  prompt: string;
  size: OpenAiImageSize;
  quality?: OpenAiImageQuality;
}): Promise<Buffer> {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const quality = normalizeQuality(process.env.OPENAI_IMAGE_QUALITY?.trim(), params.quality ?? DEFAULT_IMAGE_QUALITY);
  const models = imageGenerationModelCandidates();

  let lastError: unknown = null;

  for (const model of models) {
    try {
      const response = await openai.responses.create({
        model,
        input: params.prompt,
        tool_choice: { type: "image_generation" },
        tools: [
          {
            type: "image_generation",
            size: params.size,
            quality,
            background: "opaque"
          }
        ]
      });

      const b64 = extractGeneratedImageB64(response);
      return Buffer.from(b64, "base64");
    } catch (error) {
      lastError = error;
      const status =
        typeof error === "object" && error && "status" in error ? (error as { status?: unknown }).status : null;
      const isAccessOrModelIssue = status === 403 || status === 404;

      if (!isAccessOrModelIssue || model === models[models.length - 1]) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("OpenAI image generation failed");
}
