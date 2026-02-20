import googleFontAssetsManifest from "./font-assets.google.json";

export type FontAssetSource = "local" | "google";

export type FontAsset = {
  id: string;
  family: string;
  style: "normal" | "italic";
  weight: number;
  file: string;
  displayName: string;
  tags: string[];
  source?: FontAssetSource;
};

export type UpsertFontAssetVariant = {
  weight: number;
  style: "normal" | "italic";
  file: string;
  id?: string;
  displayName?: string;
  tags?: string[];
};

export type UpsertFontFamilyVariantsParams = {
  existingAssets: readonly FontAsset[];
  idSourceAssets?: readonly FontAsset[];
  family: string;
  source?: FontAssetSource;
  familyTags?: string[];
  variants: readonly UpsertFontAssetVariant[];
};

export const GOOGLE_FONT_ASSET_MANIFEST_RELATIVE_PATH = "src/design/fonts/font-assets.google.json";

export const LOCAL_FONT_ASSETS = [
  {
    id: "PlayfairDisplay-Regular",
    family: "Playfair Display",
    style: "normal",
    weight: 400,
    file: "PlayfairDisplay-Regular.woff2",
    displayName: "Playfair Display Regular",
    tags: ["display", "serif", "high-contrast"]
  },
  {
    id: "PlayfairDisplay-Bold",
    family: "Playfair Display",
    style: "normal",
    weight: 700,
    file: "PlayfairDisplay-Bold.woff2",
    displayName: "Playfair Display Bold",
    tags: ["display", "serif", "high-contrast"]
  },
  {
    id: "DMSerifDisplay-Regular",
    family: "DM Serif Display",
    style: "normal",
    weight: 400,
    file: "DMSerifDisplay-Regular.woff2",
    displayName: "DM Serif Display Regular",
    tags: ["display", "serif", "editorial"]
  },
  {
    id: "Fraunces-Regular",
    family: "Fraunces",
    style: "normal",
    weight: 400,
    file: "Fraunces-Regular.woff2",
    displayName: "Fraunces Regular",
    tags: ["display", "serif", "high-contrast"]
  },
  {
    id: "Fraunces-SemiBold",
    family: "Fraunces",
    style: "normal",
    weight: 600,
    file: "Fraunces-SemiBold.woff2",
    displayName: "Fraunces SemiBold",
    tags: ["display", "serif", "high-contrast"]
  },
  {
    id: "SourceSerif4-Regular",
    family: "Source Serif 4",
    style: "normal",
    weight: 400,
    file: "SourceSerif4-Regular.woff2",
    displayName: "Source Serif 4 Regular",
    tags: ["editorial", "serif", "text"]
  },
  {
    id: "SourceSerif4-SemiBold",
    family: "Source Serif 4",
    style: "normal",
    weight: 600,
    file: "SourceSerif4-SemiBold.woff2",
    displayName: "Source Serif 4 SemiBold",
    tags: ["editorial", "serif", "text"]
  },
  {
    id: "Newsreader-Regular",
    family: "Newsreader",
    style: "normal",
    weight: 400,
    file: "Newsreader-Regular.woff2",
    displayName: "Newsreader Regular",
    tags: ["editorial", "serif", "text"]
  },
  {
    id: "Newsreader-SemiBold",
    family: "Newsreader",
    style: "normal",
    weight: 600,
    file: "Newsreader-SemiBold.woff2",
    displayName: "Newsreader SemiBold",
    tags: ["editorial", "serif", "text"]
  },
  {
    id: "Oswald-Regular",
    family: "Oswald",
    style: "normal",
    weight: 400,
    file: "Oswald-Regular.woff2",
    displayName: "Oswald Regular",
    tags: ["condensed", "sans", "display"]
  },
  {
    id: "Oswald-Bold",
    family: "Oswald",
    style: "normal",
    weight: 700,
    file: "Oswald-Bold.woff2",
    displayName: "Oswald Bold",
    tags: ["condensed", "sans", "display"]
  },
  {
    id: "ArchivoNarrow-Regular",
    family: "Archivo Narrow",
    style: "normal",
    weight: 400,
    file: "ArchivoNarrow-Regular.woff2",
    displayName: "Archivo Narrow Regular",
    tags: ["condensed", "sans", "text"]
  },
  {
    id: "ArchivoNarrow-Bold",
    family: "Archivo Narrow",
    style: "normal",
    weight: 700,
    file: "ArchivoNarrow-Bold.woff2",
    displayName: "Archivo Narrow Bold",
    tags: ["condensed", "sans", "text"]
  },
  {
    id: "IBMPlexSansCondensed-Regular",
    family: "IBM Plex Sans Condensed",
    style: "normal",
    weight: 400,
    file: "IBMPlexSansCondensed-Regular.woff2",
    displayName: "IBM Plex Sans Condensed Regular",
    tags: ["condensed", "sans", "grotesk"]
  },
  {
    id: "IBMPlexSansCondensed-Bold",
    family: "IBM Plex Sans Condensed",
    style: "normal",
    weight: 700,
    file: "IBMPlexSansCondensed-Bold.woff2",
    displayName: "IBM Plex Sans Condensed Bold",
    tags: ["condensed", "sans", "grotesk"]
  },
  {
    id: "SpaceGrotesk-Regular",
    family: "Space Grotesk",
    style: "normal",
    weight: 400,
    file: "SpaceGrotesk-Regular.woff2",
    displayName: "Space Grotesk Regular",
    tags: ["grotesk", "sans", "modern"]
  },
  {
    id: "SpaceGrotesk-Bold",
    family: "Space Grotesk",
    style: "normal",
    weight: 700,
    file: "SpaceGrotesk-Bold.woff2",
    displayName: "Space Grotesk Bold",
    tags: ["grotesk", "sans", "modern"]
  },
  {
    id: "Sora-Regular",
    family: "Sora",
    style: "normal",
    weight: 400,
    file: "Sora-Regular.woff2",
    displayName: "Sora Regular",
    tags: ["grotesk", "sans", "modern"]
  },
  {
    id: "Sora-Bold",
    family: "Sora",
    style: "normal",
    weight: 700,
    file: "Sora-Bold.woff2",
    displayName: "Sora Bold",
    tags: ["grotesk", "sans", "modern"]
  },
  {
    id: "Manrope-Regular",
    family: "Manrope",
    style: "normal",
    weight: 400,
    file: "Manrope-Regular.woff2",
    displayName: "Manrope Regular",
    tags: ["grotesk", "sans", "text"]
  },
  {
    id: "Manrope-SemiBold",
    family: "Manrope",
    style: "normal",
    weight: 600,
    file: "Manrope-SemiBold.woff2",
    displayName: "Manrope SemiBold",
    tags: ["grotesk", "sans", "text"]
  },
  {
    id: "RobotoSlab-Regular",
    family: "Roboto Slab",
    style: "normal",
    weight: 400,
    file: "RobotoSlab-Regular.woff2",
    displayName: "Roboto Slab Regular",
    tags: ["slab", "serif", "text"]
  },
  {
    id: "RobotoSlab-Bold",
    family: "Roboto Slab",
    style: "normal",
    weight: 700,
    file: "RobotoSlab-Bold.woff2",
    displayName: "Roboto Slab Bold",
    tags: ["slab", "serif", "display"]
  },
  {
    id: "Arvo-Regular",
    family: "Arvo",
    style: "normal",
    weight: 400,
    file: "Arvo-Regular.woff2",
    displayName: "Arvo Regular",
    tags: ["slab", "serif", "text"]
  },
  {
    id: "Arvo-Bold",
    family: "Arvo",
    style: "normal",
    weight: 700,
    file: "Arvo-Bold.woff2",
    displayName: "Arvo Bold",
    tags: ["slab", "serif", "display"]
  }
] satisfies FontAsset[];

