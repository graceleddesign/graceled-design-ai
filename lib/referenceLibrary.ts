import "server-only";

import { readFile } from "fs/promises";
import path from "path";

export type ReferenceLibraryStyleTag = "minimal" | "illustrative" | "photo" | "bold-typography" | "textured";

export type ReferenceLibraryItem = {
  id: string;
  path: string;
  width: number;
  height: number;
  aspect: number;
  fileSize: number;
  dHash?: string;
  styleTag: ReferenceLibraryStyleTag;
  styleTags: string[];
  sourceZip?: string;
  originalName?: string;
  rawPath: string;
  normalizedPath: string;
  thumbPath: string;
};

export type ReferenceOptionLane = "A" | "B" | "C";

const INDEX_PATH_PRIMARY = path.join(process.cwd(), "data", "reference-library.json");
const INDEX_PATH_LEGACY = path.join(process.cwd(), "reference_library", "index.json");

let cachedIndexPromise: Promise<ReferenceLibraryItem[]> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toPosixPath(input: string): string {
  return input.split(path.sep).join(path.posix.sep);
}

function normalizePathValue(input: unknown): string {
  if (typeof input !== "string") {
    return "";
  }
  return toPosixPath(input.trim().replace(/^\/+/, ""));
}

function toNumber(input: unknown, fallback = 0): number {
  return typeof input === "number" && Number.isFinite(input) ? input : fallback;
}

function normalizeStyleTag(value: unknown): ReferenceLibraryStyleTag {
  if (value === "minimal" || value === "illustrative" || value === "photo" || value === "bold-typography" || value === "textured") {
    return value;
  }
  return "minimal";
}

function dedupeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

function mapStyleTagToTags(styleTag: ReferenceLibraryStyleTag): string[] {
  if (styleTag === "minimal") {
    return ["minimal", "clean", "grid", "editorial"];
  }
  if (styleTag === "illustrative") {
    return ["illustrative", "line-art", "ornament", "engraved"];
  }
  if (styleTag === "photo") {
    return ["photo", "cinematic", "texture"];
  }
  if (styleTag === "bold-typography") {
    return ["bold-typography", "type", "typography"];
  }
  return ["textured", "texture", "atmospheric"];
}

function normalizeItem(input: unknown): ReferenceLibraryItem | null {
  if (!isRecord(input)) {
    return null;
  }

  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!id) {
    return null;
  }

  const modernPath = normalizePathValue(input.path);
  const legacyThumb = normalizePathValue(input.thumbPath);
  const legacyNormalized = normalizePathValue(input.normalizedPath);
  const legacyRaw = normalizePathValue(input.rawPath);
  const canonicalPath = modernPath || legacyThumb || legacyNormalized || legacyRaw;

  const width = toNumber(input.width);
  const height = toNumber(input.height);
  if (!canonicalPath || width <= 0 || height <= 0) {
    return null;
  }

  const styleTag = normalizeStyleTag(input.styleTag);
  const explicitTags = Array.isArray(input.styleTags)
    ? input.styleTags.filter((value): value is string => typeof value === "string")
    : [];
  const styleTags = dedupeTags([...mapStyleTagToTags(styleTag), ...explicitTags]);

  const dHash = typeof input.dHash === "string" ? input.dHash.trim().toLowerCase() : undefined;
  const sourceZip = typeof input.sourceZip === "string" ? input.sourceZip.trim() : undefined;
  const originalName = typeof input.originalName === "string" ? input.originalName.trim() : undefined;
  const aspect = toNumber(input.aspect, width / height);
  const fileSize = toNumber(input.fileSize, 0);

  return {
    id,
    path: canonicalPath,
    width,
    height,
    aspect: aspect > 0 ? aspect : width / height,
    fileSize,
    dHash: dHash || undefined,
    styleTag,
    styleTags,
    sourceZip,
    originalName,
    rawPath: legacyRaw || canonicalPath,
    normalizedPath: legacyNormalized || canonicalPath,
    thumbPath: legacyThumb || canonicalPath
  };
}

