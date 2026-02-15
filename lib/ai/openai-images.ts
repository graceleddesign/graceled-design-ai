import "server-only";

import OpenAI from "openai";

const DEFAULT_IMAGE_MODEL = "gpt-image-1.5";

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
  const client = getOpenAiClient();
  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
  const style = process.env.OPENAI_IMAGE_STYLE?.trim() || "";

  const response = await client.images.generate({
    model,
    prompt: params.prompt,
    size: params.size,
    quality: normalizeQuality(process.env.OPENAI_IMAGE_QUALITY?.trim(), params.quality ?? "high"),
    response_format: "b64_json",
    ...(style ? { style } : {})
  } as never);

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI images.generate returned no image data");
  }

  return Buffer.from(b64, "base64");
}
