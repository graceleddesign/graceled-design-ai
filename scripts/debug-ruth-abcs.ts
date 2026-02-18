import { mkdir, writeFile } from "fs/promises";
import path from "path";
import OpenAI from "openai";
import sharp from "sharp";
import { buildOverlayDisplayContent } from "../lib/overlay-lines";
import {
  buildCleanMinimalOverlaySvg,
  chooseTextPaletteForBackground,
  computeCleanMinimalLayout
} from "../lib/templates/type-clean-min";

type PreviewShape = "square" | "wide" | "tall";
type OpenAiImageSize = "1024x1024" | "1536x1024" | "1024x1536";

const PREVIEW_SHAPES: readonly PreviewShape[] = ["square", "wide", "tall"];
const DIMENSIONS: Record<PreviewShape, { width: number; height: number; size: OpenAiImageSize }> = {
  square: { width: 1080, height: 1080, size: "1024x1024" },
  wide: { width: 1920, height: 1080, size: "1536x1024" },
  tall: { width: 1080, height: 1920, size: "1024x1536" }
};
const OPTION_MASTER_BACKGROUND_SHAPE: PreviewShape = "wide";
const SAMPLE_PROJECT_ID = "debug-ruth";
const OUTPUT_DIR = path.join(process.cwd(), "public", "debug", "ruth-abcs");

function parseResponseText(response: unknown): string {
  if (response && typeof response === "object" && typeof (response as { output_text?: unknown }).output_text === "string") {
    return ((response as { output_text: string }).output_text || "").trim();
  }
  if (!response || typeof response !== "object") {
    return "";
  }

  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return "";
  }

  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const segment of content) {
      if (!segment || typeof segment !== "object") {
        continue;
      }
      const text = (segment as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) {
        chunks.push(text.trim());
      }
    }
  }
  return chunks.join("\n").trim();
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

async function generatePngFromPromptLocal(params: {
  client: OpenAI;
  prompt: string;
  size: OpenAiImageSize;
  references: string[];
}): Promise<Buffer> {
  const referenceItems = params.references
    .map((dataUrl) => dataUrl.trim())
    .filter((value) => /^data:image\//i.test(value))
    .map((imageUrl) => ({ type: "input_image" as const, image_url: imageUrl, detail: "high" as const }));

  const modelCandidates = Array.from(
    new Set(
      [
        process.env.OPENAI_IMAGE_MODEL?.trim(),
        process.env.OPENAI_MAIN_MODEL?.trim(),
        "gpt-image-1",
        "gpt-4.1-mini",
        "gpt-4o-mini"
      ].filter((value): value is string => Boolean(value))
    )
  );

  let lastError: unknown = null;
  for (const model of modelCandidates) {
    try {
      const response = await params.client.responses.create({
        model,
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: params.prompt }, ...referenceItems]
          }
        ],
        tool_choice: { type: "image_generation" },
        tools: [
          {
            type: "image_generation",
            size: params.size,
            quality: "medium",
            background: "opaque"
          }
        ]
      });

      const b64 = extractGeneratedImageB64(response);
      return Buffer.from(b64, "base64");
    } catch (error) {
      lastError = error;
      const status = typeof error === "object" && error && "status" in error ? (error as { status?: unknown }).status : null;
      const message =
        typeof error === "object" && error && "message" in error ? String((error as { message?: unknown }).message || "") : "";
      const isModelAccessIssue =
        status === 403 ||
        status === 404 ||
        (status === 400 && /not supported with the Responses API/i.test(message));
      if (!isModelAccessIssue || model === modelCandidates[modelCandidates.length - 1]) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Image generation failed");
}

async function hasReadableText(client: OpenAI, image: Buffer): Promise<boolean> {
  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MAIN_MODEL?.trim() || "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: 'Detect readable text. Return JSON only: {"hasText":true|false}.' },
            { type: "input_image", image_url: `data:image/png;base64,${image.toString("base64")}`, detail: "low" }
          ]
        }
      ]
    });
    const text = parseResponseText(response);
    return /"hasText"\s*:\s*true/i.test(text);
  } catch {
    return false;
  }
}

function lanePrompt(optionIndex: number): string {
  if (optionIndex === 0) {
    return "Minimal/clean lane with Swiss-grid restraint and gentle texture.";
  }
  if (optionIndex === 1) {
    return "Illustrative/line-art lane with subtle engraved motifs and generous negative space.";
  }
  return "Photo-based lane with cinematic atmosphere and soft tactile depth.";
}

function shapePrompt(shape: PreviewShape): string {
  if (shape === "wide") {
    return "Keep the upper-left and left-center zones clear for text overlay.";
  }
  if (shape === "tall") {
    return "Keep upper-middle area clear for text overlay.";
  }
  return "Keep left-center area clear for text overlay.";
}

