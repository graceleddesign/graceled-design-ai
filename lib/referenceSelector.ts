import type {
  CuratedReference,
  ReferenceCluster,
  ReferenceTier
} from "@/lib/referenceCuration";
import type {
  StyleFamilyKey,
  StyleMediumKey,
  StyleToneKey
} from "@/lib/style-family-bank";

const ROUND1_REFERENCE_COUNT = 3;
const PROJECT_HARD_AVOID_WINDOW = 12;
const GLOBAL_SOFT_AVOID_WINDOW = 30;
const REFERENCE_ID_PATTERN = /^ref_\d{4}$/i;
const REFERENCE_ID_IN_PATH_PATTERN = /\bref_\d{4}\b/gi;

export type Round1VariationTemplate = {
  key: string;
  backgroundLayoutInstruction: string;
  lockupLayoutInstruction: string;
};

export type Round1ClusterProfile = {
  cluster: ReferenceCluster;
  toneHints: readonly StyleToneKey[];
  mediumHints: readonly StyleMediumKey[];
  allowedStyleFamilies: readonly StyleFamilyKey[];
  lockupPresetIds: readonly string[];
  lockupLayoutFamily: string;
  variationTemplates: readonly Round1VariationTemplate[];
};

type ClusterProfileMap = Record<ReferenceCluster, Round1ClusterProfile>;

