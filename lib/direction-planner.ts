import type { TemplateStyleFamily } from "@/lib/design-brief";
import type { ScriptureScope } from "@/lib/bible-motif-bank";
import { isGenericMotif } from "@/lib/motif-guardrails";
import type { CuratedReference, ReferenceCluster, ReferenceTier } from "@/lib/referenceCuration";
import {
  getRound1ClusterProfile,
  getRound1VariationTemplateByKey,
  listRound1VariationTemplates,
  pickRound1ReferenceTriplet,
  pickRound1VariationTemplateKey
} from "@/lib/referenceSelector";
import {
  isStyleBucketKey,
  isStyleFamilyKey,
  isStyleToneKey,
  STYLE_FAMILY_BANK,
  STYLE_FAMILY_KEYS,
  SCAFFOLD_RISK_FAMILY_SET,
  TEXT_ARTIFACT_RISK_FAMILY_SET,
  type StyleBucketKey,
  type StyleFamilyKey,
  type StyleMediumKey,
  type StyleToneKey
} from "@/lib/style-family-bank";

export type DirectionLaneFamily = "premium_modern" | "editorial" | "minimal" | "photo_centric" | "retro";
export type StyleFamily = DirectionLaneFamily;

export type CompositionType =
  | "asymmetric_split"
  | "centered_stack"
  | "bottom_anchor"
  | "poster_grid"
  | "badge_emblem"
  | "monumental_overprint";

export type BackgroundMode =
  | "abstract_texture"
  | "minimal_gradient"
  | "editorial_photo"
  | "cinematic_photo"
  | "paper_grain"
  | "vintage_print";

export type TypeProfile = "condensed_sans" | "humanist_sans" | "mono_sans" | "display_serif" | "high_contrast_serif";

export type OrnamentProfile = "none" | "anchored_rule" | "grain" | "wheat" | "frame_bold";
export type TitleIntegrationMode = "OVERLAY_GLASS" | "CUTOUT_MASK" | "GRID_LOCKUP" | "TYPE_AS_TEXTURE";

export type DirectionTags = {
  laneFamily: DirectionLaneFamily;
  compositionType: CompositionType;
  backgroundMode: BackgroundMode;
  typeProfile: TypeProfile;
  ornamentProfile: OrnamentProfile;
};

export type DirectionTemplate = DirectionTags & {
  id: string;
  presetKey: string;
  lockupPresetId: string;
  templateStyleFamily: TemplateStyleFamily;
  lanePrompt: string;
};

export type PlannedDirectionSpec = DirectionTemplate & {
  optionIndex: number;
  optionLabel: "A" | "B" | "C";
  wantsSeriesMark: boolean;
  wantsTitleStage: boolean;
  titleIntegrationMode?: TitleIntegrationMode;
  explorationSetKey?: string;
  explorationLaneKey?: string;
  styleFamily?: StyleFamilyKey;
  styleBucket?: StyleBucketKey;
  styleTone?: StyleToneKey;
  styleMedium?: StyleMediumKey;
  motifFocus?: string[];
  motifScope?: ScriptureScope;
  referenceId?: string;
  referenceCluster?: ReferenceCluster;
  referenceTier?: ReferenceTier;
  variationTemplateKey?: string;
  referenceToneHint?: StyleToneKey;
  referenceMediumHint?: StyleMediumKey;
  lockupLayoutFamily?: string;
  refinementMutationAxis?: RefinementMutationAxis;
  refinementVariantFingerprint?: string;
  refinementMotifEmphasisProfile?: "primary_large" | "distributed_balance" | "foreground_cluster" | "edge_repeat";
  refinementTypographyEnergyProfile?: "tight" | "balanced" | "airy";
};

export type RefinementMutationAxis = "composition" | "motif_emphasis" | "typography_energy";

export type RefinementLockedStyleInvariants = {
  toneLane: StyleToneKey | null;
  styleFamily: StyleFamilyKey | null;
  templateFamily: string | null;
  referenceAnchorIds: string[];
  motifPrimitives: string[];
};

export type PlannedRefinementVariant = {
  optionIndex: number;
  optionLabel: "A" | "B" | "C";
  axis: RefinementMutationAxis;
  fingerprint: string;
  noveltyRetryApplied: boolean;
};

export type PlannedRefinementSet = {
  directions: PlannedDirectionSpec[];
  variants: PlannedRefinementVariant[];
  lockedInvariants: RefinementLockedStyleInvariants;
};

const OPTION_LABELS: Array<"A" | "B" | "C"> = ["A", "B", "C"];

const STYLE_LANE_FAMILY_ORDER: DirectionLaneFamily[] = ["premium_modern", "editorial", "minimal", "photo_centric", "retro"];

const DIRECTION_TEMPLATES: DirectionTemplate[] = [
  {
    id: "pm-monument-overprint",
    laneFamily: "premium_modern",
    compositionType: "monumental_overprint",
    backgroundMode: "abstract_texture",
    typeProfile: "condensed_sans",
    ornamentProfile: "none",
    presetKey: "abstract_gradient_modern_v1",
    lockupPresetId: "monument_overprint",
    templateStyleFamily: "modern-collage",
    lanePrompt: "Premium modern lane: confident hierarchy, clean luxury spacing, restrained abstract texture."
  },
  {
    id: "pm-knockout-grid",
    laneFamily: "premium_modern",
    compositionType: "poster_grid",
    backgroundMode: "minimal_gradient",
    typeProfile: "condensed_sans",
    ornamentProfile: "none",
    presetKey: "geo_shapes_negative_v1",
    lockupPresetId: "stacked_stagger",
    templateStyleFamily: "modern-collage",
    lanePrompt: "Premium modern lane: geometric confidence, disciplined negative space, crisp contemporary rhythm."
  },
  {
    id: "pm-slab-anchor",
    laneFamily: "premium_modern",
    compositionType: "bottom_anchor",
    backgroundMode: "abstract_texture",
    typeProfile: "condensed_sans",
    ornamentProfile: "none",
    presetKey: "mark_icon_abstract_v1",
    lockupPresetId: "slab_shadow",
    templateStyleFamily: "modern-collage",
    lanePrompt: "Premium modern lane: anchored typography, elevated polish, minimal-but-bold contrast."
  },
  {
    id: "ed-arc-editorial",
    laneFamily: "editorial",
    compositionType: "centered_stack",
    backgroundMode: "editorial_photo",
    typeProfile: "display_serif",
    ornamentProfile: "grain",
    presetKey: "type_editorial_v1",
    lockupPresetId: "arc_title",
    templateStyleFamily: "editorial-photo",
    lanePrompt: "Editorial lane: magazine-like hierarchy, nuanced serif voice, intentional whitespace and pacing."
  },
  {
    id: "ed-split-serif",
    laneFamily: "editorial",
    compositionType: "asymmetric_split",
    backgroundMode: "editorial_photo",
    typeProfile: "high_contrast_serif",
    ornamentProfile: "grain",
    presetKey: "type_bw_high_contrast_v1",
    lockupPresetId: "split_title_dynamic",
    templateStyleFamily: "editorial-photo",
    lanePrompt: "Editorial lane: asymmetric text column, story-driven hierarchy, crisp art-direction feel."
  },
  {
    id: "ed-inline-contrast",
    laneFamily: "editorial",
    compositionType: "centered_stack",
    backgroundMode: "minimal_gradient",
    typeProfile: "high_contrast_serif",
    ornamentProfile: "grain",
    presetKey: "texture_stone_modern_v1",
    lockupPresetId: "inline_outline",
    templateStyleFamily: "editorial-photo",
    lanePrompt: "Editorial lane: high-contrast voice, elegant restraint, premium publication aesthetics."
  },
  {
    id: "min-clean-system",
    laneFamily: "minimal",
    compositionType: "asymmetric_split",
    backgroundMode: "paper_grain",
    typeProfile: "mono_sans",
    ornamentProfile: "none",
    presetKey: "type_clean_min_v1",
    lockupPresetId: "split_title_dynamic",
    templateStyleFamily: "clean-min",
    lanePrompt: "Minimal lane: reduction-first design, careful spacing, simple forms and quiet confidence."
  },
  {
    id: "min-swiss-grid",
    laneFamily: "minimal",
    compositionType: "poster_grid",
    backgroundMode: "minimal_gradient",
    typeProfile: "humanist_sans",
    ornamentProfile: "none",
    presetKey: "type_swiss_grid_v1",
    lockupPresetId: "high_contrast_serif",
    templateStyleFamily: "clean-min",
    lanePrompt: "Minimal lane: Swiss-inspired grid logic, high legibility, controlled neutral atmosphere."
  },
  {
    id: "min-text-system",
    laneFamily: "minimal",
    compositionType: "bottom_anchor",
    backgroundMode: "paper_grain",
    typeProfile: "humanist_sans",
    ornamentProfile: "none",
    presetKey: "type_text_system_v1",
    lockupPresetId: "split_title_dynamic",
    templateStyleFamily: "clean-min",
    lanePrompt: "Minimal lane: typographic system focus, subtle rhythm, no decorative noise."
  },
  {
    id: "photo-cinematic-veil",
    laneFamily: "photo_centric",
    compositionType: "bottom_anchor",
    backgroundMode: "cinematic_photo",
    typeProfile: "humanist_sans",
    ornamentProfile: "frame_bold",
    presetKey: "photo_veil_cinematic_v1",
    lockupPresetId: "inline_outline",
    templateStyleFamily: "editorial-photo",
    lanePrompt: "Photo-centric lane: cinematic depth, restrained color grading, clear text lane protection."
  },
  {
    id: "photo-color-block",
    laneFamily: "photo_centric",
    compositionType: "asymmetric_split",
    backgroundMode: "editorial_photo",
    typeProfile: "humanist_sans",
    ornamentProfile: "none",
    presetKey: "photo_color_block_v1",
    lockupPresetId: "modern_editorial",
    templateStyleFamily: "editorial-photo",
    lanePrompt: "Photo-centric lane: bold photographic mood with disciplined negative space and clear hierarchy."
  },
  {
    id: "photo-landscape-min",
    laneFamily: "photo_centric",
    compositionType: "centered_stack",
    backgroundMode: "cinematic_photo",
    typeProfile: "display_serif",
    ornamentProfile: "grain",
    presetKey: "photo_landscape_min_v1",
    lockupPresetId: "high_contrast_serif",
    templateStyleFamily: "editorial-photo",
    lanePrompt: "Photo-centric lane: atmospheric scene language, quiet typography staging, premium finish."
  },
  {
    id: "retro-classic-inscribed",
    laneFamily: "retro",
    compositionType: "badge_emblem",
    backgroundMode: "vintage_print",
    typeProfile: "display_serif",
    ornamentProfile: "frame_bold",
    presetKey: "illus_engraved_v1",
    lockupPresetId: "classic_inscription",
    templateStyleFamily: "illustrated-heritage",
    lanePrompt: "Retro lane: archival craftsmanship, classic serif character, tactile print-era warmth."
  },
  {
    id: "retro-badge-seal",
    laneFamily: "retro",
    compositionType: "badge_emblem",
    backgroundMode: "vintage_print",
    typeProfile: "display_serif",
    ornamentProfile: "frame_bold",
    presetKey: "illus_flat_min_v1",
    lockupPresetId: "badge_seal",
    templateStyleFamily: "illustrated-heritage",
    lanePrompt: "Retro lane: emblematic composition, heritage motifs, intentional old-print personality."
  },
  {
    id: "retro-handmade-organic",
    laneFamily: "retro",
    compositionType: "asymmetric_split",
    backgroundMode: "paper_grain",
    typeProfile: "display_serif",
    ornamentProfile: "wheat",
    presetKey: "seasonal_liturgical_v1",
    lockupPresetId: "handmade_organic",
    templateStyleFamily: "illustrated-heritage",
    lanePrompt: "Retro lane: hand-crafted organic texture, heritage pacing, restrained symbolic ornament."
  }
];

const STYLE_FAMILY_TO_LANE_FAMILY: Record<StyleFamilyKey, DirectionLaneFamily> = {
  modern_geometric_blocks: "premium_modern",
  abstract_organic_papercut: "minimal",
  editorial_grid_minimal: "editorial",
  typographic_only_statement: "minimal",
  monoline_icon_system: "premium_modern",
  symbol_collage: "retro",
  halftone_print_poster: "retro",
  risograph_duotone: "retro",
  blueprint_diagram: "premium_modern",
  map_wayfinding: "editorial",
  architecture_structural_forms: "premium_modern",
  textile_woven_pattern: "retro",
  topographic_contour_lines: "editorial",
  light_gradient_stage: "minimal",
  painterly_atmosphere: "photo_centric",
  photographic_graphic_overlay: "photo_centric",
  macro_texture_minimal: "minimal",
  engraved_heritage: "retro",
  manuscript_marginalia: "editorial",
  emblem_seal_system: "retro",
  playful_neon_pool: "premium_modern",
  comic_storyboard: "editorial",
  bubbly_3d_clay: "minimal",
  sticker_pack_pop: "premium_modern",
  paper_cut_collage_playful: "minimal"
};

