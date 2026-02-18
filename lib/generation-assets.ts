import "server-only";

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { buildFallbackDesignDoc, normalizeDesignDoc, type DesignDoc } from "@/lib/design-doc";
import { buildFinalSvg } from "@/lib/final-deliverables";
import { generateBackgroundPng, type OpenAiImageQuality, type OpenAiImageSize } from "@/lib/ai/openai-images";
import { prisma } from "@/lib/prisma";

const PREVIEW_SHAPES = ["square", "wide", "tall"] as const;
type PreviewShape = (typeof PREVIEW_SHAPES)[number];
const OPTION_MASTER_BACKGROUND_SHAPE: PreviewShape = "wide";

const SHAPE_CONFIG: Record<
  PreviewShape,
  {
    slot: "square_main" | "widescreen_main" | "vertical_main";
    sourceSize: OpenAiImageSize;
    outputWidth: number;
    outputHeight: number;
  }
> = {
  square: {
    slot: "square_main",
    sourceSize: "1024x1024",
    outputWidth: 1080,
    outputHeight: 1080
  },
  wide: {
    slot: "widescreen_main",
    sourceSize: "1792x1024",
    outputWidth: 1920,
    outputHeight: 1080
  },
  tall: {
    slot: "vertical_main",
    sourceSize: "1024x1792",
    outputWidth: 1080,
    outputHeight: 1920
  }
};

const AI_QUALITY: OpenAiImageQuality = "high";

function parsePaletteJson(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  } catch {
    return [];
  }
}

function readSelectedPresetKeysFromInput(input: unknown): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return [];
  }

  const selectedPresetKeys = (input as { selectedPresetKeys?: unknown }).selectedPresetKeys;
  if (!Array.isArray(selectedPresetKeys)) {
    return [];
  }

  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const value of selectedPresetKeys) {
    if (typeof value !== "string") {
      continue;
    }

    const key = value.trim();
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(key);
  }

  return deduped;
}

function readOptionIndex(input: unknown, presetKey: string | null): number {
  if (!presetKey) {
    return 0;
  }

  const selectedPresetKeys = readSelectedPresetKeysFromInput(input);
  const index = selectedPresetKeys.findIndex((candidate) => candidate === presetKey);
  return index >= 0 ? index : 0;
}

function parseDesignDocByShapeFromOutput(output: unknown, shape: PreviewShape): DesignDoc | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }

  const shapeDocs = (output as { designDocByShape?: unknown }).designDocByShape;
  if (!shapeDocs || typeof shapeDocs !== "object" || Array.isArray(shapeDocs)) {
    return null;
  }

  const docsByShape = shapeDocs as Record<string, unknown>;
  return normalizeDesignDoc(docsByShape[shape]);
}

function parseDesignDocFromOutput(output: unknown): DesignDoc | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }

  const nestedDesignDoc = normalizeDesignDoc((output as { designDoc?: unknown }).designDoc);
  if (nestedDesignDoc) {
    return nestedDesignDoc;
  }

  return normalizeDesignDoc(output);
}

function adaptDesignDocToDimensions(designDoc: DesignDoc, targetWidth: number, targetHeight: number): DesignDoc {
  if (designDoc.width <= 0 || designDoc.height <= 0) {
    return designDoc;
  }

  const scaleX = targetWidth / designDoc.width;
  const scaleY = targetHeight / designDoc.height;
  const textScale = Math.min(scaleX, scaleY);

  const layers = designDoc.layers.map((layer) => {
    if (layer.type === "text") {
      return {
        ...layer,
        x: layer.x * scaleX,
        y: layer.y * scaleY,
        w: layer.w * scaleX,
        h: layer.h * scaleY,
        fontSize: Math.max(8, layer.fontSize * textScale)
      };
    }

    return {
      ...layer,
      x: layer.x * scaleX,
      y: layer.y * scaleY,
      w: layer.w * scaleX,
      h: layer.h * scaleY
    };
  });

  return {
    width: targetWidth,
    height: targetHeight,
    background: designDoc.background,
    layers
  };
}

function resolveOverlayDesignDoc(params: {
  generationOutput: unknown;
  generationInput: unknown;
  round: number;
  presetKey: string | null;
  shape: PreviewShape;
  outputWidth: number;
  outputHeight: number;
  project: {
    series_title: string;
    series_subtitle: string | null;
    scripture_passages: string | null;
    series_description: string | null;
    brandKit: {
      logoPath: string | null;
      paletteJson: string;
    } | null;
  };
}): DesignDoc {
  const shapeDoc = parseDesignDocByShapeFromOutput(params.generationOutput, params.shape);
  if (shapeDoc) {
    return shapeDoc;
  }

  const outputDoc = parseDesignDocFromOutput(params.generationOutput);
  if (outputDoc) {
    return adaptDesignDocToDimensions(outputDoc, params.outputWidth, params.outputHeight);
  }

  const fallbackDoc = buildFallbackDesignDoc({
    output: params.generationOutput,
    input: params.generationInput,
    presetKey: params.presetKey,
    shape: params.shape,
    round: params.round,
    optionIndex: readOptionIndex(params.generationInput, params.presetKey),
    project: {
      seriesTitle: params.project.series_title,
      seriesSubtitle: params.project.series_subtitle,
      scripturePassages: params.project.scripture_passages,
      seriesDescription: params.project.series_description,
      logoPath: params.project.brandKit?.logoPath || null,
      palette: parsePaletteJson(params.project.brandKit?.paletteJson)
    }
  });

  return adaptDesignDocToDimensions(fallbackDoc, params.outputWidth, params.outputHeight);
}

