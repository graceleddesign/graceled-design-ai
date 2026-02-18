import type { LockupRecipe, StyleFamily } from "@/lib/design-brief";
import { buildCuratedFontFamilyStack, type CuratedFontFamily } from "@/lib/lockups/font-registry";
import { FONT_ASSETS, getFontAssetById, hasFontAssetId, type FontAssetId } from "@/src/design/fonts/font-assets";

export type FontId = FontAssetId;

export type FontPairing = {
  titleFontId: FontId;
  subtitleFontId: FontId;
  accentFontId?: FontId;
  titleFont: string;
  subtitleFont: string;
  accentFont?: string;
  profileId: string;
  vibe: PairingVibe;
};

type PairingVibe = "condensed" | "editorial_serif" | "high_contrast_display" | "slab" | "grotesk";

type PairingProfile = {
  id: string;
  vibe: PairingVibe;
  pairing: {
    titleFontId: FontId;
    subtitleFontId: FontId;
    accentFontId?: FontId;
  };
};

export const DISPLAY_FONT_LIBRARY = [
  "Playfair Display",
  "DM Serif Display",
  "Fraunces",
  "Source Serif 4",
  "Newsreader",
  "Oswald",
  "Archivo Narrow",
  "IBM Plex Sans Condensed",
  "Roboto Slab",
  "Arvo",
  "Space Grotesk",
  "Sora",
  "Manrope"
] as const;

export const SUPPORTING_FONT_LIBRARY = [
  "Manrope",
  "Space Grotesk",
  "Sora",
  "Source Serif 4",
  "Newsreader",
  "Archivo Narrow",
  "IBM Plex Sans Condensed"
] as const;

const PAIRING_PROFILES: PairingProfile[] = [
  {
    id: "condensed_oswald_source",
    vibe: "condensed",
    pairing: {
      titleFontId: "Oswald-Bold",
      subtitleFontId: "SourceSerif4-Regular",
      accentFontId: "SpaceGrotesk-Regular"
    }
  },
  {
    id: "condensed_archivo_news",
    vibe: "condensed",
    pairing: {
      titleFontId: "ArchivoNarrow-Bold",
      subtitleFontId: "Newsreader-Regular",
      accentFontId: "RobotoSlab-Regular"
    }
  },
  {
    id: "condensed_plexcondensed_serif",
    vibe: "condensed",
    pairing: {
      titleFontId: "IBMPlexSansCondensed-Bold",
      subtitleFontId: "SourceSerif4-SemiBold",
      accentFontId: "Manrope-Regular"
    }
  },
  {
    id: "editorial_sourceserif_manrope",
    vibe: "editorial_serif",
    pairing: {
      titleFontId: "SourceSerif4-SemiBold",
      subtitleFontId: "Manrope-Regular",
      accentFontId: "DMSerifDisplay-Regular"
    }
  },
  {
    id: "editorial_newsreader_grotesk",
    vibe: "editorial_serif",
    pairing: {
      titleFontId: "Newsreader-SemiBold",
      subtitleFontId: "SpaceGrotesk-Regular",
      accentFontId: "PlayfairDisplay-Regular"
    }
  },
  {
    id: "editorial_sourceserif_sora",
    vibe: "editorial_serif",
    pairing: {
      titleFontId: "SourceSerif4-Regular",
      subtitleFontId: "Sora-Regular",
      accentFontId: "Fraunces-Regular"
    }
  },
  {
    id: "contrast_playfair_space",
    vibe: "high_contrast_display",
    pairing: {
      titleFontId: "PlayfairDisplay-Bold",
      subtitleFontId: "SpaceGrotesk-Regular",
      accentFontId: "DMSerifDisplay-Regular"
    }
  },
  {
    id: "contrast_dmserif_manrope",
    vibe: "high_contrast_display",
    pairing: {
      titleFontId: "DMSerifDisplay-Regular",
      subtitleFontId: "Manrope-Regular",
      accentFontId: "PlayfairDisplay-Regular"
    }
  },
  {
    id: "contrast_fraunces_sora",
    vibe: "high_contrast_display",
    pairing: {
      titleFontId: "Fraunces-SemiBold",
      subtitleFontId: "Sora-Regular",
      accentFontId: "PlayfairDisplay-Regular"
    }
  },
  {
    id: "slab_robotoslab_manrope",
    vibe: "slab",
    pairing: {
      titleFontId: "RobotoSlab-Bold",
      subtitleFontId: "Manrope-Regular",
      accentFontId: "Arvo-Regular"
    }
  },
  {
    id: "slab_arvo_space",
    vibe: "slab",
    pairing: {
      titleFontId: "Arvo-Bold",
      subtitleFontId: "SpaceGrotesk-Regular",
      accentFontId: "SourceSerif4-Regular"
    }
  },
  {
    id: "slab_robotoslab_condensed",
    vibe: "slab",
    pairing: {
      titleFontId: "RobotoSlab-Regular",
      subtitleFontId: "IBMPlexSansCondensed-Regular",
      accentFontId: "PlayfairDisplay-Regular"
    }
  },
  {
    id: "grotesk_space_manrope",
    vibe: "grotesk",
    pairing: {
      titleFontId: "SpaceGrotesk-Bold",
      subtitleFontId: "Manrope-Regular",
      accentFontId: "Sora-Regular"
    }
  },
  {
    id: "grotesk_sora_newsreader",
    vibe: "grotesk",
    pairing: {
      titleFontId: "Sora-Bold",
      subtitleFontId: "Newsreader-Regular",
      accentFontId: "SpaceGrotesk-Regular"
    }
  },
  {
    id: "grotesk_manrope_serif",
    vibe: "grotesk",
    pairing: {
      titleFontId: "Manrope-SemiBold",
      subtitleFontId: "SourceSerif4-Regular",
      accentFontId: "Oswald-Regular"
    }
  }
];

