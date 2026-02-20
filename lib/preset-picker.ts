import type { StyleDirection } from "@/lib/style-direction";

const MINIMAL_PRESETS = ["type_clean_min_v1", "type_swiss_grid_v1", "type_editorial_v1"] as const;
const PHOTO_PRESETS = [
  "photo_color_block_v1",
  "photo_landscape_min_v1",
  "photo_mono_accent_v1",
  "photo_warm_film_v1",
  "photo_veil_cinematic_v1"
] as const;
const ILLUSTRATION_PRESETS = ["illus_flat_min_v1", "illus_engraved_v1"] as const;
const ABSTRACT_PRESETS = [
  "abstract_gradient_modern_v1",
  "geo_shapes_negative_v1",
  "abstract_flow_field_v1",
  "texture_print_riso_v1",
  "texture_stone_modern_v1",
  "mark_icon_abstract_v1"
] as const;
const BOLD_TYPE_PRESETS = ["type_brutalist_v1", "type_bw_high_contrast_v1", "type_text_system_v1"] as const;
const SEASONAL_PRESETS = ["seasonal_liturgical_v1"] as const;

const INITIAL_BALANCED_TRIO = ["type_clean_min_v1", "photo_color_block_v1", "abstract_gradient_modern_v1"] as const;

const STYLE_PRESET_MAP: Record<Exclude<StyleDirection, "SURPRISE">, readonly string[]> = {
  MINIMAL: MINIMAL_PRESETS,
  PHOTO: PHOTO_PRESETS,
  ILLUSTRATION: ILLUSTRATION_PRESETS,
  ABSTRACT: ABSTRACT_PRESETS,
  BOLD_TYPE: BOLD_TYPE_PRESETS,
  SEASONAL: SEASONAL_PRESETS
};

const ADJACENT_STYLE_ORDER: Record<Exclude<StyleDirection, "SURPRISE">, Array<Exclude<StyleDirection, "SURPRISE">>> = {
  MINIMAL: ["BOLD_TYPE", "ABSTRACT", "PHOTO"],
  PHOTO: ["MINIMAL", "ABSTRACT", "ILLUSTRATION"],
  ILLUSTRATION: ["ABSTRACT", "MINIMAL", "PHOTO"],
  ABSTRACT: ["MINIMAL", "ILLUSTRATION", "PHOTO"],
  BOLD_TYPE: ["MINIMAL", "ABSTRACT", "PHOTO"],
  SEASONAL: ["MINIMAL", "PHOTO", "ABSTRACT"]
};

const FALLBACK_POOL = [
  ...INITIAL_BALANCED_TRIO,
  ...MINIMAL_PRESETS,
  ...PHOTO_PRESETS,
  ...ILLUSTRATION_PRESETS,
  ...ABSTRACT_PRESETS,
  ...BOLD_TYPE_PRESETS,
  ...SEASONAL_PRESETS
];

function dedupeStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const key = value.trim();
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(key);
  }

  return result;
}

export function filterToEnabledPresets(keys: string[], enabledKeys: Set<string>): string[] {
  return dedupeStrings(keys).filter((key) => enabledKeys.has(key));
}

export function ensureThree(keys: string[], enabledKeys: Set<string>, fallbackPool: string[]): string[] {
  const enabledOrdered = filterToEnabledPresets(keys, enabledKeys);
  const enabledFallback = filterToEnabledPresets(fallbackPool, enabledKeys);
  const result = dedupeStrings([...enabledOrdered, ...enabledFallback]);

  if (result.length < 3) {
    const nonEnabledFallback = dedupeStrings([...keys, ...fallbackPool, ...FALLBACK_POOL]).filter((key) => !result.includes(key));
    for (const key of nonEnabledFallback) {
      result.push(key);
      if (result.length >= 3) {
        break;
      }
    }
  }

  return result.slice(0, 3);
}

export function pickInitialPresetKeys(): string[] {
  const defaults = dedupeStrings([
    ...INITIAL_BALANCED_TRIO,
    MINIMAL_PRESETS[0],
    PHOTO_PRESETS[0],
    ABSTRACT_PRESETS[0],
    ...FALLBACK_POOL
  ]);

  return defaults.slice(0, 3);
}

export function pickPresetKeysForStyle(style: StyleDirection): string[] {
  if (style === "SURPRISE") {
    return pickInitialPresetKeys();
  }

  const stylePool = STYLE_PRESET_MAP[style] || [];
  if (stylePool.length === 0) {
    return pickInitialPresetKeys();
  }

  const adjacentPools = ADJACENT_STYLE_ORDER[style].flatMap((direction) => STYLE_PRESET_MAP[direction] || []);
  const candidates = dedupeStrings([
    stylePool[0],
    ...stylePool,
    ...adjacentPools,
    ...pickInitialPresetKeys(),
    ...FALLBACK_POOL
  ]);

  return candidates.slice(0, 3);
}
