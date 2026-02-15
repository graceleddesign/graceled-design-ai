import sharp from "sharp";
import { getSession } from "@/lib/auth";
import { normalizeDesignDoc, type DesignDoc } from "@/lib/design-doc";
import { buildFinalSvg } from "@/lib/final-deliverables";
import { prisma } from "@/lib/prisma";

const SLOT_DIMENSIONS = {
  square: { width: 1024, height: 1024 },
  widescreen: { width: 1536, height: 864 },
  vertical: { width: 864, height: 1536 }
} as const;

type PreviewSlot = keyof typeof SLOT_DIMENSIONS;

function parseSlot(value: string | null): PreviewSlot | null {
  if (value === "square" || value === "widescreen" || value === "vertical") {
    return value;
  }

  return null;
}

function parseDesignDocFromOutput(output: unknown, slot: PreviewSlot): DesignDoc | null {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return null;
  }

  const shapeDocs = (output as { designDocByShape?: unknown }).designDocByShape;
  if (shapeDocs && typeof shapeDocs === "object" && !Array.isArray(shapeDocs)) {
    const shapeKey = slot === "widescreen" ? "wide" : slot === "vertical" ? "tall" : "square";
    const byShape = normalizeDesignDoc((shapeDocs as Record<string, unknown>)[shapeKey]);
    if (byShape) {
      return byShape;
    }
  }

  const nestedDesignDoc = normalizeDesignDoc((output as { designDoc?: unknown }).designDoc);
  if (nestedDesignDoc) {
    return nestedDesignDoc;
  }

  return normalizeDesignDoc(output);
}

export async function GET(request: Request, context: { params: Promise<{ id: string; generationId: string }> }) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id: projectId, generationId } = await context.params;
  const url = new URL(request.url);
  const slot = parseSlot(url.searchParams.get("slot"));

  if (!slot) {
    return new Response("Invalid slot", { status: 400 });
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
      output: true
    }
  });

  if (!generation || !generation.output) {
    return new Response("Generation not found", {
      status: 404,
      headers: {
        "Cache-Control": "no-store"
      }
    });
  }

  const designDoc = parseDesignDocFromOutput(generation.output, slot);
  if (!designDoc) {
    return new Response("Generation not found", {
      status: 404,
      headers: {
        "Cache-Control": "no-store"
      }
    });
  }

  const svg = await buildFinalSvg(designDoc);
  const { width, height } = SLOT_DIMENSIONS[slot];
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
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store"
    }
  });
}
