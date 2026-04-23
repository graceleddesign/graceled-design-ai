/**
 * Round 1 rescue-policy subsystem.
 *
 * This module is the single authoritative source for:
 *   - Which failure classes exist (background, lockup, planner)
 *   - What bounded rescue action maps to each failure class
 *   - How much budget is allowed per rescue category
 *   - What terminal outcome a rescue attempt produces
 *
 * Call sites must not branch inline on failure reasons — they should call
 * resolveBackgroundRescueAction / resolveMultiReasonBackgroundRescueFluxFlags
 * / detectPlannerToneFamilyIncompatibility instead.
 */
import {
  STYLE_FAMILY_BANK,
  STYLE_MEDIUM_KEYS,
  SCAFFOLD_RISK_FAMILY_SET,
  TEXT_ARTIFACT_RISK_FAMILY_SET,
  isStyleFamilyKey,
  type StyleFamilyKey,
  type StyleMediumKey,
  type StyleToneKey
} from "@/lib/style-family-bank";
import { pickExplorationFallbackStyleFamily, type DirectionLaneFamily } from "@/lib/direction-planner";

// ============================================================
// Failure classes
// ============================================================

/** Background failure classes produced by the evaluation layer. */
export type BackgroundFailureClass =
  | "background_tone_fit_failed"
  | "background_blank_or_motif_weak"
  | "background_scaffold_like"
  | "background_text_detected"
  | "background_not_canonical"
  | "UNKNOWN";

/** Lockup failure class from the fit evaluation layer. */
export type LockupFailureClass = "lockup_fit_failed";

/**
 * Planner failure class — detected PRE-GENERATION before spending image budget.
 *
 * - planner_tone_family_incompatible: native tone vs. target tone structural mismatch
 * - planner_scaffold_risk_family: family generates empty-template-like compositions
 * - planner_text_artifact_risk_family: family generates pseudo-letterform / text artifacts
 */
export type PlannerFailureClass =
  | "planner_tone_family_incompatible"
  | "planner_scaffold_risk_family"
  | "planner_text_artifact_risk_family";

export type Round1FailureClass = BackgroundFailureClass | LockupFailureClass | PlannerFailureClass;

// ============================================================
// Rescue actions
// ============================================================

/**
 * One bounded rescue action per background failure class.
 * Applied as a single additional generation attempt (BACKGROUND_RESCUE_BUDGET).
 */
export type BackgroundRescueAction =
  | "tone_safe_rescue"     // background_tone_fit_failed  → tone prompt boost + fluxBoostTone
  | "focal_subject_rescue" // background_blank_or_motif_weak → motif boost + fluxBoostMotif
  | "scaffold_safe_rescue" // background_scaffold_like    → scaffold-safe profile + fluxBoostMotif
  | "text_clean_rescue"    // background_text_detected    → text-free prompt + fluxBoostNoText
  | "none";

/**
 * One bounded compact-width retry for lockup fit failures.
 * Applied when the winner candidate fails the notTooSmall height check.
 */
export type LockupRescueAction =
  | "compact_width_retry"  // lockup_fit_failed → narrow maxTitleWidthPct to force taller wrapping
  | "none";

/**
 * Pre-generation planner rescue — applied before spending image budget.
 * Re-routes the style family to one whose native tone matches the target tone.
 */
export type PlannerRescueAction =
  | "reroute_lane_family"  // planner_tone_family_incompatible → swap to a tone-compatible family
  | "none";

// ============================================================
// Budgets (centralized)
// ============================================================

/** One additional generation attempt per background failure class, per lane. */
export const BACKGROUND_RESCUE_BUDGET = 1;

/** One compact-width retry per lockup candidate. */
export const LOCKUP_RESCUE_BUDGET = 1;

/** One planner re-route per lane (applied pre-generation). */
export const PLANNER_RESCUE_BUDGET = 1;

// ============================================================
// Terminal outcomes
// ============================================================

export type RescueOutcome =
  | "succeeded"            // rescue attempt resolved the failure
  | "budget_exhausted"     // all rescue attempts spent, still failing
  | "no_rescue_available"  // no rescue action defined for this class
  | "not_attempted";       // failure class not reached

// ============================================================
// Rescue state (for diagnostics / logging)
// ============================================================

