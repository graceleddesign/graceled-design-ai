export type FontAsset = {
  id: string;
  family: string;
  style: "normal" | "italic";
  weight: number;
  file: string;
  displayName: string;
  tags: string[];
};

export const FONT_ASSETS = [
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

export function getFontFaceCSS(assets: readonly FontAsset[] = FONT_ASSETS): string {
  return assets
    .map((asset) => {
      const family = `'${escapeCssString(asset.family)}'`;
      const src = `url('${toPublicFontPath(asset.file)}') format('woff2')`;
      return `@font-face{font-family:${family};font-style:${asset.style};font-weight:${asset.weight};font-display:block;src:${src};}`;
    })
    .join("\n");
}
