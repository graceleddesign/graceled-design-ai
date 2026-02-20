import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { getFontAssetSource, getFontAssetsByFamily, toPublicFontPath, type FontAsset } from "@/src/design/fonts/font-assets";

export const CURATED_FONT_FAMILIES = [
  "Abril Fatface",
  "Alfa Slab One",
  "Archivo Narrow",
  "Assistant",
  "Bodoni Moda",
  "Libre Bodoni",
  "Source Sans 3",
  "Work Sans",
  "Manrope",
  "Public Sans",
  "Libre Franklin",
  "Noto Sans",
  "Prata",
  "Unna",
  "Cinzel Decorative",
  "Fjalla One",
  "Spectral SC",
  "Fraunces",
  "DM Serif Display",
  "Cinzel",
  "Cormorant Garamond",
  "Playfair Display",
  "Inter",
  "IBM Plex Sans",
  "Oswald",
  "Bebas Neue",
  "Space Grotesk"
] as const;

export type CuratedFontFamily = (typeof CURATED_FONT_FAMILIES)[number];

type CuratedFontConfig = {
  packageName: string;
  fallbacks: string[];
};

type FontFileIndex = {
  normal: Map<number, string>;
  italic: Map<number, string>;
};

type LocalFontFileIndex = {
  normal: Map<number, FontAsset>;
  italic: Map<number, FontAsset>;
};

type RequestedFontFace = {
  family: string;
  weight?: number;
  style?: "normal" | "italic";
};

const FONT_CONFIG: Record<CuratedFontFamily, CuratedFontConfig> = {
  Fraunces: {
    packageName: "fraunces",
    fallbacks: ["serif"]
  },
  "Abril Fatface": {
    packageName: "abril-fatface",
    fallbacks: ["serif"]
  },
  "Alfa Slab One": {
    packageName: "alfa-slab-one",
    fallbacks: ["serif"]
  },
  "Archivo Narrow": {
    packageName: "archivo-narrow",
    fallbacks: ["sans-serif"]
  },
  Assistant: {
    packageName: "assistant",
    fallbacks: ["sans-serif"]
  },
  "Bodoni Moda": {
    packageName: "bodoni-moda",
    fallbacks: ["serif"]
  },
  "Libre Bodoni": {
    packageName: "libre-bodoni",
    fallbacks: ["serif"]
  },
  "Source Sans 3": {
    packageName: "source-sans-3",
    fallbacks: ["sans-serif"]
  },
  "Work Sans": {
    packageName: "work-sans",
    fallbacks: ["sans-serif"]
  },
  Manrope: {
    packageName: "manrope",
    fallbacks: ["sans-serif"]
  },
  "Public Sans": {
    packageName: "public-sans",
    fallbacks: ["sans-serif"]
  },
  "Libre Franklin": {
    packageName: "libre-franklin",
    fallbacks: ["sans-serif"]
  },
  "Noto Sans": {
    packageName: "noto-sans",
    fallbacks: ["sans-serif"]
  },
  Prata: {
    packageName: "prata",
    fallbacks: ["serif"]
  },
  Unna: {
    packageName: "unna",
    fallbacks: ["serif"]
  },
  "Cinzel Decorative": {
    packageName: "cinzel-decorative",
    fallbacks: ["serif"]
  },
  "Fjalla One": {
    packageName: "fjalla-one",
    fallbacks: ["sans-serif"]
  },
  "Spectral SC": {
    packageName: "spectral-sc",
    fallbacks: ["serif"]
  },
  "DM Serif Display": {
    packageName: "dm-serif-display",
    fallbacks: ["serif"]
  },
  Cinzel: {
    packageName: "cinzel",
    fallbacks: ["serif"]
  },
  "Cormorant Garamond": {
    packageName: "cormorant-garamond",
    fallbacks: ["serif"]
  },
  "Playfair Display": {
    packageName: "playfair-display",
    fallbacks: ["serif"]
  },
  Inter: {
    packageName: "inter",
    fallbacks: ["sans-serif"]
  },
  "IBM Plex Sans": {
    packageName: "ibm-plex-sans",
    fallbacks: ["sans-serif"]
  },
  Oswald: {
    packageName: "oswald",
    fallbacks: ["sans-serif"]
  },
  "Bebas Neue": {
    packageName: "bebas-neue",
    fallbacks: ["sans-serif"]
  },
  "Space Grotesk": {
    packageName: "space-grotesk",
    fallbacks: ["sans-serif"]
  }
};

