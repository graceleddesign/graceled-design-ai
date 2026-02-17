"use server";

import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sharp from "sharp";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { buildFallbackDesignDoc, buildFinalDesignDoc, type DesignDoc } from "@/lib/design-doc";
import { buildFinalSvg } from "@/lib/final-deliverables";
import { generatePngFromPrompt } from "@/lib/openai-image";
import { optionLabel } from "@/lib/option-label";
import { prisma } from "@/lib/prisma";
import { buildReferenceCollageBuffer, pickReferences } from "@/lib/reference-library";
import { listStyleRefs, pickStyleRefsForOptions, type StyleRef } from "@/lib/style-library";
import {
  buildCleanMinimalDesignDoc,
  buildCleanMinimalOverlaySvg,
  chooseTextPaletteForBackground,
  computeCleanMinimalLayout
} from "@/lib/templates/type-clean-min";

export type ProjectActionState = {
  error?: string;
};

export type BrandKitActionState = {
  error?: string;
};

export type GenerationActionState = {
  error?: string;
};

export type RoundFeedbackActionState = {
  error?: string;
};

const createProjectSchema = z.object({
  series_title: z.string().trim().min(1),
  series_subtitle: z.string().trim().optional(),
  scripture_passages: z.string().trim().optional(),
  series_description: z.string().trim().optional()
});

const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const ALLOWED_LOGO_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".svg"]);
const ALLOWED_LOGO_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/svg+xml"]);
const WEBSITE_URL_ERROR_MESSAGE =
  "Please enter a valid website URL (example: https://www.restorationmandeville.com)";

const saveBrandKitSchema = z.object({
  websiteUrl: z.string().trim().min(1, WEBSITE_URL_ERROR_MESSAGE),
  typographyDirection: z.enum(["match_site", "graceled_defaults"]),
  palette: z.array(z.string().regex(HEX_COLOR_REGEX, "Palette colors must be valid hex values."))
});

const generateRoundTwoSchema = z.object({
  currentRound: z.coerce.number().int().min(1),
  chosenGenerationId: z.string().trim().optional(),
  feedbackText: z.string().trim().max(2000).optional(),
  emphasis: z.enum(["title", "quote"]),
  expressiveness: z.coerce.number().int().min(0).max(100),
  temperature: z.coerce.number().int().min(0).max(100),
  styleDirection: z.enum(["option_a", "option_b", "option_c", "different"]).default("different")
});
const ROUND_OPTION_COUNT = 3;
const INTERNAL_LAYOUT_PRESET_KEY = "type_clean_min_v1";
const PREVIEW_SHAPES = ["square", "wide", "tall"] as const;
type PreviewShape = (typeof PREVIEW_SHAPES)[number];
type BackgroundAssetSlot = "square_bg" | "wide_bg" | "tall_bg";
type FinalAssetSlot = "square" | "wide" | "tall";
type LegacyPreviewAssetSlot = "square_main" | "wide_main" | "tall_main" | "widescreen_main" | "vertical_main";

const PREVIEW_DIMENSIONS: Record<PreviewShape, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  wide: { width: 1920, height: 1080 },
  tall: { width: 1080, height: 1920 }
};
const FINAL_ASSET_SLOT_BY_SHAPE: Record<PreviewShape, FinalAssetSlot> = {
  square: "square",
  wide: "wide",
  tall: "tall"
};
const LEGACY_PREVIEW_ASSET_SLOTS: readonly LegacyPreviewAssetSlot[] = [
  "square_main",
  "wide_main",
  "tall_main",
  "widescreen_main",
  "vertical_main"
];
const BACKGROUND_ASSET_SLOT_BY_SHAPE: Record<PreviewShape, BackgroundAssetSlot> = {
  square: "square_bg",
  wide: "wide_bg",
  tall: "tall_bg"
};
const OPENAI_IMAGE_SIZE_BY_SHAPE: Record<PreviewShape, "1024x1024" | "1536x1024" | "1024x1536"> = {
  square: "1024x1024",
  wide: "1536x1024",
  tall: "1024x1536"
};
const PREVIEW_ASSET_SLOTS_TO_CLEAR: readonly string[] = [
  ...LEGACY_PREVIEW_ASSET_SLOTS,
  ...PREVIEW_SHAPES,
  ...Object.values(BACKGROUND_ASSET_SLOT_BY_SHAPE)
];

function normalizeWebsiteUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const urlCandidate = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(urlCandidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || hostname.includes(" ") || !hostname.includes(".")) {
    return null;
  }

  if (hostname === "ww" || hostname === "ww." || hostname.startsWith("ww.")) {
    return null;
  }

  if (parsed.pathname === "/" && !parsed.search && !parsed.hash) {
    return parsed.origin;
  }

  return parsed.toString();
}

