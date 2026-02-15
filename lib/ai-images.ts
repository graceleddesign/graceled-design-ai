import "server-only";

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import OpenAI from "openai";

export type AiImageSize = "1024x1024" | "1536x1024" | "1024x1536";
export type AiImageQuality = "low" | "medium" | "high" | "auto";

let openAiClient: OpenAI | null = null;

function getOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  if (!openAiClient) {
    openAiClient = new OpenAI({ apiKey });
  }

  return openAiClient;
}

function paletteHint(palette: string[]): string {
  if (palette.length === 0) {
    return "Use refined neutral tones with one restrained accent.";
  }

  return `Use this brand palette subtly: ${palette.join(", ")}.`;
}

function projectHints(project: {
  seriesTitle: string;
  seriesSubtitle: string | null;
  scripturePassages: string | null;
  seriesDescription: string | null;
}): string {
  const hints = [project.seriesTitle, project.seriesSubtitle, project.scripturePassages, project.seriesDescription]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .join(" | ");

  return hints ? `Theme inspiration: ${hints}.` : "Theme inspiration: modern church sermon series.";
}

export function buildBackgroundPrompt(params: {
  presetKey: string;
  project: {
    seriesTitle: string;
    seriesSubtitle: string | null;
    scripturePassages: string | null;
    seriesDescription: string | null;
  };
  palette: string[];
}): string {
  const baseInstructions = [
    "Generate background art only for a church sermon series design system.",
    "Do not render text overlays.",
    "No text, letters, numbers, logos, watermarks, or word-like symbols."
  ];

  if (params.presetKey === "type_clean_min_v1") {
    return [
      ...baseInstructions,
      "Style: premium minimal editorial background.",
      "Include subtle paper texture, one subtle geometric accent, and generous negative space.",
      "Mood: modern church sermon series, polished and calm.",
      paletteHint(params.palette),
      projectHints(params.project)
    ].join(" ");
  }

  return [
    ...baseInstructions,
    "Style: premium modern editorial background with restrained geometric structure and negative space.",
    paletteHint(params.palette),
    projectHints(params.project)
  ].join(" ");
}

export function normalizeAiImageQuality(value: string | undefined): AiImageQuality {
  if (value === "low" || value === "medium" || value === "high" || value === "auto") {
    return value;
  }

  return "high";
}

export async function generateBackgroundPng(params: {
  prompt: string;
  size: AiImageSize;
  quality?: AiImageQuality;
}): Promise<Buffer> {
  const client = getOpenAiClient();
  const response = await client.images.generate({
    model: "gpt-image-1",
    prompt: params.prompt,
    size: params.size,
    quality: normalizeAiImageQuality(params.quality ?? process.env.AI_IMAGE_QUALITY?.trim()),
    response_format: "b64_json"
  } as never);

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI images.generate returned no image data");
  }

  return Buffer.from(b64, "base64");
}

export async function writeUpload(buffer: Buffer, filename: string): Promise<{ filePath: string }> {
  const uploadDirectory = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDirectory, { recursive: true });

  const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "-");
  const destination = path.join(uploadDirectory, safeName);
  await writeFile(destination, buffer);

  return { filePath: path.posix.join("uploads", safeName) };
}