function buildBackgroundPrompt(shape: PreviewShape, optionIndex: number, seed: string, noTextBoost = ""): string {
  return [
    "Create an ORIGINAL premium sermon-series BACKGROUND only.",
    "No text, no letters, no words, no typography, no signage, no logos, no watermarks, no symbols resembling letters.",
    "Do not include readable characters in any language.",
    "Default to abstract textures, subtle paper grain, geometric motifs, and minimal illustration accents.",
    "Avoid literal scene photos unless explicitly requested.",
    "Negative scene list: highway, road, cars, city, skyscraper, traffic, street signs, billboards.",
    "Theme brief: providence, redemption, loyalty, harvest, wheat, Bethlehem, mercy, trust.",
    "Avoid words (never render as text): Ruth, God Lovingly Provides.",
    lanePrompt(optionIndex),
    shapePrompt(shape),
    "Create an original design; do not copy layout or specific elements from reference images.",
    noTextBoost,
    `Variation seed: ${seed}.`
  ]
    .filter(Boolean)
    .join(" ");
}

async function normalizeShape(png: Buffer, shape: PreviewShape): Promise<Buffer> {
  const dimensions = DIMENSIONS[shape];
  return sharp(png)
    .resize({
      width: dimensions.width,
      height: dimensions.height,
      fit: "cover",
      position: "center"
    })
    .png()
    .toBuffer();
}

async function generateBackgroundWithRetries(params: {
  client: OpenAI;
  optionIndex: number;
  references: string[];
  seed: string;
}): Promise<{ png: Buffer; retries: number; prompt: string }> {
  const retryBoosts = [
    "",
    "Hard retry: if any text appears, regenerate with abstract-only forms and textures.",
    "Critical retry: absolutely zero glyphs or character-like marks."
  ];

  let lastPng: Buffer | null = null;
  let lastPrompt = "";
  for (let attempt = 0; attempt < retryBoosts.length; attempt += 1) {
    const prompt = buildBackgroundPrompt(OPTION_MASTER_BACKGROUND_SHAPE, params.optionIndex, params.seed, retryBoosts[attempt]);
    const source = await generatePngFromPromptLocal({
      client: params.client,
      prompt,
      size: DIMENSIONS[OPTION_MASTER_BACKGROUND_SHAPE].size,
      references: params.references
    });
    const png = await normalizeShape(source, OPTION_MASTER_BACKGROUND_SHAPE);
    lastPng = png;
    lastPrompt = prompt;

    if (!(await hasReadableText(params.client, png))) {
      return { png, retries: attempt, prompt };
    }
  }

  return { png: lastPng as Buffer, retries: 2, prompt: lastPrompt };
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for debug generation.");
  }

  const client = new OpenAI({ apiKey });
  await mkdir(OUTPUT_DIR, { recursive: true });

  const displayContent = buildOverlayDisplayContent({
    title: "Ruth",
    subtitle: "God Lovingly Provides",
    scripturePassages: "Ruth 1:1-22"
  });
  const content = {
    title: displayContent.title,
    subtitle: displayContent.subtitle
  };

  for (let optionIndex = 0; optionIndex < 3; optionIndex += 1) {
    const optionLabel = String.fromCharCode(65 + optionIndex);
    const referenceDataUrls: string[] = [];

    const seed = `${SAMPLE_PROJECT_ID}-${optionLabel}-master`;
    const masterBackground = await generateBackgroundWithRetries({
      client,
      optionIndex,
      references: referenceDataUrls,
      seed
    });

    for (const shape of PREVIEW_SHAPES) {
      const dimensions = DIMENSIONS[shape];
      const backgroundPng =
        shape === OPTION_MASTER_BACKGROUND_SHAPE
          ? masterBackground.png
          : await normalizeShape(masterBackground.png, shape);

      const layout = computeCleanMinimalLayout({
        width: dimensions.width,
        height: dimensions.height,
        content
      });
      const textPalette = await chooseTextPaletteForBackground({
        backgroundPng,
        sampleRegion: layout.textRegion,
        width: dimensions.width,
        height: dimensions.height
      });
      const overlaySvg = buildCleanMinimalOverlaySvg({
        width: dimensions.width,
        height: dimensions.height,
        content,
        palette: textPalette
      });
      const finalPng = await sharp(backgroundPng)
        .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
        .png()
        .toBuffer();

      const backgroundName = `${optionLabel}-${shape}-bg.png`;
      const finalName = `${optionLabel}-${shape}-final.png`;
      await writeFile(path.join(OUTPUT_DIR, backgroundName), backgroundPng);
      await writeFile(path.join(OUTPUT_DIR, finalName), finalPng);
      console.log(
        `Saved ${backgroundName} and ${finalName} (master=${OPTION_MASTER_BACKGROUND_SHAPE}, text retries: ${masterBackground.retries})`
      );
    }
    console.log(`Option ${optionLabel} master prompt: ${masterBackground.prompt}`);
  }

  console.log(`Done. Outputs written to ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