const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "emoji",
  "math",
  "fangsong",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace"
]);

const ALIAS_TO_FAMILY = new Map<string, CuratedFontFamily>(
  CURATED_FONT_FAMILIES.map((family) => [family.toLowerCase(), family])
);

const fontFileIndexCache = new Map<CuratedFontFamily, FontFileIndex>();
const localFileIndexCache = new Map<string, LocalFontFileIndex>();
const dataUriCache = new Map<string, string>();
const warnedMissingGoogleFamilies = new Set<string>();

function escapeCssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function fontFamilyCssValue(family: string): string {
  return `'${escapeCssString(family)}'`;
}

function normalizeWeight(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 400;
  }
  return Math.max(100, Math.min(900, Math.round(value / 100) * 100));
}

function normalizeStyle(value: RequestedFontFace["style"]): "normal" | "italic" {
  return value === "italic" ? "italic" : "normal";
}

function parseFileName(fileName: string): { subset: string; weight: number; style: "normal" | "italic" } | null {
  const match = /-(latin(?:-ext)?)-(\d+)-(normal|italic)\.woff2$/i.exec(fileName);
  if (!match) {
    return null;
  }

  const weight = Number.parseInt(match[2], 10);
  if (!Number.isFinite(weight)) {
    return null;
  }

  return {
    subset: match[1].toLowerCase(),
    weight,
    style: match[3] === "italic" ? "italic" : "normal"
  };
}

function nearestWeight(weights: number[], requestedWeight: number): number {
  if (weights.length === 0) {
    return requestedWeight;
  }

  return weights.reduce((best, current) => {
    const currentDistance = Math.abs(current - requestedWeight);
    const bestDistance = Math.abs(best - requestedWeight);
    if (currentDistance < bestDistance) {
      return current;
    }
    if (currentDistance === bestDistance) {
      return current < best ? current : best;
    }
    return best;
  }, weights[0]);
}

function readDataUriFromFile(filePath: string): string {
  const cached = dataUriCache.get(filePath);
  if (cached) {
    return cached;
  }
  const bytes = fs.readFileSync(filePath);
  const dataUri = `data:font/woff2;base64,${bytes.toString("base64")}`;
  dataUriCache.set(filePath, dataUri);
  return dataUri;
}