function parsePalette(raw: FormDataEntryValue | null): string[] | null {
  if (typeof raw !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function inferExtension(file: File): string {
  const ext = path.extname(file.name).toLowerCase();
  if (ALLOWED_LOGO_EXTENSIONS.has(ext)) {
    return ext;
  }

  if (file.type === "image/png") {
    return ".png";
  }
  if (file.type === "image/jpeg") {
    return ".jpg";
  }
  if (file.type === "image/svg+xml") {
    return ".svg";
  }

  return "";
}

function isAllowedLogoUpload(file: File): boolean {
  const ext = path.extname(file.name).toLowerCase();
  return ALLOWED_LOGO_EXTENSIONS.has(ext) || ALLOWED_LOGO_MIME_TYPES.has(file.type);
}

async function saveLogoUpload(file: File): Promise<string> {
  const uploadDirectory = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDirectory, { recursive: true });

  const extension = inferExtension(file) || ".png";
  const fileName = `${Date.now()}-${randomUUID()}${extension}`;
  const destination = path.join(uploadDirectory, fileName);

  await writeFile(destination, Buffer.from(await file.arrayBuffer()));

  return path.posix.join("uploads", fileName);
}

function parsePaletteJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function getUniqueStrings(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

function readSelectedPresetKeysFromInput(input: unknown): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return [];
  }

  const selectedPresetKeys = (input as { selectedPresetKeys?: unknown }).selectedPresetKeys;
  if (!Array.isArray(selectedPresetKeys)) {
    return [];
  }

  return getUniqueStrings(selectedPresetKeys);
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

function optionStyleDirectionHint(optionIndex: number): string {
  if (optionIndex === 0) {
    return "Option A direction: classic clean minimal, thin rules, left-aligned composition, restrained accents.";
  }
  if (optionIndex === 1) {
    return "Option B direction: minimal composition with one bolder accent shape (circle or line) used sparingly.";
  }
  return "Option C direction: minimal composition with stronger photo-like grain/texture emphasis while preserving clean negative space.";
}

function shapeCompositionHint(shape: PreviewShape): string {
  if (shape === "wide") {
    return "Reserve at least the left 55% as clean negative space for typography; keep art interest mostly to the right.";
  }
  if (shape === "tall") {
    return "Reserve upper-middle area as clean negative space for typography; keep heavier art in the lower third.";
  }
  return "Reserve large left-center negative space for typography and keep accents subtle near edges.";
}

function readFeedbackRequest(input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return "";
  }

  const feedback = (input as { feedback?: unknown }).feedback;
  if (!feedback || typeof feedback !== "object" || Array.isArray(feedback)) {
    return "";
  }

  const request = (feedback as { request?: unknown }).request;
  return typeof request === "string" ? truncateForPrompt(request, 220) : "";
}

function buildCleanMinimalBackgroundPrompt(params: {
  project: GenerationProjectContext;
  palette: string[];
  shape: PreviewShape;
  generationId: string;
  optionIndex: number;
  feedbackRequest?: string;
}): string {
  const title = truncateForPrompt(params.project.series_title, 120);
  const subtitle = truncateForPrompt(params.project.series_subtitle, 120);
  const scripture = truncateForPrompt(params.project.scripture_passages, 140);
  const description = truncateForPrompt(params.project.series_description, 280);
  const paletteHint =
    params.palette.length > 0
      ? `Use restrained tones influenced by this palette: ${params.palette.join(", ")}.`
      : "Use a neutral clean-minimal palette with soft whites, warm grays, slate, and one subtle accent.";

  return [
    "Create a premium sermon-series BACKGROUND only.",
    "No text, no letters, no words, no logos, no watermark.",
    "Clean minimal aesthetic: generous whitespace, subtle paper texture, disciplined geometric accents, calm editorial balance.",
    shapeCompositionHint(params.shape),
    optionStyleDirectionHint(params.optionIndex),
    title ? `Series title context: ${title}.` : "",
    subtitle ? `Series subtitle context: ${subtitle}.` : "",
    scripture ? `Scripture context: ${scripture}.` : "",
    description ? `Series description mood context: ${description}.` : "",
    paletteHint,
    params.feedbackRequest ? `Refinement cues: ${params.feedbackRequest}.` : "",
    `Variation seed: ${params.generationId}-${params.shape}.`
  ]
    .filter(Boolean)
    .join(" ");
}