const ROUND1_CLUSTER_PROFILES: ClusterProfileMap = {
  minimal: {
    cluster: "minimal",
    toneHints: ["light", "neutral"],
    mediumHints: ["typography", "abstract"],
    allowedStyleFamilies: [
      "editorial_grid_minimal",
      "typographic_only_statement",
      "light_gradient_stage",
      "macro_texture_minimal",
      "modern_geometric_blocks"
    ],
    lockupPresetIds: ["split_title_dynamic", "high_contrast_serif", "stacked_stagger"],
    lockupLayoutFamily: "editorial_clean",
    variationTemplates: [
      {
        key: "minimal_split_axis_v1",
        backgroundLayoutInstruction:
          "Build a calm asymmetric split with one quiet vertical axis and broad negative space for lockup.",
        lockupLayoutInstruction:
          "Favor editorial stack rhythm with tight baseline control and minimal ornament."
      },
      {
        key: "minimal_grid_plateau_v1",
        backgroundLayoutInstruction:
          "Use a restrained Swiss-style grid plateau with a clean title-safe lane and low-detail texture.",
        lockupLayoutInstruction:
          "Use a clean split-title approach with disciplined tracking and no decorative frames."
      },
      {
        key: "minimal_offset_kicker_v1",
        backgroundLayoutInstruction:
          "Create a reduced field with one offset focal mass and a subtle secondary kicker anchor.",
        lockupLayoutInstruction:
          "Prefer offset-kicker lockup pacing and strict hierarchy with small subtitle footprint."
      }
    ]
  },
  editorial_photo: {
    cluster: "editorial_photo",
    toneHints: ["neutral", "dark", "light"],
    mediumHints: ["photo", "typography"],
    allowedStyleFamilies: [
      "editorial_grid_minimal",
      "photographic_graphic_overlay",
      "painterly_atmosphere",
      "topographic_contour_lines"
    ],
    lockupPresetIds: ["arc_title", "modern_editorial", "inline_outline"],
    lockupLayoutFamily: "editorial_magazine",
    variationTemplates: [
      {
        key: "editorial_photo_column_v1",
        backgroundLayoutInstruction:
          "Compose with a magazine-like image column and a protected text lane with controlled contrast.",
        lockupLayoutInstruction:
          "Use editorial stack or vertical spine hierarchy with publication-style spacing."
      },
      {
        key: "editorial_photo_crop_v1",
        backgroundLayoutInstruction:
          "Use a strong crop window and directional light falloff while preserving a quiet lockup stage.",
        lockupLayoutInstruction:
          "Prefer split-title cadence with deliberate contrast between title and subtitle."
      },
      {
        key: "editorial_photo_band_v1",
        backgroundLayoutInstruction:
          "Set one tonal band for typographic calm and keep photographic texture outside the safe lane.",
        lockupLayoutInstruction:
          "Bias toward framed-type discipline without visible boxes or panel treatments."
      }
    ]
  },
  bold_type: {
    cluster: "bold_type",
    toneHints: ["vivid", "mono", "dark"],
    mediumHints: ["typography", "abstract"],
    allowedStyleFamilies: [
      "typographic_only_statement",
      "modern_geometric_blocks",
      "halftone_print_poster",
      "risograph_duotone",
      "editorial_grid_minimal"
    ],
    lockupPresetIds: ["monument_overprint", "stacked_stagger", "split_title_dynamic"],
    lockupLayoutFamily: "typographic_impact",
    variationTemplates: [
      {
        key: "bold_type_monument_v1",
        backgroundLayoutInstruction:
          "Use one dominant geometric mass with high contrast and a disciplined secondary support field.",
        lockupLayoutInstruction:
          "Use monumental stack hierarchy with assertive title scale and concise subtitle support."
      },
      {
        key: "bold_type_diagonal_v1",
        backgroundLayoutInstruction:
          "Drive composition with a diagonal force line and controlled negative spaces around lockup.",
        lockupLayoutInstruction:
          "Favor split-title with dynamic line break and compact subtitle lock."
      },
      {
        key: "bold_type_modular_v1",
        backgroundLayoutInstruction:
          "Build modular blocks with varied scale while preserving a clean lockup safe region.",
        lockupLayoutInstruction:
          "Use framed-type logic through rule systems only, never boxed containers."
      }
    ]
  },
  illustration: {
    cluster: "illustration",
    toneHints: ["vivid", "neutral", "light"],
    mediumHints: ["illustration", "abstract"],
    allowedStyleFamilies: [
      "abstract_organic_papercut",
      "monoline_icon_system",
      "comic_storyboard",
      "paper_cut_collage_playful",
      "symbol_collage"
    ],
    lockupPresetIds: ["handmade_organic", "badge_seal", "arc_title"],
    lockupLayoutFamily: "illustrative_symbolic",
    variationTemplates: [
      {
        key: "illustration_symbol_focus_v1",
        backgroundLayoutInstruction:
          "Build a single symbolic focal motif with simplified supporting shapes and generous breathing room.",
        lockupLayoutInstruction:
          "Use centered-classic or monogram-influenced lockup pacing with restrained ornament."
      },
      {
        key: "illustration_layered_cut_v1",
        backgroundLayoutInstruction:
          "Use layered cut-shape depth with clear foreground/background separation and clean title lane.",
        lockupLayoutInstruction:
          "Favor stepped-baseline flow with subtle handcrafted rhythm."
      },
      {
        key: "illustration_contour_orbit_v1",
        backgroundLayoutInstruction:
          "Use contour-orbit motion around a central void so lockup area stays legible.",
        lockupLayoutInstruction:
          "Prefer editorial stack with delicate illustrative accents kept outside text bounds."
      }
    ]
  },
  modern_abstract: {
    cluster: "modern_abstract",
    toneHints: ["light", "vivid", "neutral"],
    mediumHints: ["abstract", "3d"],
    allowedStyleFamilies: [
      "modern_geometric_blocks",
      "light_gradient_stage",
      "abstract_organic_papercut",
      "macro_texture_minimal",
      "bubbly_3d_clay"
    ],
    lockupPresetIds: ["slab_shadow", "stacked_stagger", "monument_overprint"],
    lockupLayoutFamily: "modern_structural",
    variationTemplates: [
      {
        key: "modern_abstract_radial_v1",
        backgroundLayoutInstruction:
          "Use a restrained radial energy field with one off-center focal zone and low-noise safe lane.",
        lockupLayoutInstruction:
          "Use offset-kicker or split-title discipline with modern geometric tension."
      },
      {
        key: "modern_abstract_stack_v1",
        backgroundLayoutInstruction:
          "Stack abstract planes with clear depth ordering and calm spacing near lockup area.",
        lockupLayoutInstruction:
          "Favor editorial stack hierarchy with crisp modern proportions."
      },
      {
        key: "modern_abstract_arc_v1",
        backgroundLayoutInstruction:
          "Use sweeping arc flow to guide eye movement while preserving clean lockup contrast.",
        lockupLayoutInstruction:
          "Use vertical spine or framed-type rhythm without ornamental clutter."
      }
    ]
  },
  cinematic: {
    cluster: "cinematic",
    toneHints: ["dark", "neutral"],
    mediumHints: ["photo", "abstract"],
    allowedStyleFamilies: [
      "photographic_graphic_overlay",
      "painterly_atmosphere",
      "macro_texture_minimal",
      "light_gradient_stage"
    ],
    lockupPresetIds: ["inline_outline", "modern_editorial", "high_contrast_serif"],
    lockupLayoutFamily: "cinematic_stage",
    variationTemplates: [
      {
        key: "cinematic_horizon_v1",
        backgroundLayoutInstruction:
          "Compose with a horizon-weighted depth gradient and a protected lockup foreground plane.",
        lockupLayoutInstruction:
          "Use centered-classic or split-title with strong contrast and restrained embellishment."
      },
      {
        key: "cinematic_veil_v1",
        backgroundLayoutInstruction:
          "Use layered atmospheric veils to create depth while keeping the lockup lane crisp.",
        lockupLayoutInstruction:
          "Favor editorial stack with calm subtitle treatment and no framing boxes."
      },
      {
        key: "cinematic_beam_v1",
        backgroundLayoutInstruction:
          "Use directional light-beam logic to establish focal drama without literal scene copying.",
        lockupLayoutInstruction:
          "Use vertical spine rhythm with disciplined spacing and clean edge rendering."
      }
    ]
  },
  architectural: {
    cluster: "architectural",
    toneHints: ["mono", "neutral", "dark"],
    mediumHints: ["architectural", "typography"],
    allowedStyleFamilies: [
      "blueprint_diagram",
      "architecture_structural_forms",
      "map_wayfinding",
      "topographic_contour_lines"
    ],
    lockupPresetIds: ["high_contrast_serif", "split_title_dynamic", "stacked_stagger"],
    lockupLayoutFamily: "structural_grid",
    variationTemplates: [
      {
        key: "architectural_gridframe_v1",
        backgroundLayoutInstruction:
          "Use structural gridframe logic with measured line density and a quiet text corridor.",
        lockupLayoutInstruction:
          "Use vertical-spine or editorial-stack lockup pacing with engineered spacing."
      },
      {
        key: "architectural_planview_v1",
        backgroundLayoutInstruction:
          "Build plan-view geometry with directional cues and clear hierarchy of scale.",
        lockupLayoutInstruction:
          "Favor framed-type through rules only and avoid badge-style treatments."
      },
      {
        key: "architectural_contour_v1",
        backgroundLayoutInstruction:
          "Use contour-driven structure with sparse landmarks and a protected lockup basin.",
        lockupLayoutInstruction:
          "Use split-title cadence with restrained tracking and rigid alignment."
      }
    ]
  },
  retro_print: {
    cluster: "retro_print",
    toneHints: ["neutral", "mono", "vivid"],
    mediumHints: ["illustration", "typography"],
    allowedStyleFamilies: [
      "engraved_heritage",
      "manuscript_marginalia",
      "emblem_seal_system",
      "halftone_print_poster",
      "risograph_duotone"
    ],
    lockupPresetIds: ["classic_inscription", "badge_seal", "handmade_organic"],
    lockupLayoutFamily: "heritage_emblem",
    variationTemplates: [
      {
        key: "retro_print_emblem_v1",
        backgroundLayoutInstruction:
          "Compose with print-era emblem balance and tactile grain while preserving a modern safe lane.",
        lockupLayoutInstruction:
          "Use seal-arc or monogram-inspired lockup hierarchy with crisp readability."
      },
      {
        key: "retro_print_halftone_v1",
        backgroundLayoutInstruction:
          "Use controlled halftone depth and limited-ink rhythm with no literal layout copying.",
        lockupLayoutInstruction:
          "Favor centered-classic lockup proportions and restrained decorative support."
      },
      {
        key: "retro_print_rulework_v1",
        backgroundLayoutInstruction:
          "Use heritage rulework and tonal blocks with calm text-safe region management.",
        lockupLayoutInstruction:
          "Use banner-strip discipline with balanced subtitle and no ornate overload."
      }
    ]
  },
  texture: {
    cluster: "texture",
    toneHints: ["neutral", "dark", "light"],
    mediumHints: ["abstract", "illustration", "photo"],
    allowedStyleFamilies: [
      "macro_texture_minimal",
      "painterly_atmosphere",
      "topographic_contour_lines",
      "textile_woven_pattern",
      "abstract_organic_papercut"
    ],
    lockupPresetIds: ["inline_outline", "split_title_dynamic", "slab_shadow"],
    lockupLayoutFamily: "texture_stage",
    variationTemplates: [
      {
        key: "texture_field_anchor_v1",
        backgroundLayoutInstruction:
          "Build one dominant texture field with a controlled anchor void reserved for lockup.",
        lockupLayoutInstruction:
          "Use editorial-stack hierarchy and keep ornamentation minimal and peripheral."
      },
      {
        key: "texture_gradient_fold_v1",
        backgroundLayoutInstruction:
          "Use gradient-fold transitions through textured layers and maintain a stable title-safe region.",
        lockupLayoutInstruction:
          "Favor split-title pacing with clear subtitle separation and high contrast."
      },
      {
        key: "texture_contour_basin_v1",
        backgroundLayoutInstruction:
          "Use contour or weave texture flow around a calm central basin for typography.",
        lockupLayoutInstruction:
          "Use vertical-spine or offset-kicker logic with tight typographic discipline."
      }
    ]
  },
  other: {
    cluster: "other",
    toneHints: ["neutral", "light", "dark"],
    mediumHints: ["abstract", "typography", "photo"],
    allowedStyleFamilies: [
      "modern_geometric_blocks",
      "editorial_grid_minimal",
      "macro_texture_minimal",
      "light_gradient_stage",
      "photographic_graphic_overlay"
    ],
    lockupPresetIds: ["split_title_dynamic", "modern_editorial", "inline_outline"],
    lockupLayoutFamily: "balanced_editorial",
    variationTemplates: [
      {
        key: "other_balanced_axis_v1",
        backgroundLayoutInstruction:
          "Use a balanced axis composition with one dominant field and one supporting counter-shape.",
        lockupLayoutInstruction:
          "Use editorial stack with calm subtitle proportion and strict spacing."
      },
      {
        key: "other_offset_focus_v1",
        backgroundLayoutInstruction:
          "Use an offset focal element plus clear negative space for lockup staging.",
        lockupLayoutInstruction:
          "Favor split-title with disciplined line breaks and no decorative frames."
      },
      {
        key: "other_stage_plate_v1",
        backgroundLayoutInstruction:
          "Carve a clean stage plate for typography and push texture detail to outer zones.",
        lockupLayoutInstruction:
          "Use centered-classic hierarchy with restrained supporting motif."
      }
    ]
  }
};

function hashToSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeReferenceId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!REFERENCE_ID_PATTERN.test(normalized)) {
    return null;
  }
  return normalized;
}

function normalizeReferenceIdList(values: readonly string[] | undefined): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const value of values || []) {
    const id = normalizeReferenceId(value);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    normalized.push(id);
  }
  return normalized;
}

function pickFromPool(params: {
  pool: readonly CuratedReference[];
  seed: string;
  alreadySelectedIds: Set<string>;
  selectedClusters: Set<ReferenceCluster>;
  desiredCount: number;
  projectAvoidSet: Set<string>;
  globalAvoidSet: Set<string>;
}): CuratedReference[] {
  const picks: CuratedReference[] = [];

  while (picks.length < params.desiredCount) {
    const ranked = params.pool
      .filter((ref) => !params.alreadySelectedIds.has(ref.id.toLowerCase()))
      .map((ref) => {
        let score = 0;
        if (!params.selectedClusters.has(ref.cluster)) {
          score += 120;
        }
        score += params.globalAvoidSet.has(ref.id.toLowerCase()) ? -34 : 7;
        score += params.projectAvoidSet.has(ref.id.toLowerCase()) ? -90 : 4;
        score += hashToSeed(`${params.seed}|triplet|${ref.id}`) / 0xffffffff;
        return { ref, score };
      })
      .sort((a, b) => b.score - a.score);

    const winner = ranked[0]?.ref;
    if (!winner) {
      break;
    }

    picks.push(winner);
    params.alreadySelectedIds.add(winner.id.toLowerCase());
    params.selectedClusters.add(winner.cluster);
  }

  return picks;
}

