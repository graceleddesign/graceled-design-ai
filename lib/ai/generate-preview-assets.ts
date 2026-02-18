import "server-only";

import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { openai } from "@/lib/openai";

type ImageQuality = "low" | "medium" | "high" | "auto";
type ImageSize = "1024x1024" | "1536x1024" | "1024x1536";
type PreviewSlot = "square" | "wide" | "tall";

const SLOT_CONFIG: Record<
  PreviewSlot,
  {
    sourceSize: ImageSize;
    width: number;
    height: number;
  }
> = {
  square: {
    sourceSize: "1024x1024",
    width: 1080,
    height: 1080
  },
  wide: {
    sourceSize: "1536x1024",
    width: 1920,
    height: 1080
  },
  tall: {
    sourceSize: "1024x1536",
    width: 1080,
    height: 1920
  }
};

function normalizeQuality(value: string | undefined): ImageQuality {
  if (value === "low" || value === "medium" || value === "high" || value === "auto") {
    return value;
  }

  return "medium";
}

function presetStyleHint(presetKey: string): string {
  switch (presetKey) {
    case "type_clean_min_v1":
      return "Keep it ultra-minimal with a disciplined Swiss grid, crisp spacing, and restrained color accents.";
    case "abstract_gradient_modern_v1":
      return "Use smooth modern gradients with subtle film grain/noise and soft atmospheric depth.";
    case "type_swiss_grid_v1":
      return "Use strict grid alignment, editorial typography hierarchy, and premium print-like balance.";
    case "type_brutalist_v1":
      return "Use bold typographic contrast, asymmetry, and sharp geometric framing.";
    case "photo_mono_accent_v1":
      return "Use monochrome photographic mood with one controlled accent color and cinematic contrast.";
    default:
      return "Use contemporary sermon series art direction: intentional layout, polished texture, and clear hierarchy.";
  }
}

function truncateForPrompt(value: string | null | undefined, maxLength: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return "";
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildPrompt(params: {
  projectId: string;
  presetKey: string;
  seriesTitle: string;
  seriesSubtitle: string | null;
  scripturePassages: string | null;
  seriesDescription: string | null;
  round: number;
  optionKey: string;
}): string {
  const description = truncateForPrompt(params.seriesDescription, 320);

  return [
    "Create a premium church sermon series BACKGROUND only.",
    "clean minimal composition, modern, high-end, like professional sermon series packs.",
    "Background art only; typography and final layout will be overlaid separately.",
    `Primary title: ${params.seriesTitle}.`,
    params.seriesSubtitle?.trim() ? `Subtitle: ${params.seriesSubtitle}.` : "",
    params.scripturePassages?.trim() ? `Scripture passage(s): ${params.scripturePassages}.` : "",
    description ? `Theme summary: ${description}.` : "",
    `Project context: ${params.projectId}.`,
    `Creative lane key: ${params.presetKey}.`,
    presetStyleHint(params.presetKey),
    `Variation context: round ${params.round}, option ${params.optionKey}.`,
    "Default to abstract textures and geometric motifs unless a literal photo scene was explicitly requested.",
    "Negative scene list: highway, road, cars, city, skyscraper, traffic, street signs, billboards.",
    "No text, no letters, no words, no typography, no signage, no logos, and no watermarks."
  ]
    .filter(Boolean)
    .join(" ");
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

async function generatePngWithOpenAi(params: {
  prompt: string;
  size: ImageSize;
  quality: ImageQuality;
}): Promise<Buffer> {
  const requestedModel = process.env.OPENAI_MAIN_MODEL?.trim() || "gpt-4.1";
  const models = Array.from(new Set([requestedModel, "gpt-4.1-mini", "gpt-4o-mini"]));
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
            quality: params.quality,
            background: "opaque"
          }
        ]
      });
      const b64 = extractGeneratedImageB64(response);
      return Buffer.from(b64, "base64");
    } catch (error) {
      lastError = error;
      const status = typeof error === "object" && error && "status" in error ? (error as { status?: unknown }).status : null;
      const isAccessOrModelIssue = status === 403 || status === 404;
      if (!isAccessOrModelIssue || model === models[models.length - 1]) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Image generation failed");
}

async function writeResizedPng(params: {
  generationId: string;
  slot: PreviewSlot;
  sourcePng: Buffer;
  width: number;
  height: number;
}): Promise<string> {
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });

  const filename = `${params.generationId}-${params.slot}-${Date.now()}-${randomUUID().slice(0, 8)}.png`;
  const outputPath = path.join(uploadDir, filename);

  const resized = await sharp(params.sourcePng)
    .resize({
      width: params.width,
      height: params.height,
      fit: "cover",
      position: "center"
    })
    .png()
    .toBuffer();

  await writeFile(outputPath, resized);
  return `/uploads/${filename}`;
}

export async function generatePreviewAssets(params: {
  projectId: string;
  generationId: string;
  presetKey: string;
  seriesTitle: string;
  seriesSubtitle: string | null;
  scripturePassages: string | null;
  seriesDescription: string | null;
  round: number;
  optionKey: string;
}): Promise<{ squarePath: string; widePath: string; tallPath: string; promptUsed: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  const quality = normalizeQuality(process.env.OPENAI_IMAGE_QUALITY?.trim());
  const promptUsed = buildPrompt({
    projectId: params.projectId,
    presetKey: params.presetKey,
    seriesTitle: params.seriesTitle,
    seriesSubtitle: params.seriesSubtitle,
    scripturePassages: params.scripturePassages,
    seriesDescription: params.seriesDescription,
    round: params.round,
    optionKey: params.optionKey
  });

  const masterSource = await generatePngWithOpenAi({
    prompt: promptUsed,
    size: SLOT_CONFIG.wide.sourceSize,
    quality
  });

  const squarePath = await writeResizedPng({
    generationId: params.generationId,
    slot: "square",
    sourcePng: masterSource,
    width: SLOT_CONFIG.square.width,
    height: SLOT_CONFIG.square.height
  });
  const widePath = await writeResizedPng({
    generationId: params.generationId,
    slot: "wide",
    sourcePng: masterSource,
    width: SLOT_CONFIG.wide.width,
    height: SLOT_CONFIG.wide.height
  });
  const tallPath = await writeResizedPng({
    generationId: params.generationId,
    slot: "tall",
    sourcePng: masterSource,
    width: SLOT_CONFIG.tall.width,
    height: SLOT_CONFIG.tall.height
  });

  return {
    squarePath,
    widePath,
    tallPath,
    promptUsed
  };
}