const PRESET_VIBE_HINT: Record<string, PairingVibe> = {
  arc_title: "high_contrast_display",
  stacked_stagger: "condensed",
  slab_shadow: "slab",
  inline_outline: "high_contrast_display",
  badge_stamp: "editorial_serif",
  knockout_mask: "condensed",
  editorial_serif_stack: "editorial_serif",
  modern_condensed_monument: "condensed",
  classic_inscription: "editorial_serif",
  boxed_titleplate: "high_contrast_display",
  split_title_dynamic: "high_contrast_display",
  outline_overprint: "condensed",
  handmade_organic: "editorial_serif",
  badge_seal: "editorial_serif",
  monument_overprint: "condensed",
  inscribed_frame: "editorial_serif",
  high_contrast_serif: "high_contrast_display",
  bold_condensed: "condensed",
  heritage_engraved: "editorial_serif",
  modern_editorial: "high_contrast_display",
  mono_label: "grotesk",
  outline_display: "condensed"
};

const PRESET_PROFILE_HINTS: Record<string, readonly string[]> = {
  arc_title: ["contrast_playfair_space", "contrast_fraunces_sora", "editorial_newsreader_grotesk"],
  modern_editorial: ["contrast_dmserif_manrope", "editorial_sourceserif_manrope", "contrast_playfair_space"],
  stacked_stagger: ["condensed_plexcondensed_serif", "condensed_oswald_source", "condensed_archivo_news"],
  slab_shadow: ["slab_robotoslab_manrope", "slab_arvo_space", "slab_robotoslab_condensed"],
  inline_outline: ["contrast_playfair_space", "contrast_fraunces_sora", "contrast_dmserif_manrope"],
  badge_stamp: ["editorial_sourceserif_manrope", "editorial_newsreader_grotesk", "editorial_sourceserif_sora"],
  knockout_mask: ["slab_robotoslab_manrope", "slab_arvo_space", "slab_robotoslab_condensed"],
  monument_overprint: ["contrast_playfair_space", "grotesk_space_manrope", "editorial_sourceserif_manrope"],
  modern_condensed_monument: ["condensed_oswald_source", "condensed_archivo_news", "grotesk_manrope_serif"]
};