export function pickRound1ReferenceTriplet(params: {
  seed: string;
  recentReferenceIdsProject?: readonly string[];
  recentReferenceIdsGlobal?: readonly string[];
  curatedRefs: readonly CuratedReference[];
}): CuratedReference[] {
  const proPool = params.curatedRefs.filter((ref) => ref.tier === "pro");
  if (proPool.length <= 0) {
    return [];
  }

  const projectRecent = normalizeReferenceIdList(params.recentReferenceIdsProject).slice(0, PROJECT_HARD_AVOID_WINDOW);
  const globalRecent = normalizeReferenceIdList(params.recentReferenceIdsGlobal).slice(0, GLOBAL_SOFT_AVOID_WINDOW);
  const projectAvoidSet = new Set(projectRecent);
  const globalAvoidSet = new Set(globalRecent);
  const picked: CuratedReference[] = [];
  const pickedIds = new Set<string>();
  const pickedClusters = new Set<ReferenceCluster>();

  const stages: ReadonlyArray<readonly CuratedReference[]> = [
    proPool.filter((ref) => !projectAvoidSet.has(ref.id.toLowerCase()) && !globalAvoidSet.has(ref.id.toLowerCase())),
    proPool.filter((ref) => !projectAvoidSet.has(ref.id.toLowerCase())),
    proPool
  ];

  for (const [stageIndex, stagePool] of stages.entries()) {
    if (picked.length >= ROUND1_REFERENCE_COUNT) {
      break;
    }

    const stagePicks = pickFromPool({
      pool: stagePool,
      seed: `${params.seed}|stage-${stageIndex}`,
      alreadySelectedIds: pickedIds,
      selectedClusters: pickedClusters,
      desiredCount: ROUND1_REFERENCE_COUNT - picked.length,
      projectAvoidSet,
      globalAvoidSet
    });
    picked.push(...stagePicks);
  }

  return picked.slice(0, ROUND1_REFERENCE_COUNT);
}

