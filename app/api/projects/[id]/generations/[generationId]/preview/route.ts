import sharp from "sharp";
import { getSession } from "@/lib/auth";
import { buildFallbackDesignDoc, normalizeDesignDoc, type DesignDoc } from "@/lib/design-doc";
import { buildFinalSvg } from "@/lib/final-deliverables";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SHAPE_DIMENSIONS = {
  square: { width: 1080, height: 1080 },
  wide: { width: 1920, height: 1080 },
  tall: { width: 1080, height: 1920 }
} as const;

type PreviewShape = keyof typeof SHAPE_DIMENSIONS;

function noStoreHeaders(contentType?: string): HeadersInit {
  return {
    ...(contentType ? { "Content-Type": contentType } : {}),
    "Cache-Control": "no-store"
  };
}

function parseShape(value: string | null): PreviewShape | null {
  if (value === "square" || value === "wide" || value === "tall") {
    return value;
  }

  // Backward compatibility with older slot names.
  if (value === "widescreen") {
    return "wide";
  }
  if (value === "vertical") {
    return "tall";
  }

  return null;
}

function parsePaletteJson(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }

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

function parseDesignDocByShapeFromOutput(output: unknown, shape: PreviewShape): DesignDoc | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }

  const shapeDocs = (output as { designDocByShape?: unknown }).designDocByShape;
  if (!shapeDocs || typeof shapeDocs !== "object" || Array.isArray(shapeDocs)) {
    return null;
  }

  const normalizedShape = normalizeDesignDoc((shapeDocs as Record<string, unknown>)[shape]);
  if (normalizedShape) {
    return normalizedShape;
  }

  if (shape === "wide") {
    return normalizeDesignDoc((shapeDocs as Record<string, unknown>).widescreen);
  }

  if (shape === "tall") {
    return normalizeDesignDoc((shapeDocs as Record<string, unknown>).vertical);
  }

  return null;
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

export async function GET(request: Request, context: { params: Promise<{ id: string; generationId: string }> }) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401, headers: noStoreHeaders() });
  }

  const { id: projectId, generationId } = await context.params;
  const url = new URL(request.url);
  const shape = parseShape(url.searchParams.get("shape") || url.searchParams.get("slot"));

  if (!shape) {
    return new Response("Invalid shape", { status: 400, headers: noStoreHeaders() });
  }

  const generation = await prisma.generation.findFirst({
    where: {
      id: generationId,
      projectId,
      project: {
        organizationId: session.organizationId
      }
    },
    select: {
      id: true,
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
    return new Response("Generation not found", { status: 404, headers: noStoreHeaders() });
  }

  const { width, height } = SHAPE_DIMENSIONS[shape];
  const shapedDesignDoc = parseDesignDocByShapeFromOutput(generation.output, shape);
  const outputDesignDoc = parseDesignDocFromOutput(generation.output);
  const sourceDesignDoc =
    shapedDesignDoc ||
    (outputDesignDoc ? adaptDesignDocToDimensions(outputDesignDoc, width, height) : null) ||
    adaptDesignDocToDimensions(
      buildFallbackDesignDoc({
        output: generation.output,
        input: generation.input,
        round: generation.round,
        optionIndex: readOptionIndex(generation.input, generation.preset?.key || null),
        project: {
          seriesTitle: generation.project.series_title,
          seriesSubtitle: generation.project.series_subtitle,
          scripturePassages: generation.project.scripture_passages,
          seriesDescription: generation.project.series_description,
          logoPath: generation.project.brandKit?.logoPath || null,
          palette: parsePaletteJson(generation.project.brandKit?.paletteJson)
        }
      }),
      width,
      height
    );

  const svg = await buildFinalSvg(sourceDesignDoc);
  const pngBuffer = await sharp(Buffer.from(svg))
    .resize({
      width,
      height,
      fit: "fill",
      position: "center"
    })
    .png()
    .toBuffer();

  return new Response(new Uint8Array(pngBuffer), {
    status: 200,
    headers: noStoreHeaders("image/png")
  });
}