function seedHash(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: string): () => number {
  let state = seedHash(seed) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function deterministicSample(pool: ReferenceLibraryItem[], seed: string, count: number): ReferenceLibraryItem[] {
  if (count <= 0 || pool.length === 0) {
    return [];
  }
  if (count >= pool.length) {
    return [...pool];
  }

  const rng = createSeededRandom(seed);
  const ordered = [...pool];
  for (let index = ordered.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const current = ordered[index];
    ordered[index] = ordered[swapIndex];
    ordered[swapIndex] = current;
  }

  return ordered.slice(0, count);
}

function dedupeById(items: ReferenceLibraryItem[]): ReferenceLibraryItem[] {
  const seen = new Set<string>();
  const result: ReferenceLibraryItem[] = [];

  for (const item of items) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    result.push(item);
  }

  return result;
}

function laneTags(lane: ReferenceOptionLane): string[] {
  if (lane === "A") {
    return ["minimal", "clean", "editorial", "grid"];
  }
  if (lane === "B") {
    return ["illustrative", "line-art", "ornament", "engraved"];
  }
  return ["photo", "cinematic", "texture", "textured"];
}

function haystack(item: ReferenceLibraryItem): string {
  const fileName = path.posix.basename(item.path).toLowerCase();
  const sourceZip = (item.sourceZip || "").toLowerCase();
  const originalName = (item.originalName || "").toLowerCase();
  return `${fileName} ${sourceZip} ${originalName} ${item.styleTag} ${item.styleTags.join(" ")}`;
}

function matchesLane(item: ReferenceLibraryItem, lane: ReferenceOptionLane): boolean {
  const tags = laneTags(lane);
  if (tags.includes(item.styleTag)) {
    return true;
  }

  const text = haystack(item);
  return tags.some((tag) => text.includes(tag));
}

async function readIndexFile(): Promise<string> {
  const primary = await readFile(INDEX_PATH_PRIMARY, "utf-8").catch(() => "");
  if (primary.trim()) {
    return primary;
  }
  return readFile(INDEX_PATH_LEGACY, "utf-8").catch(() => "");
}

export async function loadIndex(): Promise<ReferenceLibraryItem[]> {
  if (!cachedIndexPromise) {
    cachedIndexPromise = (async () => {
      const raw = await readIndexFile();
      if (!raw.trim()) {
        return [];
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.map(normalizeItem).filter((item): item is ReferenceLibraryItem => Boolean(item));
    })().catch(() => []);
  }

  return cachedIndexPromise;
}

export function resolveReferenceAbsolutePath(relativePath: string): string {
  return path.join(process.cwd(), relativePath.replace(/^\/+/, ""));
}

export async function sampleRefs(seed: string, n: number): Promise<ReferenceLibraryItem[]> {
  const count = Math.max(0, Math.floor(n));
  if (count === 0) {
    return [];
  }

  const index = await loadIndex();
  return deterministicSample(index, seed, count);
}

export async function sampleRefsForOption(params: {
  projectId: string;
  round: number;
  optionIndex: number;
  n: number;
}): Promise<ReferenceLibraryItem[]> {
  const count = Math.max(0, Math.floor(params.n));
  if (count === 0) {
    return [];
  }

  const lane: ReferenceOptionLane = params.optionIndex === 0 ? "A" : params.optionIndex === 1 ? "B" : "C";
  const seedBase = `${params.projectId}:${params.round}:${params.optionIndex}`;
  const allRefs = await loadIndex();
  if (allRefs.length === 0) {
    return [];
  }

  const preferredPool = allRefs.filter((item) => matchesLane(item, lane));
  const preferred = deterministicSample(preferredPool, `${seedBase}:preferred`, count);
  if (preferred.length >= count) {
    return preferred.slice(0, count);
  }

  const remainingPool = allRefs.filter((item) => !preferred.some((selected) => selected.id === item.id));
  const topUp = deterministicSample(remainingPool, `${seedBase}:fallback`, count - preferred.length);
  return dedupeById([...preferred, ...topUp]).slice(0, count);
}