function toPngDataUrl(pngBuffer: Buffer): string {
  return `data:image/png;base64,${pngBuffer.toString("base64")}`;
}

function readUsedStylePathsFromOutput(output: unknown): string[] {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return [];
  }

  const meta = (output as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return [];
  }

  const paths = (meta as { usedStylePaths?: unknown }).usedStylePaths;
  return Array.isArray(paths) ? getUniqueStrings(paths) : [];
}

function styleDirectionToOptionIndex(styleDirection: "option_a" | "option_b" | "option_c" | "different"): number | null {
  if (styleDirection === "option_a") {
    return 0;
  }
  if (styleDirection === "option_b") {
    return 1;
  }
  if (styleDirection === "option_c") {
    return 2;
  }
  return null;
}

type GenerationProjectContext = {
  series_title: string;
  series_subtitle: string | null;
  scripture_passages: string | null;
  series_description: string | null;
  brandKit: {
    paletteJson: string;
    logoPath: string | null;
  } | null;
};

type BuildGenerationOutputParams = {
  projectId: string;
  presetKey: string;
  project: GenerationProjectContext;
  input: unknown;
  round: number;
  optionIndex: number;
  styleRefs?: StyleRef[];
  revisedPrompt?: string;
};

type GenerationOutputPayload = {
  designDoc: DesignDoc;
  designDocByShape: Record<PreviewShape, DesignDoc>;
  notes: string;
  promptUsed?: string;
  meta: {
    styleRefCount: number;
    usedStylePaths: string[];
    revisedPrompt?: string;
  };
  preview?: {
    square_main: string;
    widescreen_main: string;
    vertical_main: string;
  };
};

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
    backgroundImagePath: designDoc.backgroundImagePath,
    background: designDoc.background,
    layers
  };
}

function buildFallbackGenerationOutput(params: BuildGenerationOutputParams): GenerationOutputPayload {
  const palette = params.project.brandKit ? parsePaletteJson(params.project.brandKit.paletteJson) : [];

  const buildDocForShape = (shape?: PreviewShape) =>
    buildFallbackDesignDoc({
      output: null,
      input: params.input,
      presetKey: params.presetKey,
      shape,
      round: params.round,
      optionIndex: params.optionIndex,
      project: {
        seriesTitle: params.project.series_title,
        seriesSubtitle: params.project.series_subtitle,
        scripturePassages: params.project.scripture_passages,
        seriesDescription: params.project.series_description,
        logoPath: params.project.brandKit?.logoPath || null,
        palette
      }
    });

  const designDocByShape = {} as Record<PreviewShape, DesignDoc>;
  if (params.presetKey === "type_clean_min_v1") {
    for (const shape of PREVIEW_SHAPES) {
      designDocByShape[shape] = buildDocForShape(shape);
    }
  } else {
    const fallbackDesignDoc = buildDocForShape();
    for (const shape of PREVIEW_SHAPES) {
      const shapeDimensions = PREVIEW_DIMENSIONS[shape];
      designDocByShape[shape] = adaptDesignDocToDimensions(
        fallbackDesignDoc,
        shapeDimensions.width,
        shapeDimensions.height
      );
    }
  }

  return {
    designDoc: designDocByShape.square,
    designDocByShape,
    notes: `Fallback layout: ${params.presetKey} | variant ${params.optionIndex % 3}`,
    meta: {
      styleRefCount: params.styleRefs?.length || 0,
      usedStylePaths: (params.styleRefs || []).map((ref) => ref.path),
      revisedPrompt: params.revisedPrompt
    }
  };
}

async function getProjectForGeneration(projectId: string, organizationId: string) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId
    },
    select: {
      id: true,
      series_title: true,
      series_subtitle: true,
      scripture_passages: true,
      series_description: true,
      brandKit: {
        select: {
          websiteUrl: true,
          typographyDirection: true,
          paletteJson: true,
          logoPath: true
        }
      }
    }
  });
}

function buildGenerationInput(
  project: {
    series_title: string;
    series_subtitle: string | null;
    scripture_passages: string | null;
    series_description: string | null;
  },
  brandKit: {
    websiteUrl: string;
    typographyDirection: "match_site" | "graceled_defaults";
    paletteJson: string;
  },
  selectedPresetKeys: string[] = []
) {
  return {
    series_title: project.series_title,
    series_subtitle: project.series_subtitle,
    scripture_passages: project.scripture_passages,
    series_description: project.series_description,
    websiteUrl: brandKit.websiteUrl,
    typographyDirection: brandKit.typographyDirection,
    palette: parsePaletteJson(brandKit.paletteJson),
    selectedPresetKeys
  };
}

