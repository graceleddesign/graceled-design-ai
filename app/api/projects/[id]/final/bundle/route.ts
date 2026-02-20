import { readFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { buildFinalBundle } from "@/lib/final-deliverables";
import { loadAuthorizedFinalDesign } from "@/lib/final-deliverables-api";
import { prisma } from "@/lib/prisma";

function resolvePublicAssetAbsolutePath(filePath: string): string | null {
  if (!filePath.trim() || /^https?:\/\//i.test(filePath) || /^data:/i.test(filePath)) {
    return null;
  }

  const publicRoot = path.join(process.cwd(), "public");
  const relativePath = filePath.replace(/^\/+/, "");
  const absolutePath = path.resolve(publicRoot, relativePath);
  const publicPrefix = `${publicRoot}${path.sep}`;
  if (absolutePath !== publicRoot && !absolutePath.startsWith(publicPrefix)) {
    return null;
  }
  return absolutePath;
}

async function addAssetFileIfPresent(params: {
  zip: JSZip;
  filePath: string | null;
  archivePath: string;
}): Promise<void> {
  if (!params.filePath) {
    return;
  }
  const absolutePath = resolvePublicAssetAbsolutePath(params.filePath);
  if (!absolutePath) {
    return;
  }

  try {
    const bytes = await readFile(absolutePath);
    params.zip.file(params.archivePath, bytes);
  } catch {
    // Ignore missing files so bundle still downloads.
  }
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const finalDesign = await loadAuthorizedFinalDesign(id);

  if (!finalDesign.ok) {
    return finalDesign.response;
  }

  const baseZipBuffer = await buildFinalBundle(finalDesign.designDoc);
  const zip = await JSZip.loadAsync(baseZipBuffer);

  if (finalDesign.generationId) {
    const generation = await prisma.generation.findFirst({
      where: {
        id: finalDesign.generationId,
        projectId: id
      },
      select: {
        assets: {
          select: {
            kind: true,
            slot: true,
            file_path: true
          }
        }
      }
    });

    if (generation) {
      const findAssetPath = (slots: string[], kinds?: string[]): string | null => {
        const normalizedSlots = slots.map((slot) => slot.trim().toLowerCase());
        const normalizedKinds = kinds?.map((kind) => kind.trim().toUpperCase());
        const match = generation.assets.find((asset) => {
          const slot = (asset.slot || "").trim().toLowerCase();
          const kind = asset.kind.trim().toUpperCase();
          if (!slot || !asset.file_path?.trim()) {
            return false;
          }
          if (!normalizedSlots.includes(slot)) {
            return false;
          }
          if (normalizedKinds && !normalizedKinds.includes(kind)) {
            return false;
          }
          return true;
        });
        return match?.file_path || null;
      };

      await addAssetFileIfPresent({
        zip,
        filePath: findAssetPath(["wide", "wide_main", "widescreen", "widescreen_main"], ["IMAGE"]),
        archivePath: "composed/final-wide.png"
      });
      await addAssetFileIfPresent({
        zip,
        filePath: findAssetPath(["square", "square_main"], ["IMAGE"]),
        archivePath: "composed/final-square.png"
      });
      await addAssetFileIfPresent({
        zip,
        filePath: findAssetPath(["tall", "tall_main", "vertical", "vertical_main"], ["IMAGE"]),
        archivePath: "composed/final-tall.png"
      });
      await addAssetFileIfPresent({
        zip,
        filePath: findAssetPath(["series_lockup"], ["LOCKUP", "IMAGE"]),
        archivePath: "lockup/series-lockup.png"
      });
    }
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const responseBody = new Uint8Array(zipBuffer);

  return new Response(responseBody, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="final-bundle.zip"',
      "Cache-Control": "no-store"
    }
  });
}
