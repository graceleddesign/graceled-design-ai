/**
 * DesignMode-aware lockup/composition recipe selection (v1).
 *
 * Returns simple structured preferences that map into existing lockup/compositor
 * helpers (computeCleanMinimalLayout, buildCleanMinimalOverlaySvg,
 * composeLockupOnBackground). This is intentionally a thin selection layer —
 * not a new compositor.
 *
 * v1 scope:
 *  - choose a lockup preset id (existing presets in lib/lockups/presets.ts)
 *  - choose alignment + integration mode for composeLockupOnBackground
 *  - hint title-dominance for orchestrator-level reasoning
 *
 * Mode-specific custom SVG systems (e.g. knockout-fill type, integrated paint
 * lockups) are explicitly out of scope and noted as TODOs.
 */

import type { DesignMode } from "../design-modes";

export type LockupAlignPref = "left" | "center" | "right";
export type LockupIntegrationModePref =
  | "clean"
  | "stamp"
  | "plate"
  | "mask"
  | "cutout"
  | "grid_lock";

export interface DesignModeLockupRecipe {
  /** id passed through to computeCleanMinimalLayout / buildCleanMinimalOverlaySvg */
  lockupPresetId: string;
  /** alignment passed to composeLockupOnBackground */
  align: LockupAlignPref;
  /** integration mode passed to composeLockupOnBackground */
  integrationMode: LockupIntegrationModePref;
  /** Whether this mode treats title as the primary design object */
  titleDominant: boolean;
  /** Short label for logging */
  label: string;
  /** Free-form notes for human review of recipe choices */
  notes: string;
}

/**
 * Map each DesignMode to a v1 lockup recipe using existing presets.
 *
 * Preset IDs reference lib/lockups/presets.ts. Choices are conservative:
 * we pick presets that already match the mode's typographic register, and
 * leave deeper mode-specific lockup work (knockout fills, integrated medium
 * type, mark+text composition) for later phases.
 */
export function getDesignModeLockupRecipe(mode: DesignMode): DesignModeLockupRecipe {
  switch (mode) {
    case "typography_led":
      // Title is the artwork. Use a bold condensed monumental preset, centered,
      // with a stamp integration so type sits as a confident flat block.
      // TODO: future — knockout-fill where letterforms reveal underlying texture.
      return {
        lockupPresetId: "modern_condensed_monument",
        align: "center",
        integrationMode: "stamp",
        titleDominant: true,
        label: "type-monument-center-stamp",
        notes: "Title as primary design object; bold condensed monumental scale.",
      };

    case "graphic_symbol":
      // Title sits in deliberate relationship to a graphic mark. Boxed/badge
      // treatments anchor type next to the symbol.
      // TODO: future — generate the mark separately and lock title beside it.
      return {
        lockupPresetId: "boxed_titleplate",
        align: "left",
        integrationMode: "plate",
        titleDominant: false,
        label: "graphic-mark-boxed-plate",
        notes: "Title locked into a graphic plate beside the symbol.",
      };

    case "minimal_editorial":
      // Restrained, refined, near-monochrome. Mono label preset on a minimal field.
      return {
        lockupPresetId: "mono_label",
        align: "left",
        integrationMode: "clean",
        titleDominant: false,
        label: "minimal-mono-label",
        notes: "Refined minimal-grotesk restraint; generous negative space; no scrim.",
      };

    case "modern_abstract":
      // Strong title aligned with abstract graphic blocks.
      return {
        lockupPresetId: "split_title_dynamic",
        align: "left",
        integrationMode: "grid_lock",
        titleDominant: true,
        label: "abstract-split-grid",
        notes: "Title aligned to abstract graphic blocks via grid lock.",
      };

    case "photo_composite":
      // Photo carries metaphor; lockup avoids covering subject — side placement.
      // TODO: future — knockout type filled with photo region.
      return {
        lockupPresetId: "modern_editorial",
        align: "left",
        integrationMode: "plate",
        titleDominant: false,
        label: "photo-editorial-plate",
        notes: "Side-anchored editorial plate; preserves photo subject.",
      };

    case "cinematic_atmospheric":
      // Preserve current cinematic readable overlay behavior — closest to
      // existing V2 default. Clean integration keeps atmosphere visible.
      return {
        lockupPresetId: "editorial_serif_stack",
        align: "left",
        integrationMode: "clean",
        titleDominant: false,
        label: "cinematic-clean-overlay",
        notes: "Existing V2 cinematic behavior preserved as a baseline mode.",
      };

    case "illustrative_collage":
      // Bolder, more energetic; handmade-organic preset matches medium.
      return {
        lockupPresetId: "handmade_organic",
        align: "center",
        integrationMode: "stamp",
        titleDominant: false,
        label: "collage-handmade-stamp",
        notes: "Handmade lockup register matches expressive medium.",
      };

    case "playful_seasonal":
      // Energetic but readable. Bold condensed with a plate for color punch.
      return {
        lockupPresetId: "bold_condensed",
        align: "center",
        integrationMode: "plate",
        titleDominant: true,
        label: "playful-bold-plate",
        notes: "Bold celebratory lockup; readable energy.",
      };

    case "retro_print":
      // Outline display + overprint feel reads as poster.
      // TODO: future — true risograph layered fills.
      return {
        lockupPresetId: "outline_display",
        align: "center",
        integrationMode: "stamp",
        titleDominant: true,
        label: "retro-outline-stamp",
        notes: "Outline display preset for poster register.",
      };
  }
}