async function findInternalLayoutPresetId(organizationId: string): Promise<string | null> {
  const preset = await prisma.preset.findFirst({
    where: {
      key: INTERNAL_LAYOUT_PRESET_KEY,
      enabled: true,
      OR: [{ organizationId: null }, { organizationId }]
    },
    select: {
      id: true
    }
  });

  return preset?.id || null;
}

function normalizeStyleRefsForOptions(input: StyleRef[][], optionCount: number): StyleRef[][] {
  return Array.from({ length: optionCount }, (_, optionIndex) => {
    const refs = input[optionIndex] || [];
    return refs.slice(0, 6);
  });
}

async function loadStyleRefsByPaths(paths: string[]): Promise<StyleRef[]> {
  const uniquePaths = getUniqueStrings(paths);
  if (uniquePaths.length === 0) {
    return [];
  }

  const allRefs = await listStyleRefs();
  const byPath = new Map(allRefs.map((ref) => [ref.path, ref] as const));
  return uniquePaths.map((item) => byPath.get(item)).filter((ref): ref is StyleRef => Boolean(ref)).slice(0, 6);
}

type PlannedGeneration = {
  id: string;
  presetId: string | null;
  presetKey: string;
  round: number;
  optionIndex: number;
  styleRefs: StyleRef[];
  input: Prisma.InputJsonValue;
  fallbackOutput: GenerationOutputPayload;
};

function isOpenAiPreviewGenerationEnabled(): boolean {
  const raw = process.env.OPENAI_IMAGE_PREVIEWS_ENABLED?.trim().toLowerCase();
  if (!raw) {
    return true;
  }

  return !["0", "false", "off", "no"].includes(raw);
}

async function writeGenerationPreviewFiles(params: {
  fileName: string;
  png: Buffer;
}): Promise<string> {
  const uploadDirectory = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDirectory, { recursive: true });
  await writeFile(path.join(uploadDirectory, params.fileName), params.png);
  return path.posix.join("uploads", params.fileName);
}