export type BackgroundRescueState = {
  kind: "background";
  failureClass: BackgroundFailureClass;
  rescueAction: BackgroundRescueAction;
  budgetUsed: number;
  budgetTotal: number;
  outcome: RescueOutcome;
};

export type LockupRescueState = {
  kind: "lockup";
  failureClass: LockupFailureClass;
  rescueAction: LockupRescueAction;
  budgetUsed: number;
  budgetTotal: number;
  outcome: RescueOutcome;
};

export type PlannerRescueState = {
  kind: "planner";
  failureClass: PlannerFailureClass;
  rescueAction: PlannerRescueAction;
  reroutedTo: StyleFamilyKey | null;
  budgetUsed: number;
  budgetTotal: number;
  outcome: RescueOutcome;
};

export type Round1RescueState = BackgroundRescueState | LockupRescueState | PlannerRescueState;

// ============================================================
// Policy: background rescue
// ============================================================

/**
 * Single authoritative mapping from background failure class to rescue action.
 * Call sites must use this instead of branching on failure reason strings inline.
 */
export function resolveBackgroundRescueAction(failureClass: BackgroundFailureClass): BackgroundRescueAction {
  switch (failureClass) {
    case "background_tone_fit_failed":      return "tone_safe_rescue";
    case "background_blank_or_motif_weak":  return "focal_subject_rescue";
    case "background_scaffold_like":        return "scaffold_safe_rescue";
    case "background_text_detected":        return "text_clean_rescue";
    case "background_not_canonical":        return "none";
    case "UNKNOWN":                         return "none";
  }
}

/**
 * Derive Flux boost flags from a background rescue action.
 * These flags strengthen the Flux prompt for the recovery generation attempt.
 */
export function resolveBackgroundRescueFluxFlags(action: BackgroundRescueAction): {
  fluxBoostTone: boolean;
  fluxBoostMotif: boolean;
  fluxBoostNoText: boolean;
} {
  return {
    fluxBoostTone:   action === "tone_safe_rescue",
    fluxBoostMotif:  action === "focal_subject_rescue" || action === "scaffold_safe_rescue",
    fluxBoostNoText: action === "text_clean_rescue"
  };
}

/**
 * Resolve Flux boost flags for a list of recoverable failure classes.
 * ORs the flags from each failure class so multi-reason cases are handled correctly.
 *
 * This replaces the inline `.includes("background_tone_fit_failed")` chain at call sites.
 */
export function resolveMultiReasonBackgroundRescueFluxFlags(failureClasses: string[]): {
  fluxBoostTone: boolean;
  fluxBoostMotif: boolean;
  fluxBoostNoText: boolean;
} {
  return failureClasses.reduce<{ fluxBoostTone: boolean; fluxBoostMotif: boolean; fluxBoostNoText: boolean }>(
    (acc, cls) => {
      const action = resolveBackgroundRescueAction(cls as BackgroundFailureClass);
      const flags = resolveBackgroundRescueFluxFlags(action);
      return {
        fluxBoostTone:   acc.fluxBoostTone   || flags.fluxBoostTone,
        fluxBoostMotif:  acc.fluxBoostMotif  || flags.fluxBoostMotif,
        fluxBoostNoText: acc.fluxBoostNoText || flags.fluxBoostNoText
      };
    },
    { fluxBoostTone: false, fluxBoostMotif: false, fluxBoostNoText: false }
  );
}

// ============================================================
// Policy: lockup rescue
// ============================================================

export function resolveLockupRescueAction(failureClass: LockupFailureClass): LockupRescueAction {
  switch (failureClass) {
    case "lockup_fit_failed": return "compact_width_retry";
  }
}

// ============================================================
// Policy: planner rescue
// ============================================================

export function resolvePlannerRescueAction(failureClass: PlannerFailureClass): PlannerRescueAction {
  switch (failureClass) {
    case "planner_tone_family_incompatible":    return "reroute_lane_family";
    case "planner_scaffold_risk_family":        return "reroute_lane_family";
    case "planner_text_artifact_risk_family":   return "reroute_lane_family";
  }
}

// ============================================================
// Planner compatibility detection
// ============================================================

