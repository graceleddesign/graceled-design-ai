import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

type IndexedReferenceImage = {
  relativePath: string;
  width: number;
  height: number;
  minimalScore: number;
};

type ReferenceIndex = {
  generatedAt: string;
  root: string;
  count: number;
  images: IndexedReferenceImage[];
};

const REFERENCE_ROOT = path.join(process.cwd(), "reference");
const SERMON_SERIES_ROOT = path.join(REFERENCE_ROOT, "sermon-series");
const INDEX_FILE = path.join(REFERENCE_ROOT, "index.json");
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function toPosixPath(input: string): string {
  return input.split(path.sep).join(path.posix.sep);
}

async function walkFiles(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => [] as Awaited<ReturnType<typeof readdir>>);
  const files: string[] = [];

  for (const entry of entries) {
    const entryName = typeof entry.name === "string" ? entry.name : entry.name.toString("utf-8");
    const next = path.join(rootDir, entryName);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(next)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entryName).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(extension)) {
      files.push(next);
    }
  }

  return files;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function scoreBrightness(meanBrightness: number): number {
  const target = 0.82;
  const distance = Math.abs(meanBrightness - target);
  return clamp01(1 - distance / target);
}

function scoreSaturation(meanSaturation: number): number {
  return clamp01(1 - meanSaturation / 0.45);
}

function scoreEdgeDensity(edgeDensity: number): number {
  return clamp01(1 - edgeDensity / 0.2);
}

function computeMinimalScoreFromRaw(raw: Buffer, width: number, height: number): number {
  if (width <= 1 || height <= 1) {
    return 0;
  }

  const channels = 3;
  const totalPixels = width * height;
  let brightnessSum = 0;
  let saturationSum = 0;
  let edgeHits = 0;
  let edgeChecks = 0;

  const luminanceAt = (pixelIndex: number): number => {
    const base = pixelIndex * channels;
    const r = raw[base] / 255;
    const g = raw[base + 1] / 255;
    const b = raw[base + 2] / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      const base = pixelIndex * channels;
      const r = raw[base] / 255;
      const g = raw[base + 1] / 255;
      const b = raw[base + 2] / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max <= 0 ? 0 : (max - min) / max;

      brightnessSum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      saturationSum += saturation;

      if (x + 1 < width) {
        const rightLum = luminanceAt(pixelIndex + 1);
        if (Math.abs(luminanceAt(pixelIndex) - rightLum) > 0.12) {
          edgeHits += 1;
        }
        edgeChecks += 1;
      }

      if (y + 1 < height) {
        const belowLum = luminanceAt(pixelIndex + width);
        if (Math.abs(luminanceAt(pixelIndex) - belowLum) > 0.12) {
          edgeHits += 1;
        }
        edgeChecks += 1;
      }
    }
  }

  const meanBrightness = brightnessSum / totalPixels;
  const meanSaturation = saturationSum / totalPixels;
  const edgeDensity = edgeChecks > 0 ? edgeHits / edgeChecks : 0;

  const brightnessScore = scoreBrightness(meanBrightness);
  const saturationScore = scoreSaturation(meanSaturation);
  const edgeScore = scoreEdgeDensity(edgeDensity);

  const combined = 0.45 * brightnessScore + 0.35 * saturationScore + 0.2 * edgeScore;
  return Math.round(combined * 1000) / 1000;
}

async function indexImage(absolutePath: string): Promise<IndexedReferenceImage | null> {
  const bytes = await readFile(absolutePath);
  const image = sharp(bytes, { failOn: "none" });
  const metadata = await image.metadata();

  const width = typeof metadata.width === "number" ? metadata.width : 0;
  const height = typeof metadata.height === "number" ? metadata.height : 0;
  if (width <= 0 || height <= 0) {
    return null;
  }

  const target = 256;
  const { data, info } = await image
    .resize({
      width: target,
      height: target,
      fit: "inside",
      withoutEnlargement: true
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const minimalScore = computeMinimalScoreFromRaw(data, info.width, info.height);

  return {
    relativePath: toPosixPath(path.relative(REFERENCE_ROOT, absolutePath)),
    width,
    height,
    minimalScore
  };
}

async function main(): Promise<void> {
  await mkdir(REFERENCE_ROOT, { recursive: true });
  await mkdir(SERMON_SERIES_ROOT, { recursive: true });

  const files = await walkFiles(SERMON_SERIES_ROOT);
  const indexed = (
    await Promise.all(
      files.map(async (file) => {
        try {
          return await indexImage(file);
        } catch {
          return null;
        }
      })
    )
  ).filter((item): item is IndexedReferenceImage => Boolean(item));

  indexed.sort((a, b) => b.minimalScore - a.minimalScore);

  const output: ReferenceIndex = {
    generatedAt: new Date().toISOString(),
    root: "reference",
    count: indexed.length,
    images: indexed
  };

  await writeFile(INDEX_FILE, `${JSON.stringify(output, null, 2)}\n`, "utf-8");

  console.log(`Indexed ${output.count} reference images -> ${path.relative(process.cwd(), INDEX_FILE)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
