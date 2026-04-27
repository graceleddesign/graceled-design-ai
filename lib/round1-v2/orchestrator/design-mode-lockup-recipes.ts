/**
 * DesignMode-aware lockup/composition recipe selection.
 *
 * Returns visible-impact preferences that map into existing lockup/compositor
 * helpers (computeCleanMinimalLayout, buildCleanMinimalOverlaySvg,
 * composeLockupOnBackground).
 *
 * v2 scope (this task):
 *  - per-mode FULL LockupRecipe override (titleScale, clamps, alignment) so
 *    typography_led is visibly type-dominant and minimal_editorial is visibly
 *    refined and small.
 *  - per-mode autoScrim suppression so typography_led / minimal_editorial do
 *    not get the default dark translucent box behind the title.
 *  - per-mode preset id for callers that prefer preset-based selection.
 *  - alignment + integration mode for composeLockupOnBackground.
 *
 * Mode-specific custom SVG systems (knockout-fill type, integrated paint
 * lockups, separate mark + text) are still future work and noted as TODOs.
 */

import type { DesignMode } from "../design-modes";
import type { LockupRecipe } from "@/lib/design-brief";

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

// ─────────────────────────────────────────────────────────────────────────────
// Full LockupRecipe overrides per mode
//
// These produce a FULL LockupRecipe object that downstream helpers
// (computeCleanMinimalLayout, buildCleanMinimalOverlaySvg) consume directly,
// bypassing the preset map. This is what makes mode differences VISIBLE: the
// renderer reads titleScale / titleSizeClamp / placement directly from the
// recipe, so a 2.4× titleScale produces a much larger title than the 1.0×
// default that previously came back from the preset map.
//
// Schema clamps (lib/design-brief.ts) constrain values:
//   titleScale: 1..2.5
//   maxTitleWidthPct: 0.35..0.75
//   safeMarginPct: 0.04..0.12
//   titleSizeClamp.{minPx, maxPx}: 24..260 / 28..320
// ─────────────────────────────────────────────────────────────────────────────