const TITLE_STAGE_FRIENDLY_STYLE_FAMILIES = new Set<StyleFamilyKey>([
  "light_gradient_stage",
  "editorial_grid_minimal",
  "modern_geometric_blocks",
  "abstract_organic_papercut",
  "macro_texture_minimal",
  "playful_neon_pool",
  "comic_storyboard",
  "bubbly_3d_clay",
  "sticker_pack_pop",
  "paper_cut_collage_playful"
]);

const TITLE_STAGE_CLUTTER_PRONE_STYLE_FAMILIES = new Set<StyleFamilyKey>([
  "symbol_collage",
  "map_wayfinding",
  "textile_woven_pattern",
  "manuscript_marginalia"
]);

const BRAND_CONSTRAINED_STYLE_FAMILIES = new Set<StyleFamilyKey>([
  "modern_geometric_blocks",
  "editorial_grid_minimal",
  "typographic_only_statement",
  "monoline_icon_system",
  "blueprint_diagram",
  "light_gradient_stage",
  "macro_texture_minimal",
  "emblem_seal_system"
]);

const PLAYFUL_STYLE_FAMILIES = new Set<StyleFamilyKey>([
  "playful_neon_pool",
  "comic_storyboard",
  "bubbly_3d_clay",
  "sticker_pack_pop",
  "paper_cut_collage_playful"
]);

const PLAYFUL_INTENT_KEYWORDS = [
  "summer",
  "summer daze",
  "kids",
  "kid",
  "children",
  "child",
  "vbs",
  "vacation bible school",
  "camp",
  "kids camp",
  "gratitude",
  "joy",
  "celebration",
  "celebrate",
  "party",
  "family",
  "fun",
  "welcome"
] as const;

type ExplorationLane = {
  key: string;
  toneAllow: readonly StyleToneKey[];
  mediumAllow: readonly StyleMediumKey[];
  bucketAllow?: readonly StyleBucketKey[];
  recipeAllow?: readonly string[];
  mustBeTextFree: true;
};

type ExplorationSet = {
  key: string;
  lanes: [ExplorationLane, ExplorationLane, ExplorationLane];
};

type StyleFamilyPick = {
  family: StyleFamilyKey;
  bucket: StyleBucketKey;
  tone: StyleToneKey;
  medium: StyleMediumKey;
};

type ExplorationStyleFamilySelection = {
  picks: StyleFamilyPick[];
  explorationSetKey?: string;
  explorationLaneKeys?: string[];
};

type Round1ReferenceAssignment = {
  referenceId: string;
  referenceCluster: ReferenceCluster;
  referenceTier: ReferenceTier;
  variationTemplateKey?: string;
  titleIntegrationMode?: TitleIntegrationMode;
  referenceToneHint?: StyleToneKey;
  referenceMediumHint?: StyleMediumKey;
  lockupLayoutFamily?: string;
  lockupPresetId?: string;
  allowedStyleFamilies: readonly StyleFamilyKey[];
};

export type ExplorationSetConstraint = "any" | "same" | "different";

export type ExplorationFallbackStyleFamilyPick = {
  family: StyleFamilyKey;
  bucket: StyleBucketKey;
  tone: StyleToneKey;
  medium: StyleMediumKey;
  explorationSetKey: string;
  explorationLaneKey: string;
};

function explorationLane(params: {
  key: string;
  toneAllow: readonly StyleToneKey[];
  mediumAllow: readonly StyleMediumKey[];
  bucketAllow?: readonly StyleBucketKey[];
  recipeAllow?: readonly string[];
}): ExplorationLane {
  return {
    ...params,
    mustBeTextFree: true
  };
}

const EXPLORATION_SETS: readonly ExplorationSet[] = [
  {
    key: "set_light_vivid_dark",
    lanes: [
      explorationLane({
        key: "LIGHT_CLEAN",
        toneAllow: ["light"],
        mediumAllow: ["abstract", "typography", "architectural"],
        bucketAllow: ["atmospheric", "minimal_structural", "editorial_typography", "diagrammatic_systems"],
        recipeAllow: ["classic_stack", "split_title", "offset_kicker"]
      }),
      explorationLane({
        key: "VIVID_PLAYFUL",
        toneAllow: ["vivid"],
        mediumAllow: ["illustration", "abstract", "3d"],
        bucketAllow: ["playful_pop", "print_engraved"],
        recipeAllow: ["banner_strip", "split_title", "stepped_baseline"]
      }),
      explorationLane({
        key: "MONO_DARK",
        toneAllow: ["mono", "dark"],
        mediumAllow: ["photo", "architectural", "illustration"],
        bucketAllow: ["atmospheric", "diagrammatic_systems", "print_engraved"],
        recipeAllow: ["centered_classic", "vertical_spine", "framed_type"]
      })
    ]
  },
  {
    key: "set_editorial_illustration_type",
    lanes: [
      explorationLane({
        key: "EDITORIAL_PHOTO",
        toneAllow: ["light", "neutral", "dark"],
        mediumAllow: ["photo", "typography"],
        bucketAllow: ["atmospheric", "editorial_typography"],
        recipeAllow: ["classic_stack", "split_title", "offset_kicker"]
      }),
      explorationLane({
        key: "BOLD_ILLUSTRATION",
        toneAllow: ["vivid"],
        mediumAllow: ["illustration", "3d"],
        bucketAllow: ["playful_pop", "print_engraved"],
        recipeAllow: ["banner_strip", "stepped_baseline", "framed_type"]
      }),
      explorationLane({
        key: "MINIMAL_TYPE",
        toneAllow: ["light", "neutral"],
        mediumAllow: ["typography", "abstract"],
        bucketAllow: ["editorial_typography", "minimal_structural", "atmospheric"],
        recipeAllow: ["classic_stack", "vertical_spine", "offset_kicker"]
      })
    ]
  },
  {
    key: "set_structural_pop_grid",
    lanes: [
      explorationLane({
        key: "ARCH_STRUCTURAL",
        toneAllow: ["mono", "neutral", "dark"],
        mediumAllow: ["architectural"],
        bucketAllow: ["diagrammatic_systems"],
        recipeAllow: ["vertical_spine", "framed_type", "centered_classic"]
      }),
      explorationLane({
        key: "POP_GRADIENT_ABSTRACT",
        toneAllow: ["vivid", "light"],
        mediumAllow: ["abstract", "3d", "illustration"],
        bucketAllow: ["playful_pop", "minimal_structural", "print_engraved"],
        recipeAllow: ["banner_strip", "split_title", "stepped_baseline"]
      }),
      explorationLane({
        key: "CLEAN_GRID_TYPE",
        toneAllow: ["light"],
        mediumAllow: ["typography", "abstract"],
        bucketAllow: ["editorial_typography", "atmospheric", "minimal_structural"],
        recipeAllow: ["classic_stack", "split_title", "offset_kicker"]
      })
    ]
  },
  {
    key: "set_cinematic_bright_retro",
    lanes: [
      explorationLane({
        key: "CINEMATIC_PHOTO",
        toneAllow: ["dark"],
        mediumAllow: ["photo", "illustration"],
        bucketAllow: ["atmospheric"],
        recipeAllow: ["split_title", "classic_stack", "framed_type"]
      }),
      explorationLane({
        key: "BRIGHT_MINIMAL",
        toneAllow: ["light"],
        mediumAllow: ["abstract", "typography", "architectural"],
        bucketAllow: ["minimal_structural", "editorial_typography", "atmospheric", "diagrammatic_systems"],
        recipeAllow: ["classic_stack", "vertical_spine", "offset_kicker"]
      }),
      explorationLane({
        key: "RETRO_PRINT",
        toneAllow: ["vivid", "neutral", "mono"],
        mediumAllow: ["illustration", "typography"],
        bucketAllow: ["print_engraved", "playful_pop"],
        recipeAllow: ["centered_classic", "banner_strip", "seal_arc"]
      })
    ]
  },
  {
    key: "set_mono_colorblock_airy",
    lanes: [
      explorationLane({
        key: "MONO_MINIMAL",
        toneAllow: ["mono", "dark", "light"],
        mediumAllow: ["architectural", "abstract", "typography"],
        bucketAllow: ["diagrammatic_systems", "minimal_structural", "editorial_typography", "atmospheric"],
        recipeAllow: ["vertical_spine", "centered_classic", "framed_type"]
      }),
      explorationLane({
        key: "COLORBLOCK_TYPE",
        toneAllow: ["vivid"],
        mediumAllow: ["abstract", "typography", "illustration"],
        bucketAllow: ["playful_pop", "minimal_structural", "editorial_typography", "print_engraved"],
        recipeAllow: ["banner_strip", "split_title", "offset_kicker"]
      }),
      explorationLane({
        key: "AIRY_PHOTO",
        toneAllow: ["light", "dark"],
        mediumAllow: ["photo", "abstract", "illustration"],
        bucketAllow: ["atmospheric", "minimal_structural"],
        recipeAllow: ["classic_stack", "split_title", "offset_kicker"]
      })
    ]
  },
  {
    key: "set_modern_type_cinematic",
    lanes: [
      explorationLane({
        key: "MODERN_MINIMAL",
        toneAllow: ["light", "neutral"],
        mediumAllow: ["abstract", "typography", "architectural"],
        bucketAllow: ["minimal_structural", "editorial_typography", "diagrammatic_systems", "atmospheric"],
        recipeAllow: ["classic_stack", "vertical_spine", "offset_kicker"]
      }),
      explorationLane({
        key: "EXPERIMENTAL_TYPOGRAPHY",
        toneAllow: ["vivid", "light", "neutral"],
        mediumAllow: ["typography", "illustration", "abstract"],
        bucketAllow: ["editorial_typography", "playful_pop", "print_engraved", "minimal_structural"],
        recipeAllow: ["split_title", "stepped_baseline", "framed_type"]
      }),
      explorationLane({
        key: "CINEMATIC_PHOTO_DARK",
        toneAllow: ["dark"],
        mediumAllow: ["photo", "architectural"],
        bucketAllow: ["atmospheric", "diagrammatic_systems"],
        recipeAllow: ["classic_stack", "split_title", "vertical_spine"]
      })
    ]
  }
];

const SOLEMN_INTENT_KEYWORDS = [
  "good friday",
  "lament",
  "suffering",
  "suffer",
  "repentance",
  "repent",
  "death",
  "judgment",
  "judgement",
  "mourning",
  "grief",
  "holy saturday",
  "ashes",
  "ash wednesday"
] as const;

export type PlayfulIntentSignal = {
  isPlayful: boolean;
  level: "low" | "high" | "solemn";
  reasonKeywords: string[];
  matchedPlayfulKeywords: string[];
  matchedSolemnKeywords: string[];
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeIntentText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectIntentKeywordHits(normalizedText: string, keywords: readonly string[]): string[] {
  if (!normalizedText) {
    return [];
  }

  const hits: string[] = [];
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeIntentText(keyword);
    if (!normalizedKeyword) {
      continue;
    }
    const pattern = new RegExp(`\\b${escapeRegex(normalizedKeyword)}\\b`);
    if (pattern.test(normalizedText) && !hits.includes(keyword)) {
      hits.push(keyword);
    }
  }
  return hits;
}

export function detectPlayfulIntent(input: {
  title?: string | null;
  subtitle?: string | null;
  description?: string | null;
  designNotes?: string | null;
  topics?: readonly string[];
}): PlayfulIntentSignal {
  const joined = [
    input.title || "",
    input.subtitle || "",
    input.description || "",
    input.designNotes || "",
    ...(input.topics || [])
  ]
    .filter(Boolean)
    .join(" ");
  const normalizedText = normalizeIntentText(joined);
  const matchedPlayfulKeywords = collectIntentKeywordHits(normalizedText, PLAYFUL_INTENT_KEYWORDS);
  const matchedSolemnKeywords = collectIntentKeywordHits(normalizedText, SOLEMN_INTENT_KEYWORDS);

  if (matchedSolemnKeywords.length > 0) {
    return {
      isPlayful: false,
      level: "solemn",
      reasonKeywords: matchedSolemnKeywords,
      matchedPlayfulKeywords,
      matchedSolemnKeywords
    };
  }

  if (matchedPlayfulKeywords.length > 0) {
    return {
      isPlayful: true,
      level: "high",
      reasonKeywords: matchedPlayfulKeywords,
      matchedPlayfulKeywords,
      matchedSolemnKeywords
    };
  }

  return {
    isPlayful: false,
    level: "low",
    reasonKeywords: [],
    matchedPlayfulKeywords,
    matchedSolemnKeywords
  };
}

function hashToSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seedInput: string) {
  let state = hashToSeed(seedInput || "direction-plan");

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new Error("Cannot pick from an empty list.");
      }
      return items[Math.floor(next() * items.length)] as T;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const clone = [...items];
      for (let index = clone.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(next() * (index + 1));
        const current = clone[index];
        clone[index] = clone[swapIndex];
        clone[swapIndex] = current;
      }
      return clone;
    }
  };
}

function dedupe<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function optionLabel(optionIndex: number): "A" | "B" | "C" {
  return OPTION_LABELS[optionIndex] || "C";
}

function diversityScore(candidate: DirectionTemplate, chosen: readonly DirectionTemplate[]): number {
  let score = 0;

  for (const current of chosen) {
    if (candidate.laneFamily === current.laneFamily) {
      score -= 1000;
      continue;
    }

    score += candidate.compositionType !== current.compositionType ? 6 : -2;
    score += candidate.backgroundMode !== current.backgroundMode ? 4 : -1;
    score += candidate.typeProfile !== current.typeProfile ? 4 : -1;
    score += candidate.ornamentProfile !== current.ornamentProfile ? 3 : -1;
    score += candidate.templateStyleFamily !== current.templateStyleFamily ? 2 : 0;
    score += candidate.presetKey !== current.presetKey ? 1 : -2;
    score += candidate.lockupPresetId !== current.lockupPresetId ? 1 : -2;
  }

  return score;
}

function pickBestTemplate(params: {
  pool: readonly DirectionTemplate[];
  chosen: readonly DirectionTemplate[];
  rng: ReturnType<typeof createSeededRandom>;
  slotSeed: string;
}): DirectionTemplate {
  const scored = params.pool.map((template) => ({
    template,
    score: diversityScore(template, params.chosen) + hashToSeed(`${params.slotSeed}|${template.id}`) / 0xffffffff
  }));

  scored.sort((a, b) => b.score - a.score);
  const bestScore = scored[0]?.score ?? 0;
  const ties = scored.filter((entry) => Math.abs(entry.score - bestScore) < 1e-6);
  return params.rng.pick(ties.length > 0 ? ties.map((entry) => entry.template) : [scored[0].template]);
}

function poolForLaneFamily(params: {
  laneFamily: DirectionLaneFamily;
  enabledPresetKeys: Set<string>;
}): DirectionTemplate[] {
  const familyPool = DIRECTION_TEMPLATES.filter((template) => template.laneFamily === params.laneFamily);
  const enabledPool = familyPool.filter((template) => params.enabledPresetKeys.has(template.presetKey));
  return enabledPool.length > 0 ? enabledPool : familyPool;
}

function pickLaneFamilies(params: {
  rng: ReturnType<typeof createSeededRandom>;
  preferredFamilies?: readonly DirectionLaneFamily[];
  availableFamilies: readonly DirectionLaneFamily[];
}): DirectionLaneFamily[] {
  const availableSet = new Set(params.availableFamilies);
  const preferred = dedupe((params.preferredFamilies || []).filter((family) => availableSet.has(family)));
  const rest = params.availableFamilies.filter((family) => !preferred.includes(family));
  return [...preferred, ...params.rng.shuffle(rest)];
}

function normalizeRecentStyleFamilies(recentStyleFamilies?: readonly StyleFamilyKey[]): StyleFamilyKey[] {
  const normalized: StyleFamilyKey[] = [];
  const seen = new Set<StyleFamilyKey>();
  for (const family of recentStyleFamilies || []) {
    if (!isStyleFamilyKey(family) || seen.has(family)) {
      continue;
    }
    seen.add(family);
    normalized.push(family);
  }
  return normalized;
}

function normalizeRecentStyleBuckets(recentStyleBuckets?: readonly StyleBucketKey[]): StyleBucketKey[] {
  const normalized: StyleBucketKey[] = [];
  const seen = new Set<StyleBucketKey>();
  for (const bucket of recentStyleBuckets || []) {
    if (!isStyleBucketKey(bucket) || seen.has(bucket)) {
      continue;
    }
    seen.add(bucket);
    normalized.push(bucket);
  }
  return normalized;
}