function toVariantKey(family: string, weight: number, style: "normal" | "italic"): string {
  return `${family.trim().toLowerCase()}::${Math.round(weight)}::${style}`;
}

function normalizeTags(tags: readonly string[]): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const clean = tag.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(clean);
  }
  return unique;
}

function toSafeWeight(weight: number): number {
  if (!Number.isFinite(weight)) {
    return 400;
  }
  return Math.max(100, Math.min(900, Math.round(weight / 100) * 100));
}

function sanitizeStyle(style: string): "normal" | "italic" {
  return style === "italic" ? "italic" : "normal";
}

export function slugifyFontFamily(family: string): string {
  return family
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "font";
}

function idStemFromFamily(family: string): string {
  return family
    .trim()
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("") || "Font";
}

export function buildGoogleFontAssetId(family: string, weight: number, style: "normal" | "italic"): string {
  return `${idStemFromFamily(family)}-w${toSafeWeight(weight)}-${style}`;
}

export function buildGoogleFontDisplayName(family: string, weight: number, style: "normal" | "italic"): string {
  const safeWeight = toSafeWeight(weight);
  if (style === "italic") {
    return `${family} ${safeWeight} Italic`;
  }
  if (safeWeight === 400) {
    return `${family} Regular`;
  }
  return `${family} ${safeWeight}`;
}