export function getRound1ClusterProfile(cluster: ReferenceCluster): Round1ClusterProfile {
  return ROUND1_CLUSTER_PROFILES[cluster] || ROUND1_CLUSTER_PROFILES.other;
}

export function getRound1VariationTemplateByKey(
  key: string
): (Round1VariationTemplate & { cluster: ReferenceCluster }) | null {
  const normalized = key.trim();
  if (!normalized) {
    return null;
  }

  for (const cluster of Object.keys(ROUND1_CLUSTER_PROFILES) as ReferenceCluster[]) {
    const match = ROUND1_CLUSTER_PROFILES[cluster].variationTemplates.find((template) => template.key === normalized);
    if (match) {
      return {
        ...match,
        cluster
      };
    }
  }

  return null;
}

export function pickRound1VariationTemplateKey(params: {
  seed: string;
  cluster: ReferenceCluster;
  usedTemplateKeys?: readonly string[];
}): string | null {
  const profile = getRound1ClusterProfile(params.cluster);
  if (profile.variationTemplates.length <= 0) {
    return null;
  }

  const used = new Set((params.usedTemplateKeys || []).map((item) => item.trim()).filter(Boolean));
  const ordered = [...profile.variationTemplates].sort((a, b) => {
    const aHash = hashToSeed(`${params.seed}|${profile.cluster}|template|${a.key}`);
    const bHash = hashToSeed(`${params.seed}|${profile.cluster}|template|${b.key}`);
    return aHash - bHash;
  });
  const preferred = ordered.find((template) => !used.has(template.key));
  return (preferred || ordered[0])?.key || null;
}

function collectReferenceIdsFromUnknown(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const ids: string[] = [];
  const pushId = (candidate: unknown) => {
    const normalized = normalizeReferenceId(candidate);
    if (normalized) {
      ids.push(normalized);
    }
  };
  const pushIdArray = (candidate: unknown) => {
    if (!Array.isArray(candidate)) {
      return;
    }
    for (const item of candidate) {
      pushId(item);
    }
  };

  const root = value as Record<string, unknown>;
  const meta = root.meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return [];
  }

  const metaRecord = meta as Record<string, unknown>;
  pushIdArray(metaRecord.usedReferenceIds);

  const usedStylePaths = metaRecord.usedStylePaths;
  if (Array.isArray(usedStylePaths)) {
    for (const pathValue of usedStylePaths) {
      if (typeof pathValue !== "string") {
        continue;
      }
      const matches = pathValue.match(REFERENCE_ID_IN_PATH_PATTERN);
      if (!matches) {
        continue;
      }
      for (const match of matches) {
        pushId(match);
      }
    }
  }

  const designSpec = metaRecord.designSpec;
  if (!designSpec || typeof designSpec !== "object" || Array.isArray(designSpec)) {
    return ids;
  }

  const designSpecRecord = designSpec as Record<string, unknown>;
  pushId(designSpecRecord.referenceId);
  pushIdArray(designSpecRecord.referenceIds);

  const directionSpec = designSpecRecord.directionSpec;
  if (!directionSpec || typeof directionSpec !== "object" || Array.isArray(directionSpec)) {
    return ids;
  }

  const directionSpecRecord = directionSpec as Record<string, unknown>;
  pushId(directionSpecRecord.referenceId);
  pushIdArray(directionSpecRecord.referenceIds);

  return ids;
}

export function deriveRecentReferenceIds(
  projectGenerations: readonly { output: unknown }[],
  options?: { limit?: number }
): string[] {
  const max = Math.max(1, Math.min(options?.limit || 40, 120));
  const seen = new Set<string>();
  const recent: string[] = [];

  for (const generation of projectGenerations) {
    const ids = collectReferenceIdsFromUnknown(generation.output);
    for (const id of ids) {
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      recent.push(id);
      if (recent.length >= max) {
        return recent;
      }
    }
  }

  return recent;
}

export function isRound1ReferenceTier(value: unknown): value is ReferenceTier {
  return value === "pro" || value === "experimental" || value === "fun";
}
