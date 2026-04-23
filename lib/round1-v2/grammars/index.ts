// Composition grammar bank for Round 1 V2.
// Grammars define structural composition decisions — where things live in the frame —
// independent of style decoration (color, texture, medium).
// Phase 1: wide aspect only.

export type TonalVariant = "light" | "vivid" | "neutral" | "dark" | "mono";

export const TONAL_VARIANTS: readonly TonalVariant[] = [
  "light",
  "vivid",
  "neutral",
  "dark",
  "mono",
];

export type GrammarKey =
  | "centered_focal_motif"
  | "edge_anchored_motif"
  | "horizon_band"
  | "layered_atmospheric"
  | "geometric_block_composition"
  | "textural_field";

export const GRAMMAR_KEYS: readonly GrammarKey[] = [
  "centered_focal_motif",
  "edge_anchored_motif",
  "horizon_band",
  "layered_atmospheric",
  "geometric_block_composition",
  "textural_field",
];

// Normalized bounding box in a 0–1 coordinate space where (0,0) is top-left.
// x/y are the top-left corner of the box; w/h are width/height.
export interface Bbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CompositionGrammar {
  key: GrammarKey;
  // Used for A/B/C distinctiveness enforcement — no two selected scouts may share a family.
  diversityFamily: string;
  compatibleTones: readonly TonalVariant[];
  // Minimum fraction of the frame that should be open/unoccupied negative space (0–100).
  negativeSpaceMinPct: number;
  // Where a discrete subject or motif is expected to appear; empty = no discrete focal subject.
  focalZones: readonly Bbox[];
  // Predicted regions where a lockup can be placed safely without collision.
  titleSafeZones: readonly Bbox[];
  // Motif type strings that structurally cannot work in this grammar.
  incompatibleMotifTypes: readonly string[];
  scoutPromptTemplate: string;
  rebuildPromptTemplate: string;
}

const ALL_TONES: readonly TonalVariant[] = TONAL_VARIANTS;

export const GRAMMAR_BANK: Readonly<Record<GrammarKey, CompositionGrammar>> = {
  centered_focal_motif: {
    key: "centered_focal_motif",
    diversityFamily: "focal_centered",
    compatibleTones: ALL_TONES,
    negativeSpaceMinPct: 50,
    focalZones: [{ x: 0.25, y: 0.2, w: 0.5, h: 0.55 }],
    titleSafeZones: [
      { x: 0.0, y: 0.68, w: 1.0, h: 0.25 },
      { x: 0.0, y: 0.05, w: 1.0, h: 0.18 },
    ],
    incompatibleMotifTypes: ["abstract_texture", "all_over_pattern"],
    scoutPromptTemplate:
      "Sermon series background art. Single centered {motif} as the focal element, surrounded by wide negative space. {tone} tonal treatment. No text, letters, words, or letterforms anywhere.",
    rebuildPromptTemplate:
      "Premium sermon series background artwork. Single {motif} centered in the frame, wide open negative space on all sides, {tone} palette. Completely text-free. No letterforms, no words, no labels.",
  },

  edge_anchored_motif: {
    key: "edge_anchored_motif",
    diversityFamily: "focal_edge",
    compatibleTones: ALL_TONES,
    negativeSpaceMinPct: 50,
    focalZones: [{ x: 0.0, y: 0.0, w: 0.38, h: 1.0 }],
    titleSafeZones: [{ x: 0.42, y: 0.1, w: 0.54, h: 0.8 }],
    incompatibleMotifTypes: ["abstract_texture", "all_over_pattern"],
    scoutPromptTemplate:
      "Sermon series background art. {motif} anchored to one side of the wide frame, large open negative space on the opposite side. {tone} tonal treatment. No text, letters, words, or letterforms anywhere.",
    rebuildPromptTemplate:
      "Premium sermon series background. {motif} anchored to one edge, expansive negative space on the other side, {tone} palette. Completely free of text, labels, or letterforms.",
  },

  horizon_band: {
    key: "horizon_band",
    diversityFamily: "band_horizon",
    compatibleTones: ALL_TONES,
    negativeSpaceMinPct: 40,
    focalZones: [{ x: 0.0, y: 0.35, w: 1.0, h: 0.35 }],
    titleSafeZones: [
      { x: 0.05, y: 0.05, w: 0.9, h: 0.25 },
      { x: 0.05, y: 0.72, w: 0.9, h: 0.22 },
    ],
    incompatibleMotifTypes: ["tall_vertical_form", "detailed_figure"],
    scoutPromptTemplate:
      "Sermon series background art. A horizontal band or landscape horizon across the middle of the wide frame featuring {motif}, asymmetric weight, open areas above and below. {tone} tonal treatment. No text, letters, or letterforms.",
    rebuildPromptTemplate:
      "Premium sermon series background. Horizontal compositional band featuring {motif}, clean open zones above and below for text placement, {tone} palette. No text, no letterforms.",
  },

  layered_atmospheric: {
    key: "layered_atmospheric",
    diversityFamily: "atmospheric",
    compatibleTones: ALL_TONES,
    negativeSpaceMinPct: 60,
    focalZones: [],
    titleSafeZones: [{ x: 0.08, y: 0.18, w: 0.84, h: 0.64 }],
    incompatibleMotifTypes: ["precise_geometric_shape", "photorealistic_person", "literal_object"],
    scoutPromptTemplate:
      "Sermon series background art. Soft layered atmospheric depth with {motif} as an ambient theme, tonal gradient, no hard focal subject. {tone} mood. No text, words, or letterforms anywhere.",
    rebuildPromptTemplate:
      "Premium sermon series background. Layered atmospheric depth, {motif} expressed as ambient atmosphere rather than a discrete subject, gentle gradient transitions, {tone} palette. Entirely text-free.",
  },

  geometric_block_composition: {
    key: "geometric_block_composition",
    diversityFamily: "geometric_field",
    compatibleTones: ALL_TONES,
    negativeSpaceMinPct: 35,
    focalZones: [{ x: 0.3, y: 0.2, w: 0.4, h: 0.55 }],
    titleSafeZones: [{ x: 0.05, y: 0.05, w: 0.55, h: 0.3 }],
    incompatibleMotifTypes: ["organic_natural_form", "abstract_painterly", "photorealistic_person"],
    scoutPromptTemplate:
      "Sermon series background art. Bold geometric block shapes and structured color fields with {motif} as thematic content. Clean negative space zones. {tone} palette. No text, letters, or letterforms.",
    rebuildPromptTemplate:
      "Premium sermon series background. Geometric block composition, bold structured shapes and color fields, {motif} integrated as design element, structured negative space, {tone} palette. No text.",
  },

  textural_field: {
    key: "textural_field",
    diversityFamily: "full_field_texture",
    compatibleTones: ALL_TONES,
    negativeSpaceMinPct: 0,
    focalZones: [],
    titleSafeZones: [{ x: 0.12, y: 0.22, w: 0.76, h: 0.55 }],
    incompatibleMotifTypes: ["centered_figure", "landscape_horizon", "precise_geometric_shape"],
    scoutPromptTemplate:
      "Sermon series background art. Full-frame texture or material treatment with {motif} as the textural theme. Rich surface detail, no focal subject. {tone} tonal treatment. No text, letters, or letterforms.",
    rebuildPromptTemplate:
      "Premium sermon series background. Richly textured full-frame surface, {motif} expressed as material texture or pattern, no discrete subject or focal point, {tone} palette. Completely text-free.",
  },
} as const;
