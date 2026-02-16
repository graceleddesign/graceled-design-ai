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
import { generatePngFromPrompt } from "@/lib/openai-image";
import { optionLabel } from "@/lib/option-label";
import { buildBackgroundPrompt } from "@/lib/preset-prompts";
import { prisma } from "@/lib/prisma";

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
  temperature: z.coerce.number().int().min(0).max(100)
});
const MIN_ROUND_ONE_PRESETS = 3;
const PREVIEW_SHAPES = ["square", "wide", "tall"] as const;
type PreviewShape = (typeof PREVIEW_SHAPES)[number];
type PreviewAssetSlot = "square_main" | "widescreen_main" | "vertical_main";

const PREVIEW_DIMENSIONS: Record<PreviewShape, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  wide: { width: 1920, height: 1080 },
  tall: { width: 1080, height: 1920 }
};
const PREVIEW_ASSET_SLOTS: readonly PreviewAssetSlot[] = ["square_main", "widescreen_main", "vertical_main"];
const PREVIEW_ASSET_DIMENSIONS: Record<PreviewAssetSlot, { width: number; height: number }> = {
  square_main: { width: 1080, height: 1080 },
  widescreen_main: { width: 1920, height: 1080 },
  vertical_main: { width: 1080, height: 1920 }
};

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
};

type GenerationOutputPayload = {
  designDoc: DesignDoc;
  designDocByShape: Record<PreviewShape, DesignDoc>;
  notes: string;
  promptUsed?: string;
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
    background: designDoc.background,
    layers
  };
}