export function inferFontTagsFromFamilyName(family: string): string[] {
  const normalized = family.trim().toLowerCase();
  const sansHints = [
    "sans",
    "grotesk",
    "inter",
    "manrope",
    "sora",
    "oswald",
    "archivo",
    "plex",
    "assistant",
    "public",
    "noto",
    "work",
    "bebas",
    "space"
  ];
  const slabHints = ["slab", "arvo"];

  if (sansHints.some((hint) => normalized.includes(hint))) {
    return ["google", "sans", "text"];
  }
  if (slabHints.some((hint) => normalized.includes(hint))) {
    return ["google", "slab", "serif"];
  }
  return ["google", "serif", "display"];
}

export function getFontAssetSource(asset: FontAsset): FontAssetSource {
  return asset.source === "google" ? "google" : "local";
}

function sanitizeManifestAssets(raw: unknown): FontAsset[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const assets: FontAsset[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Partial<FontAsset>;
    if (typeof record.id !== "string" || typeof record.family !== "string" || typeof record.file !== "string") {
      continue;
    }

    assets.push({
      id: record.id,
      family: record.family,
      style: sanitizeStyle(String(record.style || "normal")),
      weight: toSafeWeight(Number(record.weight || 400)),
      file: record.file,
      displayName: typeof record.displayName === "string" && record.displayName.trim() ? record.displayName : record.id,
      tags: normalizeTags(Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === "string") : []),
      source: record.source === "google" ? "google" : "local"
    });
  }
  return assets;
}

export function mergeFontAssets(localAssets: readonly FontAsset[], googleAssets: readonly FontAsset[]): FontAsset[] {
  const localByKey = new Map<string, FontAsset>();
  const localKeys: string[] = [];

  for (const asset of localAssets) {
    const normalized: FontAsset = {
      ...asset,
      style: sanitizeStyle(asset.style),
      weight: toSafeWeight(asset.weight),
      tags: normalizeTags(asset.tags),
      source: getFontAssetSource(asset)
    };
    const key = toVariantKey(normalized.family, normalized.weight, normalized.style);
    localByKey.set(key, normalized);
    localKeys.push(key);
  }

  for (const asset of googleAssets) {
    const normalized: FontAsset = {
      ...asset,
      style: sanitizeStyle(asset.style),
      weight: toSafeWeight(asset.weight),
      tags: normalizeTags(asset.tags),
      source: "google"
    };
    const key = toVariantKey(normalized.family, normalized.weight, normalized.style);
    localByKey.set(key, normalized);
    if (!localKeys.includes(key)) {
      localKeys.push(key);
    }
  }

  return localKeys
    .map((key) => localByKey.get(key))
    .filter((asset): asset is FontAsset => Boolean(asset));
}

export const GOOGLE_FONT_ASSETS = sanitizeManifestAssets(googleFontAssetsManifest).map((asset) => ({
  ...asset,
  source: "google" as const
}));

export const FONT_ASSETS = mergeFontAssets(LOCAL_FONT_ASSETS, GOOGLE_FONT_ASSETS);