function parseFamilyTokens(fontFamily: string): string[] {
  return fontFamily
    .split(",")
    .map((token) => token.trim().replace(/^['"]+|['"]+$/g, "").trim())
    .filter((token) => Boolean(token) && !GENERIC_FAMILIES.has(token.toLowerCase()));
}

function getPublicFilePathFromUrl(urlPath: string): string | null {
  if (!urlPath || /^https?:\/\//i.test(urlPath)) {
    return null;
  }

  const publicRoot = path.join(process.cwd(), "public");
  const relative = urlPath.replace(/^\/+/, "");
  const absolutePath = path.resolve(publicRoot, relative);
  const publicPrefix = `${publicRoot}${path.sep}`;
  if (absolutePath !== publicRoot && !absolutePath.startsWith(publicPrefix)) {
    return null;
  }
  return absolutePath;
}

function shouldAutoFetchGoogleFonts(): boolean {
  return process.env.GOOGLE_FONTS_AUTO_FETCH === "1";
}

function warnMissingGoogleFamily(family: string): void {
  const key = family.trim().toLowerCase();
  if (!key || warnedMissingGoogleFamilies.has(key)) {
    return;
  }
  warnedMissingGoogleFamilies.add(key);
  console.warn(
    `[font-registry] Missing local Google font files for "${family}". Falling back to embedded curated fonts. Run "npm run fonts:sync" or set GOOGLE_FONTS_AUTO_FETCH=1.`
  );
}

function isGoogleFamilyConfigured(family: string): boolean {
  return getFontAssetsByFamily(family).some((asset) => getFontAssetSource(asset) === "google");
}

function autoFetchGoogleFamily(request: { family: string; weights: number[]; ital: boolean }): boolean {
  if (!shouldAutoFetchGoogleFonts()) {
    return false;
  }

  const scriptPath = path.join(process.cwd(), "scripts", "fetch-fonts-google.ts");
  if (!fs.existsSync(scriptPath)) {
    console.warn(`[font-registry] GOOGLE_FONTS_AUTO_FETCH=1 but ${scriptPath} was not found.`);
    return false;
  }

  const weights = [...new Set(request.weights)]
    .filter((weight) => Number.isFinite(weight))
    .sort((left, right) => left - right);

  if (weights.length === 0) {
    return false;
  }

  const args = ["--import", "tsx", scriptPath, "add", "--family", request.family, "--weights", weights.join(",")];
  if (request.ital) {
    args.push("--ital");
  }

  try {
    execFileSync(process.execPath, args, {
      cwd: process.cwd(),
      stdio: "pipe",
      timeout: 20_000
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[font-registry] Failed to auto-fetch Google font "${request.family}": ${message}`);
    return false;
  }
}

function listLocalFontFiles(family: string): LocalFontFileIndex {
  const key = family.toLowerCase();
  const cached = localFileIndexCache.get(key);
  if (cached) {
    return cached;
  }

  const normal = new Map<number, FontAsset>();
  const italic = new Map<number, FontAsset>();

  for (const asset of getFontAssetsByFamily(family)) {
    const publicPath = toPublicFontPath(asset.file);
    const absolutePath = getPublicFilePathFromUrl(publicPath);
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      continue;
    }
    if (asset.style === "italic") {
      italic.set(asset.weight, asset);
    } else {
      normal.set(asset.weight, asset);
    }
  }

  const index = {
    normal,
    italic
  };
  localFileIndexCache.set(key, index);
  return index;
}

function listCuratedFontFiles(family: CuratedFontFamily): FontFileIndex {
  const cached = fontFileIndexCache.get(family);
  if (cached) {
    return cached;
  }

  const config = FONT_CONFIG[family];
  const filesDir = path.join(process.cwd(), "node_modules", "@fontsource", config.packageName, "files");
  const entries = fs.existsSync(filesDir) ? fs.readdirSync(filesDir) : [];
  const normal = new Map<number, string>();
  const italic = new Map<number, string>();

  for (const fileName of entries) {
    if (!fileName.endsWith(".woff2")) {
      continue;
    }
    const parsed = parseFileName(fileName);
    if (!parsed || parsed.subset !== "latin") {
      continue;
    }
    const fullPath = path.join(filesDir, fileName);
    if (parsed.style === "italic") {
      italic.set(parsed.weight, fullPath);
    } else {
      normal.set(parsed.weight, fullPath);
    }
  }

  if (normal.size === 0 || italic.size === 0) {
    for (const fileName of entries) {
      if (!fileName.endsWith(".woff2")) {
        continue;
      }
      const parsed = parseFileName(fileName);
      if (!parsed) {
        continue;
      }
      const fullPath = path.join(filesDir, fileName);
      if (parsed.style === "normal" && !normal.has(parsed.weight)) {
        normal.set(parsed.weight, fullPath);
      }
      if (parsed.style === "italic" && !italic.has(parsed.weight)) {
        italic.set(parsed.weight, fullPath);
      }
    }
  }

  const index = { normal, italic };
  fontFileIndexCache.set(family, index);
  return index;
}

function addRequestedWeight(
  requestsByFamily: Map<string, Map<"normal" | "italic", Set<number>>>,
  family: string,
  style: "normal" | "italic",
  weight: number
): void {
  const byStyle = requestsByFamily.get(family) || new Map<"normal" | "italic", Set<number>>();
  const requestedWeights = byStyle.get(style) || new Set<number>();
  requestedWeights.add(weight);
  byStyle.set(style, requestedWeights);
  requestsByFamily.set(family, byStyle);
}

function buildLocalAssetFontFaceCss(
  requestsByFamily: Map<string, Map<"normal" | "italic", Set<number>>>,
  allowAutoFetch = true
): { css: string; unresolvedRequests: RequestedFontFace[] } {
  const rules = new Set<string>();
  const unresolvedRequests: RequestedFontFace[] = [];
  const families = [...requestsByFamily.keys()].sort((a, b) => a.localeCompare(b));

  for (const family of families) {
    const byStyle = requestsByFamily.get(family);
    if (!byStyle) {
      continue;
    }

    const files = listLocalFontFiles(family);
    const hasAny = files.normal.size > 0 || files.italic.size > 0;
    if (!hasAny) {
      for (const [style, requestedWeights] of byStyle.entries()) {
        for (const requestedWeight of requestedWeights) {
          unresolvedRequests.push({
            family,
            style,
            weight: requestedWeight
          });
        }
      }
      continue;
    }

    for (const [style, requestedWeights] of byStyle.entries()) {
      const availableMap = style === "italic" && files.italic.size > 0 ? files.italic : files.normal;
      const availableWeights = [...availableMap.keys()].sort((a, b) => a - b);
      if (availableWeights.length === 0) {
        for (const requestedWeight of requestedWeights) {
          unresolvedRequests.push({
            family,
            style,
            weight: requestedWeight
          });
        }
        continue;
      }

      for (const requestedWeight of requestedWeights) {
        const resolvedWeight = nearestWeight(availableWeights, requestedWeight);
        const asset = availableMap.get(resolvedWeight);
        if (!asset) {
          unresolvedRequests.push({
            family,
            style,
            weight: requestedWeight
          });
          continue;
        }
        const absolutePath = getPublicFilePathFromUrl(toPublicFontPath(asset.file));
        if (!absolutePath || !fs.existsSync(absolutePath)) {
          unresolvedRequests.push({
            family,
            style,
            weight: requestedWeight
          });
          continue;
        }
        const dataUri = readDataUriFromFile(absolutePath);
        rules.add(
          `@font-face{font-family:${fontFamilyCssValue(asset.family)};font-style:${style};font-weight:${asset.weight};font-display:block;src:url(${dataUri}) format('woff2');}`
        );
      }
    }
  }

  if (allowAutoFetch && unresolvedRequests.length > 0) {
    const pendingGoogleRequests = new Map<string, { family: string; weights: Set<number>; ital: boolean }>();
    for (const unresolved of unresolvedRequests) {
      if (!isGoogleFamilyConfigured(unresolved.family)) {
        continue;
      }
      const key = unresolved.family.trim().toLowerCase();
      const existing = pendingGoogleRequests.get(key) || {
        family: unresolved.family,
        weights: new Set<number>(),
        ital: false
      };
      existing.weights.add(normalizeWeight(unresolved.weight));
      if (unresolved.style === "italic") {
        existing.ital = true;
      }
      pendingGoogleRequests.set(key, existing);
    }

    if (pendingGoogleRequests.size > 0) {
      if (shouldAutoFetchGoogleFonts()) {
        let fetchedAny = false;
        for (const request of pendingGoogleRequests.values()) {
          const didFetch = autoFetchGoogleFamily({
            family: request.family,
            weights: [...request.weights],
            ital: request.ital
          });
          fetchedAny = fetchedAny || didFetch;
        }

        if (fetchedAny) {
          localFileIndexCache.clear();
          dataUriCache.clear();
          return buildLocalAssetFontFaceCss(requestsByFamily, false);
        }
      } else {
        for (const request of pendingGoogleRequests.values()) {
          warnMissingGoogleFamily(request.family);
        }
      }
    }
  }

  return {
    css: [...rules].join("\n"),
    unresolvedRequests
  };
}

function buildCuratedFallbackFontFaceCss(fontFaces: RequestedFontFace[]): string {
  const requestsByFamily = new Map<CuratedFontFamily, Map<"normal" | "italic", Set<number>>>();

  for (const fontFace of fontFaces) {
    if (!fontFace.family.trim()) {
      continue;
    }
    const family = resolveCuratedFontFamily(fontFace.family);
    if (!family) {
      continue;
    }
    const style = normalizeStyle(fontFace.style);
    const weight = normalizeWeight(fontFace.weight);
    const byStyle = requestsByFamily.get(family) || new Map<"normal" | "italic", Set<number>>();
    const requestedWeights = byStyle.get(style) || new Set<number>();
    requestedWeights.add(weight);
    byStyle.set(style, requestedWeights);
    requestsByFamily.set(family, byStyle);
  }

  const cssRules: string[] = [];

  for (const [family, byStyle] of requestsByFamily.entries()) {
    const files = listCuratedFontFiles(family);
    for (const [style, requestedWeights] of byStyle.entries()) {
      const availableMap = style === "italic" && files.italic.size > 0 ? files.italic : files.normal;
      const availableWeights = [...availableMap.keys()].sort((a, b) => a - b);
      if (availableWeights.length === 0) {
        continue;
      }

      for (const requestedWeight of requestedWeights) {
        const resolvedWeight = nearestWeight(availableWeights, requestedWeight);
        const filePath = availableMap.get(resolvedWeight);
        if (!filePath) {
          continue;
        }
        const dataUri = readDataUriFromFile(filePath);
        cssRules.push(
          `@font-face{font-family:${fontFamilyCssValue(family)};font-style:${style};font-weight:${resolvedWeight};font-display:block;src:url(${dataUri}) format('woff2');}`
        );
      }
    }
  }

  return cssRules.join("\n");
}

export function normalizePrimaryFontFamily(fontFamily: string): string {
  return parseFamilyTokens(fontFamily)[0] || "";
}

export function resolveCuratedFontFamily(fontFamily: string): CuratedFontFamily | null {
  const primary = normalizePrimaryFontFamily(fontFamily).toLowerCase();
  return ALIAS_TO_FAMILY.get(primary) || null;
}

export function buildCuratedFontFamilyStack(fontFamily: CuratedFontFamily): string {
  const config = FONT_CONFIG[fontFamily];
  return [fontFamilyCssValue(fontFamily), ...config.fallbacks].join(",");
}

export function buildEmbeddedFontFaceCss(fontFaces: RequestedFontFace[]): string {
  const localRequests = new Map<string, Map<"normal" | "italic", Set<number>>>();

  for (const fontFace of fontFaces) {
    const tokens = parseFamilyTokens(fontFace.family);
    if (tokens.length === 0) {
      continue;
    }

    const style = normalizeStyle(fontFace.style);
    const weight = normalizeWeight(fontFace.weight);
    for (const token of tokens) {
      addRequestedWeight(localRequests, token, style, weight);
    }
  }

  const local = buildLocalAssetFontFaceCss(localRequests);
  const fallback = buildCuratedFallbackFontFaceCss(local.unresolvedRequests);

  if (!local.css) {
    return fallback;
  }
  if (!fallback) {
    return local.css;
  }
  return `${local.css}\n${fallback}`;
}
