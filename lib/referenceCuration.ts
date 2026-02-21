import "server-only";

import { readFile, writeFile } from "fs/promises";
import path from "path";

export const REFERENCE_TIERS = ["pro", "experimental", "fun"] as const;
export const REFERENCE_CLUSTERS = [
  "minimal",
  "editorial_photo",
  "bold_type",
  "illustration",
  "modern_abstract",
  "cinematic",
  "architectural",
  "retro_print",
  "texture",
  "other"
] as const;

export type ReferenceTier = (typeof REFERENCE_TIERS)[number];
export type ReferenceCluster = (typeof REFERENCE_CLUSTERS)[number];

export type ReferenceCurationItem = {
  tier: ReferenceTier;
  cluster: ReferenceCluster;
  tags: string[];
};

export type ReferenceCurationFile = {
  version: 1;
  items: Record<string, ReferenceCurationItem>;
};

export type ReferenceIndexItem = {
  id: string;
  rawPath: string;
  normalizedPath: string;
  thumbPath: string;
  width: number;
  height: number;
  aspect: number;
  fileSize: number;
  dHash?: string;
  styleTags: string[];
};

export type CuratedReference = ReferenceIndexItem &
  ReferenceCurationItem & {
    thumbUrl: string;
  };

const INDEX_PATH = path.join(process.cwd(), "reference_library", "index.json");
const CURATION_PATH = path.join(process.cwd(), "reference_library", "curation.json");

const DEFAULT_TIER: ReferenceTier = "experimental";
const DEFAULT_CLUSTER: ReferenceCluster = "other";

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

function normalizeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    const normalized = item.trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function isReferenceTier(value: unknown): value is ReferenceTier {
  return typeof value === "string" && (REFERENCE_TIERS as readonly string[]).includes(value);
}

function isReferenceCluster(value: unknown): value is ReferenceCluster {
  return typeof value === "string" && (REFERENCE_CLUSTERS as readonly string[]).includes(value);
}

function normalizeTier(value: unknown): ReferenceTier {
  return isReferenceTier(value) ? value : DEFAULT_TIER;
}

function normalizeCluster(value: unknown): ReferenceCluster {
  return isReferenceCluster(value) ? value : DEFAULT_CLUSTER;
}

function normalizeIndexItem(value: unknown): ReferenceIndexItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!id) {
    return null;
  }

  const width = normalizeNumber(value.width, 0);
  const height = normalizeNumber(value.height, 0);
  if (width <= 0 || height <= 0) {
    return null;
  }

  const rawPath = normalizePath(value.rawPath);
  const normalizedPath = normalizePath(value.normalizedPath);
  const thumbPath = normalizePath(value.thumbPath);
  if (!rawPath || !normalizedPath || !thumbPath) {
    return null;
  }

  const aspect = normalizeNumber(value.aspect, width / height);
  const fileSize = normalizeNumber(value.fileSize, 0);
  const dHash = typeof value.dHash === "string" ? value.dHash.trim() : undefined;
  const styleTags = normalizeStringArray(value.styleTags);

  return {
    id,
    rawPath,
    normalizedPath,
    thumbPath,
    width,
    height,
    aspect: aspect > 0 ? aspect : width / height,
    fileSize,
    dHash: dHash || undefined,
    styleTags
  };
}

function defaultCurationItem(): ReferenceCurationItem {
  return {
    tier: DEFAULT_TIER,
    cluster: DEFAULT_CLUSTER,
    tags: []
  };
}

export function normalizeCurationItem(value: unknown): ReferenceCurationItem {
  if (!isRecord(value)) {
    return defaultCurationItem();
  }

  return {
    tier: normalizeTier(value.tier),
    cluster: normalizeCluster(value.cluster),
    tags: normalizeStringArray(value.tags)
  };
}

export function isDefaultCurationItem(value: ReferenceCurationItem): boolean {
  return value.tier === DEFAULT_TIER && value.cluster === DEFAULT_CLUSTER && value.tags.length === 0;
}

export function normalizeCurationItems(value: unknown, options?: { keepDefaults?: boolean }): Record<string, ReferenceCurationItem> {
  if (!isRecord(value)) {
    return {};
  }

  const keepDefaults = options?.keepDefaults === true;
  const entries: Array<[string, ReferenceCurationItem]> = [];

  for (const [rawId, rawItem] of Object.entries(value)) {
    const id = rawId.trim();
    if (!id) {
      continue;
    }
    const normalized = normalizeCurationItem(rawItem);
    if (!keepDefaults && isDefaultCurationItem(normalized)) {
      continue;
    }
    entries.push([id, normalized]);
  }

  entries.sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

function toPublicThumbUrl(thumbPath: string): string {
  const normalized = normalizePath(thumbPath).replace(/^\/+/, "");
  if (!normalized) {
    return "";
  }
  if (normalized.startsWith("public/")) {
    return `/${normalized.slice("public/".length)}`;
  }
  return `/${normalized}`;
}

export async function loadReferenceIndex(): Promise<ReferenceIndexItem[]> {
  const raw = await readFile(INDEX_PATH, "utf-8").catch(() => "");
  if (!raw.trim()) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.map(normalizeIndexItem).filter((item): item is ReferenceIndexItem => Boolean(item));
}

export async function loadCuration(): Promise<ReferenceCurationFile> {
  const raw = await readFile(CURATION_PATH, "utf-8").catch(() => "");
  if (!raw.trim()) {
    return { version: 1, items: {} };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { version: 1, items: {} };
  }

  if (!isRecord(parsed)) {
    return { version: 1, items: {} };
  }

  const items = normalizeCurationItems(parsed.items, { keepDefaults: true });
  return {
    version: 1,
    items
  };
}

export async function saveCuration(items: unknown): Promise<ReferenceCurationFile> {
  const normalized = normalizeCurationItems(items);
  const payload: ReferenceCurationFile = {
    version: 1,
    items: normalized
  };
  await writeFile(CURATION_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  return payload;
}

export async function getCuratedReferences(): Promise<CuratedReference[]> {
  const [index, curation] = await Promise.all([loadReferenceIndex(), loadCuration()]);

  return index.map((item) => {
    const curated = curation.items[item.id] ?? defaultCurationItem();
    return {
      ...item,
      tier: curated.tier,
      cluster: curated.cluster,
      tags: curated.tags,
      thumbUrl: toPublicThumbUrl(item.thumbPath)
    };
  });
}

export async function getProPool(): Promise<CuratedReference[]> {
  const refs = await getCuratedReferences();
  return refs.filter((ref) => ref.tier === "pro");
}

export async function getPoolByCluster(cluster: ReferenceCluster): Promise<CuratedReference[]> {
  const refs = await getCuratedReferences();
  return refs.filter((ref) => ref.cluster === cluster);
}