export type FontAssetId = (typeof FONT_ASSETS)[number]["id"];

const FONT_ASSET_BY_ID = new Map<string, FontAsset>(FONT_ASSETS.map((asset) => [asset.id, asset]));
const FONT_ASSETS_BY_FAMILY = new Map<string, FontAsset[]>();

for (const asset of FONT_ASSETS) {
  const key = asset.family.toLowerCase();
  const list = FONT_ASSETS_BY_FAMILY.get(key) || [];
  list.push(asset);
  FONT_ASSETS_BY_FAMILY.set(key, list);
}

function escapeCssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function toPublicFontPath(file: string): string {
  const trimmed = file.trim();
  if (!trimmed) {
    return "/fonts/unknown.woff2";
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) {
    return trimmed;
  }
  if (trimmed.startsWith("public/")) {
    return `/${trimmed.slice("public/".length)}`;
  }
  if (trimmed.startsWith("fonts/") || trimmed.startsWith("assets/fonts/")) {
    return `/${trimmed}`;
  }
  return `/fonts/${trimmed}`;
}

export function getFontAssetById(id: string): FontAsset | undefined {
  return FONT_ASSET_BY_ID.get(id);
}

export function hasFontAssetId(id: string): id is FontAssetId {
  return FONT_ASSET_BY_ID.has(id);
}

export function getFontAssetsByFamily(family: string): readonly FontAsset[] {
  return FONT_ASSETS_BY_FAMILY.get(family.trim().toLowerCase()) || [];
}

export function upsertFontFamilyVariants(params: UpsertFontFamilyVariantsParams): FontAsset[] {
  const family = params.family.trim();
  if (!family) {
    return [...params.existingAssets];
  }

  const source = params.source || "google";
  const output = [...params.existingAssets];
  const byKey = new Map<string, number>();
  const existingByKey = new Map<string, FontAsset>();

  for (const asset of params.idSourceAssets || []) {
    existingByKey.set(toVariantKey(asset.family, asset.weight, sanitizeStyle(asset.style)), asset);
  }
  for (const [index, asset] of output.entries()) {
    const key = toVariantKey(asset.family, asset.weight, sanitizeStyle(asset.style));
    byKey.set(key, index);
    if (!existingByKey.has(key)) {
      existingByKey.set(key, asset);
    }
  }

  for (const variant of params.variants) {
    const weight = toSafeWeight(variant.weight);
    const style = sanitizeStyle(variant.style);
    const key = toVariantKey(family, weight, style);
    const matched = existingByKey.get(key);
    const tags = normalizeTags(
      variant.tags || matched?.tags || params.familyTags || inferFontTagsFromFamilyName(family)
    );

    const next: FontAsset = {
      id: variant.id || matched?.id || buildGoogleFontAssetId(family, weight, style),
      family,
      style,
      weight,
      file: variant.file,
      displayName: variant.displayName || matched?.displayName || buildGoogleFontDisplayName(family, weight, style),
      tags,
      source
    };

    const existingIndex = byKey.get(key);
    if (typeof existingIndex === "number") {
      output[existingIndex] = next;
    } else {
      output.push(next);
      byKey.set(key, output.length - 1);
    }
  }

  return [...output].sort((left, right) => {
    const familyCompare = left.family.localeCompare(right.family);
    if (familyCompare !== 0) {
      return familyCompare;
    }
    if (left.weight !== right.weight) {
      return left.weight - right.weight;
    }
    if (left.style !== right.style) {
      return left.style === "normal" ? -1 : 1;
    }
    return left.id.localeCompare(right.id);
  });
}

export function getFontFaceCSS(assets: readonly FontAsset[] = FONT_ASSETS): string {
  return assets
    .map((asset) => {
      const family = `'${escapeCssString(asset.family)}'`;
      const src = `url('${toPublicFontPath(asset.file)}') format('woff2')`;
      return `@font-face{font-family:${family};font-style:${asset.style};font-weight:${asset.weight};font-display:block;src:${src};}`;
    })
    .join("\n");
}
