import type { LockupRecipe, StyleFamily } from "@/lib/design-brief";

export type LockupPresetArchetype =
  | "heritage_serif"
  | "bold_condensed"
  | "editorial_display"
  | "minimal_grotesk"
  | "high_contrast_serif";

export type LockupPreset = LockupRecipe & {
  id: string;
  name: string;
  styleFamily: StyleFamily;
  archetype: LockupPresetArchetype;
  defaultPool?: boolean;
};

const PRESET_LIST: LockupPreset[] = [
  {
    id: "editorial_serif_stack",
    name: "Editorial Serif Stack",
    styleFamily: "editorial-photo",
    archetype: "editorial_display",
    layoutIntent: "editorial",
    titleTreatment: "stacked",
    hierarchy: {
      titleScale: 1.42,
      subtitleScale: 0.5,
      tracking: 0.026,
      case: "title_case"
    },
    alignment: "left",
    placement: {
      anchor: "top_left",
      safeMarginPct: 0.078,
      maxTitleWidthPct: 0.56
    },
    minTitleAreaPct: 0.16,
    maxTitleAreaPct: 0.34,
    ornament: {
      kind: "rule_dot",
      weight: "thin"
    }
  },
  {
    id: "high_contrast_serif",
    name: "High Contrast Serif",
    styleFamily: "editorial-photo",
    archetype: "high_contrast_serif",
    layoutIntent: "editorial",
    titleTreatment: "stacked",
    hierarchy: {
      titleScale: 1.58,
      subtitleScale: 0.46,
      tracking: 0.034,
      case: "title_case"
    },
    alignment: "left",
    placement: {
      anchor: "top_left",
      safeMarginPct: 0.074,
      maxTitleWidthPct: 0.54
    },
    minTitleAreaPct: 0.16,
    maxTitleAreaPct: 0.34,
    ornament: {
      kind: "grain",
      weight: "thin"
    }
  },
  {
    id: "modern_editorial",
    name: "Modern Editorial",
    styleFamily: "editorial-photo",
    archetype: "editorial_display",
    layoutIntent: "editorial",
    titleTreatment: "split",
    hierarchy: {
      titleScale: 1.5,
      subtitleScale: 0.47,
      tracking: 0.012,
      case: "title_case"
    },
    alignment: "left",
    placement: {
      anchor: "top_left",
      safeMarginPct: 0.076,
      maxTitleWidthPct: 0.58
    },
    ornament: {
      kind: "rule_dot",
      weight: "med"
    }
  },
  {
    id: "modern_condensed_monument",
    name: "Modern Condensed Monument",
    styleFamily: "modern-collage",
    archetype: "bold_condensed",
    layoutIntent: "bold_modern",
    titleTreatment: "split",
    hierarchy: {
      titleScale: 1.7,
      subtitleScale: 0.42,
      tracking: -0.04,
      case: "upper"
    },
    alignment: "left",
    placement: {
      anchor: "top_left",
      safeMarginPct: 0.07,
      maxTitleWidthPct: 0.63
    },
    ornament: {
      kind: "rule_dot",
      weight: "bold"
    }
  },
  {
    id: "bold_condensed",
    name: "Bold Condensed",
    styleFamily: "modern-collage",
    archetype: "bold_condensed",
    layoutIntent: "bold_modern",
    titleTreatment: "overprint",
    hierarchy: {
      titleScale: 1.78,
      subtitleScale: 0.4,
      tracking: -0.052,
      case: "upper"
    },
    alignment: "left",
    placement: {
      anchor: "bottom_left",
      safeMarginPct: 0.062,
      maxTitleWidthPct: 0.72
    },
    ornament: {
      kind: "none",
      weight: "bold"
    }
  },
  {
    id: "outline_display",
    name: "Outline Display",
    styleFamily: "modern-collage",
    archetype: "bold_condensed",
    layoutIntent: "bold_modern",
    titleTreatment: "outline",
    hierarchy: {
      titleScale: 1.64,
      subtitleScale: 0.44,
      tracking: -0.024,
      case: "upper"
    },
    alignment: "center",
    placement: {
      anchor: "center",
      safeMarginPct: 0.058,
      maxTitleWidthPct: 0.72
    },
    ornament: {
      kind: "none",
      weight: "med"
    }
  },
  {
    id: "classic_inscription",
    name: "Classic Inscription",
    styleFamily: "illustrated-heritage",
    archetype: "heritage_serif",
    layoutIntent: "classic_serif",
    titleTreatment: "stacked",
    hierarchy: {
      titleScale: 1.32,
      subtitleScale: 0.5,
      tracking: 0.048,
      case: "small_caps"
    },
    alignment: "center",
    placement: {
      anchor: "center",
      safeMarginPct: 0.07,
      maxTitleWidthPct: 0.64
    },
    ornament: {
      kind: "frame",
      weight: "thin"
    }
  },
  {
    id: "heritage_engraved",
    name: "Heritage Engraved",
    styleFamily: "illustrated-heritage",
    archetype: "heritage_serif",
    layoutIntent: "classic_serif",
    titleTreatment: "badge",
    hierarchy: {
      titleScale: 1.24,
      subtitleScale: 0.48,
      tracking: 0.06,
      case: "small_caps"
    },
    alignment: "center",
    placement: {
      anchor: "center",
      safeMarginPct: 0.068,
      maxTitleWidthPct: 0.62
    },
    ornament: {
      kind: "frame",
      weight: "bold"
    }
  },
  {
    id: "mono_label",
    name: "Mono Label",
    styleFamily: "clean-min",
    archetype: "minimal_grotesk",
    defaultPool: false,
    layoutIntent: "minimal_clean",
    titleTreatment: "boxed",
    hierarchy: {
      titleScale: 1.32,
      subtitleScale: 0.44,
      tracking: 0.014,
      case: "upper"
    },
    alignment: "left",
    placement: {
      anchor: "top_left",
      safeMarginPct: 0.08,
      maxTitleWidthPct: 0.62
    },
    ornament: {
      kind: "frame",
      weight: "thin"
    }
  },
  {
    id: "boxed_titleplate",
    name: "Boxed Titleplate",
    styleFamily: "editorial-photo",
    archetype: "editorial_display",
    defaultPool: false,
    layoutIntent: "photographic_titleplate",
    titleTreatment: "boxed",
    hierarchy: {
      titleScale: 1.24,
      subtitleScale: 0.5,
      tracking: 0.02,
      case: "upper"
    },
    alignment: "center",
    placement: {
      anchor: "bottom_center",
      safeMarginPct: 0.066,
      maxTitleWidthPct: 0.68
    },
    lineHeight: {
      title: 1.04,
      subtitle: 1.2
    },
    titleSizeClamp: {
      square: { minPx: 52, maxPx: 142 },
      wide: { minPx: 48, maxPx: 132 },
      tall: { minPx: 58, maxPx: 158 }
    },
    focalPoint: {
      x: 0.5,
      y: 0.5
    },
    titleEcho: {
      enabled: false,
      opacity: 0.06,
      dxPct: 0.007,
      dyPct: 0.007
    },
    ornament: {
      kind: "frame",
      weight: "med"
    }
  },
  {
    id: "split_title_dynamic",
    name: "Split Title Dynamic",
    styleFamily: "editorial-photo",
    archetype: "editorial_display",
    layoutIntent: "editorial",
    titleTreatment: "split",
    hierarchy: {
      titleScale: 1.48,
      subtitleScale: 0.47,
      tracking: 0.012,
      case: "title_case"
    },
    alignment: "left",
    placement: {
      anchor: "top_left",
      safeMarginPct: 0.082,
      maxTitleWidthPct: 0.6
    },
    lineHeight: {
      title: 1.04,
      subtitle: 1.2
    },
    titleSizeClamp: {
      square: { minPx: 50, maxPx: 144 },
      wide: { minPx: 46, maxPx: 136 },
      tall: { minPx: 56, maxPx: 160 }
    },
    focalPoint: {
      x: 0.45,
      y: 0.5
    },
    titleEcho: {
      enabled: false,
      opacity: 0.06,
      dxPct: 0.006,
      dyPct: 0.006
    },
    ornament: {
      kind: "grain",
      weight: "thin"
    }
  },
  {
    id: "outline_overprint",
    name: "Outline Overprint",
    styleFamily: "modern-collage",
    archetype: "bold_condensed",
    layoutIntent: "bold_modern",
    titleTreatment: "outline",
    hierarchy: {
      titleScale: 1.58,
      subtitleScale: 0.44,
      tracking: -0.018,
      case: "upper"
    },
    alignment: "center",
    placement: {
      anchor: "center",
      safeMarginPct: 0.058,
      maxTitleWidthPct: 0.72
    },
    lineHeight: {
      title: 1.04,
      subtitle: 1.2
    },
    titleSizeClamp: {
      square: { minPx: 56, maxPx: 158 },
      wide: { minPx: 50, maxPx: 148 },
      tall: { minPx: 60, maxPx: 176 }
    },
    focalPoint: {
      x: 0.5,
      y: 0.5
    },
    titleEcho: {
      enabled: true,
      opacity: 0.08,
      dxPct: 0.008,
      dyPct: 0.007,
      blur: 0.8
    },
    ornament: {
      kind: "none",
      weight: "med"
    }
  },
  {
    id: "handmade_organic",
    name: "Handmade Organic",
    styleFamily: "illustrated-heritage",
    archetype: "heritage_serif",
    layoutIntent: "handmade_organic",
    titleTreatment: "stacked",
    hierarchy: {
      titleScale: 1.36,
      subtitleScale: 0.52,
      tracking: 0.038,
      case: "title_case"
    },
    alignment: "left",
    placement: {
      anchor: "top_left",
      safeMarginPct: 0.088,
      maxTitleWidthPct: 0.6
    },
    lineHeight: {
      title: 1.1,
      subtitle: 1.22
    },
    titleSizeClamp: {
      square: { minPx: 48, maxPx: 136 },
      wide: { minPx: 44, maxPx: 126 },
      tall: { minPx: 54, maxPx: 150 }
    },
    focalPoint: {
      x: 0.44,
      y: 0.5
    },
    titleEcho: {
      enabled: false,
      opacity: 0.06,
      dxPct: 0.006,
      dyPct: 0.006
    },
    ornament: {
      kind: "wheat",
      weight: "med"
    }
  },
  {
    id: "badge_seal",
    name: "Badge Seal",
    styleFamily: "illustrated-heritage",
    archetype: "heritage_serif",
    defaultPool: false,
    layoutIntent: "classic_serif",
    titleTreatment: "badge",
    hierarchy: {
      titleScale: 1.18,
      subtitleScale: 0.48,
      tracking: 0.056,
      case: "small_caps"
    },
    alignment: "center",
    placement: {
      anchor: "center",
      safeMarginPct: 0.068,
      maxTitleWidthPct: 0.62
    },
    lineHeight: {
      title: 1.06,
      subtitle: 1.2
    },
    titleSizeClamp: {
      square: { minPx: 46, maxPx: 128 },
      wide: { minPx: 42, maxPx: 120 },
      tall: { minPx: 52, maxPx: 144 }
    },
    focalPoint: {
      x: 0.5,
      y: 0.5
    },
    titleEcho: {
      enabled: false,
      opacity: 0.06,
      dxPct: 0.006,
      dyPct: 0.006
    },
    ornament: {
      kind: "frame",
      weight: "bold"
    }
  },
  {
    id: "monument_overprint",
    name: "Monument Overprint",
    styleFamily: "modern-collage",
    archetype: "bold_condensed",
    layoutIntent: "bold_modern",
    titleTreatment: "overprint",
    hierarchy: {
      titleScale: 1.66,
      subtitleScale: 0.41,
      tracking: -0.046,
      case: "upper"
    },
    alignment: "left",
    placement: {
      anchor: "bottom_left",
      safeMarginPct: 0.064,
      maxTitleWidthPct: 0.71
    },
    lineHeight: {
      title: 0.96,
      subtitle: 1.15
    },
    titleSizeClamp: {
      square: { minPx: 56, maxPx: 164 },
      wide: { minPx: 50, maxPx: 152 },
      tall: { minPx: 60, maxPx: 180 }
    },
    focalPoint: {
      x: 0.45,
      y: 0.5
    },
    titleEcho: {
      enabled: true,
      opacity: 0.08,
      dxPct: 0.01,
      dyPct: 0.008,
      blur: 0.5
    },
    ornament: {
      kind: "none",
      weight: "bold"
    }
  },
  {
    id: "inscribed_frame",
    name: "Inscribed Frame",
    styleFamily: "illustrated-heritage",
    archetype: "heritage_serif",
    layoutIntent: "classic_serif",
    titleTreatment: "boxed",
    hierarchy: {
      titleScale: 1.22,
      subtitleScale: 0.47,
      tracking: 0.036,
      case: "title_case"
    },
    alignment: "center",
    placement: {
      anchor: "top_center",
      safeMarginPct: 0.074,
      maxTitleWidthPct: 0.64
    },
    lineHeight: {
      title: 1.06,
      subtitle: 1.2
    },
    titleSizeClamp: {
      square: { minPx: 48, maxPx: 130 },
      wide: { minPx: 44, maxPx: 122 },
      tall: { minPx: 54, maxPx: 146 }
    },
    focalPoint: {
      x: 0.5,
      y: 0.5
    },
    titleEcho: {
      enabled: false,
      opacity: 0.06,
      dxPct: 0.006,
      dyPct: 0.006
    },
    ornament: {
      kind: "frame",
      weight: "thin"
    }
  },
  {
    id: "arc_title",
    name: "Arc Title",
    styleFamily: "editorial-photo",
    archetype: "editorial_display",
    layoutIntent: "editorial",
    titleTreatment: "stacked",
    hierarchy: {
      titleScale: 1.44,
      subtitleScale: 0.46,
      tracking: 0.02,
      case: "title_case"
    },
    alignment: "center",
    placement: {
      anchor: "top_center",
      safeMarginPct: 0.076,
      maxTitleWidthPct: 0.66
    },
    lineHeight: {
      title: 1.04,
      subtitle: 1.18
    },
    titleSizeClamp: {
      square: { minPx: 56, maxPx: 148 },
      wide: { minPx: 50, maxPx: 140 },
      tall: { minPx: 62, maxPx: 168 }
    },
    focalPoint: {
      x: 0.5,
      y: 0.46
    },
    titleEcho: {
      enabled: false,
      opacity: 0.06,
      dxPct: 0.005,
      dyPct: 0.005
    },
    ornament: {
      kind: "rule_dot",
      weight: "thin"
    }
  },
  {
    id: "stacked_stagger",
    name: "Stacked Stagger",
    styleFamily: "modern-collage",
    archetype: "bold_condensed",
    layoutIntent: "bold_modern",
    titleTreatment: "stacked",
    hierarchy: {
      titleScale: 1.64,
      subtitleScale: 0.42,
      tracking: -0.01,
      case: "upper"
    },
    alignment: "left",
    placement: {
      anchor: "top_left",
      safeMarginPct: 0.07,
      maxTitleWidthPct: 0.66
    },
    lineHeight: {
      title: 0.94,
      subtitle: 1.14
    },
    titleSizeClamp: {
      square: { minPx: 60, maxPx: 176 },
      wide: { minPx: 54, maxPx: 164 },
      tall: { minPx: 66, maxPx: 190 }
    },
    focalPoint: {
      x: 0.44,
      y: 0.5
    },
    titleEcho: {
      enabled: false,
      opacity: 0.06,
      dxPct: 0.006,
      dyPct: 0.006
    },
    ornament: {
      kind: "rule_dot",
      weight: "med"
    }
  },
  {
    id: "slab_shadow",
    name: "Slab Shadow",
    styleFamily: "modern-collage",
    archetype: "bold_condensed",
    layoutIntent: "bold_modern",
    titleTreatment: "singleline",
    hierarchy: {
      titleScale: 1.72,
      subtitleScale: 0.42,
      tracking: -0.038,
      case: "upper"
    },
    alignment: "left",
    placement: {
      anchor: "bottom_left",
      safeMarginPct: 0.062,
      maxTitleWidthPct: 0.72
    },
    lineHeight: {
      title: 0.92,
      subtitle: 1.12
    },
    titleSizeClamp: {
      square: { minPx: 62, maxPx: 188 },
      wide: { minPx: 56, maxPx: 174 },
      tall: { minPx: 68, maxPx: 206 }
    },
    focalPoint: {
      x: 0.45,
      y: 0.54
    },
    titleEcho: {
      enabled: false,
      opacity: 0.06,
      dxPct: 0.006,
      dyPct: 0.006
    },
    ornament: {
      kind: "none",
      weight: "bold"
    }
  },
  {
    id: "inline_outline",
    name: "Inline Outline",
    styleFamily: "editorial-photo",
    archetype: "high_contrast_serif",
    layoutIntent: "editorial",
    titleTreatment: "outline",
    hierarchy: {
      titleScale: 1.48,
      subtitleScale: 0.45,
      tracking: 0.018,
      case: "upper"
    },
    alignment: "center",
    placement: {
      anchor: "center",
      safeMarginPct: 0.066,
      maxTitleWidthPct: 0.68
    },
    lineHeight: {
      title: 1.04,
      subtitle: 1.16
    },
    titleSizeClamp: {
      square: { minPx: 56, maxPx: 156 },
      wide: { minPx: 50, maxPx: 146 },
      tall: { minPx: 62, maxPx: 176 }
    },
    focalPoint: {
      x: 0.5,
      y: 0.5
    },
    titleEcho: {
      enabled: false,
      opacity: 0.06,
      dxPct: 0.006,
      dyPct: 0.006
    },
    ornament: {
      kind: "grain",
      weight: "thin"
    }
  },
  {
    id: "badge_stamp",
    name: "Badge Stamp",
    styleFamily: "illustrated-heritage",
    archetype: "heritage_serif",
    defaultPool: false,
    layoutIntent: "classic_serif",
    titleTreatment: "badge",
    hierarchy: {
      titleScale: 1.26,
      subtitleScale: 0.48,
      tracking: 0.05,
      case: "small_caps"
    },
    alignment: "center",
    placement: {
      anchor: "center",
      safeMarginPct: 0.066,
      maxTitleWidthPct: 0.62
    },
    lineHeight: {
      title: 1.06,
      subtitle: 1.2
    },
    titleSizeClamp: {
      square: { minPx: 50, maxPx: 136 },
      wide: { minPx: 46, maxPx: 126 },
      tall: { minPx: 56, maxPx: 152 }
    },
    focalPoint: {
      x: 0.5,
      y: 0.5
    },
    titleEcho: {
      enabled: false,
      opacity: 0.06,
      dxPct: 0.006,
      dyPct: 0.006
    },
    ornament: {
      kind: "wheat",
      weight: "bold"
    }
  },
  {
    id: "knockout_mask",
    name: "Knockout Mask",
    styleFamily: "modern-collage",
    archetype: "bold_condensed",
    layoutIntent: "bold_modern",
    titleTreatment: "boxed",
    hierarchy: {
      titleScale: 1.62,
      subtitleScale: 0.42,
      tracking: -0.024,
      case: "upper"
    },
    alignment: "left",
    placement: {
      anchor: "center",
      safeMarginPct: 0.064,
      maxTitleWidthPct: 0.7
    },
    lineHeight: {
      title: 0.94,
      subtitle: 1.14
    },
    titleSizeClamp: {
      square: { minPx: 58, maxPx: 174 },
      wide: { minPx: 52, maxPx: 164 },
      tall: { minPx: 64, maxPx: 192 }
    },
    focalPoint: {
      x: 0.45,
      y: 0.5
    },
    titleEcho: {
      enabled: false,
      opacity: 0.06,
      dxPct: 0.006,
      dyPct: 0.006
    },
    ornament: {
      kind: "none",
      weight: "med"
    }
  }
];