function normalizeQuality(value: string | undefined): OpenAiImageQuality {
  if (value === "low" || value === "medium" || value === "high" || value === "auto") {
    return value;
  }

  return AI_QUALITY;
}

function presetStyleHint(presetKey: string | null): string {
  const normalized = (presetKey || "").toLowerCase();
  if (normalized.startsWith("photo_") || normalized.includes("_photo") || normalized.includes("photo")) {
    return "Use photo-real atmosphere with moody cinematic lighting and realistic depth.";
  }

  if (normalized.startsWith("abstract_") || normalized.includes("_abstract") || normalized.includes("abstract")) {
    return "Use abstract gradients and geometric forms with clean composition.";
  }

  return "Use modern geometric layering and subtle editorial texture.";
}

function promptPalette(palette: string[]): string {
  if (palette.length === 0) {
    return "refined modern neutrals with one restrained accent";
  }

  return palette.join(", ");
}

function buildBackgroundPrompt(params: {
  presetKey: string | null;
  seriesTitle: string;
  seriesSubtitle: string | null;
  scripturePassages: string | null;
  palette: string[];
}): string {
  const thematicHints = [params.seriesTitle, params.seriesSubtitle, params.scripturePassages]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .join(" | ");

  return [
    "Design a premium sermon series background artwork in the style of modern church media.",
    "Clean, minimal, high-end.",
    `Use palette: ${promptPalette(params.palette)}.`,
    "Include subtle texture and geometric depth.",
    "Leave generous negative space for typography overlays.",
    "Default to abstract textures and geometric motifs unless a literal photo scene was explicitly requested.",
    "Negative scene list: highway, road, cars, city, skyscraper, traffic, street signs, billboards.",
    presetStyleHint(params.presetKey),
    thematicHints ? `Theme inspiration: ${thematicHints}.` : "Theme inspiration: modern worship campaign.",
    "NO TEXT, NO LETTERS, NO WORDS, NO TYPOGRAPHY, NO SIGNAGE, NO LOGOS, NO WATERMARKS."
  ].join(" ");
}

export async function createGenerationPreviewAssets(params: {
  projectId: string;
  generationId: string;
}): Promise<void> {
  const generation = await prisma.generation.findFirst({
    where: {
      id: params.generationId,
      projectId: params.projectId
    },
    select: {
      id: true,
      projectId: true,
      round: true,
      input: true,
      output: true,
      preset: {
        select: {
          key: true
        }
      },
      project: {
        select: {
          series_title: true,
          series_subtitle: true,
          scripture_passages: true,
          series_description: true,
          brandKit: {
            select: {
              logoPath: true,
              paletteJson: true
            }
          }
        }
      }
    }
  });

  if (!generation) {
    throw new Error(`Generation ${params.generationId} was not found for project ${params.projectId}`);
  }

  const uploadDirectory = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDirectory, { recursive: true });

  const palette = parsePaletteJson(generation.project.brandKit?.paletteJson);
  const backgroundPrompt = buildBackgroundPrompt({
    presetKey: generation.preset?.key || null,
    seriesTitle: generation.project.series_title,
    seriesSubtitle: generation.project.series_subtitle,
    scripturePassages: generation.project.scripture_passages,
    palette
  });
  const masterBackgroundPng = await generateBackgroundPng({
    prompt: backgroundPrompt,
    size: SHAPE_CONFIG[OPTION_MASTER_BACKGROUND_SHAPE].sourceSize,
    quality: normalizeQuality(process.env.OPENAI_IMAGE_QUALITY?.trim())
  });
  const assetRows: {
    projectId: string;
    generationId: string;
    kind: "IMAGE";
    slot: "square_main" | "widescreen_main" | "vertical_main";
    file_path: string;
    mime_type: string;
    width: number;
    height: number;
  }[] = [];

  for (const shape of PREVIEW_SHAPES) {
    const config = SHAPE_CONFIG[shape];
    const overlayDesignDoc = resolveOverlayDesignDoc({
      generationOutput: generation.output,
      generationInput: generation.input,
      round: generation.round,
      presetKey: generation.preset?.key || null,
      shape,
      outputWidth: config.outputWidth,
      outputHeight: config.outputHeight,
      project: generation.project
    });

    const overlaySvg = await buildFinalSvg(overlayDesignDoc, {
      includeBackground: false,
      includeImages: true
    });

    const resizedBackground = await sharp(masterBackgroundPng)
      .resize({
        width: config.outputWidth,
        height: config.outputHeight,
        fit: "cover",
        position: "center"
      })
      .png()
      .toBuffer();

    const composited = await sharp(resizedBackground)
      .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
      .png()
      .toBuffer();

    const filename = `${generation.id}-${shape}-${Date.now()}.png`;
    await writeFile(path.join(uploadDirectory, filename), composited);

    assetRows.push({
      projectId: generation.projectId,
      generationId: generation.id,
      kind: "IMAGE",
      slot: config.slot,
      file_path: `/uploads/${filename}`,
      mime_type: "image/png",
      width: config.outputWidth,
      height: config.outputHeight
    });
  }

  const slots = assetRows.map((assetRow) => assetRow.slot);
  await prisma.$transaction([
    prisma.asset.deleteMany({
      where: {
        generationId: generation.id,
        slot: {
          in: slots
        }
      }
    }),
    prisma.asset.createMany({
      data: assetRows
    }),
    prisma.generation.update({
      where: { id: generation.id },
      data: { updatedAt: new Date() }
    })
  ]);
}