/**
 * Returns true when nativeTone and targetTone are structurally incompatible.
 *
 * Structural incompatibility = the family's inherent tonal character will cause
 * repeated background_tone_fit_failed even after recovery boosts.
 *
 * Rules:
 *   {dark, mono} vs {light, vivid} → incompatible (dark family ≠ produce light)
 *   {vivid}      vs {dark, mono}   → incompatible (vivid family ≠ produce dark)
 *   neutral is compatible with all targets
 */
export function isToneFamilyIncompatible(nativeTone: StyleToneKey, targetTone: StyleToneKey): boolean {
  const darkSide = new Set<StyleToneKey>(["dark", "mono"]);
  const lightSide = new Set<StyleToneKey>(["light", "vivid"]);
  if (darkSide.has(nativeTone) && lightSide.has(targetTone)) return true;
  if (nativeTone === "vivid" && darkSide.has(targetTone)) return true;
  return false;
}

/**
 * Detect a structural planner tone/family incompatibility.
 *
 * Compares the style family's native tone (from STYLE_FAMILY_BANK) against the
 * assigned styleTone from the direction spec. If they conflict structurally,
 * returns "planner_tone_family_incompatible" — otherwise null.
 *
 * Should be called PRE-GENERATION to avoid spending image budget on a lane that
 * will fail the tone check regardless of recovery boosts.
 */
export function detectPlannerToneFamilyIncompatibility(params: {
  styleFamily: StyleFamilyKey | null | undefined;
  styleTone: StyleToneKey | null | undefined;
}): PlannerFailureClass | null {
  if (!params.styleFamily || !params.styleTone) return null;
  if (!isStyleFamilyKey(params.styleFamily)) return null;

  const nativeTone = STYLE_FAMILY_BANK[params.styleFamily].tone;
  if (isToneFamilyIncompatible(nativeTone, params.styleTone)) {
    return "planner_tone_family_incompatible";
  }
  return null;
}

/**
 * Pick a tone-compatible replacement style family when the current family is
 * incompatible with the assigned tone target.
 *
 * Delegates to pickExplorationFallbackStyleFamily so the reroute stays within
 * the planned exploration universe (respects exploration sets, seeded random).
 *
 * Returns null if no compatible family is available — lane settles with original.
 */
export function reroutePlannerLane(params: {
  currentStyleFamily: StyleFamilyKey;
  toneTarget: StyleToneKey;
  runSeed: string;
  laneFamily: DirectionLaneFamily;
}): StyleFamilyKey | null {
  const currentRecord = STYLE_FAMILY_BANK[params.currentStyleFamily];
  const result = pickExplorationFallbackStyleFamily({
    runSeed: `${params.runSeed}|planner-reroute`,
    laneFamily: params.laneFamily,
    currentStyleFamily: params.currentStyleFamily,
    tone: params.toneTarget,
    medium: currentRecord.medium,
    avoidFamilies: [params.currentStyleFamily]
  });
  return result?.family ?? null;
}

// ============================================================
// Background family compatibility guardrails
// ============================================================

/**
 * Union of all background-generation risk families.
 * Used in reroute avoidance so a replacement is free of both scaffold and text-artifact risk.
 */
const ALL_BACKGROUND_RISK_FAMILIES: readonly StyleFamilyKey[] = [
  ...SCAFFOLD_RISK_FAMILY_SET,
  ...TEXT_ARTIFACT_RISK_FAMILY_SET
];

/**
 * Detect a background family compatibility issue PRE-GENERATION.
 *
 * Returns the most specific failure class when the family is structurally prone to:
 *   - generating text artifacts (topographic lines, annotation marks, etc.)
 *   - generating scaffold-like / empty-template compositions
 *
 * Text artifact risk is checked first because it has stricter consequences.
 *
 * Returns null if the family has no known background risk.
 */
export function detectPlannerBackgroundFamilyRisk(
  styleFamily: StyleFamilyKey | null | undefined
): PlannerFailureClass | null {
  if (!styleFamily || !isStyleFamilyKey(styleFamily)) return null;
  if (TEXT_ARTIFACT_RISK_FAMILY_SET.has(styleFamily)) return "planner_text_artifact_risk_family";
  if (SCAFFOLD_RISK_FAMILY_SET.has(styleFamily)) return "planner_scaffold_risk_family";
  return null;
}

