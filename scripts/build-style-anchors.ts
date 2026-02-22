import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import OpenAI from "openai";
import sharp from "sharp";

type ReferenceIndexItem = {
  id: string;
  rawPath: string;
  normalizedPath: string;
  thumbPath: string;
  styleAnchorPath?: string;
  width: number;
  height: number;
  aspect: number;
  fileSize: number;
  dHash?: string;
  styleTags: string[];
  [key: string]: unknown;
};

type NormalizedRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};

type PixelBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type HeuristicGlyph = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  area: number;
};

type GlyphCluster = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  count: number;
  totalHeight: number;
  totalArea: number;
};

const INDEX_PATH = path.join(process.cwd(), "reference_library", "index.json");
const STYLE_ANCHOR_ABSOLUTE_DIR = path.join(process.cwd(), "public", "reference_library", "style_anchors");
const STYLE_ANCHOR_WEB_ROOT = "/reference_library/style_anchors";
const REGION_BLUR_SIGMA = 20;
const GLOBAL_FALLBACK_BLUR_SIGMA = 2.2;
const GLOBAL_SAFETY_BLUR_SIGMA_NO_OPENAI = 1.1;
const OPENAI_MODEL = process.env.OPENAI_MAIN_MODEL?.trim() || "gpt-4.1-mini";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toPosixPath(value: string): string {
  return value.replaceAll("\\", "/");
}

function normalizePath(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return toPosixPath(value.trim());
}

function normalizeRequiredPath(value: unknown): string {
  const normalized = normalizePath(value);
  return normalized.replace(/^\/+/, "");
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return Math.round(value);
}

function gap1d(aMin: number, aMax: number, bMin: number, bMax: number): number {
  if (aMax < bMin) {
    return bMin - aMax;
  }
  if (bMax < aMin) {
    return aMin - bMax;
  }
  return 0;
}

function parseResponseText(response: unknown): string {
  if (response && typeof response === "object") {
    const outputText = (response as { output_text?: unknown }).output_text;
    if (typeof outputText === "string" && outputText.trim()) {
      return outputText.trim();
    }

    const output = (response as { output?: unknown }).output;
    if (Array.isArray(output)) {
      const chunks: string[] = [];
      for (const item of output) {
        if (!item || typeof item !== "object") {
          continue;
        }
        const content = (item as { content?: unknown }).content;
        if (!Array.isArray(content)) {
          continue;
        }
        for (const segment of content) {
          if (!segment || typeof segment !== "object") {
            continue;
          }
          const text = (segment as { text?: unknown }).text;
          if (typeof text === "string" && text.trim()) {
            chunks.push(text.trim());
          }
        }
      }
      return chunks.join("\n").trim();
    }
  }

  return "";
}