export const LockupPresets: Record<string, LockupPreset> = Object.fromEntries(
  PRESET_LIST.map((preset) => [preset.id, preset])
);

const DEFAULT_LOCKUP_PRESET_ID = PRESET_LIST[0]?.id || "editorial_serif_stack";
const FEATURED_DEFAULT_PRESET_IDS = [
  "arc_title",
  "stacked_stagger",
  "slab_shadow",
  "inline_outline",
  "knockout_mask"
] as const;

function fnv1aHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

export function getLockupPresetIds(): string[] {
  return PRESET_LIST.map((preset) => preset.id);
}

function getDefaultPoolPresetIds(): string[] {
  return PRESET_LIST.filter((preset) => preset.defaultPool !== false).map((preset) => preset.id);
}

function deterministicCycle(ids: readonly string[], seedHash: number): string[] {
  if (ids.length <= 1) {
    return [...ids];
  }

  const start = seedHash % ids.length;
  let stride = ((seedHash >>> 9) % (ids.length - 1)) + 1;
  while (gcd(stride, ids.length) !== 1) {
    stride = (stride % ids.length) + 1;
  }

  return Array.from({ length: ids.length }, (_, index) => ids[(start + index * stride) % ids.length]);
}

export function getLockupPresetById(id?: string | null): LockupPreset {
  if (id) {
    const preset = LockupPresets[id.trim()];
    if (preset) {
      return preset;
    }
  }

  return LockupPresets[DEFAULT_LOCKUP_PRESET_ID] || PRESET_LIST[0];
}

