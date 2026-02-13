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

function parseDesignDocFromOutput(output: unknown): DesignDoc | null {
  const directDesignDoc = normalizeDesignDoc(output);
  if (directDesignDoc) {
    return directDesignDoc;
  }

  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }

  return normalizeDesignDoc((output as { designDoc?: unknown }).designDoc);
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

  // If output is missing or malformed, generate a deterministic fallback preview document.
  const designDoc =
    parseDesignDocFromOutput(generation.output) ||
    buildFallbackDesignDoc({
      output: null,
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
    });

  const svg = await buildFinalSvg(designDoc);
  const { width, height } = SHAPE_DIMENSIONS[shape];
  const pngBuffer = await sharp(Buffer.from(svg))
    .resize({
      width,
      height,
      fit: "cover",
      position: "center"
    })
    .png()
    .toBuffer();

  return new Response(new Uint8Array(pngBuffer), {
    status: 200,
    headers: noStoreHeaders("image/png")
  });
}
