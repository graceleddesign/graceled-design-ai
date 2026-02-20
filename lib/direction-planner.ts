import type { TemplateStyleFamily } from "@/lib/design-brief";
import { isGenericMotif } from "@/lib/motif-guardrails";
import {
  isStyleFamilyKey,
  STYLE_FAMILY_BANK,
  STYLE_FAMILY_KEYS,
  type StyleFamilyKey
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
  styleFamily?: StyleFamilyKey;
  motifFocus?: string[];
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

function styleFamilyScore(params: {
  family: StyleFamilyKey;
  spec: {
    laneFamily: DirectionLaneFamily;
    wantsSeriesMark: boolean;
    wantsTitleStage: boolean;
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

  return score;
}

function assignStyleFamilies(params: {
  runSeed: string;
  specs: readonly {
    laneFamily: DirectionLaneFamily;
    wantsSeriesMark: boolean;
    wantsTitleStage: boolean;
  }[];
  preferredLaneFamilies?: readonly DirectionLaneFamily[];
  recentStyleFamilies?: readonly StyleFamilyKey[];
  brandMode: "brand" | "fresh";
  playfulIntent: PlayfulIntentSignal;
}): StyleFamilyKey[] {
  const seededOrder = createSeededRandom(`${params.runSeed}|style-family-order`).shuffle(STYLE_FAMILY_KEYS);
  const orderIndex = new Map(seededOrder.map((family, index) => [family, index] as const));
  const recent = normalizeRecentStyleFamilies(params.recentStyleFamilies);
  const recentRanks = new Map(recent.map((family, index) => [family, index] as const));
  const preferredLaneFamilies = new Set(params.preferredLaneFamilies || []);

  const picks: StyleFamilyKey[] = [];
  const used = new Set<StyleFamilyKey>();

  for (const [optionIndex, spec] of params.specs.entries()) {
    const candidates = seededOrder.filter((family) => !used.has(family));
    if (candidates.length === 0) {
      break;
    }

    const ranked = candidates
      .map((family) => ({
        family,
        score: styleFamilyScore({
          family,
          spec,
          recentRanks,
          preferredLaneFamilies,
          brandMode: params.brandMode,
          playfulIntent: params.playfulIntent
        }),
        tieBreak: orderIndex.get(family) || 0,
        hashTie: hashToSeed(`${params.runSeed}|style-family|${optionIndex}|${family}`)
      }))
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        if (a.tieBreak !== b.tieBreak) {
          return a.tieBreak - b.tieBreak;
        }
        return a.hashTie - b.hashTie;
      });

    const selected = ranked[0]?.family || candidates[0];
    picks.push(selected);
    used.add(selected);
  }

  return picks;
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
}): string[][] {
  const optionCount = params.specs.length;
  if (optionCount <= 0) {
    return [];
  }

  const motifs = normalizeMotifs(params.motifs);
  if (motifs.length === 0) {
    return Array.from({ length: optionCount }, () => []);
  }

  const allowedGeneric = new Set(normalizeMotifs(params.allowedGenericMotifs).map((item) => item.toLowerCase()));
  const nonGeneric = motifs.filter((motif) => !isGenericMotif(motif));
  const allowedGenericPool = motifs.filter((motif) => {
    if (!isGenericMotif(motif)) {
      return false;
    }
    if (allowedGeneric.size === 0) {
      return false;
    }
    return allowedGeneric.has(motif.toLowerCase());
  });
  const fallbackGeneric = motifs.filter((motif) => isGenericMotif(motif) && !allowedGeneric.has(motif.toLowerCase()));
  const recentMotifSet = new Set(normalizeMotifs(params.recentMotifs).map((item) => normalizeMotifKey(item)));

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

export function planDirectionSet(params: {
  runSeed: string;
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
  brandMode?: "brand" | "fresh";
  seriesTitle?: string | null;
  seriesSubtitle?: string | null;
  seriesDescription?: string | null;
  designNotes?: string | null;
  topicNames?: readonly string[];
}): PlannedDirectionSpec[] {
  const count = Math.max(1, Math.min(params.optionCount || 3, 3));
  const runSeed = params.runSeed.trim() || "run-seed";
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

  const styleFamilies = assignStyleFamilies({
    runSeed,
    specs: baseSpecs,
    preferredLaneFamilies: params.preferredFamilies,
    recentStyleFamilies: params.recentStyleFamilies,
    brandMode: params.brandMode === "brand" ? "brand" : "fresh",
    playfulIntent
  });

  const motifFocusByDirection = assignMotifFocuses({
    runSeed,
    specs: baseSpecs,
    motifs: params.motifs,
    allowedGenericMotifs: params.allowedGenericMotifs,
    markIdeas: params.markIdeas,
    recentMotifs: params.recentMotifs
  });

  return baseSpecs.map((spec, optionIndex) => ({
    ...spec,
    styleFamily: styleFamilies[optionIndex],
    motifFocus: motifFocusByDirection[optionIndex] || []
  }));
}