/**
 * Pick a safe replacement family for a lane with a background compatibility issue.
 *
 * Avoids ALL_BACKGROUND_RISK_FAMILIES so the replacement is free of both scaffold
 * and text-artifact risk. Falls back to the family's native tone when toneTarget is null.
 *
 * Tries the current family's medium first, then broadens through other mediums.
 * This is necessary because some risk families (e.g. topographic_contour_lines, abstract
 * medium, mono tone) have no safe abstract+mono alternatives — broadening the medium finds
 * painterly_atmosphere or photographic_graphic_overlay as valid replacements.
 *
 * Returns null if no safe replacement is found — lane generation proceeds with original.
 */
export function reroutePlannerBackgroundRiskLane(params: {
  currentStyleFamily: StyleFamilyKey;
  toneTarget: StyleToneKey | null;
  runSeed: string;
  laneFamily: DirectionLaneFamily;
}): StyleFamilyKey | null {
  const currentRecord = STYLE_FAMILY_BANK[params.currentStyleFamily];
  const effectiveTone = params.toneTarget ?? currentRecord.tone;

  // Try current medium first, then widen to other mediums for broader coverage.
  // This is important for families like topographic_contour_lines (abstract/mono) where
  // no safe alternative exists with the same medium+tone combination.
  const mediumsToTry: StyleMediumKey[] = [
    currentRecord.medium,
    ...STYLE_MEDIUM_KEYS.filter((m) => m !== currentRecord.medium)
  ];

  for (const medium of mediumsToTry) {
    // Start with the full risk-family avoid list and expand it with any tone-incompatible
    // results. pickExplorationFallbackStyleFamily uses lane-level tone filtering (whether
    // a lane allows the target tone) rather than family-level tone filtering (whether the
    // family's native tone matches the target). Multi-tone lanes can return families whose
    // native tone is structurally incompatible with the target, so we validate and retry.
    const localAvoid: StyleFamilyKey[] = [...ALL_BACKGROUND_RISK_FAMILIES];

    for (let attempt = 0; attempt < 5; attempt++) {
      const result = pickExplorationFallbackStyleFamily({
        runSeed: `${params.runSeed}|planner-bg-risk-reroute`,
        laneFamily: params.laneFamily,
        currentStyleFamily: params.currentStyleFamily,
        tone: effectiveTone,
        medium,
        avoidFamilies: localAvoid
      });
      if (!result) break;

      const resultRecord = STYLE_FAMILY_BANK[result.family];
      if (params.toneTarget && isToneFamilyIncompatible(resultRecord.tone, params.toneTarget)) {
        // Tone-incompatible result — add to avoid and try for the next-best candidate.
        localAvoid.push(result.family);
        continue;
      }
      return result.family;
    }
  }
  return null;
}

// ============================================================
// Builder helpers (produce rescue state for diagnostics)
// ============================================================

export function buildBackgroundRescueState(params: {
  failureClass: BackgroundFailureClass;
  budgetUsed: number;
  outcome: RescueOutcome;
}): BackgroundRescueState {
  return {
    kind: "background",
    failureClass: params.failureClass,
    rescueAction: resolveBackgroundRescueAction(params.failureClass),
    budgetUsed: params.budgetUsed,
    budgetTotal: BACKGROUND_RESCUE_BUDGET,
    outcome: params.outcome
  };
}

export function buildLockupRescueState(params: {
  failureClass: LockupFailureClass;
  budgetUsed: number;
  outcome: RescueOutcome;
}): LockupRescueState {
  return {
    kind: "lockup",
    failureClass: params.failureClass,
    rescueAction: resolveLockupRescueAction(params.failureClass),
    budgetUsed: params.budgetUsed,
    budgetTotal: LOCKUP_RESCUE_BUDGET,
    outcome: params.outcome
  };
}

export function buildPlannerRescueState(params: {
  failureClass: PlannerFailureClass;
  reroutedTo: StyleFamilyKey | null;
  budgetUsed: number;
  outcome: RescueOutcome;
}): PlannerRescueState {
  return {
    kind: "planner",
    failureClass: params.failureClass,
    rescueAction: resolvePlannerRescueAction(params.failureClass),
    reroutedTo: params.reroutedTo,
    budgetUsed: params.budgetUsed,
    budgetTotal: PLANNER_RESCUE_BUDGET,
    outcome: params.outcome
  };
}
