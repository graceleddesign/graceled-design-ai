/**
 * Narrow mode-aware acceptance waiver for Imagen 4 modern_abstract
 * prism_refraction_light_on_dark plates.
 *
 * Problem:
 *   The generic tone gate rejects intentionally dark/low-luminance modern
 *   abstract plates as "tone_implausible" when the project brief tone is
 *   "light" or "vivid." A prism/refraction plate is deliberately dark — that
 *   is part of the aesthetic, not a defect. Rejecting it solely on luminance
 *   prevents any end-to-end test of the Imagen 4 → compositor path.
 *
 * What this waiver does:
 *   If the ONLY acceptance failure is "background_tone_fit_failed" AND all
 *   structural/text conditions below are satisfied, the tone gate is waived
 *   and the lane proceeds as accepted.
 *
 * What this waiver does NOT do:
 *   - It never waives text or scaffold failures.
 *   - It never waives non-Imagen 4 modern_abstract lanes.
 *   - It never waives other prompt families.
 *   - It is not a universal quality signal — these thresholds were calibrated
 *     from a single fixture. Treat them as provisional.
 *
 * IMPORTANT: Thresholds calibrated from one fixture:
 *   test/fixtures/round1-v2/imagen4-modern-abstract-prism-dark.png
 *   (saved from live run 2025-05-12, generationId 64323f20-d844-4e19-917d-779e307e037b)
 *   structureScore 0.814, marginScore 0.386, edgeDensity 0.061, textDetected false.
 *   Do not generalise these to other prompt families or design modes.
 */

import type { ScoutEvalResult } from "../eval/evaluate-scout";
import { IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY } from "./build-imagen4-modern-abstract-prompt";

// ── Thresholds ────────────────────────────────────────────────────────────────
// Calibrated from one fixture. May need refinement as more plates are seen.

export const PRISM_TONE_WAIVER_THRESHOLDS = {
  structureScoreMin: 0.7,
  marginScoreMin: 0.3,
  edgeDensityMax: 0.15,
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Imagen4AcceptanceOverride {
  applied: true;
  reason: "dark_prism_modern_abstract_tone_gate";
  originalRejectReasons: string[];
  thresholds: typeof PRISM_TONE_WAIVER_THRESHOLDS;
  actual: {
    toneScore: number;
    structureScore: number;
    marginScore: number;
    edgeDensity: number | null;
  };
}

// ── Waiver check ──────────────────────────────────────────────────────────────

/**
 * Returns an override record if the tone gate can be waived, or null if not.
 *
 * Callers must ensure this is only invoked for Imagen 4 modern_abstract
 * prism_refraction lanes — it is structurally guarded by where it is called
 * in run-imagen4-modern-abstract-lane.ts, but the promptFamily parameter is
 * accepted explicitly so the constraint is visible at the call site.
 */
export function checkImagen4ModernAbstractToneWaiver(
  promptFamily: string,
  evalRes: ScoutEvalResult,
  acceptance: { accepted: boolean; invalidReasons: string[] }
): Imagen4AcceptanceOverride | null {
  // Must be the correct prompt family
  if (promptFamily !== IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY) return null;

  // Only consider already-rejected results
  if (acceptance.accepted) return null;

  // The ONLY permissible failing reason is background_tone_fit_failed.
  // Any text, scaffold, source, or canonical failure disqualifies immediately.
  const isToneOnlyFailure =
    acceptance.invalidReasons.length === 1 &&
    acceptance.invalidReasons[0] === "background_tone_fit_failed";
  if (!isToneOnlyFailure) return null;

  // Belt-and-suspenders text check (independent of acceptance reasons)
  if (evalRes.textDetected) return null;

  // Structure must be strong — ensures the plate has genuine visual content
  if (evalRes.structureScore < PRISM_TONE_WAIVER_THRESHOLDS.structureScoreMin) return null;

  // Margin must be acceptable — ensures title-safe zones are not over-busy
  if (evalRes.marginScore < PRISM_TONE_WAIVER_THRESHOLDS.marginScoreMin) return null;

  // Edge density cap — guards against noisy/chaotic images that happen to pass structure
  const edgeDensity = evalRes.imageStats?.edgeDensity ?? null;
  if (edgeDensity === null || edgeDensity > PRISM_TONE_WAIVER_THRESHOLDS.edgeDensityMax) return null;

  return {
    applied: true,
    reason: "dark_prism_modern_abstract_tone_gate",
    originalRejectReasons: [...acceptance.invalidReasons],
    thresholds: PRISM_TONE_WAIVER_THRESHOLDS,
    actual: {
      toneScore: evalRes.toneScore,
      structureScore: evalRes.structureScore,
      marginScore: evalRes.marginScore,
      edgeDensity,
    },
  };
}
