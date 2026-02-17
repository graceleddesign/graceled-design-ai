import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRESET_KEY = "type_clean_min_v1";

function normalizeAssetPath(filePath: string): string {
  const trimmed = filePath.trim();
  if (!trimmed) {
    return "";
  }
  if (/^https?:\/\//i.test(trimmed) || /^data:/i.test(trimmed)) {
    return trimmed;
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed.replace(/^\/+/, "")}`;
}

function pickBySlot(
  assets: Array<{ slot: string | null; file_path: string }>,
  shape: "square" | "wide" | "tall"
): string | null {
  const slotMatches =
    shape === "square"
      ? new Set(["square", "square_main"])
      : shape === "wide"
        ? new Set(["wide", "wide_main", "widescreen", "widescreen_main"])
        : new Set(["tall", "tall_main", "vertical", "vertical_main"]);

  const asset = assets.find((item) => slotMatches.has((item.slot || "").trim().toLowerCase()) && item.file_path?.trim());
  return asset ? normalizeAssetPath(asset.file_path) : null;
}

export async function GET() {
  const generation = await prisma.generation.findFirst({
    where: {
      status: "COMPLETED",
      preset: {
        key: PRESET_KEY
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    select: {
      id: true,
      createdAt: true,
      assets: {
        where: {
          kind: "IMAGE"
        },
        select: {
          slot: true,
          file_path: true
        }
      }
    }
  });

  if (!generation) {
    return Response.json({
      found: false,
      presetKey: PRESET_KEY,
      assets: {
        square: null,
        wide: null,
        tall: null
      }
    });
  }

  return Response.json({
    found: true,
    presetKey: PRESET_KEY,
    generationId: generation.id,
    createdAt: generation.createdAt,
    assets: {
      square: pickBySlot(generation.assets, "square"),
      wide: pickBySlot(generation.assets, "wide"),
      tall: pickBySlot(generation.assets, "tall")
    }
  });
}
