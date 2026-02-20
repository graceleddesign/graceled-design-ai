import fs from "node:fs/promises";
import path from "node:path";
import { slugifyFontFamily } from "./font-assets";

export type GoogleFontStyle = "normal" | "italic";

export type FetchGoogleFontsWoff2Params = {
  family: string;
  weights: number[];
  ital: boolean;
  subsets?: string[];
  projectRoot?: string;
  fetchImpl?: typeof fetch;
};

export type GoogleFontDownloadedVariant = {
  weight: number;
  style: GoogleFontStyle;
  relPath: string;
};

export type GoogleFontFetchResult = {
  family: string;
  variants: GoogleFontDownloadedVariant[];
};

export type ParsedGoogleFontFace = {
  style: GoogleFontStyle;
  weightMin: number;
  weightMax: number;
  url: string;
  subset: string | null;
  order: number;
};

type ResolvedGoogleFontVariant = {
  weight: number;
  style: GoogleFontStyle;
  url: string;
};

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function normalizeFamilyName(family: string): string {
  return family.trim().replace(/\s+/g, " ");
}

function normalizeWeights(weights: number[]): number[] {
  const unique = new Set<number>();
  for (const weight of weights) {
    if (!Number.isFinite(weight)) {
      continue;
    }
    const normalized = Math.max(100, Math.min(900, Math.round(weight / 100) * 100));
    unique.add(normalized);
  }
  return [...unique].sort((left, right) => left - right);
}

function normalizeSubsets(subsets?: string[]): string[] {
  if (!subsets) {
    return [];
  }

  const unique = new Set<string>();
  for (const subset of subsets) {
    const normalized = subset.trim().toLowerCase();
    if (normalized) {
      unique.add(normalized);
    }
  }
  return [...unique];
}

function rangeDistance(weight: number, min: number, max: number): number {
  if (weight < min) {
    return min - weight;
  }
  if (weight > max) {
    return weight - max;
  }
  return 0;
}

function parseWeightRange(value: string): { min: number; max: number } | null {
  const match = value.trim().match(/^(\d+)(?:\s+(\d+))?$/);
  if (!match) {
    return null;
  }

  const first = Number.parseInt(match[1], 10);
  const second = Number.parseInt(match[2] || match[1], 10);
  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    return null;
  }

  return {
    min: Math.min(first, second),
    max: Math.max(first, second)
  };
}