async function normalizePngToShape(png: Buffer, shape: PreviewShape): Promise<Buffer> {
  const dimensions = PREVIEW_DIMENSIONS[shape];
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

async function generateCleanMinimalBackgroundPng(params: {
  prompt: string;
  shape: PreviewShape;
  referenceCollageDataUrl?: string;
}): Promise<Buffer> {
  const size = OPENAI_IMAGE_SIZE_BY_SHAPE[params.shape];

  if (params.referenceCollageDataUrl) {
    try {
      return await generatePngFromPrompt({
        prompt: params.prompt,
        size,
        references: [{ dataUrl: params.referenceCollageDataUrl }]
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown reference-guided generation error";
      console.warn(`Reference-guided generation failed for ${params.shape}; retrying prompt-only. ${message}`);
    }
  }

  return generatePngFromPrompt({
    prompt: params.prompt,
    size
  });
}

async function renderCompositedPreviewPng(designDoc: DesignDoc): Promise<Buffer> {
  const svg = await buildFinalSvg(designDoc);
  return sharp(Buffer.from(svg))
    .resize({
      width: designDoc.width,
      height: designDoc.height,
      fit: "fill",
      position: "center"
    })
    .png()
    .toBuffer();
}

async function completeGenerationWithFallbackOutput(params: {
  projectId: string;
  generationId: string;
  output: GenerationOutputPayload;
}): Promise<void> {
  const designDocByShape = params.output.designDocByShape;
  const [squarePng, widePng, tallPng] = await Promise.all([
    renderCompositedPreviewPng(designDocByShape.square),
    renderCompositedPreviewPng(designDocByShape.wide),
    renderCompositedPreviewPng(designDocByShape.tall)
  ]);
  const [squarePath, widePath, tallPath] = await Promise.all([
    writeGenerationPreviewFiles({
      fileName: `${params.generationId}-square.png`,
      png: squarePng
    }),
    writeGenerationPreviewFiles({
      fileName: `${params.generationId}-wide.png`,
      png: widePng
    }),
    writeGenerationPreviewFiles({
      fileName: `${params.generationId}-tall.png`,
      png: tallPng
    })
  ]);
  const finalAssetRows: Prisma.AssetCreateManyInput[] = PREVIEW_SHAPES.map((shape) => ({
    projectId: params.projectId,
    generationId: params.generationId,
    kind: "IMAGE",
    slot: FINAL_ASSET_SLOT_BY_SHAPE[shape],
    file_path: shape === "square" ? squarePath : shape === "wide" ? widePath : tallPath,
    mime_type: "image/png",
    width: PREVIEW_DIMENSIONS[shape].width,
    height: PREVIEW_DIMENSIONS[shape].height
  }));

  const completedOutput: GenerationOutputPayload = {
    ...params.output,
    preview: {
      square_main: squarePath,
      widescreen_main: widePath,
      vertical_main: tallPath
    }
  };

  await prisma.$transaction([
    prisma.asset.deleteMany({
      where: {
        generationId: params.generationId,
        slot: {
          in: [...PREVIEW_ASSET_SLOTS_TO_CLEAR]
        }
      }
    }),
    prisma.asset.createMany({
      data: finalAssetRows
    }),
    prisma.generation.update({
      where: { id: params.generationId },
      data: {
        status: "COMPLETED",
        output: completedOutput as Prisma.InputJsonValue
      }
    })
  ]);
}

async function createOpenAiPreviewAssetsForPlannedGenerations(params: {
  project: GenerationProjectContext & { id: string };
  plannedGenerations: PlannedGeneration[];
}): Promise<void> {
  const openAiEnabled = isOpenAiPreviewGenerationEnabled() && Boolean(process.env.OPENAI_API_KEY?.trim());

  for (const plannedGeneration of params.plannedGenerations) {
    const fallbackOutput = plannedGeneration.fallbackOutput;

    if (!openAiEnabled) {
      await completeGenerationWithFallbackOutput({
        projectId: params.project.id,
        generationId: plannedGeneration.id,
        output: fallbackOutput
      });
      continue;
    }

    try {
      const palette = params.project.brandKit ? parsePaletteJson(params.project.brandKit.paletteJson) : [];
      const feedbackRequest = readFeedbackRequest(plannedGeneration.input);
      const content = {
        title: params.project.series_title,
        subtitle: params.project.series_subtitle,
        passage: params.project.scripture_passages,
        description: params.project.series_description
      };
      const pickedReferences = await pickReferences({ count: 4, mode: "clean-minimal" });
      const usedReferencePaths = pickedReferences.map((item) => item.relativePath);

      let collageReferenceDataUrl: string | undefined;
      if (usedReferencePaths.length > 0) {
        try {
          const collageBuffer = await buildReferenceCollageBuffer(usedReferencePaths);
          collageReferenceDataUrl = toPngDataUrl(collageBuffer);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown collage error";
          console.warn(`Failed to build reference collage for generation ${plannedGeneration.id}. ${message}`);
        }
      }

      const shapeResults = await Promise.all(
        PREVIEW_SHAPES.map(async (shape) => {
          const prompt = buildCleanMinimalBackgroundPrompt({
            project: params.project,
            palette,
            shape,
            generationId: plannedGeneration.id,
            optionIndex: plannedGeneration.optionIndex,
            feedbackRequest
          });

          const backgroundSource = await generateCleanMinimalBackgroundPng({
            prompt,
            shape,
            referenceCollageDataUrl: collageReferenceDataUrl
          });
          const backgroundPng = await normalizePngToShape(backgroundSource, shape);
          const backgroundPath = await writeGenerationPreviewFiles({
            fileName: `${plannedGeneration.id}-${shape}-bg.png`,
            png: backgroundPng
          });

          const dimensions = PREVIEW_DIMENSIONS[shape];
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

          const finalPath = await writeGenerationPreviewFiles({
            fileName: `${plannedGeneration.id}-${shape}.png`,
            png: finalPng
          });

          return {
            shape,
            prompt,
            backgroundPath,
            finalPath,
            designDoc: buildCleanMinimalDesignDoc({
              width: dimensions.width,
              height: dimensions.height,
              content,
              palette: textPalette,
              backgroundImagePath: backgroundPath
            })
          };
        })
      );

      const promptUsed = shapeResults.map((result) => `${result.shape}: ${result.prompt}`).join("\n");
      const byShape = Object.fromEntries(shapeResults.map((result) => [result.shape, result])) as Record<
        PreviewShape,
        (typeof shapeResults)[number]
      >;
      const designDocByShape: Record<PreviewShape, DesignDoc> = {
        square: byShape.square.designDoc,
        wide: byShape.wide.designDoc,
        tall: byShape.tall.designDoc
      };

      const backgroundAssetRows: Prisma.AssetCreateManyInput[] = PREVIEW_SHAPES.map((shape) => ({
        projectId: params.project.id,
        generationId: plannedGeneration.id,
        kind: "IMAGE",
        slot: BACKGROUND_ASSET_SLOT_BY_SHAPE[shape],
        file_path: byShape[shape].backgroundPath,
        mime_type: "image/png",
        width: PREVIEW_DIMENSIONS[shape].width,
        height: PREVIEW_DIMENSIONS[shape].height
      }));
      const finalAssetRows: Prisma.AssetCreateManyInput[] = PREVIEW_SHAPES.map((shape) => ({
        projectId: params.project.id,
        generationId: plannedGeneration.id,
        kind: "IMAGE",
        slot: FINAL_ASSET_SLOT_BY_SHAPE[shape],
        file_path: byShape[shape].finalPath,
        mime_type: "image/png",
        width: PREVIEW_DIMENSIONS[shape].width,
        height: PREVIEW_DIMENSIONS[shape].height
      }));

      const completedOutput: GenerationOutputPayload = {
        ...fallbackOutput,
        designDoc: designDocByShape.square,
        designDocByShape,
        notes: "ai+clean-min-overlay",
        promptUsed,
        meta: {
          styleRefCount: usedReferencePaths.length,
          usedStylePaths: usedReferencePaths
        },
        preview: {
          square_main: byShape.square.finalPath,
          widescreen_main: byShape.wide.finalPath,
          vertical_main: byShape.tall.finalPath
        }
      };

      await prisma.$transaction([
        prisma.asset.deleteMany({
          where: {
            generationId: plannedGeneration.id,
            slot: {
              in: [...PREVIEW_ASSET_SLOTS_TO_CLEAR]
            }
          }
        }),
        prisma.asset.createMany({
          data: [...backgroundAssetRows, ...finalAssetRows]
        }),
        prisma.generation.update({
          where: {
            id: plannedGeneration.id
          },
          data: {
            status: "COMPLETED",
            output: completedOutput as Prisma.InputJsonValue
          }
        })
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `OpenAI preview generation failed for generation ${plannedGeneration.id} (${plannedGeneration.presetKey}). Falling back to layout-only output. ${message}`
      );

      await completeGenerationWithFallbackOutput({
        projectId: params.project.id,
        generationId: plannedGeneration.id,
        output: fallbackOutput
      });
    }
  }
}

export async function createProjectAction(
  _: ProjectActionState,
  formData: FormData
): Promise<ProjectActionState> {
  const session = await requireSession();

  const parsed = createProjectSchema.safeParse({
    series_title: formData.get("series_title"),
    series_subtitle: formData.get("series_subtitle") || undefined,
    scripture_passages: formData.get("scripture_passages") || undefined,
    series_description: formData.get("series_description") || undefined
  });

  if (!parsed.success) {
    return { error: "Series title is required." };
  }

  const project = await prisma.project.create({
    data: {
      organizationId: session.organizationId,
      createdById: session.userId,
      series_title: parsed.data.series_title,
      series_subtitle: parsed.data.series_subtitle || null,
      scripture_passages: parsed.data.scripture_passages || null,
      series_description: parsed.data.series_description || null
    }
  });

  redirect(`/app/projects/${project.id}/brand`);
}

export async function deleteProjectAction(projectId: string): Promise<void> {
  const session = await requireSession();

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId: session.organizationId
    },
    select: {
      id: true
    }
  });

  if (!project) {
    redirect("/app/projects");
  }

  await prisma.$transaction(async (tx) => {
    await tx.asset.deleteMany({
      where: {
        projectId: project.id
      }
    });

    await tx.finalDesign.deleteMany({
      where: {
        projectId: project.id
      }
    });

    await tx.generation.deleteMany({
      where: {
        projectId: project.id
      }
    });

    await tx.brandKit.deleteMany({
      where: {
        projectId: project.id
      }
    });

    await tx.project.delete({
      where: {
        id: project.id
      }
    });
  });

  revalidatePath("/app/projects");
  redirect("/app/projects");
}

export async function saveBrandKitAction(
  projectId: string,
  _: BrandKitActionState,
  formData: FormData
): Promise<BrandKitActionState> {
  const session = await requireSession();

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId: session.organizationId
    },
    select: { id: true }
  });

  if (!project) {
    return { error: "Project not found." };
  }

  const rawPalette = parsePalette(formData.get("palette_json"));
  if (!rawPalette) {
    return { error: "Palette data is invalid. Please re-add your colors." };
  }

  const parsed = saveBrandKitSchema.safeParse({
    websiteUrl: formData.get("website_url"),
    typographyDirection: formData.get("typography_direction"),
    palette: rawPalette
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Please correct the brand kit fields and try again." };
  }

  const normalizedWebsiteUrl = normalizeWebsiteUrl(parsed.data.websiteUrl);
  if (!normalizedWebsiteUrl) {
    return { error: WEBSITE_URL_ERROR_MESSAGE };
  }

  const logoUpload = formData.get("logo_upload");
  if (logoUpload && logoUpload instanceof File && logoUpload.size > 0 && !isAllowedLogoUpload(logoUpload)) {
    return { error: "Logo must be a PNG, JPG, or SVG file." };
  }

  const existingBrandKit = await prisma.brandKit.findUnique({
    where: { projectId },
    select: { logoPath: true }
  });

  let logoPath = existingBrandKit?.logoPath || null;
  if (logoUpload && logoUpload instanceof File && logoUpload.size > 0) {
    logoPath = await saveLogoUpload(logoUpload);
  }

  await prisma.brandKit.upsert({
    where: { projectId },
    create: {
      organizationId: session.organizationId,
      projectId,
      websiteUrl: normalizedWebsiteUrl,
      logoPath,
      paletteJson: JSON.stringify(parsed.data.palette),
      typographyDirection: parsed.data.typographyDirection
    },
    update: {
      organizationId: session.organizationId,
      websiteUrl: normalizedWebsiteUrl,
      logoPath,
      paletteJson: JSON.stringify(parsed.data.palette),
      typographyDirection: parsed.data.typographyDirection
    }
  });

  redirect(`/app/projects/${projectId}`);
}

