import "server-only";

import { readdir, readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

export type StyleRef = {
  path: string;
  dataUrl: string;
  mime: string;
  width?: number;
  height?: number;
};

type StyleRefWithFeatures = StyleRef & {
  features: [number, number, number, number];
};

const STYLE_LIBRARY_DIR = path.join(process.cwd(), "public", "style_library");
const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function mimeFromExt(extension: string): string | null {
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  return null;
}

function normalizeRelativePath(relativePath: string): string {
  return path.posix.join("style_library", relativePath.split(path.sep).join(path.posix.sep));
}

async function walkLibraryFiles(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true }).catch(() => null);
  if (!entries) {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const nextPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkLibraryFiles(nextPath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(extension)) {
      files.push(nextPath);
    }
  }

  return files;
}

function euclideanDistance(a: readonly number[], b: readonly number[]): number {
  let total = 0;
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const delta = a[index] - b[index];
    total += delta * delta;
  }
  return Math.sqrt(total);
}

function randomIntInclusive(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(items: readonly T[]): T[] {
  const clone = [...items];
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = clone[index];
    clone[index] = clone[swapIndex];
    clone[swapIndex] = current;
  }
  return clone;
}

function sampleUnique<T>(items: readonly T[], count: number): T[] {
  if (count <= 0 || items.length === 0) {
    return [];
  }

  if (count >= items.length) {
    return [...items];
  }

  return shuffle(items).slice(0, count);
}

async function listStyleRefsWithFeatures(): Promise<StyleRefWithFeatures[]> {
  const files = await walkLibraryFiles(STYLE_LIBRARY_DIR);
  if (files.length === 0) {
    return [];
  }

  const refs = await Promise.all(
    files.map(async (absolutePath) => {
      const extension = path.extname(absolutePath).toLowerCase();
      const mime = mimeFromExt(extension);
      if (!mime) {
        return null;
      }

      const bytes = await readFile(absolutePath);
      const image = sharp(bytes, { failOn: "none" });
      const [stats, metadata] = await Promise.all([image.stats(), image.metadata()]);

      const red = stats.channels[0]?.mean ?? 0;
      const green = stats.channels[1]?.mean ?? red;
      const blue = stats.channels[2]?.mean ?? green;
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const relative = normalizeRelativePath(path.relative(STYLE_LIBRARY_DIR, absolutePath));

      return {
        path: relative,
        dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
        mime,
        width: typeof metadata.width === "number" ? metadata.width : undefined,
        height: typeof metadata.height === "number" ? metadata.height : undefined,
        features: [red, green, blue, luminance] as [number, number, number, number]
      } satisfies StyleRefWithFeatures;
    })
  );

  const filtered: StyleRefWithFeatures[] = [];
  for (const ref of refs) {
    if (ref) {
      filtered.push(ref);
    }
  }

  return filtered;
}

function farthestPointCenters(refs: StyleRefWithFeatures[], centerCount: number): StyleRefWithFeatures[] {
  if (centerCount <= 0 || refs.length === 0) {
    return [];
  }

  const centers: StyleRefWithFeatures[] = [refs[Math.floor(Math.random() * refs.length)]];
  while (centers.length < centerCount) {
    let farthestRef: StyleRefWithFeatures | null = null;
    let farthestDistance = -1;

    for (const candidate of refs) {
      const nearestDistance = Math.min(
        ...centers.map((center) => euclideanDistance(candidate.features, center.features))
      );
      if (nearestDistance > farthestDistance) {
        farthestDistance = nearestDistance;
        farthestRef = candidate;
      }
    }

    if (!farthestRef) {
      break;
    }

    centers.push(farthestRef);
  }

  return centers;
}

function clusterByNearestCenter(refs: StyleRefWithFeatures[], centers: StyleRefWithFeatures[]): StyleRefWithFeatures[][] {
  const clusters = centers.map(() => [] as StyleRefWithFeatures[]);

  for (const ref of refs) {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < centers.length; index += 1) {
      const distance = euclideanDistance(ref.features, centers[index].features);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }

    clusters[nearestIndex].push(ref);
  }

  return clusters;
}

function toStyleRef(ref: StyleRefWithFeatures): StyleRef {
  return {
    path: ref.path,
    dataUrl: ref.dataUrl,
    mime: ref.mime,
    width: ref.width,
    height: ref.height
  };
}

export async function listStyleRefs(): Promise<StyleRef[]> {
  const refs = await listStyleRefsWithFeatures();
  return refs.map(toStyleRef);
}

export async function pickStyleRefsForOptions(countOptions: number): Promise<StyleRef[][]> {
  const targetOptions = Math.max(0, Math.floor(countOptions));
  if (targetOptions === 0) {
    return [];
  }

  const refs = await listStyleRefsWithFeatures();
  if (refs.length === 0) {
    return [];
  }

  if (refs.length < 6) {
    const sampled = Array.from({ length: targetOptions }, () => {
      const sampleCount = Math.min(refs.length, Math.max(1, Math.min(3, refs.length)));
      return sampleUnique(refs, sampleCount).map(toStyleRef);
    });
    return sampled;
  }

  const clusterCount = Math.min(3, targetOptions, refs.length);
  const centers = farthestPointCenters(refs, clusterCount);
  const rawClusters = clusterByNearestCenter(refs, centers).filter((cluster) => cluster.length > 0);
  const clusters = rawClusters.length > 0 ? rawClusters : [refs];

  return Array.from({ length: targetOptions }, (_, optionIndex) => {
    const cluster = clusters[optionIndex % clusters.length];
    const sampleCount = Math.min(cluster.length, randomIntInclusive(3, 6));
    const selected = sampleUnique(cluster, sampleCount);

    if (selected.length >= 3 || refs.length <= selected.length) {
      return selected.map(toStyleRef);
    }

    const selectedPaths = new Set(selected.map((item) => item.path));
    const remainder = refs.filter((item) => !selectedPaths.has(item.path));
    const topUp = sampleUnique(remainder, Math.min(3 - selected.length, remainder.length));
    return [...selected, ...topUp].map(toStyleRef);
  });
}