function parseJsonObject(rawText: string): Record<string, unknown> | null {
  const text = rawText
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    if (isRecord(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeReferenceItem(value: unknown): ReferenceIndexItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === "string" ? value.id.trim() : "";
  const rawPath = normalizeRequiredPath(value.rawPath);
  const normalizedPath = normalizeRequiredPath(value.normalizedPath);
  const thumbPath = normalizeRequiredPath(value.thumbPath);
  const width = toNumber(value.width, 0);
  const height = toNumber(value.height, 0);

  if (!id || !rawPath || !normalizedPath || !thumbPath || width <= 0 || height <= 0) {
    return null;
  }

  const styleTags = Array.isArray(value.styleTags)
    ? value.styleTags.filter((item): item is string => typeof item === "string")
    : [];
  const styleAnchorPath = normalizePath(value.styleAnchorPath) || undefined;

  return {
    ...value,
    id,
    rawPath,
    normalizedPath,
    thumbPath,
    styleAnchorPath,
    width,
    height,
    aspect: toNumber(value.aspect, width / height),
    fileSize: toNumber(value.fileSize, 0),
    dHash: typeof value.dHash === "string" ? value.dHash.trim() : undefined,
    styleTags
  };
}

async function loadReferenceIndex(): Promise<ReferenceIndexItem[]> {
  const raw = await readFile(INDEX_PATH, "utf-8").catch(() => "");
  if (!raw.trim()) {
    throw new Error(`Reference index is empty or missing: ${INDEX_PATH}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Reference index is not valid JSON: ${INDEX_PATH}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Reference index must be an array: ${INDEX_PATH}`);
  }

  const normalized = parsed.map(normalizeReferenceItem).filter((item): item is ReferenceIndexItem => Boolean(item));
  if (normalized.length === 0) {
    throw new Error("Reference index has no valid items.");
  }

  return normalized;
}

function resolveWorkspacePath(relativePath: string): string {
  return path.join(process.cwd(), relativePath.replace(/^\/+/, ""));
}

async function readFirstAvailableReference(item: ReferenceIndexItem): Promise<{ bytes: Buffer; sourcePath: string } | null> {
  const candidates = [item.normalizedPath, item.rawPath, item.thumbPath]
    .map((candidate) => normalizeRequiredPath(candidate))
    .filter(Boolean);

  for (const candidate of candidates) {
    const bytes = await readFile(resolveWorkspacePath(candidate)).catch(() => null);
    if (bytes) {
      return {
        bytes,
        sourcePath: candidate
      };
    }
  }

  return null;
}

function parseFraction(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (value > 1 && value <= 100) {
    return clamp01(value / 100);
  }
  return clamp01(value);
}

function parseNormalizedRegion(value: unknown): NormalizedRegion | null {
  if (!isRecord(value)) {
    return null;
  }

  const xRaw = parseFraction(value.x ?? value.left);
  const yRaw = parseFraction(value.y ?? value.top);
  const widthRaw = parseFraction(value.width ?? value.w);
  const heightRaw = parseFraction(value.height ?? value.h);
  const rightRaw = parseFraction(value.right);
  const bottomRaw = parseFraction(value.bottom);

  if (xRaw === null || yRaw === null) {
    return null;
  }

  let width = widthRaw;
  let height = heightRaw;

  if ((width === null || width <= 0) && rightRaw !== null && rightRaw > xRaw) {
    width = clamp01(rightRaw - xRaw);
  }
  if ((height === null || height <= 0) && bottomRaw !== null && bottomRaw > yRaw) {
    height = clamp01(bottomRaw - yRaw);
  }

  if (width === null || height === null || width <= 0.002 || height <= 0.002) {
    return null;
  }

  const confidenceRaw = parseFraction(value.confidence);

  return {
    x: xRaw,
    y: yRaw,
    width,
    height,
    confidence: confidenceRaw === null ? 0.5 : confidenceRaw
  };
}

async function detectTextRegionsWithOpenAi(client: OpenAI | null, image: Buffer): Promise<{ hasText: boolean; regions: NormalizedRegion[] }> {
  if (!client) {
    return {
      hasText: false,
      regions: []
    };
  }

  try {
    const preview = await sharp(image, { failOn: "none" })
      .rotate()
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer();

    const response = await client.responses.create({
      model: OPENAI_MODEL,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                'Detect readable letters/words, logos, watermarks, or numbers in this image. Return strict JSON only with this shape: {"hasText":true|false,"regions":[{"x":0..1,"y":0..1,"width":0..1,"height":0..1,"confidence":0..1}]}. Use top-left origin. If no text, return hasText=false and an empty regions array.'
            },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${preview.toString("base64")}`,
              detail: "high"
            }
          ]
        }
      ]
    });

    const parsed = parseJsonObject(parseResponseText(response));
    if (!parsed) {
      return {
        hasText: false,
        regions: []
      };
    }

    const rawRegions = Array.isArray(parsed.regions) ? parsed.regions : [];
    const regions = rawRegions.map(parseNormalizedRegion).filter((region): region is NormalizedRegion => Boolean(region));

    return {
      hasText: parsed.hasText === true || regions.length > 0,
      regions
    };
  } catch {
    return {
      hasText: false,
      regions: []
    };
  }
}

function detectTextRegionsHeuristicFromRaw(params: {
  pixels: Buffer;
  width: number;
  height: number;
}): NormalizedRegion[] {
  const { pixels, width, height } = params;
  if (width < 48 || height < 48) {
    return [];
  }

  const totalPixels = width * height;
  const edgeMask = new Uint8Array(totalPixels);
  let edgeCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const gx = Math.abs(pixels[index + 1] - pixels[index - 1]);
      const gy = Math.abs(pixels[index + width] - pixels[index - width]);
      const magnitude = gx + gy;
      if (magnitude > 66) {
        edgeMask[index] = 1;
        edgeCount += 1;
      }
    }
  }

  const edgeRatio = edgeCount / totalPixels;
  if (edgeRatio < 0.006 || edgeRatio > 0.4) {
    return [];
  }

  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  const glyphs: HeuristicGlyph[] = [];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const start = y * width + x;
      if (!edgeMask[start] || visited[start]) {
        continue;
      }

      let head = 0;
      let tail = 0;
      visited[start] = 1;
      queue[tail++] = start;

      let area = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;

      while (head < tail) {
        const current = queue[head++];
        const cy = Math.floor(current / width);
        const cx = current - cy * width;

        area += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [current - 1, current + 1, current - width, current + width];
        for (const neighbor of neighbors) {
          if (neighbor <= 0 || neighbor >= totalPixels - 1) {
            continue;
          }
          if (!edgeMask[neighbor] || visited[neighbor]) {
            continue;
          }
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }

      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      if (boxWidth < 2 || boxHeight < 2) {
        continue;
      }
      const boxArea = boxWidth * boxHeight;
      const density = area / boxArea;
      const aspect = boxWidth / boxHeight;

      const isLikelyGlyph =
        area >= 7 &&
        area <= 460 &&
        boxWidth <= 44 &&
        boxHeight <= 30 &&
        boxArea <= 920 &&
        aspect >= 0.12 &&
        aspect <= 10 &&
        density >= 0.07 &&
        density <= 0.84;

      if (!isLikelyGlyph) {
        continue;
      }

      glyphs.push({
        minX,
        maxX,
        minY,
        maxY,
        width: boxWidth,
        height: boxHeight,
        area
      });
    }
  }

  if (glyphs.length < 4) {
    return [];
  }

  glyphs.sort((a, b) => (a.minY - b.minY) || (a.minX - b.minX));
  const clusters: GlyphCluster[] = [];

  for (const glyph of glyphs) {
    let bestClusterIndex = -1;
    let bestDistanceScore = Number.POSITIVE_INFINITY;

    for (let index = 0; index < clusters.length; index += 1) {
      const cluster = clusters[index];
      const avgHeight = cluster.totalHeight / Math.max(1, cluster.count);
      const xGap = gap1d(glyph.minX, glyph.maxX, cluster.minX, cluster.maxX);
      const yGap = gap1d(glyph.minY, glyph.maxY, cluster.minY, cluster.maxY);
      const xTolerance = Math.max(12, Math.round(avgHeight * 3.2));
      const yTolerance = Math.max(8, Math.round(avgHeight * 1.25));

      if (xGap > xTolerance || yGap > yTolerance) {
        continue;
      }

      const distanceScore = xGap + yGap * 2;
      if (distanceScore < bestDistanceScore) {
        bestDistanceScore = distanceScore;
        bestClusterIndex = index;
      }
    }

    if (bestClusterIndex === -1) {
      clusters.push({
        minX: glyph.minX,
        maxX: glyph.maxX,
        minY: glyph.minY,
        maxY: glyph.maxY,
        count: 1,
        totalHeight: glyph.height,
        totalArea: glyph.area
      });
      continue;
    }

    const cluster = clusters[bestClusterIndex];
    cluster.minX = Math.min(cluster.minX, glyph.minX);
    cluster.maxX = Math.max(cluster.maxX, glyph.maxX);
    cluster.minY = Math.min(cluster.minY, glyph.minY);
    cluster.maxY = Math.max(cluster.maxY, glyph.maxY);
    cluster.count += 1;
    cluster.totalHeight += glyph.height;
    cluster.totalArea += glyph.area;
  }

  const regions: NormalizedRegion[] = [];
  for (const cluster of clusters) {
    const boxWidth = cluster.maxX - cluster.minX + 1;
    const boxHeight = cluster.maxY - cluster.minY + 1;
    const boxArea = boxWidth * boxHeight;
    const aspect = boxWidth / Math.max(1, boxHeight);

    if (cluster.count < 3) {
      continue;
    }
    if (boxWidth < 14 || boxHeight < 6) {
      continue;
    }
    if (boxArea > totalPixels * 0.45) {
      continue;
    }
    if (aspect < 0.45 || aspect > 24) {
      continue;
    }

    const avgHeight = cluster.totalHeight / cluster.count;
    const expandX = Math.max(4, Math.round(avgHeight * 1.1));
    const expandY = Math.max(3, Math.round(avgHeight * 0.7));

    const left = clampInt(cluster.minX - expandX, 0, width - 1);
    const top = clampInt(cluster.minY - expandY, 0, height - 1);
    const right = clampInt(cluster.maxX + expandX, 0, width - 1);
    const bottom = clampInt(cluster.maxY + expandY, 0, height - 1);

    const regionWidth = Math.max(1, right - left + 1);
    const regionHeight = Math.max(1, bottom - top + 1);

    regions.push({
      x: left / width,
      y: top / height,
      width: regionWidth / width,
      height: regionHeight / height,
      confidence: clamp01(0.35 + cluster.count * 0.06)
    });
  }

  return regions;
}

async function detectTextRegionsHeuristic(image: Buffer): Promise<NormalizedRegion[]> {
  const downscaled = await sharp(image, { failOn: "none" })
    .rotate()
    .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .catch(() => null);

  if (!downscaled || !downscaled.info.width || !downscaled.info.height) {
    return [];
  }

  return detectTextRegionsHeuristicFromRaw({
    pixels: downscaled.data,
    width: downscaled.info.width,
    height: downscaled.info.height
  });
}

function mergePixelBoxes(boxes: PixelBox[]): PixelBox[] {
  if (boxes.length <= 1) {
    return boxes;
  }

  const merged = [...boxes];
  let changed = true;

  while (changed) {
    changed = false;

    for (let i = 0; i < merged.length; i += 1) {
      for (let j = i + 1; j < merged.length; j += 1) {
        const a = merged[i];
        const b = merged[j];
        const aRight = a.left + a.width;
        const aBottom = a.top + a.height;
        const bRight = b.left + b.width;
        const bBottom = b.top + b.height;

        const xGap = gap1d(a.left, aRight, b.left, bRight);
        const yGap = gap1d(a.top, aBottom, b.top, bBottom);
        const maxXGap = Math.max(8, Math.round(Math.min(a.width, b.width) * 0.24));
        const maxYGap = Math.max(6, Math.round(Math.min(a.height, b.height) * 0.75));

        if (xGap > maxXGap || yGap > maxYGap) {
          continue;
        }

        const next: PixelBox = {
          left: Math.min(a.left, b.left),
          top: Math.min(a.top, b.top),
          width: Math.max(aRight, bRight) - Math.min(a.left, b.left),
          height: Math.max(aBottom, bBottom) - Math.min(a.top, b.top)
        };

        merged[i] = next;
        merged.splice(j, 1);
        changed = true;
        break;
      }

      if (changed) {
        break;
      }
    }
  }

  return merged;
}

function normalizedRegionsToPixelBoxes(regions: NormalizedRegion[], imageWidth: number, imageHeight: number): PixelBox[] {
  const boxes: PixelBox[] = [];

  for (const region of regions) {
    const baseLeft = clampInt(region.x * imageWidth, 0, imageWidth - 1);
    const baseTop = clampInt(region.y * imageHeight, 0, imageHeight - 1);
    const baseRight = clampInt((region.x + region.width) * imageWidth, 0, imageWidth);
    const baseBottom = clampInt((region.y + region.height) * imageHeight, 0, imageHeight);

    const marginX = Math.max(6, Math.round(imageWidth * 0.012));
    const marginY = Math.max(5, Math.round(imageHeight * 0.01));
    const left = clampInt(baseLeft - marginX, 0, imageWidth - 1);
    const top = clampInt(baseTop - marginY, 0, imageHeight - 1);
    const right = clampInt(baseRight + marginX, 1, imageWidth);
    const bottom = clampInt(baseBottom + marginY, 1, imageHeight);

    const width = right - left;
    const height = bottom - top;
    if (width < 2 || height < 2) {
      continue;
    }

    boxes.push({
      left,
      top,
      width,
      height
    });
  }

  return mergePixelBoxes(boxes);
}

async function blurTextRegions(baseImage: Buffer, boxes: PixelBox[]): Promise<Buffer> {
  if (boxes.length === 0) {
    return baseImage;
  }

  const overlays = (
    await Promise.all(
      boxes.map(async (box) => {
        const input = await sharp(baseImage, { failOn: "none" })
          .extract({
            left: box.left,
            top: box.top,
            width: box.width,
            height: box.height
          })
          .blur(REGION_BLUR_SIGMA)
          .toBuffer()
          .catch(() => null);

        if (!input) {
          return null;
        }

        return {
          input,
          left: box.left,
          top: box.top
        };
      })
    )
  ).filter((overlay): overlay is { input: Buffer; left: number; top: number } => Boolean(overlay));

  if (overlays.length === 0) {
    return baseImage;
  }

  return sharp(baseImage, { failOn: "none" })
    .composite(overlays)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function createStyleAnchor(params: {
  imageBytes: Buffer;
  openAiClient: OpenAI | null;
}): Promise<{
  png: Buffer;
  heuristicRegionCount: number;
  openAiRegionCount: number;
  mergedRegionCount: number;
  openAiHasText: boolean;
  globalFallbackBlurApplied: boolean;
}> {
  const normalizedPng = await sharp(params.imageBytes, { failOn: "none" })
    .rotate()
    .toColorspace("srgb")
    .png({ compressionLevel: 9 })
    .toBuffer();

  const metadata = await sharp(normalizedPng, { failOn: "none" }).metadata();
  const imageWidth = metadata.width || 0;
  const imageHeight = metadata.height || 0;
  if (imageWidth <= 0 || imageHeight <= 0) {
    throw new Error("Unable to decode image dimensions for style anchor build.");
  }

  const [heuristicRegions, openAiDetection] = await Promise.all([
    detectTextRegionsHeuristic(normalizedPng),
    detectTextRegionsWithOpenAi(params.openAiClient, normalizedPng)
  ]);

  const mergedRegions = [...heuristicRegions, ...openAiDetection.regions];
  const pixelBoxes = normalizedRegionsToPixelBoxes(mergedRegions, imageWidth, imageHeight);
  let output = await blurTextRegions(normalizedPng, pixelBoxes);

  const globalFallbackBlurApplied =
    pixelBoxes.length === 0 && (openAiDetection.hasText || !params.openAiClient);

  if (globalFallbackBlurApplied) {
    output = await sharp(output, { failOn: "none" })
      .blur(GLOBAL_FALLBACK_BLUR_SIGMA)
      .png({ compressionLevel: 9 })
      .toBuffer();
  } else if (!params.openAiClient) {
    output = await sharp(output, { failOn: "none" })
      .blur(GLOBAL_SAFETY_BLUR_SIGMA_NO_OPENAI)
      .png({ compressionLevel: 9 })
      .toBuffer();
  }

  return {
    png: output,
    heuristicRegionCount: heuristicRegions.length,
    openAiRegionCount: openAiDetection.regions.length,
    mergedRegionCount: pixelBoxes.length,
    openAiHasText: openAiDetection.hasText,
    globalFallbackBlurApplied
  };
}

async function main(): Promise<void> {
  const index = await loadReferenceIndex();
  await mkdir(STYLE_ANCHOR_ABSOLUTE_DIR, { recursive: true });

  const apiKey = process.env.OPENAI_API_KEY?.trim() || "";
  const disableOpenAi = ["1", "true", "yes", "on"].includes(
    (process.env.STYLE_ANCHOR_DISABLE_OPENAI || "").trim().toLowerCase()
  );
  const openAiClient = !apiKey || disableOpenAi ? null : new OpenAI({ apiKey });

  if (!openAiClient) {
    console.warn("[style-anchors] OpenAI vision disabled. Falling back to heuristic text-region detection + global safety blur.");
  }

  let processed = 0;
  let missing = 0;
  let heuristicHitCount = 0;
  let openAiHitCount = 0;
  let mergedHitCount = 0;
  let fallbackGlobalBlurCount = 0;

  const updatedItems: ReferenceIndexItem[] = [];

  for (const [indexPosition, item] of index.entries()) {
    const styleAnchorPath = `${STYLE_ANCHOR_WEB_ROOT}/${item.id}.png`;
    const source = await readFirstAvailableReference(item);

    if (!source) {
      missing += 1;
      updatedItems.push({
        ...item,
        styleAnchorPath
      });
      console.warn(
        `[style-anchors] ${item.id}: source image unavailable (checked normalized/raw/thumb). Index still updated with styleAnchorPath.`
      );
      continue;
    }

    const anchor = await createStyleAnchor({
      imageBytes: source.bytes,
      openAiClient
    });

    const outputPath = path.join(STYLE_ANCHOR_ABSOLUTE_DIR, `${item.id}.png`);
    await writeFile(outputPath, anchor.png);

    if (anchor.heuristicRegionCount > 0) {
      heuristicHitCount += 1;
    }
    if (anchor.openAiRegionCount > 0 || anchor.openAiHasText) {
      openAiHitCount += 1;
    }
    if (anchor.mergedRegionCount > 0) {
      mergedHitCount += 1;
    }
    if (anchor.globalFallbackBlurApplied) {
      fallbackGlobalBlurCount += 1;
    }

    processed += 1;
    updatedItems.push({
      ...item,
      styleAnchorPath
    });

    console.log(
      `[${indexPosition + 1}/${index.length}] ${item.id} -> ${styleAnchorPath} source=${source.sourcePath} regions(heuristic/openai/merged)=${anchor.heuristicRegionCount}/${anchor.openAiRegionCount}/${anchor.mergedRegionCount}${
        anchor.globalFallbackBlurApplied ? " fallback-global-blur" : ""
      }`
    );
  }

  await writeFile(INDEX_PATH, `${JSON.stringify(updatedItems, null, 2)}\n`, "utf-8");

  console.log(
    `[style-anchors] done. processed=${processed} missing=${missing} openai=${openAiClient ? "enabled" : "disabled"} heuristicHits=${heuristicHitCount} openAiHits=${openAiHitCount} mergedHits=${mergedHitCount} fallbackGlobalBlur=${fallbackGlobalBlurCount}`
  );
  console.log(`[style-anchors] index updated: ${INDEX_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
