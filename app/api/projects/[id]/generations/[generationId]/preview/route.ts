import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { getSession } from "@/lib/auth";
import { extractBibleCreativeBrief } from "@/lib/bible-creative-brief";
import { resolveEffectiveBrandKit } from "@/lib/brand-kit";
import { buildFallbackDesignDoc, normalizeDesignDoc, type DesignDoc } from "@/lib/design-doc";
import { buildFinalSvg } from "@/lib/final-deliverables";
import { composeLockupOnBackground, LOCKUP_SAFE_REGION_RATIOS, type LockupIntegrationMode } from "@/lib/lockup-compositor";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SHAPE_DIMENSIONS = {
  square: { width: 1080, height: 1080 },
  wide: { width: 1920, height: 1080 },
  tall: { width: 1080, height: 1920 }
} as const;

type PreviewShape = keyof typeof SHAPE_DIMENSIONS;

type GenerationAssetRecord = {
  kind: "IMAGE" | "BACKGROUND" | "LOCKUP" | "ZIP" | "OTHER";
  slot: string | null;
  file_path: string;
};

type StageDebugRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

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

function normalizeAssetUrl(filePath: string): string {
  const trimmed = filePath.trim();
  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed) || /^data:/i.test(trimmed)) {
    return trimmed;
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed.replace(/^\/+/, "")}`;
}

function readFinalAssetPath(assets: GenerationAssetRecord[], shape: PreviewShape): string | null {
  const match = assets.find((asset) => {
    if (asset.kind !== "IMAGE") {
      return false;
    }

    const slot = asset.slot?.trim().toLowerCase();
    if (!slot || !asset.file_path?.trim()) {
      return false;
    }

    if (shape === "square") {
      return slot === "square" || slot === "square_main";
    }
    if (shape === "wide") {
      return slot === "wide" || slot === "wide_main" || slot === "widescreen" || slot === "widescreen_main";
    }
    return slot === "tall" || slot === "tall_main" || slot === "vertical" || slot === "vertical_main";
  });

  if (!match) {
    return null;
  }

  const normalizedPath = normalizeAssetUrl(match.file_path);
  return normalizedPath || null;
}

function readBackgroundAssetPath(assets: GenerationAssetRecord[], shape: PreviewShape): string | null {
  const match = assets.find((asset) => {
    const slot = asset.slot?.trim().toLowerCase();
    if (!slot || !asset.file_path?.trim()) {
      return false;
    }

    const isBackgroundKind = asset.kind === "BACKGROUND" || asset.kind === "IMAGE";
    if (!isBackgroundKind) {
      return false;
    }

    if (shape === "square") {
      return slot === "square_bg";
    }
    if (shape === "wide") {
      return slot === "wide_bg" || slot === "widescreen_bg";
    }
    return slot === "tall_bg" || slot === "vertical_bg";
  });

  if (!match) {
    return null;
  }
  const normalizedPath = normalizeAssetUrl(match.file_path);
  return normalizedPath || null;
}

function readLockupAssetPath(assets: GenerationAssetRecord[]): string | null {
  const match = assets.find((asset) => {
    const slot = asset.slot?.trim().toLowerCase();
    if (!slot || !asset.file_path?.trim()) {
      return false;
    }
    return slot === "series_lockup" || asset.kind === "LOCKUP";
  });

  if (!match) {
    return null;
  }
  const normalizedPath = normalizeAssetUrl(match.file_path);
  return normalizedPath || null;
}

function resolveLocalPublicPath(assetUrl: string): string | null {
  if (!assetUrl.trim() || /^https?:\/\//i.test(assetUrl) || /^data:/i.test(assetUrl)) {
    return null;
  }

  const publicRoot = path.join(process.cwd(), "public");
  const relativePath = assetUrl.replace(/^\/+/, "");
  const absolutePath = path.resolve(publicRoot, relativePath);
  const publicPrefix = `${publicRoot}${path.sep}`;
  if (absolutePath !== publicRoot && !absolutePath.startsWith(publicPrefix)) {
    return null;
  }
  return absolutePath;
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

function readLockupIntegrationModeFromOutput(output: unknown): LockupIntegrationMode {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return "clean";
  }

  const meta = (output as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return "clean";
  }

  const designSpec = (meta as { designSpec?: unknown }).designSpec;
  if (!designSpec || typeof designSpec !== "object" || Array.isArray(designSpec)) {
    return "clean";
  }

  const rawIntegrationMode = (designSpec as { lockupIntegrationMode?: unknown }).lockupIntegrationMode;
  if (rawIntegrationMode === "stamp" || rawIntegrationMode === "clean") {
    return rawIntegrationMode;
  }

  const rawStyleMode = (designSpec as { lockupStyleMode?: unknown }).lockupStyleMode;
  if (rawStyleMode === "engraved_stamp") {
    return "stamp";
  }

  return "clean";
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

function isDebugBriefEnabled(url: URL): boolean {
  return process.env.NODE_ENV !== "production" && url.searchParams.get("debugBrief") === "1";
}

function isDebugStageEnabled(url: URL): boolean {
  return process.env.NODE_ENV !== "production" && url.searchParams.get("debugStage") === "1";
}

function readSeriesPreferenceDesignNotes(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const seriesPreferences = (input as { seriesPreferences?: unknown }).seriesPreferences;
  if (!seriesPreferences || typeof seriesPreferences !== "object" || Array.isArray(seriesPreferences)) {
    return null;
  }

  const designNotes = (seriesPreferences as { designNotes?: unknown }).designNotes;
  if (typeof designNotes !== "string") {
    return null;
  }

  const trimmed = designNotes.trim();
  return trimmed || null;
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
    backgroundImagePath: designDoc.backgroundImagePath,
    background: designDoc.background,
    layers
  };
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function computeLockupSafeRegionBox(shape: PreviewShape, width: number, height: number): StageDebugRect {
  const ratios = LOCKUP_SAFE_REGION_RATIOS[shape];
  return {
    left: Math.round(width * ratios.left),
    top: Math.round(height * ratios.top),
    width: Math.round(width * ratios.width),
    height: Math.round(height * ratios.height)
  };
}

async function readOptionalFile(filePath: string | null): Promise<Buffer | null> {
  if (!filePath) {
    return null;
  }

  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
}

async function computeCompositedLockupBox(params: {
  lockupPng: Buffer;
  shape: PreviewShape;
  width: number;
  height: number;
  align?: "left" | "center" | "right";
}): Promise<StageDebugRect | null> {
  const lockupMetadata = await sharp(params.lockupPng, { failOn: "none" }).metadata();
  const lockupWidth = Math.max(1, Math.round(lockupMetadata.width || 1));
  const lockupHeight = Math.max(1, Math.round(lockupMetadata.height || 1));
  if (lockupWidth <= 0 || lockupHeight <= 0) {
    return null;
  }

  const safeRegion = computeLockupSafeRegionBox(params.shape, params.width, params.height);
  const safeWidth = Math.max(1, safeRegion.width);
  const safeHeight = Math.max(1, safeRegion.height);
  const scale = clamp(Math.min(safeWidth / lockupWidth, safeHeight / lockupHeight), 0.1, 4);
  const targetWidth = Math.max(1, Math.round(lockupWidth * scale));
  const targetHeight = Math.max(1, Math.round(lockupHeight * scale));
  const align = params.align || "left";
  const left =
    align === "center"
      ? safeRegion.left + Math.round((safeWidth - targetWidth) / 2)
      : align === "right"
        ? safeRegion.left + (safeWidth - targetWidth)
        : safeRegion.left;
  const top = safeRegion.top + Math.round((safeHeight - targetHeight) / 2);

  return {
    left: clamp(left, 0, Math.max(0, params.width - targetWidth)),
    top: clamp(top, 0, Math.max(0, params.height - targetHeight)),
    width: targetWidth,
    height: targetHeight
  };
}

function buildStageDebugOverlaySvg(params: {
  width: number;
  height: number;
  safeRegion: StageDebugRect;
  lockupBounds?: StageDebugRect | null;
}): Buffer {
  const safe = params.safeRegion;
  const lockup = params.lockupBounds;
  const safeLabelX = clamp(safe.left + 8, 6, Math.max(6, params.width - 170));
  const safeLabelY = clamp(safe.top + 18, 16, Math.max(16, params.height - 10));
  const lockupLabelX = lockup ? clamp(lockup.left + 8, 6, Math.max(6, params.width - 180)) : 0;
  const lockupLabelY = lockup ? clamp(lockup.top + 18, 16, Math.max(16, params.height - 10)) : 0;
  const lockupLayer = lockup
    ? `
  <rect x="${lockup.left}" y="${lockup.top}" width="${lockup.width}" height="${lockup.height}" fill="none" stroke="#F97316" stroke-width="3" stroke-dasharray="10 6" />
  <rect x="${lockupLabelX - 6}" y="${lockupLabelY - 14}" width="170" height="18" rx="4" fill="rgba(249,115,22,0.92)" />
  <text x="${lockupLabelX}" y="${lockupLabelY}" fill="#ffffff" font-size="12" font-weight="700">LOCKUP BOUNDS</text>`
    : "";

  return Buffer.from(
    `<svg width="${params.width}" height="${params.height}" viewBox="0 0 ${params.width} ${params.height}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${safe.left}" y="${safe.top}" width="${safe.width}" height="${safe.height}" fill="none" stroke="#06B6D4" stroke-width="3" stroke-dasharray="12 8" />
  <rect x="${safeLabelX - 6}" y="${safeLabelY - 14}" width="155" height="18" rx="4" fill="rgba(6,182,212,0.92)" />
  <text x="${safeLabelX}" y="${safeLabelY}" fill="#ffffff" font-size="12" font-weight="700">SAFE REGION</text>${lockupLayer}