function normalizeRecentExplorationSetKeys(recentExplorationSetKeys?: readonly string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const key of recentExplorationSetKeys || []) {
    const trimmed = typeof key === "string" ? key.trim() : "";
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function normalizeRecentRecipeIds(recentRecipeIds?: readonly string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const id of recentRecipeIds || []) {
    const trimmed = typeof id === "string" ? id.trim() : "";
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function recencyPenalty(params: {
  rank: number | undefined;
  newestPenalty: number;
  slope?: number;
  freshBonus?: number;
}): number {
  if (params.rank === undefined) {
    return params.freshBonus || 0;
  }
  return Math.min(0, -params.newestPenalty + params.rank * (params.slope ?? 1));
}

function hasLightOrVividTone(picks: readonly StyleFamilyPick[]): boolean {
  return picks.some((pick) => pick.tone === "light" || pick.tone === "vivid");
}

function toStyleFamilyPick(family: StyleFamilyKey): StyleFamilyPick {
  const record = STYLE_FAMILY_BANK[family];
  return {
    family,
    bucket: record.bucket,
    tone: record.tone,
    medium: record.medium
  };
}

function laneMatchesFamily(params: {
  lane: ExplorationLane;
  family: StyleFamilyKey;
  heroOnly: boolean;
}): boolean {
  const record = STYLE_FAMILY_BANK[params.family];
  if (params.heroOnly && record.explorationTier !== "hero") {
    return false;
  }
  if (!params.lane.toneAllow.includes(record.tone)) {
    return false;
  }
  if (!params.lane.mediumAllow.includes(record.medium)) {
    return false;
  }
  if (params.lane.bucketAllow && !params.lane.bucketAllow.includes(record.bucket)) {
    return false;
  }
  if (params.lane.mustBeTextFree && !record.backgroundMustBeTextFree) {
    return false;
  }
  return true;
}

export function pickExplorationFallbackStyleFamily(params: {
  runSeed: string;
  laneFamily: DirectionLaneFamily;
  currentStyleFamily: StyleFamilyKey;
  currentExplorationSetKey?: string | null;
  tone: StyleToneKey;
  medium: StyleMediumKey;
  recentStyleFamilies?: readonly StyleFamilyKey[];
  avoidFamilies?: readonly StyleFamilyKey[];
  setConstraint?: ExplorationSetConstraint;
  allowedFamilies?: readonly StyleFamilyKey[];
}): ExplorationFallbackStyleFamilyPick | null {
  const seededOrder = createSeededRandom(`${params.runSeed}|fallback-style-family-order`).shuffle(STYLE_FAMILY_KEYS);
  const recentFamilyOrder = normalizeRecentStyleFamilies(params.recentStyleFamilies);
  const recentRanks = new Map(recentFamilyOrder.map((family, index) => [family, index] as const));
  const avoid = new Set<StyleFamilyKey>([params.currentStyleFamily, ...(params.avoidFamilies || [])]);
  const allowedFamilySet =
    params.allowedFamilies && params.allowedFamilies.length > 0
      ? new Set(params.allowedFamilies.filter((family): family is StyleFamilyKey => isStyleFamilyKey(family)))
      : null;
  const currentSetKey = params.currentExplorationSetKey?.trim() || "";
  const setConstraint = params.setConstraint || "any";

  const candidateSets = EXPLORATION_SETS.filter((set) => {
    if (setConstraint === "same" && currentSetKey) {
      return set.key === currentSetKey;
    }
    if (setConstraint === "different" && currentSetKey) {
      return set.key !== currentSetKey;
    }
    return true;
  });

  if (candidateSets.length === 0) {
    return null;
  }

  const scoredCandidates: Array<{
    score: number;
    pick: ExplorationFallbackStyleFamilyPick;
  }> = [];

  for (const set of candidateSets) {
    const matchingLanes = set.lanes.filter(
      (lane) => lane.toneAllow.includes(params.tone) && lane.mediumAllow.includes(params.medium)
    );
    if (matchingLanes.length === 0) {
      continue;
    }

    for (const lane of matchingLanes) {
      for (const family of seededOrder) {
        if (avoid.has(family)) {
          continue;
        }
        if (allowedFamilySet && !allowedFamilySet.has(family)) {
          continue;
        }
        if (
          !laneMatchesFamily({
            lane,
            family,
            heroOnly: false
          })
        ) {
          continue;
        }

        const record = STYLE_FAMILY_BANK[family];
        let score = 0;
        score += record.explorationTier === "hero" ? 9 : 2;
        score += STYLE_FAMILY_TO_LANE_FAMILY[family] === params.laneFamily ? 6 : -2;
        score += recencyPenalty({
          rank: recentRanks.get(family),
          newestPenalty: 14,
          slope: 1,
          freshBonus: 6
        });
        if (currentSetKey) {
          score += set.key === currentSetKey ? 2.5 : 0.5;
        }
        score += hashToSeed(`${params.runSeed}|fallback-style-family|${set.key}|${lane.key}|${family}`) / 0xffffffff;

        scoredCandidates.push({
          score,
          pick: {
            family,
            bucket: record.bucket,
            tone: record.tone,
            medium: record.medium,
            explorationSetKey: set.key,
            explorationLaneKey: lane.key
          }
        });
      }
    }
  }

  scoredCandidates.sort((a, b) => b.score - a.score);
  return scoredCandidates[0]?.pick || null;
}

function lanesAreHeroSatisfiable(params: {
  lanes: readonly ExplorationLane[];
  seededOrder: readonly StyleFamilyKey[];
}): boolean {
  if (params.lanes.length <= 0) {
    return true;
  }

  const laneCandidates = params.lanes.map((lane) =>
    params.seededOrder.filter((family) =>
      laneMatchesFamily({
        lane,
        family,
        heroOnly: true
      })
    )
  );

  if (laneCandidates.some((candidates) => candidates.length === 0)) {
    return false;
  }

  const used = new Set<StyleFamilyKey>();

  const backtrack = (laneIndex: number): boolean => {
    if (laneIndex >= laneCandidates.length) {
      return true;
    }

    for (const family of laneCandidates[laneIndex]) {
      if (used.has(family)) {
        continue;
      }
      used.add(family);
      if (backtrack(laneIndex + 1)) {
        return true;
      }
      used.delete(family);
    }
    return false;
  };

  return backtrack(0);
}

function explorationSetNoveltyScore(params: {
  set: ExplorationSet;
  recentSetRanks: Map<string, number>;
  recentRecipeRanks: Map<string, number>;
  runSeed: string;
}): number {
  let score = 0;
  score += recencyPenalty({
    rank: params.recentSetRanks.get(params.set.key),
    newestPenalty: 12,
    slope: 2,
    freshBonus: 7
  });

  for (const lane of params.set.lanes) {
    if (!lane.recipeAllow || lane.recipeAllow.length === 0) {
      continue;
    }
    const laneBestRecipeScore = lane.recipeAllow.reduce((best, recipeId) => {
      const recipeScore = recencyPenalty({
        rank: params.recentRecipeRanks.get(recipeId),
        newestPenalty: 6,
        slope: 1,
        freshBonus: 3
      });
      return Math.max(best, recipeScore);
    }, -3);
    score += laneBestRecipeScore;
  }

  score += (hashToSeed(`${params.runSeed}|exploration-set-score|${params.set.key}`) / 0xffffffff) * 4;
  return score;
}

function pickExplorationStyleFamilies(params: {
  runSeed: string;
  explorationSeed: string;
  seededOrder: readonly StyleFamilyKey[];
  specs: readonly {
    laneFamily: DirectionLaneFamily;
    wantsSeriesMark: boolean;
    wantsTitleStage: boolean;
  }[];
  recentBuckets: Set<StyleBucketKey>;
  recentRanks: Map<StyleFamilyKey, number>;
  recentExplorationSetRanks: Map<string, number>;
  recentRecipeRanks: Map<string, number>;
  preferredLaneFamilies: Set<DirectionLaneFamily>;
  brandMode: "brand" | "fresh";
  playfulIntent: PlayfulIntentSignal;
  allowedFamilySetsByOption?: readonly (ReadonlySet<StyleFamilyKey> | null)[];
}): ExplorationStyleFamilySelection | null {
  const count = params.specs.length;
  if (count <= 0) {
    return {
      picks: []
    };
  }

  const evaluateSet = (set: ExplorationSet): {
    picks: StyleFamilyPick[];
    laneKeys: string[];
    score: number;
  } | null => {
    const shuffledLanes = createSeededRandom(`${params.explorationSeed}|${set.key}|lane-order`).shuffle(set.lanes).slice(0, count);
    if (!lanesAreHeroSatisfiable({ lanes: shuffledLanes, seededOrder: params.seededOrder })) {
      return null;
    }

    const picks: StyleFamilyPick[] = [];
    const usedFamilies = new Set<StyleFamilyKey>();
    const usedBuckets = new Set<StyleBucketKey>();
    let score = explorationSetNoveltyScore({
      set,
      recentSetRanks: params.recentExplorationSetRanks,
      recentRecipeRanks: params.recentRecipeRanks,
      runSeed: params.runSeed
    });

    for (let optionIndex = 0; optionIndex < count; optionIndex += 1) {
      const lane = shuffledLanes[optionIndex];
      const spec = params.specs[optionIndex];
      const allowedSet = params.allowedFamilySetsByOption?.[optionIndex] || null;
      const candidates = params.seededOrder
        .filter((family) => {
          if (usedFamilies.has(family)) {
            return false;
          }
          if (allowedSet && !allowedSet.has(family)) {
            return false;
          }
          return laneMatchesFamily({
            lane,
            family,
            heroOnly: true
          });
        })
        .map((family) => {
          const record = STYLE_FAMILY_BANK[family];
          let laneScore = styleFamilyScore({
            family,
            spec,
            recentRanks: params.recentRanks,
            preferredLaneFamilies: params.preferredLaneFamilies,
            brandMode: params.brandMode,
            playfulIntent: params.playfulIntent
          });
          laneScore += usedBuckets.has(record.bucket) ? -4 : 4;
          laneScore += recencyPenalty({
            rank: params.recentRanks.get(family),
            newestPenalty: 10,
            slope: 1,
            freshBonus: 5
          });
          laneScore += params.recentBuckets.has(record.bucket) ? -2 : 2;
          laneScore += record.backgroundRefHasTypographyRisk ? -1 : 1;
          if (lane.recipeAllow && lane.recipeAllow.length > 0) {
            const bestRecipeScore = lane.recipeAllow.reduce((best, recipeId) => {
              const recipeScore = recencyPenalty({
                rank: params.recentRecipeRanks.get(recipeId),
                newestPenalty: 6,
                slope: 1,
                freshBonus: 2
              });
              return Math.max(best, recipeScore);
            }, -2);
            laneScore += bestRecipeScore;
          }
          laneScore += hashToSeed(`${params.runSeed}|exploration-family|${set.key}|${optionIndex}|${lane.key}|${family}`) / 0xffffffff;
          return {
            pick: toStyleFamilyPick(family),
            score: laneScore
          };
        })
        .sort((a, b) => b.score - a.score);

      const selected = candidates[0];
      if (!selected) {
        return null;
      }
      picks.push(selected.pick);
      usedFamilies.add(selected.pick.family);
      usedBuckets.add(selected.pick.bucket);
      score += selected.score;
    }

    if (!hasLightOrVividTone(picks)) {
      return null;
    }

    score += new Set(picks.map((pick) => pick.bucket)).size * 2;
    score += new Set(picks.map((pick) => pick.medium)).size * 1.5;
    score += new Set(picks.map((pick) => pick.tone)).size;

    return {
      picks,
      laneKeys: shuffledLanes.map((lane) => lane.key),
      score
    };
  };

  const scoredSets = EXPLORATION_SETS.map((set) => ({
    set,
    result: evaluateSet(set)
  }))
    .filter((entry): entry is { set: ExplorationSet; result: { picks: StyleFamilyPick[]; laneKeys: string[]; score: number } } =>
      Boolean(entry.result)
    )
    .sort((a, b) => b.result.score - a.result.score);

  const best = scoredSets[0];
  if (!best) {
    return null;
  }

  return {
    picks: best.result.picks,
    explorationSetKey: best.set.key,
    explorationLaneKeys: best.result.laneKeys
  };
}

function styleFamilyScore(params: {
  family: StyleFamilyKey;
  spec: {
    laneFamily: DirectionLaneFamily;
    wantsSeriesMark: boolean;
    wantsTitleStage: boolean;
    referenceToneHint?: StyleToneKey;
    referenceMediumHint?: StyleMediumKey;
  };
  recentRanks: Map<StyleFamilyKey, number>;
  preferredLaneFamilies: Set<DirectionLaneFamily>;
  brandMode: "brand" | "fresh";
  playfulIntent: PlayfulIntentSignal;
}): number {
  let score = 0;
  const familyRecord = STYLE_FAMILY_BANK[params.family];
  const mappedLane = STYLE_FAMILY_TO_LANE_FAMILY[params.family];
  const recentRank = params.recentRanks.get(params.family);

  if (mappedLane === params.spec.laneFamily) {
    score += 4;
  }

  if (params.preferredLaneFamilies.has(mappedLane)) {
    score += 2;
  }

  if (recentRank === undefined) {
    score += 8;
  } else {
    // Heavier penalty for very recent usage, lighter for older usage.
    score += Math.min(0, -8 + recentRank);
  }

  if (params.spec.wantsSeriesMark) {
    score += familyRecord.markFriendly ? 6 : -3;
  }

  if (params.spec.wantsTitleStage) {
    if (TITLE_STAGE_FRIENDLY_STYLE_FAMILIES.has(params.family)) {
      score += 6;
    }
    if (TITLE_STAGE_CLUTTER_PRONE_STYLE_FAMILIES.has(params.family)) {
      score -= 6;
    }
  }

  if (params.brandMode === "brand") {
    score += BRAND_CONSTRAINED_STYLE_FAMILIES.has(params.family) ? 2 : -1;
  }

  if (PLAYFUL_STYLE_FAMILIES.has(params.family)) {
    if (params.playfulIntent.level === "solemn") {
      score -= 24;
    } else if (params.playfulIntent.level === "high") {
      score += 7;
    } else {
      score -= 4;
    }
  }

  if (params.spec.referenceToneHint) {
    score += familyRecord.tone === params.spec.referenceToneHint ? 6 : -4;
  }

  if (params.spec.referenceMediumHint) {
    score += familyRecord.medium === params.spec.referenceMediumHint ? 5 : -3;
  }

  // Downrank families with known background generation reliability issues.
  // These are not hard-blocked here — the per-lane generation-time planner guardrail
  // (detectPlannerBackgroundFamilyRisk + reroutePlannerBackgroundRiskLane) provides
  // the hard safety net. The score penalty reduces how often they are planned in the
  // first place, saving generation budget.
  if (SCAFFOLD_RISK_FAMILY_SET.has(params.family)) {
    score -= 8;
  }
  if (TEXT_ARTIFACT_RISK_FAMILY_SET.has(params.family)) {
    score -= 8;
  }

  return score;
}

function assignStyleFamilies(params: {
  runSeed: string;
  explorationSeed: string;
  specs: readonly {
    laneFamily: DirectionLaneFamily;
    wantsSeriesMark: boolean;
    wantsTitleStage: boolean;
    referenceToneHint?: StyleToneKey;
    referenceMediumHint?: StyleMediumKey;
  }[];
  preferredLaneFamilies?: readonly DirectionLaneFamily[];
  recentStyleFamilies?: readonly StyleFamilyKey[];
  recentStyleBuckets?: readonly StyleBucketKey[];
  recentExplorationSetKeys?: readonly string[];
  recentRecipeIds?: readonly string[];
  explorationMode?: boolean;
  referenceFirstMode?: boolean;
  strictAllowedFamilies?: boolean;
  brandMode: "brand" | "fresh";
  playfulIntent: PlayfulIntentSignal;
  allowedFamiliesByOption?: readonly (readonly StyleFamilyKey[] | undefined)[];
}): ExplorationStyleFamilySelection | null {
  const seededOrder = createSeededRandom(`${params.runSeed}|style-family-order`).shuffle(STYLE_FAMILY_KEYS);
  const orderIndex = new Map(seededOrder.map((family, index) => [family, index] as const));
  const recentStyleFamilyOrder = normalizeRecentStyleFamilies(params.recentStyleFamilies);
  const recentRanks = new Map(recentStyleFamilyOrder.map((family, index) => [family, index] as const));
  const recentBuckets = new Set(normalizeRecentStyleBuckets(params.recentStyleBuckets));
  const recentExplorationSetOrder = normalizeRecentExplorationSetKeys(params.recentExplorationSetKeys);
  const recentRecipeOrder = normalizeRecentRecipeIds(params.recentRecipeIds);
  const recentExplorationSetRanks = new Map(recentExplorationSetOrder.map((setKey, index) => [setKey, index] as const));
  const recentRecipeRanks = new Map(recentRecipeOrder.map((recipeId, index) => [recipeId, index] as const));
  const preferredLaneFamilies = new Set(params.preferredLaneFamilies || []);
  const isReferenceFirstMode = params.referenceFirstMode === true;
  const allowedFamilySetsByOption = Array.from({ length: params.specs.length }, (_, optionIndex) => {
    const rawAllowed = params.allowedFamiliesByOption?.[optionIndex];
    if (!rawAllowed || rawAllowed.length <= 0) {
      return null;
    }
    const normalized = rawAllowed.filter((family): family is StyleFamilyKey => isStyleFamilyKey(family));
    return normalized.length > 0 ? new Set(normalized) : null;
  });

  if (params.explorationMode && !isReferenceFirstMode) {
    const explorationPicks = pickExplorationStyleFamilies({
      runSeed: params.runSeed,
      explorationSeed: params.explorationSeed,
      seededOrder,
      specs: params.specs,
      recentBuckets,
      recentRanks,
      recentExplorationSetRanks,
      recentRecipeRanks,
      preferredLaneFamilies,
      brandMode: params.brandMode,
      playfulIntent: params.playfulIntent,
      allowedFamilySetsByOption
    });
    if (explorationPicks) {
      return explorationPicks;
    }
  }

  const picks: StyleFamilyPick[] = [];
  const used = new Set<StyleFamilyKey>();
  const usedBuckets = new Set<StyleBucketKey>();
  const usedTones = new Set<StyleToneKey>();
  const usedMediums = new Set<StyleMediumKey>();

  for (const [optionIndex, spec] of params.specs.entries()) {
    const allowedSet = allowedFamilySetsByOption[optionIndex];
    if (params.strictAllowedFamilies && !allowedSet) {
      return null;
    }
    const candidates = seededOrder.filter((family) => {
      if (used.has(family)) {
        return false;
      }
      if (allowedSet && !allowedSet.has(family)) {
        return false;
      }
      if (!params.explorationMode || isReferenceFirstMode) {
        return true;
      }
      return !usedBuckets.has(STYLE_FAMILY_BANK[family].bucket);
    });
    const fallbackCandidates = seededOrder.filter((family) => {
      if (used.has(family)) {
        return false;
      }
      return !allowedSet || allowedSet.has(family);
    });
    const unconstrainedFallbackCandidates = seededOrder.filter((family) => !used.has(family));
    const effectiveCandidates = params.strictAllowedFamilies
      ? candidates.length > 0
        ? candidates
        : fallbackCandidates
      : candidates.length > 0
        ? candidates
        : fallbackCandidates.length > 0
          ? fallbackCandidates
          : unconstrainedFallbackCandidates;
    if (effectiveCandidates.length === 0) {
      return params.strictAllowedFamilies ? null : {
        picks
      };
    }

    const ranked = effectiveCandidates
      .map((family) => {
        const record = STYLE_FAMILY_BANK[family];
        const bucket = record.bucket;
        let score = styleFamilyScore({
          family,
          spec,
          recentRanks,
          preferredLaneFamilies,
          brandMode: params.brandMode,
          playfulIntent: params.playfulIntent
        });
        if (!params.explorationMode && usedBuckets.has(bucket)) {
          score -= 2;
        }
        if (params.explorationMode && !isReferenceFirstMode) {
          score += usedTones.has(record.tone) ? -3 : 3;
          score += usedMediums.has(record.medium) ? -3 : 3;
          if (record.tone === "light" || record.tone === "vivid") {
            score += 2;
          }
        }
        return {
          family,
          bucket,
          score,
          tieBreak: orderIndex.get(family) || 0,
          hashTie: hashToSeed(`${params.runSeed}|style-family|${optionIndex}|${family}`)
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        if (a.tieBreak !== b.tieBreak) {
          return a.tieBreak - b.tieBreak;
        }
        return a.hashTie - b.hashTie;
      });

    const selectedFamily = ranked[0]?.family || effectiveCandidates[0];
    const selectedRecord = STYLE_FAMILY_BANK[selectedFamily];
    picks.push({
      family: selectedFamily,
      bucket: selectedRecord.bucket,
      tone: selectedRecord.tone,
      medium: selectedRecord.medium
    });
    used.add(selectedFamily);
    usedBuckets.add(selectedRecord.bucket);
    usedTones.add(selectedRecord.tone);
    usedMediums.add(selectedRecord.medium);
  }

  if (params.explorationMode && !isReferenceFirstMode && picks.length > 0 && !hasLightOrVividTone(picks)) {
    for (let optionIndex = picks.length - 1; optionIndex >= 0; optionIndex -= 1) {
      const remainingBuckets = new Set(
        picks.filter((_, index) => index !== optionIndex).map((pick) => pick.bucket)
      );
      const remainingFamilies = new Set(
        picks.filter((_, index) => index !== optionIndex).map((pick) => pick.family)
      );
      const allowedSet = allowedFamilySetsByOption[optionIndex];
      const constrainedReplacementCandidates = seededOrder.filter((family) => {
        if (remainingFamilies.has(family)) {
          return false;
        }
        if (allowedSet && !allowedSet.has(family)) {
          return false;
        }
        const record = STYLE_FAMILY_BANK[family];
        if (remainingBuckets.has(record.bucket)) {
          return false;
        }
        return record.tone === "light" || record.tone === "vivid";
      });
      const replacementCandidates =
        constrainedReplacementCandidates.length > 0
          ? constrainedReplacementCandidates
          : seededOrder.filter((family) => {
              if (remainingFamilies.has(family)) {
                return false;
              }
              const record = STYLE_FAMILY_BANK[family];
              if (remainingBuckets.has(record.bucket)) {
                return false;
              }
              return record.tone === "light" || record.tone === "vivid";
            });
      if (replacementCandidates.length === 0) {
        continue;
      }
      const spec = params.specs[optionIndex];
      const replacement = replacementCandidates
        .map((family) => ({
          family,
          score:
            styleFamilyScore({
              family,
              spec,
              recentRanks,
              preferredLaneFamilies,
              brandMode: params.brandMode,
              playfulIntent: params.playfulIntent
            }) + hashToSeed(`${params.runSeed}|light-vivid-repair|${optionIndex}|${family}`) / 0xffffffff
        }))
        .sort((a, b) => b.score - a.score)[0]?.family;
      if (!replacement) {
        continue;
      }
      const replacementRecord = STYLE_FAMILY_BANK[replacement];
      picks[optionIndex] = {
        family: replacement,
        bucket: replacementRecord.bucket,
        tone: replacementRecord.tone,
        medium: replacementRecord.medium
      };
      break;
    }

    if (!hasLightOrVividTone(picks)) {
      const remainingBuckets = new Set(picks.slice(1).map((pick) => pick.bucket));
      const allowedSet = allowedFamilySetsByOption[0];
      const replacementPool =
        allowedSet && seededOrder.some((family) => allowedSet.has(family))
          ? seededOrder.filter((family) => allowedSet.has(family))
          : seededOrder;
      for (const family of replacementPool) {
        if (used.has(family)) {
          continue;
        }
        const record = STYLE_FAMILY_BANK[family];
        if (record.tone !== "light" && record.tone !== "vivid") {
          continue;
        }
        if (remainingBuckets.has(record.bucket)) {
          continue;
        }
        picks[0] = {
          family,
          bucket: record.bucket,
          tone: record.tone,
          medium: record.medium
        };
        break;
      }
    }
  }

  if (params.strictAllowedFamilies && picks.length < params.specs.length) {
    return null;
  }

  return {
    picks
  };
}

export function getDirectionTemplateCatalog(): readonly DirectionTemplate[] {
  return DIRECTION_TEMPLATES;
}

const TITLE_STAGE_STYLE_FAMILY_SCORES: Record<DirectionLaneFamily, number> = {
  premium_modern: 4,
  editorial: 1,
  minimal: 5,
  photo_centric: -3,
  retro: 0
};

const TITLE_STAGE_COMPOSITION_SCORES: Record<CompositionType, number> = {
  asymmetric_split: 3,
  centered_stack: 2,
  bottom_anchor: 2,
  poster_grid: 4,
  badge_emblem: 1,
  monumental_overprint: 3
};

const TITLE_STAGE_BACKGROUND_MODE_SCORES: Record<BackgroundMode, number> = {
  abstract_texture: 4,
  minimal_gradient: 6,
  editorial_photo: -2,
  cinematic_photo: -3,
  paper_grain: 3,
  vintage_print: 1
};

function titleStagePreferenceScore(template: DirectionTemplate): number {
  let score = 0;
  score += TITLE_STAGE_STYLE_FAMILY_SCORES[template.laneFamily];
  score += TITLE_STAGE_COMPOSITION_SCORES[template.compositionType];
  score += TITLE_STAGE_BACKGROUND_MODE_SCORES[template.backgroundMode];
  score += template.templateStyleFamily === "clean-min" || template.templateStyleFamily === "modern-collage" ? 2 : -1;
  score += template.ornamentProfile === "none" ? 1 : -1;
  return score;
}

function pickTitleStageIndex(params: { runSeed: string; templates: readonly DirectionTemplate[] }): number {
  if (params.templates.length <= 0) {
    return -1;
  }

  const ranked = params.templates.map((template, optionIndex) => ({
    optionIndex,
    score: titleStagePreferenceScore(template),
    tieBreak: hashToSeed(`${params.runSeed}|title-stage|${optionIndex}|${template.id}`)
  }));

  ranked.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.tieBreak - b.tieBreak;
  });

  return ranked[0]?.optionIndex ?? 0;
}

function normalizeMotifs(items: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items || []) {
    const trimmed = typeof item === "string" ? item.trim() : "";
    const normalized = trimmed.toLowerCase();
    if (!trimmed || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(trimmed);
  }
  return result;
}

function normalizeMotifKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function motifTokenSet(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 3)
  );
}

