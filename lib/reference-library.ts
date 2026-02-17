import "server-only";

import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

export type ReferenceMode = "clean-minimal";

export type ReferenceIndexImage = {
  relativePath: string;
  width: number;
  height: number;
  minimalScore: number;
};

type ReferenceIndexFile = {
  images?: unknown;
};

const REFERENCE_ROOT = path.join(process.cwd(), "reference");
const INDEX_PATH = path.join(REFERENCE_ROOT, "index.json");

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeReferenceImage(input: unknown): ReferenceIndexImage | null {
  if (!isRecord(input)) {
    return null;
  }

  const relativePath = typeof input.relativePath === "string" ? input.relativePath.trim() : "";
  const width = typeof input.width === "number" ? input.width : 0;
  const height = typeof input.height === "number" ? input.height : 0;
  const minimalScore = typeof input.minimalScore === "number" ? input.minimalScore : 0;

  if (!relativePath || width <= 0 || height <= 0) {
    return null;
  }

  return {
    relativePath,
    width,
    height,
    minimalScore
  };
}

function shuffle<T>(input: readonly T[]): T[] {
  const items = [...input];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = items[index];
    items[index] = items[swapIndex];
    items[swapIndex] = current;
  }
  return items;
}

function sampleUnique<T>(input: readonly T[], count: number): T[] {
  if (count <= 0 || input.length === 0) {
    return [];
  }
  if (count >= input.length) {
    return [...input];
  }
  return shuffle(input).slice(0, count);
}

function sanitizeReferencePath(relativePath: string): string | null {
  const normalized = relativePath.replace(/^\/+/, "");
  if (!normalized) {
    return null;
  }

  const absolutePath = path.resolve(REFERENCE_ROOT, normalized);
  const rootPrefix = `${REFERENCE_ROOT}${path.sep}`;
  if (absolutePath !== REFERENCE_ROOT && !absolutePath.startsWith(rootPrefix)) {
    return null;
  }

  return absolutePath;
}

async function buildTileBuffer(filePath: string, width: number, height: number): Promise<Buffer> {
  return sharp(filePath, { failOn: "none" })
    .resize({
      width,
      height,
      fit: "cover",
      position: "centre"
    })
    .png()
    .toBuffer();
}

export async function loadReferenceIndex(): Promise<ReferenceIndexImage[]> {
  const raw = await readFile(INDEX_PATH, "utf-8").catch(() => "");
  if (!raw.trim()) {
    return [];
  }

  let parsed: ReferenceIndexFile;
  try {
    parsed = JSON.parse(raw) as ReferenceIndexFile;
  } catch {
    return [];
  }

  const images = Array.isArray(parsed.images) ? parsed.images : [];
  return images.map(normalizeReferenceImage).filter((item): item is ReferenceIndexImage => Boolean(item));
}

export async function pickReferences(params: { count: number; mode: ReferenceMode }): Promise<ReferenceIndexImage[]> {
  const requested = Math.max(0, Math.floor(params.count));
  if (requested === 0) {
    return [];
  }

  const indexed = await loadReferenceIndex();
  if (indexed.length === 0) {
    return [];
  }

  const sorted = [...indexed].sort((a, b) => b.minimalScore - a.minimalScore);

  if (params.mode === "clean-minimal") {
    const poolSize = Math.min(sorted.length, Math.max(requested * 3, 12));
    const pool = sorted.slice(0, poolSize);
    return sampleUnique(pool, Math.min(requested, pool.length));
  }

  return sampleUnique(sorted, Math.min(requested, sorted.length));
}

export async function buildReferenceCollageBuffer(paths: string[]): Promise<Buffer> {
  const tileWidth = 512;
  const tileHeight = 512;
  const width = tileWidth * 2;
  const height = tileHeight * 2;

  const usablePaths = paths
    .map((relativePath) => sanitizeReferencePath(relativePath))
    .filter((absolutePath): absolutePath is string => Boolean(absolutePath));

  if (usablePaths.length === 0) {
    throw new Error("No usable reference paths were provided for collage generation");
  }

  const selectedPaths: string[] = [];
  for (let index = 0; index < 4; index += 1) {
    selectedPaths.push(usablePaths[index % usablePaths.length]);
  }

  const tiles = await Promise.all(selectedPaths.map((filePath) => buildTileBuffer(filePath, tileWidth, tileHeight)));

  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#F4F4F5"
    }
  })
    .composite([
      { input: tiles[0], top: 0, left: 0 },
      { input: tiles[1], top: 0, left: tileWidth },
      { input: tiles[2], top: tileHeight, left: 0 },
      { input: tiles[3], top: tileHeight, left: tileWidth }
    ])
    .png()
    .toBuffer();
}