export function pickDistinctLockupPresetIds(seed: string, count = 3): string[] {
  const ids = getDefaultPoolPresetIds();
  if (ids.length === 0) {
    return [DEFAULT_LOCKUP_PRESET_ID].slice(0, count);
  }

  const total = Math.max(1, Math.min(count, ids.length));
  const hash = fnv1aHash(seed || "lockup-seed");
  const orderedIds = deterministicCycle(ids, hash);
  const featuredIds = orderedIds.filter((id) => FEATURED_DEFAULT_PRESET_IDS.includes(id as (typeof FEATURED_DEFAULT_PRESET_IDS)[number]));
  const selected: string[] = [];
  const usedTreatments = new Set<string>();

  for (const id of featuredIds) {
    if (selected.length >= Math.min(2, total)) {
      break;
    }
    const preset = LockupPresets[id];
    if (!preset) {
      continue;
    }
    if (usedTreatments.has(preset.titleTreatment)) {
      continue;
    }
    selected.push(id);
    usedTreatments.add(preset.titleTreatment);
  }

  for (const id of orderedIds) {
    if (selected.length >= total) {
      break;
    }
    if (selected.includes(id)) {
      continue;
    }
    const preset = LockupPresets[id];
    if (!preset) {
      continue;
    }
    if (usedTreatments.has(preset.titleTreatment) && ids.length > total) {
      continue;
    }
    selected.push(id);
    usedTreatments.add(preset.titleTreatment);
  }

  for (const id of orderedIds) {
    if (selected.length >= total) {
      break;
    }
    if (!selected.includes(id)) {
      selected.push(id);
    }
  }

  return selected;
}