function pickMarkSupportMotif(params: {
  motifs: readonly string[];
  markIdeas: readonly string[];
  recentMotifs?: readonly string[];
}): string | null {
  const motifPool = normalizeMotifs(params.motifs);
  if (motifPool.length === 0) {
    return null;
  }

  const recent = new Set(normalizeMotifs(params.recentMotifs).map((item) => normalizeMotifKey(item)));
  const nonGeneric = motifPool.filter((motif) => !isGenericMotif(motif));
  const markTokenSets = params.markIdeas
    .map((item) => motifTokenSet(item))
    .filter((tokens) => tokens.size > 0);

  const scoreMotif = (motif: string): number => {
    const motifTokens = motifTokenSet(motif);
    if (motifTokens.size === 0) {
      return 0;
    }
    let score = 0;
    for (const markTokens of markTokenSets) {
      for (const token of motifTokens) {
        if (markTokens.has(token)) {
          score += 1;
        }
      }
    }
    return score;
  };

  const ranked = (nonGeneric.length > 0 ? nonGeneric : motifPool)
    .map((motif) => {
      const motifKey = normalizeMotifKey(motif);
      const noveltyBoost = recent.has(motifKey) ? 0 : 2;
      return { motif, score: scoreMotif(motif) + noveltyBoost };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.motif || null;
}

function assignMotifFocuses(params: {
  runSeed: string;
  specs: readonly { wantsSeriesMark: boolean }[];
  motifs?: readonly string[];
  allowedGenericMotifs?: readonly string[];
  markIdeas?: readonly string[];
  recentMotifs?: readonly string[];
  motifScope?: ScriptureScope;
  primaryThemes?: readonly string[];
  secondaryThemes?: readonly string[];
  sceneMotifs?: readonly string[];
  sceneMotifRequested?: boolean;
}): string[][] {
  const optionCount = params.specs.length;
  if (optionCount <= 0) {
    return [];
  }

  const motifScope = params.motifScope || "specific_passage";
  const motifs = normalizeMotifs(params.motifs);
  if (motifs.length === 0) {
    return Array.from({ length: optionCount }, () => []);
  }

  const sceneSet = new Set(normalizeMotifs(params.sceneMotifs).map((item) => normalizeMotifKey(item)));
  const sceneAllowed = motifScope !== "whole_book" || params.sceneMotifRequested === true;
  const removeSceneMotifs = (pool: string[]): string[] =>
    sceneAllowed || sceneSet.size === 0 ? pool : pool.filter((motif) => !sceneSet.has(normalizeMotifKey(motif)));

  const allowedGeneric = new Set(normalizeMotifs(params.allowedGenericMotifs).map((item) => item.toLowerCase()));
  const scopedMotifs = removeSceneMotifs(motifs);
  const nonGeneric = scopedMotifs.filter((motif) => !isGenericMotif(motif));
  const allowedGenericPool = scopedMotifs.filter((motif) => {
    if (!isGenericMotif(motif)) {
      return false;
    }
    if (allowedGeneric.size === 0) {
      return false;
    }
    return allowedGeneric.has(motif.toLowerCase());
  });
  const fallbackGeneric = scopedMotifs.filter((motif) => isGenericMotif(motif) && !allowedGeneric.has(motif.toLowerCase()));
  const recentMotifSet = new Set(normalizeMotifs(params.recentMotifs).map((item) => normalizeMotifKey(item)));

  if (motifScope === "whole_book") {
    const requestedSceneMotifs = sceneAllowed ? normalizeMotifs(params.sceneMotifs) : [];
    const scopedPrimaryThemes = removeSceneMotifs(normalizeMotifs(params.primaryThemes));
    const scopedSecondaryThemes = removeSceneMotifs(normalizeMotifs(params.secondaryThemes));
    const primaryThemes = scopedPrimaryThemes.filter((motif) => !isGenericMotif(motif));
    const secondaryThemes = scopedSecondaryThemes.filter((motif) => !isGenericMotif(motif));
    const basePrimaryPool = primaryThemes.length > 0 ? primaryThemes : nonGeneric.length > 0 ? nonGeneric : scopedMotifs;
    const primaryPool =
      params.sceneMotifRequested && requestedSceneMotifs.length > 0
        ? dedupe([...requestedSceneMotifs, ...basePrimaryPool])
        : basePrimaryPool;
    const secondaryPool =
      params.sceneMotifRequested && requestedSceneMotifs.length > 0
        ? dedupe([...requestedSceneMotifs, ...(secondaryThemes.length > 0 ? secondaryThemes : nonGeneric)])
        : secondaryThemes.length > 0
          ? secondaryThemes
          : nonGeneric;

    const rankPool = (pool: string[], salt: string): string[] => {
      return [...pool]
        .map((motif, index) => {
          const noveltyBoost = recentMotifSet.has(normalizeMotifKey(motif)) ? 0 : 2;
          const priorityBoost = Math.max(0, pool.length - index) / Math.max(1, pool.length);
          const tieBreak = hashToSeed(`${params.runSeed}|motif-scope|${salt}|${motif}`) / 0xffffffff;
          return { motif, score: noveltyBoost + priorityBoost + tieBreak * 0.25 };
        })
        .sort((a, b) => b.score - a.score)
        .map((entry) => entry.motif);
    };

    const rankedPrimary = dedupe(rankPool(primaryPool, "primary"));
    const rankedSecondary = dedupe(rankPool(secondaryPool, "secondary"));
    const usedPrimary = new Set<string>();
    const focusByDirection = Array.from({ length: optionCount }, (_, optionIndex) => {
      const nextPrimary =
        rankedPrimary.find((motif) => !usedPrimary.has(normalizeMotifKey(motif))) ||
        rankedPrimary[optionIndex % Math.max(1, rankedPrimary.length)] ||
        "";
      if (!nextPrimary) {
        return [];
      }
      usedPrimary.add(normalizeMotifKey(nextPrimary));

      const secondaryStart = rankedPrimary.length > 0 ? (optionIndex + 1) % rankedPrimary.length : 0;
      const rotatedPrimary = [...rankedPrimary.slice(secondaryStart), ...rankedPrimary.slice(0, secondaryStart)];
      const secondPrimary = rotatedPrimary.find((motif) => normalizeMotifKey(motif) !== normalizeMotifKey(nextPrimary));
      if (secondPrimary) {
        return [nextPrimary, secondPrimary];
      }
      const fallbackSecondary = rankedSecondary.find((motif) => normalizeMotifKey(motif) !== normalizeMotifKey(nextPrimary));
      return fallbackSecondary ? [nextPrimary, fallbackSecondary] : [nextPrimary];
    });

    const seriesMarkDirectionIndex = params.specs.findIndex((spec) => spec.wantsSeriesMark);
    const markSupportMotif =
      seriesMarkDirectionIndex >= 0
        ? pickMarkSupportMotif({
            motifs: primaryPool,
            markIdeas: params.markIdeas || [],
            recentMotifs: params.recentMotifs || []
          })
        : null;
    if (seriesMarkDirectionIndex >= 0 && markSupportMotif && (!sceneSet.has(normalizeMotifKey(markSupportMotif)) || sceneAllowed)) {
      const currentFocus = focusByDirection[seriesMarkDirectionIndex] || [];
      if (!currentFocus.includes(markSupportMotif)) {
        focusByDirection[seriesMarkDirectionIndex] =
          currentFocus.length >= 2 ? [markSupportMotif, currentFocus[0]] : [...currentFocus, markSupportMotif];
      }
    }

    return focusByDirection.map((focus) => focus.slice(0, 2));
  }

  const rng = createSeededRandom(`${params.runSeed}|motif-focus`);
  const baseOrderedMotifs = dedupe([
    ...rng.shuffle(nonGeneric),
    ...rng.shuffle(allowedGenericPool),
    ...rng.shuffle(fallbackGeneric)
  ]);
  const freshMotifs = baseOrderedMotifs.filter((motif) => !recentMotifSet.has(normalizeMotifKey(motif)));
  const recentMotifs = baseOrderedMotifs.filter((motif) => recentMotifSet.has(normalizeMotifKey(motif)));
  const orderedMotifs = [...freshMotifs, ...recentMotifs];

  const usedPrimary = new Set<string>();
  const primaryByDirection = Array.from({ length: optionCount }, (_, optionIndex) => {
    const freshPrimary = orderedMotifs.find((motif) => !usedPrimary.has(normalizeMotifKey(motif)));
    const selectedPrimary = freshPrimary || orderedMotifs[optionIndex % orderedMotifs.length];
    if (selectedPrimary) {
      usedPrimary.add(normalizeMotifKey(selectedPrimary));
    }
    return selectedPrimary || "";
  });

  const focusByDirection = primaryByDirection.map((primary, optionIndex) => {
    if (!primary) {
      return [];
    }

    const secondaryPool = dedupe([...orderedMotifs.slice(optionIndex + 1), ...orderedMotifs.slice(0, optionIndex + 1)]);
    const secondary = secondaryPool.find((motif) => normalizeMotifKey(motif) !== normalizeMotifKey(primary));
    return secondary ? [primary, secondary] : [primary];
  });

  const seriesMarkDirectionIndex = params.specs.findIndex((spec) => spec.wantsSeriesMark);
  const markSupportMotif =
    seriesMarkDirectionIndex >= 0
      ? pickMarkSupportMotif({
          motifs: nonGeneric.length > 0 ? nonGeneric : orderedMotifs,
          markIdeas: params.markIdeas || [],
          recentMotifs: params.recentMotifs || []
        })
      : null;
  if (seriesMarkDirectionIndex >= 0 && markSupportMotif) {
    const currentFocus = focusByDirection[seriesMarkDirectionIndex] || [];
    if (!currentFocus.includes(markSupportMotif)) {
      focusByDirection[seriesMarkDirectionIndex] =
        currentFocus.length >= 2 ? [markSupportMotif, currentFocus[0]] : [...currentFocus, markSupportMotif];
    }
  }

  return focusByDirection.map((focus) => focus.slice(0, 2));
}

function pickRound1LockupPresetId(params: {
  runSeed: string;
  optionIndex: number;
  cluster: ReferenceCluster;
  preferredLockupPresetIds: readonly string[];
  fallbackLockupPresetId: string;
  usedLockupPresetIds: Set<string>;
}): string {
  if (params.preferredLockupPresetIds.length <= 0) {
    return params.fallbackLockupPresetId;
  }

  const ordered = [...params.preferredLockupPresetIds].sort((a, b) => {
    const aHash = hashToSeed(`${params.runSeed}|cluster-${params.cluster}|option-${params.optionIndex}|lockup-preset|${a}`);
    const bHash = hashToSeed(`${params.runSeed}|cluster-${params.cluster}|option-${params.optionIndex}|lockup-preset|${b}`);
    return aHash - bHash;
  });
  const unused = ordered.find((presetId) => !params.usedLockupPresetIds.has(presetId));
  const selected = unused || ordered[0] || params.fallbackLockupPresetId;
  params.usedLockupPresetIds.add(selected);
  return selected;
}

const ROUND1_TITLE_INTEGRATION_MODES: readonly TitleIntegrationMode[] = [
  "OVERLAY_GLASS",
  "CUTOUT_MASK",
  "GRID_LOCKUP",
  "TYPE_AS_TEXTURE"
];

function pickRound1TitleIntegrationMode(params: {
  runSeed: string;
  optionIndex: number;
  referenceId: string;
  usedTitleIntegrationModes: Set<TitleIntegrationMode>;
}): TitleIntegrationMode {
  const ordered = [...ROUND1_TITLE_INTEGRATION_MODES].sort((a, b) => {
    const aHash = hashToSeed(
      `${params.runSeed}|option-${params.optionIndex}|reference-${params.referenceId}|title-integration|${a}`
    );
    const bHash = hashToSeed(
      `${params.runSeed}|option-${params.optionIndex}|reference-${params.referenceId}|title-integration|${b}`
    );
    return aHash - bHash;
  });
  const unused = ordered.find((mode) => !params.usedTitleIntegrationModes.has(mode));
  const selected = unused || ordered[0] || "OVERLAY_GLASS";
  params.usedTitleIntegrationModes.add(selected);
  return selected;
}

function normalizeMotifPool(motifs?: readonly string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const raw of motifs || []) {
    if (typeof raw !== "string") {
      continue;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    const key = normalizeMotifKey(trimmed);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(trimmed);
  }
  return normalized;
}

function normalizeReferenceAnchorIds(input?: readonly string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const raw of input || []) {
    if (typeof raw !== "string") {
      continue;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(trimmed);
  }
  return normalized;
}

function normalizeTemplateFamilyKey(value?: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

function deriveTemplateFamilyFromVariationTemplateKey(variationTemplateKey?: string): string | null {
  const key = typeof variationTemplateKey === "string" ? variationTemplateKey.trim() : "";
  if (!key) {
    return null;
  }
  const template = getRound1VariationTemplateByKey(key);
  if (template?.cluster && template.cluster !== "other") {
    return `cluster:${template.cluster}`;
  }
  const normalized = key.toLowerCase();
  const parts = normalized.split("_").filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]}_${parts[1]}`;
  }
  return normalized || null;
}

function normalizeRefinementLockedStyleInvariants(params: {
  primaryDirection: PlannedDirectionSpec;
  lockedInvariants?: RefinementLockedStyleInvariants;
}): RefinementLockedStyleInvariants {
  const primaryStyleFamily = isStyleFamilyKey(params.primaryDirection.styleFamily) ? params.primaryDirection.styleFamily : null;
  const primaryStyleTone = isStyleToneKey(params.primaryDirection.styleTone)
    ? params.primaryDirection.styleTone
    : primaryStyleFamily
      ? STYLE_FAMILY_BANK[primaryStyleFamily].tone
      : null;
  const styleFamily = isStyleFamilyKey(params.lockedInvariants?.styleFamily) ? params.lockedInvariants.styleFamily : primaryStyleFamily;
  const toneLane = isStyleToneKey(params.lockedInvariants?.toneLane) ? params.lockedInvariants.toneLane : primaryStyleTone;
  const templateFamily =
    normalizeTemplateFamilyKey(params.lockedInvariants?.templateFamily) ||
    deriveTemplateFamilyFromVariationTemplateKey(params.primaryDirection.variationTemplateKey);
  const referenceAnchorIds = normalizeReferenceAnchorIds([
    ...(params.lockedInvariants?.referenceAnchorIds || []),
    ...(params.primaryDirection.referenceId ? [params.primaryDirection.referenceId] : [])
  ]);
  const motifPrimitives = normalizeMotifPool([
    ...(params.lockedInvariants?.motifPrimitives || []),
    ...normalizeMotifPool(params.primaryDirection.motifFocus).slice(0, 2)
  ]).slice(0, 2);
  return {
    toneLane: toneLane || null,
    styleFamily: styleFamily || null,
    templateFamily,
    referenceAnchorIds,
    motifPrimitives
  };
}

function withLockedInvariants(params: {
  primaryDirection: PlannedDirectionSpec;
  lockedInvariants: RefinementLockedStyleInvariants;
}): PlannedDirectionSpec {
  const locked = params.lockedInvariants;
  const next: PlannedDirectionSpec = {
    ...params.primaryDirection,
    motifFocus: locked.motifPrimitives.slice(0, 2)
  };
  if (locked.referenceAnchorIds.length > 0) {
    next.referenceId = locked.referenceAnchorIds[0];
  }
  if (locked.styleFamily) {
    const record = STYLE_FAMILY_BANK[locked.styleFamily];
    next.styleFamily = locked.styleFamily;
    next.styleBucket = record.bucket;
    next.styleTone = record.tone;
    next.styleMedium = record.medium;
  }
  if (locked.toneLane) {
    next.styleTone = locked.toneLane;
  }
  next.refinementMutationAxis = undefined;
  next.refinementVariantFingerprint = undefined;
  next.refinementMotifEmphasisProfile = undefined;
  next.refinementTypographyEnergyProfile = undefined;
  return next;
}

function refinementTemplatePoolByFamily(params: {
  templateFamily: string | null;
  fallbackKey?: string;
}): string[] {
  const templates = listRound1VariationTemplates();
  if (templates.length <= 0) {
    return params.fallbackKey ? [params.fallbackKey] : [];
  }
  const family = normalizeTemplateFamilyKey(params.templateFamily);
  if (!family) {
    return templates.map((template) => template.key);
  }
  const matched = templates
    .filter((template) => normalizeTemplateFamilyKey(deriveTemplateFamilyFromVariationTemplateKey(template.key)) === family)
    .map((template) => template.key);
  if (matched.length > 0) {
    return matched;
  }
  return templates.map((template) => template.key);
}

function pickRefinementCompositionTemplateKey(params: {
  runSeed: string;
  primaryDirection: PlannedDirectionSpec;
  templateFamily: string | null;
  attempt: number;
}): string | undefined {
  const currentKey = params.primaryDirection.variationTemplateKey?.trim() || "";
  const pool = refinementTemplatePoolByFamily({
    templateFamily: params.templateFamily,
    fallbackKey: currentKey || undefined
  });
  if (pool.length <= 0) {
    return currentKey || undefined;
  }
  const ordered = [...pool].sort((a, b) => {
    const aHash = hashToSeed(`${params.runSeed}|refinement-composition|${params.templateFamily || "any"}|${a}`);
    const bHash = hashToSeed(`${params.runSeed}|refinement-composition|${params.templateFamily || "any"}|${b}`);
    return aHash - bHash;
  });
  const alternatives = ordered.filter((key) => key !== currentKey);
  if (alternatives.length <= 0) {
    return currentKey || ordered[0];
  }
  const index = Math.max(0, Math.min(params.attempt, alternatives.length - 1));
  return alternatives[index] || alternatives[0];
}

function pickRefinementMotifEmphasisVariation(params: {
  runSeed: string;
  primaryDirection: PlannedDirectionSpec;
  lockedInvariants: RefinementLockedStyleInvariants;
  attempt: number;
}): {
  motifFocus: string[];
  emphasisProfile: "primary_large" | "distributed_balance" | "foreground_cluster" | "edge_repeat";
} {
  const base = normalizeMotifPool(params.lockedInvariants.motifPrimitives);
  const motifPermutations =
    base.length >= 2
      ? [
          [base[0], base[1]],
          [base[1], base[0]]
        ]
      : [base.slice(0, 1)];
  const profiles: Array<"primary_large" | "distributed_balance" | "foreground_cluster" | "edge_repeat"> = [
    "primary_large",
    "distributed_balance",
    "foreground_cluster",
    "edge_repeat"
  ];
  const combinations = motifPermutations.flatMap((motifFocus) =>
    profiles.map((profile) => ({
      motifFocus,
      emphasisProfile: profile
    }))
  );
  const ordered = [...combinations].sort((a, b) => {
    const aHash = hashToSeed(`${params.runSeed}|refinement-motif|${a.motifFocus.join(",")}|${a.emphasisProfile}`);
    const bHash = hashToSeed(`${params.runSeed}|refinement-motif|${b.motifFocus.join(",")}|${b.emphasisProfile}`);
    return aHash - bHash;
  });
  const selected = ordered[Math.max(0, Math.min(params.attempt, ordered.length - 1))] || ordered[0];
  return {
    motifFocus: selected?.motifFocus || base.slice(0, 1),
    emphasisProfile: selected?.emphasisProfile || "primary_large"
  };
}

const REFINEMENT_TYPOGRAPHY_ENERGY_PROFILES: Array<"tight" | "balanced" | "airy"> = ["tight", "balanced", "airy"];

function pickRefinementTypographyVariation(params: {
  runSeed: string;
  primaryDirection: PlannedDirectionSpec;
  attempt: number;
}): {
  lockupPresetId: string;
  energyProfile: "tight" | "balanced" | "airy";
} {
  const currentPreset = params.primaryDirection.lockupPresetId;
  const pool = dedupe([
    ...DIRECTION_TEMPLATES.filter(
      (template) =>
        template.laneFamily === params.primaryDirection.laneFamily &&
        template.templateStyleFamily === params.primaryDirection.templateStyleFamily
    ).map((template) => template.lockupPresetId),
    currentPreset
  ]).filter((preset): preset is string => typeof preset === "string" && preset.trim().length > 0);
  const ordered = [...pool].sort((a, b) => {
    const aHash = hashToSeed(`${params.runSeed}|refinement-typography|${params.primaryDirection.laneFamily}|${a}`);
    const bHash = hashToSeed(`${params.runSeed}|refinement-typography|${params.primaryDirection.laneFamily}|${b}`);
    return aHash - bHash;
  });
  const alternatives = ordered.filter((preset) => preset !== currentPreset);
  const lockupPresetId =
    alternatives[Math.max(0, Math.min(params.attempt, alternatives.length - 1))] || currentPreset || ordered[0] || "split_title_dynamic";
  const profileOrder = [...REFINEMENT_TYPOGRAPHY_ENERGY_PROFILES].sort((a, b) => {
    const aHash = hashToSeed(`${params.runSeed}|refinement-typography-profile|${a}`);
    const bHash = hashToSeed(`${params.runSeed}|refinement-typography-profile|${b}`);
    return aHash - bHash;
  });
  const energyProfile = profileOrder[Math.max(0, Math.min(params.attempt, profileOrder.length - 1))] || profileOrder[0] || "balanced";
  return {
    lockupPresetId,
    energyProfile
  };
}

function normalizeSeenVariantFingerprints(values?: readonly string[]): Set<string> {
  const normalized = new Set<string>();
  for (const value of values || []) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    normalized.add(trimmed);
  }
  return normalized;
}

export function createRefinementVariantFingerprint(params: {
  direction: PlannedDirectionSpec;
  referenceAnchorIds?: readonly string[];
}): string {
  const referenceIds = normalizeReferenceAnchorIds([...(params.referenceAnchorIds || []), params.direction.referenceId || ""]).join(",");
  const motifSymbols = normalizeMotifPool(params.direction.motifFocus).slice(0, 2).join(",");
  const templateKey = params.direction.variationTemplateKey?.trim() || params.direction.presetKey;
  const typographyRecipe = [
    params.direction.lockupPresetId,
    params.direction.typeProfile,
    params.direction.refinementTypographyEnergyProfile || "base",
    params.direction.refinementMotifEmphasisProfile || "base",
    params.direction.titleIntegrationMode || "auto"
  ]
    .filter(Boolean)
    .join("|");
  const paletteFamily = [params.direction.styleFamily || "", params.direction.styleBucket || "", params.direction.styleTone || ""].join("|");
  const source = [templateKey, motifSymbols, typographyRecipe, paletteFamily, referenceIds].join("||");
  const hashA = hashToSeed(source).toString(16).padStart(8, "0");
  const hashB = hashToSeed(`refinement|${source}`).toString(16).padStart(8, "0");
  return `${hashA}${hashB}`;
}

export function planRoundTwoRefinementSet(params: {
  runSeed: string;
  primaryDirection: PlannedDirectionSpec;
  motifPool?: readonly string[];
  optionCount?: number;
  lockedInvariants?: RefinementLockedStyleInvariants;
  seenVariantFingerprints?: readonly string[];
}): PlannedDirectionSpec[] {
  return planRefinementDirectionSet(params).directions;
}

export function planRefinementDirectionSet(params: {
  runSeed: string;
  primaryDirection: PlannedDirectionSpec;
  motifPool?: readonly string[];
  optionCount?: number;
  lockedInvariants?: RefinementLockedStyleInvariants;
  seenVariantFingerprints?: readonly string[];
}): PlannedRefinementSet {
  const count = Math.max(1, Math.min(params.optionCount || 3, 3));
  const lockedInvariants = normalizeRefinementLockedStyleInvariants({
    primaryDirection: params.primaryDirection,
    lockedInvariants: params.lockedInvariants
  });
  const baseDirection: PlannedDirectionSpec = {
    ...withLockedInvariants({
      primaryDirection: params.primaryDirection,
      lockedInvariants
    }),
    optionIndex: 0,
    optionLabel: "A"
  };
  const seenFingerprints = normalizeSeenVariantFingerprints(params.seenVariantFingerprints);
  const variants: PlannedRefinementVariant[] = [];
  const directions: PlannedDirectionSpec[] = [];
  const axisOrder: RefinementMutationAxis[] = ["composition", "motif_emphasis", "typography_energy"];

  const buildCandidateForAxis = (axis: RefinementMutationAxis, attempt: number): PlannedDirectionSpec => {
    if (axis === "composition") {
      return {
        ...baseDirection,
        variationTemplateKey: pickRefinementCompositionTemplateKey({
          runSeed: params.runSeed,
          primaryDirection: baseDirection,
          templateFamily: lockedInvariants.templateFamily,
          attempt
        }),
        refinementMutationAxis: "composition"
      };
    }
    if (axis === "motif_emphasis") {
      const motifVariation = pickRefinementMotifEmphasisVariation({
        runSeed: params.runSeed,
        primaryDirection: baseDirection,
        lockedInvariants,
        attempt
      });
      return {
        ...baseDirection,
        motifFocus: motifVariation.motifFocus,
        refinementMutationAxis: "motif_emphasis",
        refinementMotifEmphasisProfile: motifVariation.emphasisProfile
      };
    }
    const typographyVariation = pickRefinementTypographyVariation({
      runSeed: params.runSeed,
      primaryDirection: baseDirection,
      attempt
    });
    return {
      ...baseDirection,
      lockupPresetId: typographyVariation.lockupPresetId,
      refinementMutationAxis: "typography_energy",
      refinementTypographyEnergyProfile: typographyVariation.energyProfile
    };
  };

  for (let optionIndex = 0; optionIndex < count; optionIndex += 1) {
    const axis = axisOrder[optionIndex] || "typography_energy";
    let noveltyRetryApplied = false;
    let candidate = buildCandidateForAxis(axis, 0);
    let fingerprint = createRefinementVariantFingerprint({
      direction: candidate,
      referenceAnchorIds: lockedInvariants.referenceAnchorIds
    });
    if (seenFingerprints.has(fingerprint)) {
      noveltyRetryApplied = true;
      candidate = buildCandidateForAxis(axis, 1);
      fingerprint = createRefinementVariantFingerprint({
        direction: candidate,
        referenceAnchorIds: lockedInvariants.referenceAnchorIds
      });
    }
    seenFingerprints.add(fingerprint);
    const option = {
      ...candidate,
      optionIndex,
      optionLabel: optionLabel(optionIndex),
      refinementVariantFingerprint: fingerprint
    };
    directions.push(option);
    variants.push({
      optionIndex,
      optionLabel: optionLabel(optionIndex),
      axis,
      fingerprint,
      noveltyRetryApplied
    });
  }

  return {
    directions,
    variants,
    lockedInvariants
  };
}

function buildRound1ReferenceAssignments(params: {
  runSeed: string;
  optionCount: number;
  round?: number;
  explorationMode?: boolean;
  curatedRefs?: readonly CuratedReference[];
  recentReferenceIdsProject?: readonly string[];
  recentReferenceIdsGlobal?: readonly string[];
  fallbackLockupPresetIds: readonly string[];
  tripletSeedKey?: string;
  reselectSameClusterReferences?: boolean;
}): Array<Round1ReferenceAssignment | null> {
  const shouldUseRound1ReferencePlan =
    params.explorationMode === true && params.round === 1 && (params.curatedRefs?.length || 0) > 0;
  if (!shouldUseRound1ReferencePlan) {
    return Array.from({ length: params.optionCount }, () => null);
  }

  const tripletSeedKey = params.tripletSeedKey?.trim();
  const pickedTriplet = pickRound1ReferenceTriplet({
    seed: [params.runSeed, "round1-reference-triplet", tripletSeedKey].filter(Boolean).join("|"),
    recentReferenceIdsProject: params.recentReferenceIdsProject,
    recentReferenceIdsGlobal: params.recentReferenceIdsGlobal,
    curatedRefs: params.curatedRefs || []
  });
  if (pickedTriplet.length <= 0) {
    return Array.from({ length: params.optionCount }, () => null);
  }

  const optionReferenceSequence = Array.from({ length: params.optionCount }, (_, optionIndex) => {
    const reference = pickedTriplet[optionIndex] || pickedTriplet[optionIndex % pickedTriplet.length];
    return reference || null;
  });
  if (params.reselectSameClusterReferences && (params.curatedRefs?.length || 0) > 0) {
    const proPoolByCluster = new Map<ReferenceCluster, CuratedReference[]>();
    for (const reference of params.curatedRefs || []) {
      if (reference.tier !== "pro") {
        continue;
      }
      const existing = proPoolByCluster.get(reference.cluster) || [];
      existing.push(reference);
      proPoolByCluster.set(reference.cluster, existing);
    }
    const usedReferenceIds = new Set<string>();
    for (let optionIndex = 0; optionIndex < optionReferenceSequence.length; optionIndex += 1) {
      const baseReference = optionReferenceSequence[optionIndex];
      if (!baseReference) {
        continue;
      }
      const clusterPool = proPoolByCluster.get(baseReference.cluster) || [];
      if (clusterPool.length <= 0) {
        usedReferenceIds.add(baseReference.id.toLowerCase());
        continue;
      }
      const orderedClusterPool = [...clusterPool].sort((a, b) => {
        const aHash = hashToSeed(
          `${params.runSeed}|round1-cluster-reselect|${tripletSeedKey || "base"}|option-${optionIndex}|cluster-${baseReference.cluster}|${a.id}`
        );
        const bHash = hashToSeed(
          `${params.runSeed}|round1-cluster-reselect|${tripletSeedKey || "base"}|option-${optionIndex}|cluster-${baseReference.cluster}|${b.id}`
        );
        return aHash - bHash;
      });
      const preferred = orderedClusterPool.find((candidate) => !usedReferenceIds.has(candidate.id.toLowerCase()));
      const selected = preferred || orderedClusterPool[0] || baseReference;
      optionReferenceSequence[optionIndex] = selected;
      usedReferenceIds.add(selected.id.toLowerCase());
    }
  }

  const usedTemplateKeys = new Set<string>();
  const usedLockupPresetIds = new Set<string>();
  const usedTitleIntegrationModes = new Set<TitleIntegrationMode>();

  return Array.from({ length: params.optionCount }, (_, optionIndex) => {
    const reference = optionReferenceSequence[optionIndex];
    if (!reference) {
      return null;
    }

    const profile = getRound1ClusterProfile(reference.cluster);
    const variationTemplateKey = pickRound1VariationTemplateKey({
      seed: `${params.runSeed}|option-${optionIndex}|reference-${reference.id}`,
      cluster: reference.cluster,
      usedTemplateKeys: [...usedTemplateKeys]
    });
    if (variationTemplateKey) {
      usedTemplateKeys.add(variationTemplateKey);
    }

    const fallbackLockupPresetId =
      params.fallbackLockupPresetIds[optionIndex] ||
      params.fallbackLockupPresetIds[params.fallbackLockupPresetIds.length - 1] ||
      "split_title_dynamic";
    const lockupPresetId = pickRound1LockupPresetId({
      runSeed: params.runSeed,
      optionIndex,
      cluster: reference.cluster,
      preferredLockupPresetIds: profile.lockupPresetIds,
      fallbackLockupPresetId,
      usedLockupPresetIds
    });
    const titleIntegrationMode = pickRound1TitleIntegrationMode({
      runSeed: params.runSeed,
      optionIndex,
      referenceId: reference.id,
      usedTitleIntegrationModes
    });

    return {
      referenceId: reference.id,
      referenceCluster: reference.cluster,
      referenceTier: reference.tier,
      variationTemplateKey: variationTemplateKey || undefined,
      titleIntegrationMode,
      referenceToneHint: profile.toneHints[0],
      referenceMediumHint: profile.mediumHints[0],
      lockupLayoutFamily: profile.lockupLayoutFamily,
      lockupPresetId,
      allowedStyleFamilies: profile.allowedStyleFamilies
    };
  });
}

export function planDirectionSet(params: {
  runSeed: string;
  projectId?: string;
  round?: number;
  explorationSetSeed?: string;
  enabledPresetKeys: readonly string[];
  optionCount?: number;
  preferredFamilies?: readonly DirectionLaneFamily[];
  seriesMarkRequested?: boolean;
  wantsSeriesMarkLane?: boolean;
  motifs?: readonly string[];
  allowedGenericMotifs?: readonly string[];
  markIdeas?: readonly string[];
  recentMotifs?: readonly string[];
  recentStyleFamilies?: readonly StyleFamilyKey[];
  recentStyleBuckets?: readonly StyleBucketKey[];
  recentExplorationSetKeys?: readonly string[];
  recentRecipeIds?: readonly string[];
  explorationMode?: boolean;
  brandMode?: "brand" | "fresh";
  seriesTitle?: string | null;
  seriesSubtitle?: string | null;
  seriesDescription?: string | null;
  designNotes?: string | null;
  topicNames?: readonly string[];
  motifScope?: ScriptureScope;
  primaryThemes?: readonly string[];
  secondaryThemes?: readonly string[];
  sceneMotifs?: readonly string[];
  sceneMotifRequested?: boolean;
  curatedRefs?: readonly CuratedReference[];
  recentReferenceIdsProject?: readonly string[];
  recentReferenceIdsGlobal?: readonly string[];
}): PlannedDirectionSpec[] {
  const count = Math.max(1, Math.min(params.optionCount || 3, 3));
  const runSeed = params.runSeed.trim() || "run-seed";
  const explorationSeed =
    params.explorationSetSeed?.trim() ||
    [params.projectId?.trim() || "", typeof params.round === "number" ? `round-${params.round}` : "", runSeed]
      .filter(Boolean)
      .join("|") ||
    runSeed;
  const rng = createSeededRandom(runSeed);
  const enabledPresetKeys = new Set(
    params.enabledPresetKeys
      .map((value) => value.trim())
      .filter(Boolean)
  );

  const availableLaneFamilies = STYLE_LANE_FAMILY_ORDER.filter(
    (laneFamily) => poolForLaneFamily({ laneFamily, enabledPresetKeys }).length > 0
  );
  const laneFamilyOrder = pickLaneFamilies({
    rng,
    preferredFamilies: params.preferredFamilies,
    availableFamilies: availableLaneFamilies
  });

  const chosenLaneFamilies: DirectionLaneFamily[] = [];
  for (const family of laneFamilyOrder) {
    if (chosenLaneFamilies.length >= count) {
      break;
    }
    if (!chosenLaneFamilies.includes(family)) {
      chosenLaneFamilies.push(family);
    }
  }

  for (const family of STYLE_LANE_FAMILY_ORDER) {
    if (chosenLaneFamilies.length >= count) {
      break;
    }
    if (!chosenLaneFamilies.includes(family)) {
      chosenLaneFamilies.push(family);
    }
  }

  const chosenTemplates: DirectionTemplate[] = [];
  for (let optionIndex = 0; optionIndex < count; optionIndex += 1) {
    const laneFamily = chosenLaneFamilies[optionIndex] || chosenLaneFamilies[chosenLaneFamilies.length - 1] || "premium_modern";
    const pool = poolForLaneFamily({ laneFamily, enabledPresetKeys });
    const template = pickBestTemplate({
      pool,
      chosen: chosenTemplates,
      rng,
      slotSeed: `${runSeed}|${optionIndex}`
    });
    chosenTemplates.push(template);
  }

  const seriesMarkEnabled = params.wantsSeriesMarkLane ?? params.seriesMarkRequested ?? false;
  const wantsSeriesMarkIndex = seriesMarkEnabled ? hashToSeed(`${runSeed}|series-mark`) % count : -1;
  const wantsTitleStageIndex = pickTitleStageIndex({
    runSeed,
    templates: chosenTemplates
  });

  const baseSpecs = chosenTemplates.map((template, optionIndex) => ({
    ...template,
    optionIndex,
    optionLabel: optionLabel(optionIndex),
    wantsSeriesMark: optionIndex === wantsSeriesMarkIndex,
    wantsTitleStage: optionIndex === wantsTitleStageIndex
  }));

  const playfulIntent = detectPlayfulIntent({
    title: params.seriesTitle,
    subtitle: params.seriesSubtitle,
    description: params.seriesDescription,
    designNotes: params.designNotes,
    topics: params.topicNames
  });
  const buildReferenceAwareSpecs = (assignments: readonly (Round1ReferenceAssignment | null)[]) =>
    baseSpecs.map((spec, optionIndex) => {
      const assignment = assignments[optionIndex];
      if (!assignment) {
        return spec;
      }
      return {
        ...spec,
        lockupPresetId: assignment.lockupPresetId || spec.lockupPresetId,
        referenceToneHint: assignment.referenceToneHint,
        referenceMediumHint: assignment.referenceMediumHint
      };
    });
  const styleSelectionRespectsReferenceAllowlist = (
    assignments: readonly (Round1ReferenceAssignment | null)[],
    selection: ExplorationStyleFamilySelection | null
  ): boolean => {
    if (!selection || selection.picks.length < count) {
      return false;
    }
    for (let optionIndex = 0; optionIndex < count; optionIndex += 1) {
      const assignment = assignments[optionIndex];
      if (!assignment?.referenceId) {
        continue;
      }
      const family = selection.picks[optionIndex]?.family;
      if (!family || !assignment.allowedStyleFamilies.includes(family)) {
        return false;
      }
    }
    return true;
  };

  let round1ReferenceAssignments: Array<Round1ReferenceAssignment | null> = Array.from({ length: count }, () => null);
  let referenceAwareSpecs = buildReferenceAwareSpecs(round1ReferenceAssignments);
  let allowedFamiliesByOption = round1ReferenceAssignments.map((assignment) => assignment?.allowedStyleFamilies);
  let styleFamilies: ExplorationStyleFamilySelection | null = null;

  const shouldUseReferenceFirstPlan =
    params.explorationMode === true && params.round === 1 && (params.curatedRefs?.length || 0) > 0;
  if (shouldUseReferenceFirstPlan) {
    const maxAttempts = Math.max(1, Math.min(12, (params.curatedRefs?.length || 3) * 2));
    for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
      const useSameClusterReselection = attemptIndex % 2 === 1;
      const attemptAssignments = buildRound1ReferenceAssignments({
        runSeed,
        optionCount: count,
        round: params.round,
        explorationMode: params.explorationMode === true,
        curatedRefs: params.curatedRefs,
        recentReferenceIdsProject: params.recentReferenceIdsProject,
        recentReferenceIdsGlobal: params.recentReferenceIdsGlobal,
        fallbackLockupPresetIds: baseSpecs.map((spec) => spec.lockupPresetId),
        tripletSeedKey: `attempt-${Math.floor(attemptIndex / 2)}`,
        reselectSameClusterReferences: useSameClusterReselection
      });
      const attemptHasReferences = attemptAssignments.some((assignment) => Boolean(assignment?.referenceId));
      if (!attemptHasReferences) {
        continue;
      }
      const attemptReferenceAwareSpecs = buildReferenceAwareSpecs(attemptAssignments);
      const attemptAllowedFamiliesByOption = attemptAssignments.map((assignment) => assignment?.allowedStyleFamilies);
      const attemptStyleFamilies = assignStyleFamilies({
        runSeed,
        explorationSeed,
        specs: attemptReferenceAwareSpecs,
        preferredLaneFamilies: params.preferredFamilies,
        recentStyleFamilies: params.recentStyleFamilies,
        recentStyleBuckets: params.recentStyleBuckets,
        recentExplorationSetKeys: params.recentExplorationSetKeys,
        recentRecipeIds: params.recentRecipeIds,
        explorationMode: params.explorationMode === true,
        referenceFirstMode: true,
        strictAllowedFamilies: true,
        brandMode: params.brandMode === "brand" ? "brand" : "fresh",
        playfulIntent,
        allowedFamiliesByOption: attemptAllowedFamiliesByOption
      });
      if (!styleSelectionRespectsReferenceAllowlist(attemptAssignments, attemptStyleFamilies)) {
        continue;
      }

      round1ReferenceAssignments = attemptAssignments;
      referenceAwareSpecs = attemptReferenceAwareSpecs;
      allowedFamiliesByOption = attemptAllowedFamiliesByOption;
      styleFamilies = attemptStyleFamilies;
      break;
    }
  }

  if (!styleFamilies) {
    round1ReferenceAssignments = buildRound1ReferenceAssignments({
      runSeed,
      optionCount: count,
      round: params.round,
      explorationMode: params.explorationMode === true,
      curatedRefs: params.curatedRefs,
      recentReferenceIdsProject: params.recentReferenceIdsProject,
      recentReferenceIdsGlobal: params.recentReferenceIdsGlobal,
      fallbackLockupPresetIds: baseSpecs.map((spec) => spec.lockupPresetId)
    });
    referenceAwareSpecs = buildReferenceAwareSpecs(round1ReferenceAssignments);
    allowedFamiliesByOption = round1ReferenceAssignments.map((assignment) => assignment?.allowedStyleFamilies);
    const referenceFirstMode = round1ReferenceAssignments.some((assignment) => Boolean(assignment?.referenceId));
    styleFamilies = assignStyleFamilies({
      runSeed,
      explorationSeed,
      specs: referenceAwareSpecs,
      preferredLaneFamilies: params.preferredFamilies,
      recentStyleFamilies: params.recentStyleFamilies,
      recentStyleBuckets: params.recentStyleBuckets,
      recentExplorationSetKeys: params.recentExplorationSetKeys,
      recentRecipeIds: params.recentRecipeIds,
      explorationMode: params.explorationMode === true,
      referenceFirstMode,
      strictAllowedFamilies: referenceFirstMode,
      brandMode: params.brandMode === "brand" ? "brand" : "fresh",
      playfulIntent,
      allowedFamiliesByOption
    });
  }
  if (!styleFamilies) {
    const forcedPicks = Array.from({ length: count }, (_, optionIndex) => {
      const assignment = round1ReferenceAssignments[optionIndex];
      const allowedFamilies =
        assignment?.allowedStyleFamilies && assignment.allowedStyleFamilies.length > 0
          ? assignment.allowedStyleFamilies.filter((family): family is StyleFamilyKey => isStyleFamilyKey(family))
          : STYLE_FAMILY_KEYS;
      if (allowedFamilies.length <= 0) {
        return null;
      }
      const ordered = [...allowedFamilies].sort((a, b) => {
        const aHash = hashToSeed(`${runSeed}|forced-reference-first-family|option-${optionIndex}|${a}`);
        const bHash = hashToSeed(`${runSeed}|forced-reference-first-family|option-${optionIndex}|${b}`);
        return aHash - bHash;
      });
      return toStyleFamilyPick(ordered[0]);
    }).filter((pick): pick is StyleFamilyPick => Boolean(pick));
    styleFamilies = {
      picks: forcedPicks
    };
  }
  const effectiveStyleFamilies = styleFamilies || { picks: [] };

  const motifFocusByDirection = assignMotifFocuses({
    runSeed,
    specs: referenceAwareSpecs,
    motifs: params.motifs,
    allowedGenericMotifs: params.allowedGenericMotifs,
    markIdeas: params.markIdeas,
    recentMotifs: params.recentMotifs,
    motifScope: params.motifScope,
    primaryThemes: params.primaryThemes,
    secondaryThemes: params.secondaryThemes,
    sceneMotifs: params.sceneMotifs,
    sceneMotifRequested: params.sceneMotifRequested
  });

  return referenceAwareSpecs.map((spec, optionIndex) => {
    const referenceAssignment = round1ReferenceAssignments[optionIndex];
    const selectedFamily = effectiveStyleFamilies.picks[optionIndex]?.family;
    const selectedRecord = selectedFamily ? STYLE_FAMILY_BANK[selectedFamily] : null;
    if (
      process.env.NODE_ENV !== "production" &&
      referenceAssignment?.referenceCluster &&
      selectedFamily &&
      !referenceAssignment.allowedStyleFamilies.includes(selectedFamily)
    ) {
      console.error("[direction-planner] reference-first style-family mismatch", {
        optionIndex,
        referenceId: referenceAssignment.referenceId,
        referenceCluster: referenceAssignment.referenceCluster,
        styleFamily: selectedFamily
      });
    }
    return {
    ...spec,
    explorationSetKey: referenceAssignment?.referenceId ? undefined : effectiveStyleFamilies.explorationSetKey,
    explorationLaneKey: referenceAssignment?.referenceId ? undefined : effectiveStyleFamilies.explorationLaneKeys?.[optionIndex],
    styleFamily: selectedFamily,
    styleBucket: selectedRecord?.bucket || effectiveStyleFamilies.picks[optionIndex]?.bucket,
    styleTone: selectedRecord?.tone || referenceAssignment?.referenceToneHint || effectiveStyleFamilies.picks[optionIndex]?.tone,
    styleMedium:
      selectedRecord?.medium || referenceAssignment?.referenceMediumHint || effectiveStyleFamilies.picks[optionIndex]?.medium,
    motifFocus: motifFocusByDirection[optionIndex] || [],
    motifScope: params.motifScope,
    referenceId: referenceAssignment?.referenceId,
    referenceCluster: referenceAssignment?.referenceCluster,
    referenceTier: referenceAssignment?.referenceTier,
    variationTemplateKey: referenceAssignment?.variationTemplateKey,
    titleIntegrationMode: referenceAssignment?.titleIntegrationMode,
    referenceToneHint: referenceAssignment?.referenceToneHint,
    referenceMediumHint: referenceAssignment?.referenceMediumHint,
    lockupLayoutFamily: referenceAssignment?.lockupLayoutFamily
  };
  });
}
