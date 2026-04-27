/**
 * DesignMode-specific prompt directives for V2 scout and rebuild prompts.
 *
 * These directives steer the image model toward the visual language of each
 * DesignMode without ever asking the model to render typography. The
 * compositor handles all real text. The strict text-purge block remains the
 * authoritative anti-text guard and is appended elsewhere.
 *
 * Phase v1: each directive is a concise sentence pair appended to the
 * existing prompt structure. Mode-specific tuning of weights, motifs,
 * and validators is a later step.
 */

import type { DesignMode } from "../design-modes";

/**
 * Positive directive — appended after motif anchoring, before text-purge.
 * Each string is mode-specific guidance describing the *kind* of background
 * plate the model should produce so the compositor's typography can land.
 */
export function buildDesignModePromptDirective(mode: DesignMode): string {
  switch (mode) {
    case "typography_led":
      return (
        "Design intent: a restrained background plate built to support a dominant typography system. " +
        "Prefer flat tonal fields, simple structural blocks, subtle gradient zones, or quiet textured surfaces. " +
        "No scenic realism. No photographic landscape. Leave generous calm space where typography will live."
      );

    case "graphic_symbol":
      return (
        "Design intent: a graphic background built around a single bold symbolic form — a clean mark, icon-like motif, " +
        "geometric badge, ray, arrow, or vector-style shape. Prefer flat or near-flat graphic language over photographic realism. " +
        "The mark should be readable at a glance. No stock-photo subjects."
      );

    case "minimal_editorial":
      return (
        "Design intent: minimal editorial restraint. Generous whitespace, fine compositional structure, quiet texture, subtle tonal modulation. " +
        "No heavy illustration. No busy scenery. No decorative clutter. Confidence in emptiness."
      );

    case "modern_abstract":
      return (
        "Design intent: a modern abstract system of bold shape, color field, layered geometry, and rhythm. " +
        "Cut-paper-like blocks, gradient meshes, or aligned graphic structures. " +
        "Avoid generic AI noise, meaningless blobs, or scenic realism."
      );

    case "photo_composite":
      return (
        "Design intent: an intentionally composed photographic or collage-like image — selected, framed, and cropped with editorial intent. " +
        "Not a casual scenic landscape. The composition should leave deliberate negative space for typography placement."
      );

    case "cinematic_atmospheric":
      return (
        "Design intent: cinematic atmosphere with clear focal hierarchy and a deliberate quiet zone for typography. " +
        "Avoid generic stock scenery. The frame should feel composed, not captured by accident."
      );

    case "illustrative_collage":
      return (
        "Design intent: stylized, interpretive, non-realistic visual language — collage, paint, torn paper, or hand-illustrated forms. " +
        "Avoid photorealism. Favor intentional handmade or illustrated character throughout the frame."
      );

    case "playful_seasonal":
      return (
        "Design intent: bold color, playful shape, and celebratory rhythm with approachable energy. " +
        "Avoid cheesy clipart and chaotic confetti. Energy must feel designed, not decorative."
      );

    case "retro_print":
      return (
        "Design intent: retro print pastiche — risograph or halftone-inspired structure, layered ink registration, " +
        "muted or limited palette, poster-like compositional energy. Texture should feel printed, not photographic."
      );
  }
}

/**
 * Negative directive — short list of phrases to add to the avoid clause for
 * a given mode. Returned as a comma-joined string suitable for appending to
 * an existing "Avoid:" list, or empty if the mode has no extra negatives.
 */
export function buildDesignModeNegativeDirective(mode: DesignMode): string {
  switch (mode) {
    case "typography_led":
      return "scenic landscape, photographic realism, busy textured fields, decorative ornament";
    case "graphic_symbol":
      return "stock photography, photorealistic scenery, multiple competing icons, clipart";
    case "minimal_editorial":
      return "heavy illustration, busy scenery, decorative clutter, saturated chaos";
    case "modern_abstract":
      return "photographic content, scenic landscape, generic gradient blobs";
    case "photo_composite":
      return "casual scenic landscape, untreated stock photo, generic background wallpaper";
    case "cinematic_atmospheric":
      return "generic stock scenery, untreated landscape with no focal hierarchy";
    case "illustrative_collage":
      return "photorealism, photographic subjects, clean vector hybrid with painted ground";
    case "playful_seasonal":
      return "cheesy clipart, chaotic confetti, generic holiday template";
    case "retro_print":
      return "modern photographic gloss, pristine digital cleanliness";
    default:
      return "";
  }
}
