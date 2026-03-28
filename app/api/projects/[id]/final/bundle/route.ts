import { readFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { buildFinalBundle } from "@/lib/final-deliverables";
import { loadAuthorizedFinalDesign } from "@/lib/final-deliverables-api";
import { buildProductionBlockedMessage } from "@/lib/production-valid-option";

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

async function addAssetFileOrThrow(params: {
  zip: JSZip;
  filePath: string | null;
  archivePath: string;
  label: string;
}): Promise<void> {
  if (!params.filePath) {
    throw new Error(`Missing ${params.label}.`);
  }
  const absolutePath = resolvePublicAssetAbsolutePath(params.filePath);
  if (!absolutePath) {
    throw new Error(`${params.label} is not a local canonical asset.`);
  }

  try {
    const bytes = await readFile(absolutePath);
    params.zip.file(params.archivePath, bytes);
  } catch {
    throw new Error(`${params.label} could not be read from disk.`);
  }
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const finalDesign = await loadAuthorizedFinalDesign(id);

  if (!finalDesign.ok) {
    return finalDesign.response;
  }
  if (!finalDesign.generationValidation.export.eligible) {
    const missingSlots = finalDesign.generationValidation.export.missingSlots;
    const missingSummary = missingSlots.length > 0 ? ` Missing: ${missingSlots.join(", ")}.` : "";
    return new Response(
      `${buildProductionBlockedMessage("ZIP export", finalDesign.generationValidation.export.invalidReasons)}${missingSummary}`,
      {
        status: 409,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }

  const baseZipBuffer = await buildFinalBundle(finalDesign.designDoc);
  const zip = await JSZip.loadAsync(baseZipBuffer);
  const findAssetPath = (slots: string[], kinds?: string[]): string | null => {
    const normalizedSlots = slots.map((slot) => slot.trim().toLowerCase());
    const normalizedKinds = kinds?.map((kind) => kind.trim().toUpperCase());
    const match = finalDesign.generationAssets.find((asset) => {
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

  try {
    await addAssetFileOrThrow({
      zip,
      filePath: findAssetPath(["wide", "wide_main", "widescreen", "widescreen_main"], ["IMAGE"]),
      archivePath: "composed/final-wide.png",
      label: "canonical wide export"
    });
    await addAssetFileOrThrow({
      zip,
      filePath: findAssetPath(["square", "square_main"], ["IMAGE"]),
      archivePath: "composed/final-square.png",
      label: "canonical square export"
    });
    await addAssetFileOrThrow({
      zip,
      filePath: findAssetPath(["tall", "tall_main", "vertical", "vertical_main"], ["IMAGE"]),
      archivePath: "composed/final-tall.png",
      label: "canonical tall export"
    });
    await addAssetFileOrThrow({
      zip,
      filePath: findAssetPath(["series_lockup"], ["LOCKUP", "IMAGE"]),
      archivePath: "lockup/series-lockup.png",
      label: "canonical lockup export"
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Final bundle is missing canonical source assets.", {
      status: 409,
      headers: {
        "Cache-Control": "no-store"
      }
    });
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