export async function generateRoundOneAction(
  projectId: string,
  _: GenerationActionState,
  _formData: FormData
): Promise<GenerationActionState> {
  const session = await requireSession();

  const project = await getProjectForGeneration(projectId, session.organizationId);
  if (!project) {
    return { error: "Project not found." };
  }

  if (!project.brandKit) {
    return { error: "Set up the brand kit before generating directions." };
  }

  const presetId = await findInternalLayoutPresetId(session.organizationId);
  const refsForOptions = normalizeStyleRefsForOptions(await pickStyleRefsForOptions(ROUND_OPTION_COUNT), ROUND_OPTION_COUNT);
  const input = buildGenerationInput(project, project.brandKit);

  const plannedGenerations: PlannedGeneration[] = Array.from({ length: ROUND_OPTION_COUNT }, (_, index) => {
    const generationId = randomUUID();
    const styleRefs = refsForOptions[index] || [];

    return {
      id: generationId,
      presetId,
      presetKey: INTERNAL_LAYOUT_PRESET_KEY,
      round: 1,
      optionIndex: index,
      styleRefs,
      input: input as Prisma.InputJsonValue,
      fallbackOutput: buildFallbackGenerationOutput({
        projectId: project.id,
        presetKey: INTERNAL_LAYOUT_PRESET_KEY,
        project,
        input,
        round: 1,
        optionIndex: index,
        styleRefs
      })
    };
  });

  await prisma.$transaction(
    plannedGenerations.map(({ id: generationId, presetId: generationPresetId, input: generationInput }) =>
      prisma.generation.create({
        data: {
          id: generationId,
          projectId: project.id,
          presetId: generationPresetId,
          round: 1,
          status: "RUNNING",
          input: generationInput
        }
      })
    )
  );

  await createOpenAiPreviewAssetsForPlannedGenerations({
    project,
    plannedGenerations
  });

  redirect(`/app/projects/${projectId}/generations`);
}