export function getDesignModeLockupRecipeOverride(mode: DesignMode): LockupRecipe {
  switch (mode) {
    case "typography_led":
      // Title is the artwork. Maximum allowed scale, biggest clamp, generous
      // width, centered, with a strong rule_dot accent. No subtitle inflation.
      return {
        layoutIntent: "bold_modern",
        titleTreatment: "stacked",
        hierarchy: { titleScale: 2.5, subtitleScale: 0.42, tracking: -0.04, case: "upper" },
        alignment: "center",
        placement: { anchor: "center", safeMarginPct: 0.06, maxTitleWidthPct: 0.75 },
        titleSizeClamp: { wide: { minPx: 200, maxPx: 320 } },
        minTitleAreaPct: 0.30,
        ornament: { kind: "rule_dot", weight: "bold" },
      };

    case "minimal_editorial":
      // Refined, small, editorial. Top-left singleline with a thin frame
      // ornament; conservative scale; tight clamp.
      return {
        layoutIntent: "minimal_clean",
        titleTreatment: "singleline",
        hierarchy: { titleScale: 1.0, subtitleScale: 0.45, tracking: 0.012, case: "upper" },
        alignment: "left",
        placement: { anchor: "top_left", safeMarginPct: 0.08, maxTitleWidthPct: 0.5 },
        titleSizeClamp: { wide: { minPx: 56, maxPx: 96 } },
        ornament: { kind: "rule_dot", weight: "thin" },
      };

    case "graphic_symbol":
      // Boxed titleplate next to where a graphic mark would live. Bottom-left
      // anchored so the mark area sits above/right.
      return {
        layoutIntent: "photographic_titleplate",
        titleTreatment: "boxed",
        hierarchy: { titleScale: 1.4, subtitleScale: 0.5, tracking: 0.02, case: "upper" },
        alignment: "left",
        placement: { anchor: "bottom_left", safeMarginPct: 0.07, maxTitleWidthPct: 0.55 },
        titleSizeClamp: { wide: { minPx: 80, maxPx: 150 } },
        ornament: { kind: "frame", weight: "med" },
      };

    case "modern_abstract":
      // Strong title aligned with abstract graphic blocks. Split treatment for
      // dynamic feel.
      return {
        layoutIntent: "bold_modern",
        titleTreatment: "split",
        hierarchy: { titleScale: 1.8, subtitleScale: 0.42, tracking: -0.03, case: "upper" },
        alignment: "left",
        placement: { anchor: "top_left", safeMarginPct: 0.06, maxTitleWidthPct: 0.7 },
        titleSizeClamp: { wide: { minPx: 110, maxPx: 220 } },
        ornament: { kind: "rule_dot", weight: "bold" },
      };

    case "photo_composite":
      // Side-anchored editorial plate; preserves photo subject.
      return {
        layoutIntent: "editorial",
        titleTreatment: "boxed",
        hierarchy: { titleScale: 1.2, subtitleScale: 0.5, tracking: 0.01, case: "upper" },
        alignment: "left",
        placement: { anchor: "bottom_left", safeMarginPct: 0.06, maxTitleWidthPct: 0.5 },
        titleSizeClamp: { wide: { minPx: 70, maxPx: 130 } },
        ornament: { kind: "rule_dot", weight: "med" },
      };

    case "cinematic_atmospheric":
      // Closest to existing V2 default — readable left-anchored editorial stack.
      // No oversized clamp, conservative scale.
      return {
        layoutIntent: "editorial",
        titleTreatment: "stacked",
        hierarchy: { titleScale: 1.2, subtitleScale: 0.5, tracking: 0.012, case: "upper" },
        alignment: "left",
        placement: { anchor: "bottom_left", safeMarginPct: 0.06, maxTitleWidthPct: 0.55 },
        titleSizeClamp: { wide: { minPx: 80, maxPx: 130 } },
        ornament: { kind: "rule_dot", weight: "med" },
      };

    case "illustrative_collage":
      // Handmade-organic register. Centered with frame ornament.
      return {
        layoutIntent: "handmade_organic",
        titleTreatment: "stacked",
        hierarchy: { titleScale: 1.6, subtitleScale: 0.5, tracking: 0.0, case: "upper" },
        alignment: "center",
        placement: { anchor: "center", safeMarginPct: 0.07, maxTitleWidthPct: 0.65 },
        titleSizeClamp: { wide: { minPx: 100, maxPx: 200 } },
        ornament: { kind: "frame", weight: "bold" },
      };

    case "playful_seasonal":
      // Bold celebratory; centered plate with rule_dot ornament.
      return {
        layoutIntent: "bold_modern",
        titleTreatment: "boxed",
        hierarchy: { titleScale: 1.7, subtitleScale: 0.45, tracking: -0.02, case: "upper" },
        alignment: "center",
        placement: { anchor: "bottom_center", safeMarginPct: 0.06, maxTitleWidthPct: 0.7 },
        titleSizeClamp: { wide: { minPx: 110, maxPx: 200 } },
        ornament: { kind: "rule_dot", weight: "bold" },
      };

    case "retro_print":
      // Outline poster register, centered, thicker frame.
      return {
        layoutIntent: "bold_modern",
        titleTreatment: "outline",
        hierarchy: { titleScale: 1.8, subtitleScale: 0.45, tracking: 0.0, case: "upper" },
        alignment: "center",
        placement: { anchor: "center", safeMarginPct: 0.06, maxTitleWidthPct: 0.7 },
        titleSizeClamp: { wide: { minPx: 110, maxPx: 220 } },
        ornament: { kind: "frame", weight: "bold" },
      };
  }
}

/**
 * Whether this DesignMode should suppress the default autoScrim (dark
 * translucent box behind the title).
 *
 * For typography_led and minimal_editorial, the dark scrim is the single
 * biggest reason all canary outputs read as "background + title overlay" —
 * it materially flattens mode differences. We suppress it so the type sits
 * directly on the background plate.
 *
 * For other modes the contrast-driven default is preserved.
 */
export function shouldSuppressAutoScrim(mode: DesignMode): boolean {
  return mode === "typography_led" || mode === "minimal_editorial";
}
