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
  /**
   * If true, this grammar's flat/geometric composition style may invite poster-like
   * text artifacts. Prompt builders should add extra "no signage" enforcement.
   */
  avoidTextProne?: boolean;
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
      "Cinematic background plate. A single {motif} as the sole focal subject, centered in the wide frame. " +
      "Atmospheric depth: distinct foreground haze, midground subject, and background recession. " +
      "Surrounding negative space is calm and uncluttered. {tone} light and atmosphere.",
    rebuildPromptTemplate:
      "Cinematic background plate, centered composition. " +
      "Primary subject: {motif}, positioned center-frame with clear visual dominance. " +
      "Foreground, midground, and background depth layers with atmospheric separation. " +
      "Wide open quiet space surrounds the subject on all sides. {tone} atmosphere and palette.",
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
      "Cinematic background plate. A {motif} anchored to one lateral edge of the wide frame. " +
      "Atmospheric depth with foreground-to-background recession behind the subject. " +
      "The opposing half of the frame holds expansive open quiet space. {tone} light and atmosphere.",
    rebuildPromptTemplate:
      "Cinematic background plate, edge-anchored composition. " +
      "Primary subject: {motif}, placed at one lateral edge of the wide frame. " +
      "Clear foreground-to-background atmospheric depth behind the subject. " +
      "The opposite half of the frame is open, quiet, and uncluttered. {tone} atmosphere and palette.",
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
      "Cinematic background plate. A horizontal compositional band across the middle third of the frame, " +
      "featuring {motif} as the dominant horizontal element. " +
      "Atmospheric sky or open space above; grounded depth below. Multiple depth planes. " +
      "{tone} light and atmosphere.",
    rebuildPromptTemplate:
      "Cinematic background plate, horizon band composition. " +
      "{motif} as the dominant visual element running through the horizontal mid-band of the frame. " +
      "Distinct foreground, midground band, and atmospheric background recession. " +
      "Open quiet zones above and below the band. {tone} atmosphere and palette.",
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
      "Cinematic background plate. Soft layered atmospheric depth — " +
      "{motif} expressed as ambient environmental mood rather than a discrete isolated object. " +
      "Multiple overlapping depth planes dissolving into each other. No hard focal subject. " +
      "{tone} light and atmosphere.",
    rebuildPromptTemplate:
      "Cinematic background plate, atmospheric layered composition. " +
      "{motif} expressed as pervasive environmental character rather than an isolated subject. " +
      "Soft gradients through foreground, midground, and background atmospheric planes. " +
      "Immersive atmosphere with no hard focal point. {tone} atmosphere and palette.",
  },

  geometric_block_composition: {
    key: "geometric_block_composition",
    diversityFamily: "geometric_field",
    compatibleTones: ALL_TONES,
    negativeSpaceMinPct: 35,
    focalZones: [{ x: 0.3, y: 0.2, w: 0.4, h: 0.55 }],
    titleSafeZones: [{ x: 0.05, y: 0.05, w: 0.55, h: 0.3 }],
    incompatibleMotifTypes: ["organic_natural_form", "abstract_painterly", "photorealistic_person"],
    avoidTextProne: true,
    scoutPromptTemplate:
      "Cinematic background plate. Bold geometric structural forms and color volumes with {motif} as the visual theme. " +
      "Shapes have dimensional depth — planes advance and recede in space. " +
      "No flat graphic layout. No poster-like arrangements. {tone} light and atmosphere.",
    rebuildPromptTemplate:
      "Cinematic background plate, geometric volumetric composition. " +
      "{motif} integrated within bold geometric structural forms with architectural depth. " +
      "Foreground planes, midground forms, atmospheric background. " +
      "No flat 2D graphic arrangements. No signage-like geometry. {tone} atmosphere and palette.",
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
      "Cinematic background plate. Rich full-frame material surface with {motif} as the textural character. " +
      "All-over surface detail with tonal depth variation across the frame. " +
      "No discrete focal subject. {tone} light and atmosphere.",
    rebuildPromptTemplate:
      "Cinematic background plate, full-frame textural composition. " +
      "{motif} expressed as the surface material and texture across the entire frame. " +
      "Rich organic or material detail with depth through surface variation. " +
      "No discrete focal point or isolated subject. {tone} atmosphere and palette.",
  },
} as const;