const STYLE_FAMILY_VIBE_ORDER: Record<StyleFamily, PairingVibe[]> = {
  "clean-min": ["grotesk", "editorial_serif", "high_contrast_display"],
  "editorial-photo": ["editorial_serif", "high_contrast_display", "grotesk"],
  "modern-collage": ["condensed", "grotesk", "slab"],
  "illustrated-heritage": ["editorial_serif", "slab", "high_contrast_display"],
  editorial: ["editorial_serif", "high_contrast_display", "grotesk"],
  classic_serif: ["editorial_serif", "high_contrast_display", "slab"],
  bold_modern: ["condensed", "grotesk", "high_contrast_display"],
  handmade_organic: ["editorial_serif", "slab", "high_contrast_display"],
  photographic_titleplate: ["high_contrast_display", "editorial_serif", "grotesk"],
  minimal_clean: ["grotesk", "condensed", "editorial_serif"],
  illustration_wheatfield: ["editorial_serif", "slab", "high_contrast_display"]
};

const FALLBACK_FAMILY_BY_FONT_ID: Partial<Record<FontId, CuratedFontFamily>> = {
  "PlayfairDisplay-Regular": "Playfair Display",
  "PlayfairDisplay-Bold": "Playfair Display",
  "DMSerifDisplay-Regular": "DM Serif Display",
  "Fraunces-Regular": "Fraunces",
  "Fraunces-SemiBold": "Fraunces",
  "SourceSerif4-Regular": "Prata",
  "SourceSerif4-SemiBold": "Prata",
  "Newsreader-Regular": "Cormorant Garamond",
  "Newsreader-SemiBold": "Cormorant Garamond",
  "Oswald-Regular": "Oswald",
  "Oswald-Bold": "Oswald",
  "ArchivoNarrow-Regular": "Archivo Narrow",
  "ArchivoNarrow-Bold": "Archivo Narrow",
  "IBMPlexSansCondensed-Regular": "IBM Plex Sans",
  "IBMPlexSansCondensed-Bold": "IBM Plex Sans",
  "SpaceGrotesk-Regular": "Space Grotesk",
  "SpaceGrotesk-Bold": "Space Grotesk",
  "Sora-Regular": "Inter",
  "Sora-Bold": "Inter",
  "Manrope-Regular": "Manrope",
  "Manrope-SemiBold": "Manrope",
  "RobotoSlab-Regular": "Alfa Slab One",
  "RobotoSlab-Bold": "Alfa Slab One",
  "Arvo-Regular": "Alfa Slab One",
  "Arvo-Bold": "Alfa Slab One"
};

const SLOT_FALLBACK_FAMILY: Record<"title" | "subtitle" | "accent", CuratedFontFamily> = {
  title: "Fraunces",
  subtitle: "Inter",
  accent: "DM Serif Display"
};

const DEFAULT_FONT_IDS: Record<"title" | "subtitle" | "accent", FontId> = {
  title: "Fraunces-SemiBold",
  subtitle: "Manrope-Regular",
  accent: "DMSerifDisplay-Regular"
};

const FIRST_FONT_ID = (FONT_ASSETS[0]?.id || DEFAULT_FONT_IDS.title) as FontId;

const FALLBACK_PROFILE: PairingProfile = {
  id: "fallback_default",
  vibe: "high_contrast_display",
  pairing: {
    titleFontId: DEFAULT_FONT_IDS.title,
    subtitleFontId: DEFAULT_FONT_IDS.subtitle,
    accentFontId: DEFAULT_FONT_IDS.accent
  }
};

