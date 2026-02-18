import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { Prisma } from "@prisma/client";
import sharp from "sharp";
import { getSession } from "@/lib/auth";
import { buildFallbackDesignDoc, type DesignDoc } from "@/lib/design-doc";
import { buildFinalSvg } from "@/lib/final-deliverables";
import { generatePngFromPrompt } from "@/lib/openai-image";
import { prisma } from "@/lib/prisma";
import { pickStyleRefsForOptions } from "@/lib/style-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERNAL_LAYOUT_PRESET_KEY = "type_clean_min_v1";
const PREVIEW_SHAPES = ["square", "wide", "tall"] as const;
type PreviewShape = (typeof PREVIEW_SHAPES)[number];

const PREVIEW_DIMENSIONS: Record<PreviewShape, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  wide: { width: 1920, height: 1080 },
  tall: { width: 1080, height: 1920 }
};

const OPENAI_IMAGE_SIZE_BY_SHAPE: Record<PreviewShape, "1024x1024" | "1536x1024" | "1024x1536"> = {
  square: "1024x1024",
  wide: "1536x1024",
  tall: "1024x1536"
};
const OPTION_MASTER_BACKGROUND_SHAPE: PreviewShape = "wide";

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

function paletteSummary(palette: string[]): string {
  if (palette.length === 0) {
    return "Brand palette: refined neutrals with one restrained accent.";
  }

  return `Brand palette: ${palette.join(", ")}.`;
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

function buildPrompt(params: {
  seriesTitle: string;
  seriesSubtitle: string | null;
  scripturePassages: string | null;
  seriesDescription: string | null;
  palette: string[];
  shape: PreviewShape;
  generationId: string;
}): string {
  const source = [
    params.seriesTitle,
    params.seriesSubtitle || "",
    params.scripturePassages || "",
    params.seriesDescription || ""
  ]
    .join(" ")
    .toLowerCase();
  const ruthHint = /\bruth\b/.test(source)
    ? "Subtle topic motifs: wheat, barley, gleaning fields, harvest texture, and quiet Bethlehem-era atmosphere."
    : "Keep motif language symbolic and understated.";

  return [
    "Create an original premium sermon series background image only.",
    "AI output must include background/texture/art elements only.",
    "NO TEXT, NO LETTERS, NO WORDS, NO TYPOGRAPHY, NO SIGNAGE, NO WATERMARKS.",
    "Never render typographic characters or symbol clusters that read as text.",
    "Composition: premium sermon series graphic background, big clean negative space reserved for typography, subtle paper/film texture, restrained geometric accents.",
    "Default to abstract textures, subtle paper grain, geometric motifs, and minimal illustration accents.",
    "Avoid literal scene photos unless explicitly requested by user context.",
    "Negative scene list: highway, road, cars, city, skyscraper, traffic, street signs, billboards.",
    ruthHint,
    shapeCompositionHint(params.shape),
    truncateForPrompt(params.seriesTitle, 120) ? `Series title: ${truncateForPrompt(params.seriesTitle, 120)}.` : "",
    truncateForPrompt(params.seriesSubtitle, 120) ? `Series subtitle: ${truncateForPrompt(params.seriesSubtitle, 120)}.` : "",
    truncateForPrompt(params.scripturePassages, 140) ? `Scripture passages: ${truncateForPrompt(params.scripturePassages, 140)}.` : "",
    truncateForPrompt(params.seriesDescription, 280) ? `Series description mood cues: ${truncateForPrompt(params.seriesDescription, 280)}.` : "",
    paletteSummary(params.palette),
    `Variation seed: ${params.generationId}.`
  ]
    .filter(Boolean)
    .join(" ");
}

async function writePreviewFile(fileName: string, png: Buffer): Promise<string> {
  const uploadDirectory = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDirectory, { recursive: true });
  await writeFile(path.join(uploadDirectory, fileName), png);
  return `/uploads/${fileName}`;
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

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return Response.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
  }

  let project = await prisma.project.findFirst({
    where: {
      organizationId: session.organizationId,
      brandKit: {
        isNot: null
      }
    },
    orderBy: {
      updatedAt: "desc"
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

  if (!project) {
    project = await prisma.project.create({
      data: {
        organizationId: session.organizationId,
        createdById: session.userId,
        series_title: "Style Library Debug Series",
        series_subtitle: "Auto-generated debug project",
        scripture_passages: "Psalm 27:1",
        series_description: "Debug project for validating style-library guided background generation."
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

    const newBrandKit = await prisma.brandKit.create({
      data: {
        organizationId: session.organizationId,
        projectId: project.id,
        websiteUrl: "https://example.com",
        paletteJson: JSON.stringify(["#0F172A", "#334155", "#F8F6F1"]),
        typographyDirection: "graceled_defaults"
      },
      select: {
        websiteUrl: true,
        typographyDirection: true,
        paletteJson: true,
        logoPath: true
      }
    });

    project = {
      ...project,
      brandKit: newBrandKit
    };
  }

  if (!project.brandKit) {
    return Response.json({ error: "No brand kit available for debug generation" }, { status: 400 });
  }

  const generationId = randomUUID();
  const palette = parsePaletteJson(project.brandKit.paletteJson);
  const refs = (await pickStyleRefsForOptions(1))[0] || [];

  const input = {
    series_title: project.series_title,
    series_subtitle: project.series_subtitle,
    scripture_passages: project.scripture_passages,
    series_description: project.series_description,
    websiteUrl: project.brandKit.websiteUrl,
    typographyDirection: project.brandKit.typographyDirection,
    palette,
    selectedPresetKeys: [] as string[]
  };

  await prisma.generation.create({
    data: {
      id: generationId,
      projectId: project.id,
      round: 1,
      status: "RUNNING",
      input: input as Prisma.InputJsonValue
    }
  });

  try {
    const masterPrompt = buildPrompt({
      seriesTitle: project.series_title,
      seriesSubtitle: project.series_subtitle,
      scripturePassages: project.scripture_passages,
      seriesDescription: project.series_description,
      palette,
      shape: OPTION_MASTER_BACKGROUND_SHAPE,
      generationId
    });

    const references = refs.map((ref) => ({ dataUrl: ref.dataUrl }));
    const masterBgSourcePng = await generatePngFromPrompt({
      prompt: masterPrompt,
      size: OPENAI_IMAGE_SIZE_BY_SHAPE[OPTION_MASTER_BACKGROUND_SHAPE],
      references
    });
    const masterBgPng = await normalizePngToShape(masterBgSourcePng, OPTION_MASTER_BACKGROUND_SHAPE);

    const [squareBgPng, wideBgPng, tallBgPng] = await Promise.all(
      PREVIEW_SHAPES.map(async (shape) =>
        shape === OPTION_MASTER_BACKGROUND_SHAPE ? masterBgPng : normalizePngToShape(masterBgPng, shape)
      )
    );

    const [squareBgPath, wideBgPath, tallBgPath] = await Promise.all([
      writePreviewFile(`${generationId}-square-bg.png`, squareBgPng),
      writePreviewFile(`${generationId}-wide-bg.png`, wideBgPng),
      writePreviewFile(`${generationId}-tall-bg.png`, tallBgPng)
    ]);

    const buildDoc = (shape: PreviewShape, optionIndex: number, backgroundImagePath: string) =>
      buildFallbackDesignDoc({
        output: null,
        input,
        presetKey: INTERNAL_LAYOUT_PRESET_KEY,
        shape,
        round: 1,
        optionIndex,
        project: {
          seriesTitle: project.series_title,
          seriesSubtitle: project.series_subtitle,
          scripturePassages: project.scripture_passages,
          seriesDescription: project.series_description,
          logoPath: project.brandKit?.logoPath || null,
          palette
        },
        backgroundImagePath
      });

    const designDocByShape: Record<PreviewShape, DesignDoc> = {
      square: buildDoc("square", 0, squareBgPath),
      wide: buildDoc("wide", 0, wideBgPath),
      tall: buildDoc("tall", 0, tallBgPath)
    };

    const [squarePng, widePng, tallPng] = await Promise.all([
      renderCompositedPreviewPng(designDocByShape.square),
      renderCompositedPreviewPng(designDocByShape.wide),
      renderCompositedPreviewPng(designDocByShape.tall)
    ]);

    const [squarePath, widePath, tallPath] = await Promise.all([
      writePreviewFile(`${generationId}-square.png`, squarePng),
      writePreviewFile(`${generationId}-wide.png`, widePng),
      writePreviewFile(`${generationId}-tall.png`, tallPng)
    ]);

    const output = {
      designDoc: designDocByShape.square,
      designDocByShape,
      notes: "debug-style-library",
      meta: {
        styleRefCount: refs.length,
        usedStylePaths: refs.map((ref) => ref.path),
        designSpec: {
          seed: generationId,
          masterBackgroundShape: OPTION_MASTER_BACKGROUND_SHAPE
        }
      },
      promptUsed: `master(${OPTION_MASTER_BACKGROUND_SHAPE}): ${masterPrompt}\nderived variants: square/wide/tall reframed from one master background.`,
      preview: {
        square_main: squarePath,
        widescreen_main: widePath,
        vertical_main: tallPath
      }
    };

    await prisma.$transaction([
      prisma.asset.deleteMany({
        where: {
          generationId,
          slot: {
            in: ["square_main", "wide_main", "tall_main", "square_bg", "wide_bg", "tall_bg"]
          }
        }
      }),
      prisma.asset.createMany({
        data: [
          {
            projectId: project.id,
            generationId,
            kind: "IMAGE",
            slot: "square_bg",
            file_path: squareBgPath,
            mime_type: "image/png",
            width: PREVIEW_DIMENSIONS.square.width,
            height: PREVIEW_DIMENSIONS.square.height
          },
          {
            projectId: project.id,
            generationId,
            kind: "IMAGE",
            slot: "wide_bg",
            file_path: wideBgPath,
            mime_type: "image/png",
            width: PREVIEW_DIMENSIONS.wide.width,
            height: PREVIEW_DIMENSIONS.wide.height
          },
          {
            projectId: project.id,
            generationId,
            kind: "IMAGE",
            slot: "tall_bg",
            file_path: tallBgPath,
            mime_type: "image/png",
            width: PREVIEW_DIMENSIONS.tall.width,
            height: PREVIEW_DIMENSIONS.tall.height
          },
          {
            projectId: project.id,
            generationId,
            kind: "IMAGE",
            slot: "square_main",
            file_path: squarePath,
            mime_type: "image/png",
            width: PREVIEW_DIMENSIONS.square.width,
            height: PREVIEW_DIMENSIONS.square.height
          },
          {
            projectId: project.id,
            generationId,
            kind: "IMAGE",
            slot: "wide_main",
            file_path: widePath,
            mime_type: "image/png",
            width: PREVIEW_DIMENSIONS.wide.width,
            height: PREVIEW_DIMENSIONS.wide.height
          },
          {
            projectId: project.id,
            generationId,
            kind: "IMAGE",
            slot: "tall_main",
            file_path: tallPath,
            mime_type: "image/png",
            width: PREVIEW_DIMENSIONS.tall.width,
            height: PREVIEW_DIMENSIONS.tall.height
          }
        ]
      }),
      prisma.generation.update({
        where: {
          id: generationId
        },
        data: {
          status: "COMPLETED",
          output: output as Prisma.InputJsonValue
        }
      })
    ]);

    return Response.json({
      ok: true,
      projectId: project.id,
      generationId,
      previews: {
        square: squarePath,
        wide: widePath,
        tall: tallPath
      },
      meta: output.meta
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Style debug generation failed";

    await prisma.generation.update({
      where: { id: generationId },
      data: {
        status: "FAILED",
        output: {
          error: message
        } as Prisma.InputJsonValue
      }
    });

    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
