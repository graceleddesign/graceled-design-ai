/**
 * V2 DesignMode type bank.
 *
 * A DesignMode is a discrete decision about what kind of sermon-series
 * identity system a lane should produce. It is made before generation and
 * routes downstream prompt builders, compositors, and validators.
 *
 * Phase 1 note: modes are planned and persisted as metadata only.
 * Mode-specific prompt/compositor behavior is a subsequent step.
 */

// ── Enum ─────────────────────────────────────────────────────────────────────

export type DesignMode =
  | "typography_led"
  | "graphic_symbol"
  | "photo_composite"
  | "cinematic_atmospheric"
  | "minimal_editorial"
  | "modern_abstract"
  | "illustrative_collage"
  | "playful_seasonal"
  | "retro_print";

export const DESIGN_MODES: readonly DesignMode[] = [
  "typography_led",
  "graphic_symbol",
  "photo_composite",
  "cinematic_atmospheric",
  "minimal_editorial",
  "modern_abstract",
  "illustrative_collage",
  "playful_seasonal",
  "retro_print",
];

// ── Metadata ─────────────────────────────────────────────────────────────────

export interface DesignModeMeta {
  mode: DesignMode;
  label: string;
  description: string;
  /** curation.json clusters that ground this mode */
  referenceClusters: readonly string[];
  /** Pro-tier reference image IDs from the owned library */
  referenceAnchors: readonly string[];
  /** Modes that should be avoided if this mode is already in the lane plan */
  avoidIfCoPresent: readonly DesignMode[];
  /** Brief tone affinities — modes score higher when brief tone matches */
  toneAffinities: readonly string[];
  /** Brief characteristics that favor this mode */
  briefAffinities: readonly string[];
  /** Risk notes for prompt builders and validators */
  commonFailureRisks: readonly string[];
  /**
   * Whether this mode is selected by default in lane planning.
   * false = requires an explicit signal or flag to be chosen.
   */
  defaultEnabled: boolean;
  /**
   * Experimental modes need a flag to unlock. They won't be chosen
   * by the default planner even with matching signals.
   */
  experimental: boolean;
}

