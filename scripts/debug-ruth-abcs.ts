import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import OpenAI from "openai";
import sharp from "sharp";
import { getDirectionTemplateCatalog, planDirectionSet, type PlannedDirectionSpec } from "../lib/direction-planner";
import { buildOverlayDisplayContent } from "../lib/overlay-lines";
import {
  buildCleanMinimalOverlaySvg,
  chooseTextPaletteForBackground,
  computeCleanMinimalLayout,
  resolveLockupPaletteForBackground
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

function shapePrompt(shape: PreviewShape): string {
  if (shape === "wide") {
    return "Keep the upper-left and left-center zones clear for text overlay.";
  }
  if (shape === "tall") {
    return "Keep upper-middle area clear for text overlay.";
  }
  return "Keep left-center area clear for text overlay.";
}

function buildBackgroundPrompt(params: {
  shape: PreviewShape;
  direction: PlannedDirectionSpec;
  title: string;
  subtitle: string;
  seed: string;
  noTextBoost?: string;
}): string {
  const avoidWords = [params.title, params.subtitle]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(", ");

  return [
    "Create an ORIGINAL premium sermon-series BACKGROUND only.",
    "No text, no letters, no words, no typography, no signage, no logos, no watermarks, no symbols resembling letters.",
    "Do not include readable characters in any language.",
    `Direction family: ${params.direction.styleFamily}.`,
    `Composition target: ${params.direction.compositionType}.`,
    `Background mode: ${params.direction.backgroundMode}.`,
    `Type profile intent: ${params.direction.typeProfile}.`,
    `Ornament profile intent: ${params.direction.ornamentProfile}.`,
    params.direction.lanePrompt,
    "Default to abstract textures, subtle paper grain, geometric motifs, and restrained premium compositions.",
    "Use a church-safe visual language and avoid novelty gimmicks.",
    "Negative scene list: highway, road, cars, city, skyscraper, traffic, street signs, billboards.",
    "Theme brief: providence, redemption, mercy, trust, restoration, worship, biblical narrative.",
    avoidWords ? `Avoid words (never render as text): ${avoidWords}.` : "",
    shapePrompt(params.shape),
    "Create an original design; do not copy layout or specific elements from reference images.",
    params.noTextBoost || "",
    `Variation seed: ${params.seed}.`
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
  direction: PlannedDirectionSpec;
  title: string;
  subtitle: string;
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
    const prompt = buildBackgroundPrompt({
      shape: OPTION_MASTER_BACKGROUND_SHAPE,
      direction: params.direction,
      title: params.title,
      subtitle: params.subtitle,
      seed: `${params.seed}|${attempt}`,
      noTextBoost: retryBoosts[attempt]
    });
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
  const client = apiKey ? new OpenAI({ apiKey }) : null;
  await mkdir(OUTPUT_DIR, { recursive: true });

  const runSeed = process.env.DEBUG_RUN_SEED?.trim() || randomUUID();
  const inputTitle = process.env.DEBUG_TITLE?.trim() || "Ruth";
  const inputSubtitle = process.env.DEBUG_SUBTITLE?.trim() || "God Lovingly Provides";
  const inputPassage = process.env.DEBUG_PASSAGE?.trim() || "Ruth 1:1-22";
  const displayContent = buildOverlayDisplayContent({
    title: inputTitle,
    subtitle: inputSubtitle,
    scripturePassages: inputPassage
  });
  const content = {
    title: displayContent.title,
    subtitle: displayContent.subtitle
  };
  const enabledPresetKeys = [...new Set(getDirectionTemplateCatalog().map((template) => template.presetKey))];
  const directionPlan = planDirectionSet({
    runSeed,
    enabledPresetKeys,
    optionCount: 3
  });
  const debugMetadata: Array<{
    option: string;
    styleFamily: string;
    compositionType: string;
    backgroundMode: string;
    typeProfile: string;
    ornamentProfile: string;
    presetKey: string;
    lockupPresetId: string;
    templateStyleFamily: string;
    prompt: string;
  }> = [];

  for (let optionIndex = 0; optionIndex < 3; optionIndex += 1) {
    const direction = directionPlan[optionIndex];
    if (!direction) {
      throw new Error(`Missing planned direction for option index ${optionIndex}`);
    }
    const optionLabel = direction.optionLabel;
    const referenceDataUrls: string[] = [];
    const lockupPresetId = direction.lockupPresetId;
    const fontSeed = `${runSeed}|${optionIndex}|${lockupPresetId}`;

    const masterBackground = client
      ? await generateBackgroundWithRetries({
          client,
          direction,
          title: content.title,
          subtitle: content.subtitle,
          references: referenceDataUrls,
          seed: `${runSeed}|${optionLabel}|master`
        })
      : {
          png: await normalizeShape(await readFile(path.join(OUTPUT_DIR, `${optionLabel}-wide-bg.png`)), OPTION_MASTER_BACKGROUND_SHAPE),
          retries: 0,
          prompt: "offline-existing-background"
        };
    const masterDimensions = DIMENSIONS[OPTION_MASTER_BACKGROUND_SHAPE];
    const masterLayout = computeCleanMinimalLayout({
      width: masterDimensions.width,
      height: masterDimensions.height,
      content,
      lockupPresetId,
      styleFamily: direction.templateStyleFamily,
      fontSeed
    });
    const resolvedLockupPalette = await resolveLockupPaletteForBackground({
      backgroundPng: masterBackground.png,
      sampleRegion: masterLayout.textRegion,
      width: masterDimensions.width,
      height: masterDimensions.height
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
        content,
        lockupPresetId,
        styleFamily: direction.templateStyleFamily,
        fontSeed
      });
      const textPalette = await chooseTextPaletteForBackground({
        backgroundPng,
        sampleRegion: layout.textRegion,
        width: dimensions.width,
        height: dimensions.height,
        resolvedPalette: resolvedLockupPalette
      });
      const overlaySvg = buildCleanMinimalOverlaySvg({
        width: dimensions.width,
        height: dimensions.height,
        content,
        palette: textPalette,
        lockupPresetId,
        styleFamily: direction.templateStyleFamily,
        fontSeed
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
    debugMetadata.push({
      option: optionLabel,
      styleFamily: direction.styleFamily,
      compositionType: direction.compositionType,
      backgroundMode: direction.backgroundMode,
      typeProfile: direction.typeProfile,
      ornamentProfile: direction.ornamentProfile,
      presetKey: direction.presetKey,
      lockupPresetId,
      templateStyleFamily: direction.templateStyleFamily,
      prompt: masterBackground.prompt
    });
    console.log(
      `Option ${optionLabel}: ${direction.styleFamily} / ${direction.compositionType} | preset=${direction.presetKey} lockup=${lockupPresetId}`
    );
  }

  await writeFile(
    path.join(OUTPUT_DIR, "metadata.json"),
    `${JSON.stringify(
      {
        runSeed,
        title: content.title,
        subtitle: content.subtitle,
        sampleProjectId: SAMPLE_PROJECT_ID,
        directions: debugMetadata
      },
      null,
      2
    )}\n`
  );
  console.log(`Done. Outputs written to ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