</svg>`
  );
}

async function applyStageDebugOverlay(params: {
  basePng: Buffer;
  shape: PreviewShape;
  width: number;
  height: number;
  lockupPng?: Buffer | null;
}): Promise<Buffer> {
  const safeRegion = computeLockupSafeRegionBox(params.shape, params.width, params.height);
  const lockupBounds = params.lockupPng
    ? await computeCompositedLockupBox({
        lockupPng: params.lockupPng,
        shape: params.shape,
        width: params.width,
        height: params.height,
        align: "left"
      })
    : null;
  const overlaySvg = buildStageDebugOverlaySvg({
    width: params.width,
    height: params.height,
    safeRegion,
    lockupBounds
  });

  return sharp(params.basePng, { failOn: "none" })
    .resize({
      width: params.width,
      height: params.height,
      fit: "fill",
      position: "center"
    })
    .composite([{ input: overlaySvg, blend: "over" }])
    .png()
    .toBuffer();
}

export async function GET(request: Request, context: { params: Promise<{ id: string; generationId: string }> }) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401, headers: noStoreHeaders() });
  }

  const { id: projectId, generationId } = await context.params;
  const url = new URL(request.url);
  const shape = parseShape(url.searchParams.get("shape") || url.searchParams.get("slot"));
  const debugStageEnabled = isDebugStageEnabled(url);

  if (!shape) {
    return new Response("Invalid shape", { status: 400, headers: noStoreHeaders() });
  }
  const { width, height } = SHAPE_DIMENSIONS[shape];

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
      assets: {
        select: {
          kind: true,
          slot: true,
          file_path: true
        }
      },
      project: {
        select: {
          organizationId: true,
          series_title: true,
          series_subtitle: true,
          scripture_passages: true,
          series_description: true,
          designNotes: true,
          brandKit: {
            select: {
              websiteUrl: true,
              typographyDirection: true,
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

  if (isDebugBriefEnabled(url)) {
    const designNotes = generation.project.designNotes || readSeriesPreferenceDesignNotes(generation.input);
    const extractedBrief = await extractBibleCreativeBrief({
      title: generation.project.series_title,
      subtitle: generation.project.series_subtitle,
      scripturePassages: generation.project.scripture_passages,
      description: generation.project.series_description,
      designNotes
    });
    console.info(
      `[debugBrief] project=${projectId} generation=${generationId} shape=${shape}\n${JSON.stringify(extractedBrief, null, 2)}`
    );
  }

  const effectiveBrandKit = await resolveEffectiveBrandKit({
    organizationId: generation.project.organizationId,
    projectId,
    projectBrandKit: generation.project.brandKit
  });

  const lockupAssetPath = readLockupAssetPath(generation.assets);
  const lockupLocalPath = lockupAssetPath ? resolveLocalPublicPath(lockupAssetPath) : null;
  const finalAssetPath = readFinalAssetPath(generation.assets, shape);
  if (finalAssetPath) {
    if (debugStageEnabled) {
      const finalLocalPath = resolveLocalPublicPath(finalAssetPath);
      if (finalLocalPath) {
        const [finalPng, lockupPng] = await Promise.all([readOptionalFile(finalLocalPath), readOptionalFile(lockupLocalPath)]);
        if (finalPng) {
          try {
            const debugPng = await applyStageDebugOverlay({
              basePng: finalPng,
              shape,
              width,
              height,
              lockupPng
            });
            return new Response(new Uint8Array(debugPng), {
              status: 200,
              headers: noStoreHeaders("image/png")
            });
          } catch {
            // Fall back to redirect if debug overlay render fails.
          }
        }
      }
    }

    const redirectLocation =
      /^https?:\/\//i.test(finalAssetPath) || /^data:/i.test(finalAssetPath)
        ? finalAssetPath
        : new URL(finalAssetPath, url.origin).toString();

    return new Response(null, {
      status: 302,
      headers: {
        ...noStoreHeaders(),
        Location: redirectLocation
      }
    });
  }
  const backgroundAssetPath = readBackgroundAssetPath(generation.assets, shape);
  if (backgroundAssetPath && lockupAssetPath) {
    const backgroundLocalPath = resolveLocalPublicPath(backgroundAssetPath);
    if (backgroundLocalPath && lockupLocalPath) {
      try {
        const [backgroundPng, lockupPng] = await Promise.all([readFile(backgroundLocalPath), readFile(lockupLocalPath)]);
        const integrationMode = readLockupIntegrationModeFromOutput(generation.output);
        const compositedBase = await composeLockupOnBackground({
          backgroundPng,
          lockupPng,
          shape,
          width,
          height,
          align: "left",
          integrationMode
        });
        const composited = debugStageEnabled
          ? await applyStageDebugOverlay({
              basePng: compositedBase,
              shape,
              width,
              height,
              lockupPng
            })
          : compositedBase;
        return new Response(new Uint8Array(composited), {
          status: 200,
          headers: noStoreHeaders("image/png")
        });
      } catch {
        // Fall through to design-doc fallback render.
      }
    }
  }

  const shapedDesignDoc = parseDesignDocByShapeFromOutput(generation.output, shape);
  const outputDesignDoc = parseDesignDocFromOutput(generation.output);
  const sourceDesignDoc =
    shapedDesignDoc ||
    (outputDesignDoc ? adaptDesignDocToDimensions(outputDesignDoc, width, height) : null) ||
    adaptDesignDocToDimensions(
      buildFallbackDesignDoc({
        output: generation.output,
        input: generation.input,
        presetKey: generation.preset?.key || null,
        shape,
        round: generation.round,
        optionIndex: readOptionIndex(generation.input, generation.preset?.key || null),
        project: {
          seriesTitle: generation.project.series_title,
          seriesSubtitle: generation.project.series_subtitle,
          scripturePassages: generation.project.scripture_passages,
          seriesDescription: generation.project.series_description,
          logoPath: effectiveBrandKit?.logoPath || null,
          palette: parsePaletteJson(effectiveBrandKit?.paletteJson)
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
  const debugLockupPng = debugStageEnabled ? await readOptionalFile(lockupLocalPath) : null;
  const responsePng = debugStageEnabled
    ? await applyStageDebugOverlay({
        basePng: pngBuffer,
        shape,
        width,
        height,
        lockupPng: debugLockupPng
      })
    : pngBuffer;

  return new Response(new Uint8Array(responsePng), {
    status: 200,
    headers: noStoreHeaders("image/png")
  });
}