function cleanCssUrl(url: string): string {
  return url.trim().replace(/^['"]|['"]$/g, "");
}

export function buildGoogleFontsCss2Url(params: {
  family: string;
  weights: number[];
  ital: boolean;
  subsets?: string[];
}): string {
  const family = normalizeFamilyName(params.family);
  const weights = normalizeWeights(params.weights);
  if (!family) {
    throw new Error("Google Fonts fetch requires a non-empty family name.");
  }
  if (weights.length === 0) {
    throw new Error(`Google Fonts fetch requires at least one weight for ${family}.`);
  }

  const descriptor = params.ital
    ? `${family}:ital,wght@${weights.flatMap((weight) => [`0,${weight}`, `1,${weight}`]).join(";")}`
    : `${family}:wght@${weights.join(";")}`;

  const url = new URL("https://fonts.googleapis.com/css2");
  url.searchParams.set("family", descriptor);
  const subsets = normalizeSubsets(params.subsets);
  if (subsets.length > 0) {
    url.searchParams.set("subset", subsets.join(","));
  }
  url.searchParams.set("display", "swap");
  return url.toString();
}

export function parseGoogleFontsStylesheet(css: string): ParsedGoogleFontFace[] {
  const parsed: ParsedGoogleFontFace[] = [];
  const fontFaceRegex = /(?:\/\*\s*([^*]+?)\s*\*\/\s*)?@font-face\s*{([^}]*)}/gms;
  let match = fontFaceRegex.exec(css);
  let order = 0;

  while (match) {
    const subset = match[1] ? match[1].trim().toLowerCase() : null;
    const body = match[2];

    const styleMatch = /font-style\s*:\s*(normal|italic)\s*;/i.exec(body);
    const weightMatch = /font-weight\s*:\s*([^;]+);/i.exec(body);

    const srcRegex = /url\(([^)]+)\)\s*format\((?:'|")woff2(?:'|")\)/gi;
    const srcMatch = srcRegex.exec(body);

    if (!styleMatch || !weightMatch || !srcMatch) {
      match = fontFaceRegex.exec(css);
      continue;
    }

    const weightRange = parseWeightRange(weightMatch[1]);
    if (!weightRange) {
      match = fontFaceRegex.exec(css);
      continue;
    }

    parsed.push({
      style: styleMatch[1].toLowerCase() === "italic" ? "italic" : "normal",
      weightMin: weightRange.min,
      weightMax: weightRange.max,
      url: cleanCssUrl(srcMatch[1]),
      subset,
      order
    });

    order += 1;
    match = fontFaceRegex.exec(css);
  }

  return parsed;
}

export function resolveGoogleFontVariantUrls(params: {
  faces: readonly ParsedGoogleFontFace[];
  family: string;
  weights: number[];
  ital: boolean;
  subsets?: string[];
}): ResolvedGoogleFontVariant[] {
  const requestedWeights = normalizeWeights(params.weights);
  const subsets = normalizeSubsets(params.subsets);
  const subsetSet = new Set(subsets);
  const requestedStyles: GoogleFontStyle[] = params.ital ? ["normal", "italic"] : ["normal"];

  const resolved: ResolvedGoogleFontVariant[] = [];

  for (const style of requestedStyles) {
    for (const weight of requestedWeights) {
      const byStyle = params.faces.filter((face) => face.style === style);
      const preferredSubset =
        subsetSet.size > 0 ? byStyle.filter((face) => face.subset && subsetSet.has(face.subset)) : byStyle;
      const candidates = preferredSubset.length > 0 ? preferredSubset : byStyle;

      if (candidates.length === 0) {
        throw new Error(`No ${style} variant found in Google CSS for ${params.family}.`);
      }

      const selected = [...candidates].sort((left, right) => {
        const distanceDiff =
          rangeDistance(weight, left.weightMin, left.weightMax) - rangeDistance(weight, right.weightMin, right.weightMax);
        if (distanceDiff !== 0) {
          return distanceDiff;
        }
        const widthLeft = left.weightMax - left.weightMin;
        const widthRight = right.weightMax - right.weightMin;
        if (widthLeft !== widthRight) {
          return widthLeft - widthRight;
        }
        return left.order - right.order;
      })[0];

      resolved.push({
        weight,
        style,
        url: selected.url
      });
    }
  }

  return resolved;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function fetchGoogleFontsWoff2(params: FetchGoogleFontsWoff2Params): Promise<GoogleFontFetchResult> {
  const family = normalizeFamilyName(params.family);
  const weights = normalizeWeights(params.weights);
  if (!family) {
    throw new Error("Google Fonts fetch requires --family.");
  }
  if (weights.length === 0) {
    throw new Error(`Google Fonts fetch requires at least one weight for ${family}.`);
  }

  const fetchImpl = params.fetchImpl || fetch;
  const cssUrl = buildGoogleFontsCss2Url({
    family,
    weights,
    ital: params.ital,
    subsets: params.subsets
  });

  const cssResponse = await fetchImpl(cssUrl, {
    headers: {
      "User-Agent": BROWSER_USER_AGENT,
      Accept: "text/css,*/*;q=0.1"
    }
  });

  if (!cssResponse.ok) {
    throw new Error(`Google Fonts CSS request failed for ${family}: ${cssResponse.status} ${cssResponse.statusText}`);
  }

  const css = await cssResponse.text();
  const faces = parseGoogleFontsStylesheet(css);
  if (faces.length === 0) {
    throw new Error(`No WOFF2 sources found in Google Fonts CSS for ${family}.`);
  }

  const resolvedVariants = resolveGoogleFontVariantUrls({
    faces,
    family,
    weights,
    ital: params.ital,
    subsets: params.subsets
  });

  const projectRoot = params.projectRoot || process.cwd();
  const familySlug = slugifyFontFamily(family);
  const outputDir = path.join(projectRoot, "public", "fonts", "google", familySlug);
  await fs.mkdir(outputDir, { recursive: true });

  const binaryByUrl = new Map<string, Buffer>();
  const variants: GoogleFontDownloadedVariant[] = [];

  for (const variant of resolvedVariants) {
    const fileName = `${familySlug}-w${variant.weight}-${variant.style}.woff2`;
    const absolutePath = path.join(outputDir, fileName);
    const relPath = `/fonts/google/${familySlug}/${fileName}`;

    if (!(await pathExists(absolutePath))) {
      let bytes = binaryByUrl.get(variant.url);
      if (!bytes) {
        const fontResponse = await fetchImpl(variant.url, {
          headers: {
            "User-Agent": BROWSER_USER_AGENT
          }
        });
        if (!fontResponse.ok) {
          throw new Error(`Google Fonts file download failed (${variant.url}): ${fontResponse.status} ${fontResponse.statusText}`);
        }
        bytes = Buffer.from(await fontResponse.arrayBuffer());
        binaryByUrl.set(variant.url, bytes);
      }
      await fs.writeFile(absolutePath, bytes);
    }

    variants.push({
      weight: variant.weight,
      style: variant.style,
      relPath
    });
  }

  return {
    family,
    variants: variants.sort((left, right) => {
      if (left.weight !== right.weight) {
        return left.weight - right.weight;
      }
      if (left.style !== right.style) {
        return left.style === "normal" ? -1 : 1;
      }
      return left.relPath.localeCompare(right.relPath);
    })
  };
}