export async function generateRoundTwoAction(
  projectId: string,
  _: RoundFeedbackActionState,
  formData: FormData
): Promise<RoundFeedbackActionState> {
  const session = await requireSession();

  const project = await getProjectForGeneration(projectId, session.organizationId);
  if (!project) {
    return { error: "Project not found." };
  }

  if (!project.brandKit) {
    return { error: "Set up the brand kit before generating directions." };
  }

  const parsed = generateRoundTwoSchema.safeParse({
    currentRound: formData.get("currentRound"),
    chosenGenerationId: formData.get("chosenGenerationId") || undefined,
    feedbackText: formData.get("feedbackText") || undefined,
    emphasis: formData.get("emphasis"),
    expressiveness: formData.get("expressiveness"),
    temperature: formData.get("temperature"),
    styleDirection: formData.get("styleDirection") || "different"
  });

  if (!parsed.success) {
    return { error: "Please review your feedback inputs and try again." };
  }

  const chosenGenerationId = parsed.data.chosenGenerationId || null;
  const chosenGeneration = chosenGenerationId
    ? await prisma.generation.findFirst({
        where: {
          id: chosenGenerationId,
          projectId: project.id
        },
        select: {
          id: true,
          input: true,
          output: true
        }
      })
    : null;

  if (chosenGenerationId && !chosenGeneration) {
    return { error: "Selected direction was not found for this project." };
  }

  const presetId = await findInternalLayoutPresetId(session.organizationId);
  const input = {
    ...buildGenerationInput(project, project.brandKit),
    feedback: {
      sourceRound: parsed.data.currentRound,
      chosenGenerationId,
      request: parsed.data.feedbackText || "",
      emphasis: parsed.data.emphasis,
      expressiveness: parsed.data.expressiveness,
      temperature: parsed.data.temperature,
      styleDirection: parsed.data.styleDirection
    }
  };

  const round = parsed.data.currentRound + 1;
  let refsForOptions = normalizeStyleRefsForOptions(await pickStyleRefsForOptions(ROUND_OPTION_COUNT), ROUND_OPTION_COUNT);
  const selectedOptionIndex = styleDirectionToOptionIndex(parsed.data.styleDirection);

  if (selectedOptionIndex !== null) {
    const currentRoundGenerations = await prisma.generation.findMany({
      where: {
        projectId: project.id,
        round: parsed.data.currentRound
      },
      orderBy: {
        createdAt: "asc"
      },
      select: {
        output: true
      }
    });

    const sourceOutput = currentRoundGenerations[selectedOptionIndex]?.output ?? chosenGeneration?.output ?? null;
    const usedStylePaths = readUsedStylePathsFromOutput(sourceOutput);
    const reusedRefs = await loadStyleRefsByPaths(usedStylePaths);
    if (reusedRefs.length > 0) {
      refsForOptions = Array.from({ length: ROUND_OPTION_COUNT }, () => reusedRefs);
    }
  }

  const plannedGenerations: PlannedGeneration[] = Array.from({ length: ROUND_OPTION_COUNT }, (_, index) => {
    const generationId = randomUUID();
    const styleRefs = refsForOptions[index] || [];

    return {
      id: generationId,
      presetId,
      presetKey: INTERNAL_LAYOUT_PRESET_KEY,
      round,
      optionIndex: index,
      styleRefs,
      input: input as Prisma.InputJsonValue,
      fallbackOutput: buildFallbackGenerationOutput({
        projectId: project.id,
        presetKey: INTERNAL_LAYOUT_PRESET_KEY,
        project,
        input,
        round,
        optionIndex: index,
        styleRefs
      })
    };
  });

  await prisma.$transaction(
    plannedGenerations.map(({ id: generationId, presetId: generationPresetId, input: generationInput }) =>
      prisma.generation.create({
        data: {
          id: generationId,
          projectId: project.id,
          presetId: generationPresetId,
          round,
          status: "RUNNING",
          input: generationInput
        }
      })
    )
  );

  await createOpenAiPreviewAssetsForPlannedGenerations({
    project,
    plannedGenerations
  });

  redirect(`/app/projects/${projectId}/generations`);
}