export const DESIGN_MODE_META: Readonly<Record<DesignMode, DesignModeMeta>> = {
  typography_led: {
    mode: "typography_led",
    label: "Typography-Led",
    description: "The title is the artwork. Background is a tonal field or quiet texture; type carries the full identity.",
    referenceClusters: ["bold_type"],
    referenceAnchors: ["ref_0002", "ref_0033", "ref_0089", "ref_0009", "ref_0020", "ref_0021", "ref_0037", "ref_0041", "ref_0046", "ref_0090"],
    avoidIfCoPresent: [],
    toneAffinities: ["neutral", "dark", "mono"],
    briefAffinities: ["short_title", "expository", "declarative", "single_concept"],
    commonFailureRisks: [
      "Cinematic field appearing behind the type — type becomes overlay, not design",
      "Multiple competing decorative ornaments diluting the typographic focus",
    ],
    defaultEnabled: true,
    experimental: false,
  },

  graphic_symbol: {
    mode: "graphic_symbol",
    label: "Graphic Symbol",
    description: "A single confident vector mark/symbol is the hero; title sits in deliberate relationship to it.",
    referenceClusters: ["illustration"],
    referenceAnchors: ["ref_0023", "ref_0011", "ref_0148", "ref_0038", "ref_0051"],
    avoidIfCoPresent: ["illustrative_collage"],
    toneAffinities: ["neutral", "light", "vivid"],
    briefAffinities: ["concrete_metaphor", "expository", "object_in_title"],
    commonFailureRisks: [
      "Mark reads as generic stock icon",
      "Inset-card pile-up: mark + decorative frame + textured background = template look",
    ],
    defaultEnabled: true,
    experimental: false,
  },

  photo_composite: {
    mode: "photo_composite",
    label: "Photo Composite",
    description: "Photography composed *with* type — knockout fills, layered panels, or tonally graded composites.",
    referenceClusters: ["editorial_photo"],
    referenceAnchors: ["ref_0050", "ref_0030", "ref_0097", "ref_0125", "ref_0034", "ref_0091", "ref_0100", "ref_0135"],
    avoidIfCoPresent: ["cinematic_atmospheric"],
    toneAffinities: ["neutral", "light", "dark"],
    briefAffinities: ["real_world_subject", "people", "place", "object_in_title"],
    commonFailureRisks: [
      "Drifting back to cinematic_atmospheric: passive photo + overlaid title",
      "Missing composition intent — photo not planned around the type",
    ],
    defaultEnabled: true,
    experimental: false,
  },

  cinematic_atmospheric: {
    mode: "cinematic_atmospheric",
    label: "Cinematic Atmospheric",
    description: "A photographed scene carries mood; type is overlaid with intention. Scene is composed for the lockup zone.",
    referenceClusters: ["cinematic"],
    referenceAnchors: ["ref_0017", "ref_0019", "ref_0044", "ref_0066", "ref_0083", "ref_0101", "ref_0107", "ref_0114", "ref_0157", "ref_0161"],
    avoidIfCoPresent: ["photo_composite"],
    toneAffinities: ["light", "dark", "neutral"],
    briefAffinities: ["atmospheric", "contemplative", "expansive", "nature"],
    commonFailureRisks: [
      "Generic cinematic wallpaper: background + title overlay + nothing else — the current V2 default trap",
      "No deliberate negative-space zone for the lockup",
    ],
    defaultEnabled: true,
    experimental: false,
  },

  minimal_editorial: {
    mode: "minimal_editorial",
    label: "Minimal Editorial",
    description: "Restraint. White space dominant, near-monochrome, single tonal field or quiet motion.",
    referenceClusters: ["minimal"],
    referenceAnchors: ["ref_0001", "ref_0048", "ref_0062", "ref_0115", "ref_0118", "ref_0139", "ref_0143", "ref_0150"],
    avoidIfCoPresent: ["illustrative_collage", "playful_seasonal"],
    toneAffinities: ["mono", "neutral", "dark"],
    briefAffinities: ["expository", "quiet", "contemplative", "scripture_book"],
    commonFailureRisks: [
      "Reads as unfinished rather than restrained if type is too weak",
    ],
    defaultEnabled: true,
    experimental: false,
  },

  modern_abstract: {
    mode: "modern_abstract",
    label: "Modern Abstract",
    description: "Non-photo atmosphere: gradient mesh, smoke, neon, geometric pattern. No photographic content.",
    referenceClusters: ["modern_abstract"],
    referenceAnchors: ["ref_0004", "ref_0072", "ref_0031", "ref_0055", "ref_0057", "ref_0073", "ref_0122"],
    avoidIfCoPresent: [],
    toneAffinities: ["vivid", "light", "neutral"],
    briefAffinities: ["conceptual", "energetic", "seasonal_modern", "abstract_concept"],
    commonFailureRisks: [
      "AI-render cliché: purple-orange gradient blob with no designed intent",
    ],
    defaultEnabled: true,
    experimental: false,
  },

  illustrative_collage: {
    mode: "illustrative_collage",
    label: "Illustrative Collage",
    description: "Fully committed expressive system: paint, torn paper, hand mark, sketch. Medium is the message.",
    referenceClusters: ["illustration"],
    referenceAnchors: ["ref_0086", "ref_0016", "ref_0038", "ref_0051", "ref_0105", "ref_0148"],
    avoidIfCoPresent: ["graphic_symbol", "minimal_editorial"],
    toneAffinities: ["vivid", "neutral"],
    briefAffinities: ["expressive", "collage", "hand_made", "sketch", "illustration"],
    commonFailureRisks: [
      "Half-committed: clean type dropped on a painted background reads as template, not identity",
    ],
    defaultEnabled: true,
    experimental: false,
  },

  playful_seasonal: {
    mode: "playful_seasonal",
    label: "Playful Seasonal",
    description: "Bright, energetic, holiday-leaning. Only selected when brief carries explicit seasonal signals.",
    referenceClusters: [],
    referenceAnchors: ["ref_0072", "ref_0086"],
    avoidIfCoPresent: ["minimal_editorial"],
    toneAffinities: ["vivid", "light"],
    briefAffinities: ["seasonal", "holiday", "easter", "christmas", "advent", "kickoff", "celebratory"],
    commonFailureRisks: [
      "Cheesy church-design defaults when mode is forced without seasonal grounding",
      "Multi-motif clutter",
    ],
    // Requires explicit seasonal signal — not selected as a default lane.
    defaultEnabled: false,
    experimental: false,
  },

  retro_print: {
    mode: "retro_print",
    label: "Retro Print",
    description: "Vintage offset/print pastiche. Experimental: gated until reliability is proven.",
    referenceClusters: ["retro_print"],
    referenceAnchors: ["ref_0003"],
    avoidIfCoPresent: [],
    toneAffinities: ["neutral", "vivid"],
    briefAffinities: ["retro", "print", "risograph", "vintage_poster", "letterpress"],
    commonFailureRisks: [
      "Entire reference cluster is experimental tier — hard to land without discipline",
      "Easily collapses to generic vintage cliché",
    ],
    // Must be explicitly unlocked. Never selected by default planner.
    defaultEnabled: false,
    experimental: true,
  },
};

// ── Helper functions ──────────────────────────────────────────────────────────

export function isDesignMode(value: unknown): value is DesignMode {
  return typeof value === "string" && (DESIGN_MODES as readonly string[]).includes(value);
}

export function getDesignModeMeta(mode: DesignMode): DesignModeMeta {
  return DESIGN_MODE_META[mode];
}

export function isDefaultEnabledDesignMode(mode: DesignMode): boolean {
  return DESIGN_MODE_META[mode].defaultEnabled && !DESIGN_MODE_META[mode].experimental;
}

/** Modes available for default lane planning (not gated, not experimental). */
export const DEFAULT_ENABLED_MODES: readonly DesignMode[] = DESIGN_MODES.filter(
  isDefaultEnabledDesignMode
);