function normalizeStackToken(token: string): string {
  return token.trim().replace(/^['"]+|['"]+$/g, "").trim();
}

function unquoteStack(stack: string): string {
  return stack
    .split(",")
    .map((token) => normalizeStackToken(token))
    .filter((token) => Boolean(token))
    .join(",");
}

function sanitizeFontId(id: string): FontId {
  return hasFontAssetId(id) ? id : hasFontAssetId(FIRST_FONT_ID) ? FIRST_FONT_ID : DEFAULT_FONT_IDS.title;
}

function genericFamilyFromTags(tags: string[]): "serif" | "sans-serif" {
  const normalized = tags.map((tag) => tag.toLowerCase());
  if (normalized.some((tag) => tag.includes("sans") || tag.includes("grotesk") || tag.includes("condensed"))) {
    return "sans-serif";
  }
  return "serif";
}

function stackWithFallback(primaryFamily: string | null, fallbackFamily: CuratedFontFamily, genericFamily: "serif" | "sans-serif"): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  const pushToken = (token: string) => {
    const normalizedRaw = normalizeStackToken(token);
    const normalized = normalizedRaw.toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    parts.push(normalizedRaw);
  };

  if (primaryFamily) {
    pushToken(primaryFamily);
  }

  for (const token of buildCuratedFontFamilyStack(fallbackFamily).split(",")) {
    pushToken(token.trim());
  }

  pushToken(genericFamily);
  return parts.join(",");
}

function inferRecipeVibe(lockupRecipe: LockupRecipe): PairingVibe {
  if (lockupRecipe.layoutIntent === "minimal_clean") {
    return "grotesk";
  }
  if (lockupRecipe.layoutIntent === "bold_modern") {
    return "condensed";
  }
  if (lockupRecipe.layoutIntent === "classic_serif" || lockupRecipe.layoutIntent === "handmade_organic") {
    return "editorial_serif";
  }
  if (lockupRecipe.titleTreatment === "outline" || lockupRecipe.titleTreatment === "overprint") {
    return "condensed";
  }
  if (lockupRecipe.titleTreatment === "boxed" || lockupRecipe.titleTreatment === "badge") {
    return "high_contrast_display";
  }
  if (lockupRecipe.layoutIntent === "editorial") {
    return "editorial_serif";
  }
  return "high_contrast_display";
}

function fnv1aHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function resolveSeed(params: {
  styleFamily: StyleFamily;
  lockupPresetId?: string | null;
  presetVibe?: PairingVibe;
  recipeVibe: PairingVibe;
  fontSeed?: string | null;
}): string {
  const explicitSeed = params.fontSeed?.trim();
  if (explicitSeed) {
    return explicitSeed;
  }

  return [
    "font-pairing",
    params.styleFamily,
    params.lockupPresetId?.trim() || "none",
    params.presetVibe || "none",
    params.recipeVibe
  ].join("|");
}

function profileScore(params: {
  profile: PairingProfile;
  presetVibe?: PairingVibe;
  recipeVibe: PairingVibe;
  preferredVibes: PairingVibe[];
  presetProfileHints: readonly string[];
}): number {
  const styleRank = params.preferredVibes.indexOf(params.profile.vibe);
  const styleScore = styleRank >= 0 ? Math.max(0, 16 - styleRank * 4) : 0;
  const presetScore = params.presetVibe && params.profile.vibe === params.presetVibe ? 10 : 0;
  const recipeScore = params.profile.vibe === params.recipeVibe ? 8 : 0;
  const hintIndex = params.presetProfileHints.indexOf(params.profile.id);
  const hintScore = hintIndex >= 0 ? 16 - hintIndex * 4 : 0;
  return styleScore + presetScore + recipeScore + hintScore;
}

function sortedCandidateProfiles(params: {
  presetVibe?: PairingVibe;
  recipeVibe: PairingVibe;
  preferredVibes: PairingVibe[];
  presetProfileHints: readonly string[];
}): PairingProfile[] {
  return [...PAIRING_PROFILES]
    .map((profile) => ({
      profile,
      score: profileScore({
        profile,
        presetVibe: params.presetVibe,
        recipeVibe: params.recipeVibe,
        preferredVibes: params.preferredVibes,
        presetProfileHints: params.presetProfileHints
      })
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.profile.id.localeCompare(right.profile.id);
    })
    .map((entry) => entry.profile);
}

function resolveSlotFont(params: { slot: "title" | "subtitle" | "accent"; requestedId?: string }): { id: FontId; family: string } {
  const fallbackFamily = SLOT_FALLBACK_FAMILY[params.slot];
  const fallbackId = sanitizeFontId(DEFAULT_FONT_IDS[params.slot]);

  if (!params.requestedId || !hasFontAssetId(params.requestedId)) {
    return {
      id: fallbackId,
      family: unquoteStack(buildCuratedFontFamilyStack(fallbackFamily))
    };
  }

  const resolvedId = sanitizeFontId(params.requestedId);
  const asset = getFontAssetById(resolvedId);
  if (!asset) {
    return {
      id: fallbackId,
      family: unquoteStack(buildCuratedFontFamilyStack(fallbackFamily))
    };
  }

  const embeddedFallback = FALLBACK_FAMILY_BY_FONT_ID[resolvedId] || fallbackFamily;
  const genericFamily = genericFamilyFromTags(asset.tags);
  return {
    id: resolvedId,
    family: stackWithFallback(asset.family, embeddedFallback, genericFamily)
  };
}

export function resolveFontPairingFromIds(input: {
  titleFontId: string;
  subtitleFontId: string;
  accentFontId?: string;
  profileId?: string;
  vibe?: PairingVibe;
}): FontPairing {
  const title = resolveSlotFont({ slot: "title", requestedId: input.titleFontId });
  const subtitle = resolveSlotFont({ slot: "subtitle", requestedId: input.subtitleFontId });
  const accent = input.accentFontId ? resolveSlotFont({ slot: "accent", requestedId: input.accentFontId }) : null;

  return {
    titleFontId: title.id,
    subtitleFontId: subtitle.id,
    accentFontId: accent?.id,
    titleFont: title.family,
    subtitleFont: subtitle.family,
    accentFont: accent?.family,
    profileId: input.profileId || FALLBACK_PROFILE.id,
    vibe: input.vibe || FALLBACK_PROFILE.vibe
  };
}

export function getFontPairing(
  lockupRecipe: LockupRecipe,
  styleFamily: StyleFamily = "clean-min",
  lockupPresetId?: string | null,
  fontSeed?: string | null
): FontPairing {
  const presetId = lockupPresetId?.trim() || "";
  const presetVibe = presetId ? PRESET_VIBE_HINT[presetId] : undefined;
  const recipeVibe = inferRecipeVibe(lockupRecipe);
  const preferredVibes = STYLE_FAMILY_VIBE_ORDER[styleFamily] || STYLE_FAMILY_VIBE_ORDER["clean-min"];
  const presetProfileHints = presetId ? PRESET_PROFILE_HINTS[presetId] || [] : [];
  const scoredCandidates = sortedCandidateProfiles({
    presetVibe,
    recipeVibe,
    preferredVibes,
    presetProfileHints
  });
  const hintedCandidates = presetProfileHints
    .map((profileId) => PAIRING_PROFILES.find((profile) => profile.id === profileId))
    .filter((profile): profile is PairingProfile => Boolean(profile));
  const candidates = hintedCandidates.length > 0 ? hintedCandidates : scoredCandidates;

  const selected = candidates.length > 0 ? candidates[fnv1aHash(resolveSeed({
    styleFamily,
    lockupPresetId,
    presetVibe,
    recipeVibe,
    fontSeed
  })) % candidates.length] : FALLBACK_PROFILE;

  return resolveFontPairingFromIds({
    titleFontId: selected.pairing.titleFontId,
    subtitleFontId: selected.pairing.subtitleFontId,
    accentFontId: selected.pairing.accentFontId,
    profileId: selected.id,
    vibe: selected.vibe
  });
}