export async function approveFinalDesignAction(projectId: string, generationId: string, optionKeyRaw: string): Promise<void> {
  const session = await requireSession();
  const normalizedOptionKey = optionKeyRaw.trim().toUpperCase().slice(0, 1);

  if (!/^[A-Z]$/.test(normalizedOptionKey)) {
    return;
  }

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      organizationId: session.organizationId
    },
    select: {
      id: true,
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
  });

  if (!project) {
    return;
  }

  const generation = await prisma.generation.findFirst({
    where: {
      id: generationId,
      projectId: project.id
    },
    select: {
      id: true,
      round: true,
      input: true,
      output: true
    }
  });

  if (!generation) {
    return;
  }

  const optionIndex = Math.max(0, normalizedOptionKey.charCodeAt(0) - 65);
  const palette = project.brandKit ? parsePaletteJson(project.brandKit.paletteJson) : [];
  const designDoc = buildFinalDesignDoc({
    output: generation.output,
    input: generation.input,
    round: generation.round,
    optionIndex,
    project: {
      seriesTitle: project.series_title,
      seriesSubtitle: project.series_subtitle,
      scripturePassages: project.scripture_passages,
      seriesDescription: project.series_description,
      logoPath: project.brandKit?.logoPath || null,
      palette
    }
  });

  await prisma.finalDesign.upsert({
    where: {
      projectId: project.id
    },
    create: {
      projectId: project.id,
      generationId: generation.id,
      round: generation.round,
      optionKey: normalizedOptionKey,
      optionLabel: optionLabel(optionIndex),
      designJson: designDoc as Prisma.InputJsonValue
    },
    update: {
      generationId: generation.id,
      round: generation.round,
      optionKey: normalizedOptionKey,
      optionLabel: optionLabel(optionIndex),
      designJson: designDoc as Prisma.InputJsonValue
    }
  });

  revalidatePath(`/app/projects/${project.id}/generations`);
}
