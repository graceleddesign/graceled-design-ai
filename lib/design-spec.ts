import { z } from "zod";

export const DESIGN_SPEC_REGION_VALUES = ["left", "right", "top", "bottom", "center"] as const;
export const DESIGN_SPEC_OVERLAP_VALUES = ["separate", "overlay", "mask", "plate"] as const;
export const DESIGN_SPEC_ASYMMETRY_VALUES = ["low", "med", "high"] as const;
export const DESIGN_SPEC_TITLE_INTEGRATION_VALUES = [
  "PLATE",
  "MASK",
  "GRID_LOCK",
  "TYPE_AS_TEXTURE",
  "CUTOUT"
] as const;
export const DESIGN_SPEC_HIERARCHY_VALUES = [
  "heroTitle",
  "stackedTitle",
  "smallCaps",
  "condensedHero"
] as const;
export const DESIGN_SPEC_CASE_RULE_VALUES = ["upper", "title", "mixed"] as const;
export const DESIGN_SPEC_LINE_BREAK_VALUES = ["balanced", "rag_right", "rag_left", "block"] as const;
export const DESIGN_SPEC_TRACKING_VALUES = ["tight", "normal", "wide"] as const;
export const DESIGN_SPEC_SUBTITLE_STYLE_VALUES = ["small", "caps", "ruleSeparated", "pill"] as const;
export const DESIGN_SPEC_ABSTRACTION_VALUES = ["literal", "symbolic", "abstract"] as const;
export const DESIGN_SPEC_TEXTURE_VALUES = ["engraved", "paper", "grain", "halftone", "none"] as const;
export const DESIGN_SPEC_COLOR_USE_VALUES = ["mono", "duotone", "triad", "full"] as const;
export const DESIGN_SPEC_PALETTE_INTENT_VALUES = ["bright", "muted", "cinematic", "print"] as const;
export const DESIGN_SPEC_CONTRAST_VALUES = ["high", "med", "low"] as const;
export const DESIGN_SPEC_BACKGROUND_VALUES = ["light", "dark"] as const;

export const DESIGN_SPEC_SCHEMA = z
  .object({
    reference: z
      .object({
        id: z.string().trim().min(1),
        cluster: z.string().trim().min(1),
        tier: z.string().trim().min(1)
      })
      .strict(),
    composition: z
      .object({
        templateKey: z.string().trim().min(1),
        typeRegion: z.enum(DESIGN_SPEC_REGION_VALUES),
        motifRegion: z.enum(DESIGN_SPEC_REGION_VALUES),
        overlap: z.enum(DESIGN_SPEC_OVERLAP_VALUES),
        asymmetry: z.enum(DESIGN_SPEC_ASYMMETRY_VALUES)
      })
      .strict(),
    titleIntegrationMode: z.enum(DESIGN_SPEC_TITLE_INTEGRATION_VALUES),
    typographySystem: z
      .object({
        hierarchy: z.enum(DESIGN_SPEC_HIERARCHY_VALUES),
        caseRule: z.enum(DESIGN_SPEC_CASE_RULE_VALUES),
        lineBreakStrategy: z.enum(DESIGN_SPEC_LINE_BREAK_VALUES),
        tracking: z.enum(DESIGN_SPEC_TRACKING_VALUES),
        subtitleStyle: z.enum(DESIGN_SPEC_SUBTITLE_STYLE_VALUES)
      })
      .strict(),
    motifTreatment: z
      .object({
        primarySymbols: z.array(z.string().trim().min(1)).min(1).max(8),
        symbolDirectives: z.array(z.string().trim().min(1)).min(1).max(10).optional(),
        abstraction: z.enum(DESIGN_SPEC_ABSTRACTION_VALUES),
        texture: z.enum(DESIGN_SPEC_TEXTURE_VALUES),
        colorUse: z.enum(DESIGN_SPEC_COLOR_USE_VALUES)
      })
      .strict(),
    palette: z
      .object({
        intent: z.enum(DESIGN_SPEC_PALETTE_INTENT_VALUES),
        contrast: z.enum(DESIGN_SPEC_CONTRAST_VALUES),
        background: z.enum(DESIGN_SPEC_BACKGROUND_VALUES)
      })
      .strict(),
    doNot: z
      .object({
        noScaffoldFrames: z.literal(true),
        noRuledPaperAsOnlyDesign: z.literal(true),
        noBordersOnly: z.literal(true),
        noStickerClipartUnlessFunTier: z.literal(true),
        noReadableBackgroundText: z.literal(true)
      })
      .strict()
  })
  .strict();

export type DesignSpec = z.infer<typeof DESIGN_SPEC_SCHEMA>;
export type DesignSpecTitleIntegrationMode = DesignSpec["titleIntegrationMode"];

export function mapLegacyTitleIntegrationToDesignSpec(mode?: string | null): DesignSpecTitleIntegrationMode | null {
  if (!mode) {
    return null;
  }
  if (mode === "OVERLAY_GLASS") {
    return "PLATE";
  }
  if (mode === "CUTOUT_MASK") {
    return "CUTOUT";
  }
  if (mode === "GRID_LOCKUP") {
    return "GRID_LOCK";
  }
  if (mode === "TYPE_AS_TEXTURE") {
    return "TYPE_AS_TEXTURE";
  }
  if (mode === "PLATE" || mode === "MASK" || mode === "GRID_LOCK" || mode === "CUTOUT" || mode === "TYPE_AS_TEXTURE") {
    return mode;
  }
  return null;
}

export function normalizeBackgroundTitleIntegrationMode(
  mode: DesignSpecTitleIntegrationMode | null | undefined
): DesignSpecTitleIntegrationMode {
  if (!mode) {
    return "PLATE";
  }
  if (mode === "TYPE_AS_TEXTURE") {
    return "GRID_LOCK";
  }
  return mode;
}