function buildFallbackGenerationOutput(params: BuildGenerationOutputParams): GenerationOutputPayload {
  const palette = params.project.brandKit ? parsePaletteJson(params.project.brandKit.paletteJson) : [];

  const fallbackDesignDoc = buildFallbackDesignDoc({
    output: null,
    input: params.input,
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
  for (const shape of PREVIEW_SHAPES) {
    const shapeDimensions = PREVIEW_DIMENSIONS[shape];
    designDocByShape[shape] = adaptDesignDocToDimensions(
      fallbackDesignDoc,
      shapeDimensions.width,
      shapeDimensions.height
    );
  }

  return {
    designDoc: designDocByShape.square,
    designDocByShape,
    notes: `Fallback layout: ${params.presetKey} | variant ${params.optionIndex % 3}`
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
  selectedPresetKeys: string[]
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

type PlannedGeneration = {
  id: string;
  preset: {
    id: string;
    key: string;
  };
  round: number;
  optionIndex: number;
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
  generationId: string;
  squarePng: Buffer;
}): Promise<{
  squarePath: string;
  widescreenPath: string;
  verticalPath: string;
}> {
  const uploadDirectory = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDirectory, { recursive: true });

  const squareFileName = `${params.generationId}-square.png`;
  const wideFileName = `${params.generationId}-wide.png`;
  const tallFileName = `${params.generationId}-tall.png`;

  const squarePng = await sharp(params.squarePng).png().toBuffer();
  const widePng = await sharp(squarePng)
    .resize({
      width: PREVIEW_ASSET_DIMENSIONS.widescreen_main.width,
      height: PREVIEW_ASSET_DIMENSIONS.widescreen_main.height,
      fit: "cover",
      position: "center"
    })
    .png()
    .toBuffer();
  const tallPng = await sharp(squarePng)
    .resize({
      width: PREVIEW_ASSET_DIMENSIONS.vertical_main.width,
      height: PREVIEW_ASSET_DIMENSIONS.vertical_main.height,
      fit: "cover",
      position: "center"
    })
    .png()
    .toBuffer();

  await Promise.all([
    writeFile(path.join(uploadDirectory, squareFileName), squarePng),
    writeFile(path.join(uploadDirectory, wideFileName), widePng),
    writeFile(path.join(uploadDirectory, tallFileName), tallPng)
  ]);

  return {
    squarePath: `/uploads/${squareFileName}`,
    widescreenPath: `/uploads/${wideFileName}`,
    verticalPath: `/uploads/${tallFileName}`
  };
}

async function completeGenerationWithFallbackOutput(params: {
  generationId: string;
  output: GenerationOutputPayload;
}): Promise<void> {
  await prisma.$transaction([
    prisma.asset.deleteMany({
      where: {
        generationId: params.generationId,
        slot: {
          in: [...PREVIEW_ASSET_SLOTS, "square", "wide", "tall"]
        }
      }
    }),
    prisma.generation.update({
      where: { id: params.generationId },
      data: {
        status: "COMPLETED",
        output: params.output as Prisma.InputJsonValue
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
        generationId: plannedGeneration.id,
        output: fallbackOutput
      });
      continue;
    }

    try {
      const palette = params.project.brandKit ? parsePaletteJson(params.project.brandKit.paletteJson) : [];
      const promptUsed = buildBackgroundPrompt({
        presetKey: plannedGeneration.preset.key,
        project: {
          seriesTitle: params.project.series_title,
          seriesSubtitle: params.project.series_subtitle,
          scripturePassages: params.project.scripture_passages,
          seriesDescription: params.project.series_description
        },
        palette,
        seed: plannedGeneration.id
      });

      const squarePng = await generatePngFromPrompt({
        prompt: promptUsed,
        size: "1024x1024"
      });
      const generatedAssets = await writeGenerationPreviewFiles({
        generationId: plannedGeneration.id,
        squarePng
      });

      const assetRows: Prisma.AssetCreateManyInput[] = PREVIEW_ASSET_SLOTS.map((slot) => ({
        projectId: params.project.id,
        generationId: plannedGeneration.id,
        kind: "IMAGE",
        slot,
        file_path:
          slot === "square_main"
            ? generatedAssets.squarePath
            : slot === "widescreen_main"
              ? generatedAssets.widescreenPath
              : generatedAssets.verticalPath,
        mime_type: "image/png",
        width: PREVIEW_ASSET_DIMENSIONS[slot].width,
        height: PREVIEW_ASSET_DIMENSIONS[slot].height
      }));
      const completedOutput: GenerationOutputPayload = {
        ...fallbackOutput,
        notes: "openai_background_generated",
        promptUsed,
        preview: {
          square_main: generatedAssets.squarePath,
          widescreen_main: generatedAssets.widescreenPath,
          vertical_main: generatedAssets.verticalPath
        }
      };

      await prisma.$transaction([
        prisma.asset.deleteMany({
          where: {
            generationId: plannedGeneration.id,
            slot: {
              in: [...PREVIEW_ASSET_SLOTS, "square", "wide", "tall"]
            }
          }
        }),
        prisma.asset.createMany({
          data: assetRows
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
        `OpenAI preview generation failed for generation ${plannedGeneration.id} (${plannedGeneration.preset.key}). Falling back to layout-only output. ${message}`
      );

      await completeGenerationWithFallbackOutput({
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
  formData: FormData
): Promise<GenerationActionState> {
  const session = await requireSession();

  const project = await getProjectForGeneration(projectId, session.organizationId);
  if (!project) {
    return { error: "Project not found." };
  }

  if (!project.brandKit) {
    return { error: "Set up the brand kit before generating directions." };
  }

  const selectedPresetKeys = getUniqueStrings(formData.getAll("selectedPresetKeys"));
  if (selectedPresetKeys.length < MIN_ROUND_ONE_PRESETS) {
    return { error: `Select at least ${MIN_ROUND_ONE_PRESETS} preset lanes.` };
  }

  const selectedPresets = await prisma.preset.findMany({
    where: {
      key: { in: selectedPresetKeys },
      enabled: true,
      OR: [{ organizationId: null }, { organizationId: session.organizationId }]
    },
    select: {
      id: true,
      key: true
    }
  });

  const presetByKey = new Map(selectedPresets.map((preset) => [preset.key, preset] as const));
  const orderedPresets = selectedPresetKeys
    .map((key) => presetByKey.get(key))
    .filter((preset): preset is { id: string; key: string } => Boolean(preset));

  if (orderedPresets.length !== selectedPresetKeys.length) {
    return { error: "One or more selected presets are unavailable." };
  }

  const input = buildGenerationInput(project, project.brandKit, selectedPresetKeys);

  const plannedGenerations: PlannedGeneration[] = orderedPresets.map((preset, index) => {
    const generationId = randomUUID();

    return {
      id: generationId,
      preset,
      round: 1,
      optionIndex: index,
      fallbackOutput: buildFallbackGenerationOutput({
        projectId: project.id,
        presetKey: preset.key,
        project,
        input,
        round: 1,
        optionIndex: index
      })
    };
  });

  await prisma.$transaction(
    plannedGenerations.map(({ id: generationId, preset }) =>
      prisma.generation.create({
        data: {
          id: generationId,
          projectId: project.id,
          presetId: preset.id,
          round: 1,
          status: "RUNNING",
          input
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
    temperature: formData.get("temperature")
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
          preset: {
            select: {
              key: true
            }
          }
        }
      })
    : null;

  if (chosenGenerationId && !chosenGeneration) {
    return { error: "Selected direction was not found for this project." };
  }

  const availablePresets = await prisma.preset.findMany({
    where: {
      enabled: true,
      OR: [{ organizationId: null }, { organizationId: session.organizationId }]
    },
    orderBy: [{ collection: "asc" }, { name: "asc" }],
    select: {
      id: true,
      key: true
    }
  });

  const availablePresetByKey = new Map(availablePresets.map((preset) => [preset.key, preset] as const));
  const suggestedPresetKeys = getUniqueStrings([
    chosenGeneration?.preset?.key,
    ...readSelectedPresetKeysFromInput(chosenGeneration?.input).slice(0, 3),
    ...availablePresets.map((preset) => preset.key)
  ]);

  const selectedPresets = suggestedPresetKeys
    .map((key) => availablePresetByKey.get(key))
    .filter((preset): preset is { id: string; key: string } => Boolean(preset))
    .slice(0, 3);

  if (selectedPresets.length < 3) {
    return { error: "Need at least 3 enabled presets to generate this round." };
  }

  const selectedPresetKeys = selectedPresets.map((preset) => preset.key);
  const input = {
    ...buildGenerationInput(project, project.brandKit, selectedPresetKeys),
    feedback: {
      sourceRound: parsed.data.currentRound,
      chosenGenerationId,
      request: parsed.data.feedbackText || "",
      emphasis: parsed.data.emphasis,
      expressiveness: parsed.data.expressiveness,
      temperature: parsed.data.temperature
    }
  };

  const round = parsed.data.currentRound + 1;

  const plannedGenerations: PlannedGeneration[] = selectedPresets.map((preset, index) => {
    const generationId = randomUUID();

    return {
      id: generationId,
      preset,
      round,
      optionIndex: index,
      fallbackOutput: buildFallbackGenerationOutput({
        projectId: project.id,
        presetKey: preset.key,
        project,
        input,
        round,
        optionIndex: index
      })
    };
  });

  await prisma.$transaction(
    plannedGenerations.map(({ id: generationId, preset }) =>
      prisma.generation.create({
        data: {
          id: generationId,
          projectId: project.id,
          presetId: preset.id,
          round,
          status: "RUNNING",
          input
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
