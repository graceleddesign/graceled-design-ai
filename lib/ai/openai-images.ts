import "server-only";

import OpenAI from "openai";
import { runWithGptImage429Retry, runWithGptImageBudget } from "@/lib/gptImageRateLimit";
import { generateProviderImageBuffer } from "@/lib/image-provider";

export type OpenAiImageSize = "1024x1024" | "1792x1024" | "1024x1792";
export type OpenAiImageQuality = "low" | "medium" | "high" | "auto";

export class MissingOpenAiApiKeyError extends Error {
  readonly code = "OPENAI_API_KEY_MISSING";

  constructor() {
    super("OPENAI_API_KEY is not configured");
    this.name = "MissingOpenAiApiKeyError";
  }
}

let openAiClient: OpenAI | null = null;

function getOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new MissingOpenAiApiKeyError();
  }

  if (!openAiClient) {
    openAiClient = new OpenAI({ apiKey });
  }

  return openAiClient;
}

function normalizeQuality(value: string | undefined, fallback: OpenAiImageQuality): OpenAiImageQuality {
  if (value === "low" || value === "medium" || value === "high" || value === "auto") {
    return value;
  }

  return fallback;
}

export async function generateBackgroundPng(params: {
  prompt: string;
  size: OpenAiImageSize;
  quality?: OpenAiImageQuality;
}): Promise<Buffer> {
  const [w, h] = params.size.split("x").map(Number) as [number, number];
  const quality = normalizeQuality(process.env.OPENAI_IMAGE_QUALITY?.trim(), params.quality ?? "high");
  return generateProviderImageBuffer(params.prompt, w, h, quality);
}
