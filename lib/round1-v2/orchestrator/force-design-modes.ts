/**
 * Dev/test-only override for V2 design-mode lane planning.
 *
 * Set ROUND1_V2_FORCE_DESIGN_MODES=modern_abstract,cinematic_atmospheric,graphic_symbol
 * to force A/B/C lanes to specific modes, bypassing the planner entirely.
 *
 * Active only when NODE_ENV !== "production". Never affects production.
 */

import {
  type DesignMode,
  DESIGN_MODE_META,
  isDesignMode,
} from "../design-modes";
import type { DesignModePlan, LaneDesignMode } from "./plan-design-modes";

// ── Public types ──────────────────────────────────────────────────────────────

export type ForceDesignModesResult =
  | { ok: true; plan: DesignModePlan }
  | { ok: false; reason: string };

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Returns:
 * - null  → env var absent, or NODE_ENV === "production": no override.
 * - { ok: false, reason }  → env var present but invalid: caller should warn and skip.
 * - { ok: true, plan }  → valid forced plan ready for use.
 *
 * Validation rules:
 * - Exactly 3 comma-separated values.
 * - Each must be a known DesignMode.
 * - No duplicates.
 */
export function resolveForceDesignModes(): ForceDesignModesResult | null {
  if (process.env.NODE_ENV === "production") return null;

  const raw = process.env.ROUND1_V2_FORCE_DESIGN_MODES?.trim();
  if (!raw) return null;

  const parts = raw.split(",").map((s) => s.trim());

  if (parts.length !== 3) {
    return {
      ok: false,
      reason: `expected exactly 3 comma-separated modes, got ${parts.length}: "${raw}"`,
    };
  }

  const invalid = parts.filter((p) => !isDesignMode(p));
  if (invalid.length > 0) {
    return {
      ok: false,
      reason: `unknown design mode(s): ${invalid.map((m) => `"${m}"`).join(", ")} — valid values: ${Object.keys(DESIGN_MODE_META).join(", ")}`,
    };
  }

  const modes = parts as [DesignMode, DesignMode, DesignMode];

  if (new Set(modes).size !== 3) {
    return {
      ok: false,
      reason: `duplicate modes not allowed: "${raw}"`,
    };
  }

  const labels = ["A", "B", "C"] as const;
  const lanes = labels.map((lane, i) => {
    const mode = modes[i];
    const meta = DESIGN_MODE_META[mode];
    return {
      lane,
      mode,
      rationale: "forced_by_ROUND1_V2_FORCE_DESIGN_MODES",
      referenceAnchors: meta.referenceAnchors,
      forced: true,
      usedFallback: false,
    } satisfies LaneDesignMode;
  }) as [LaneDesignMode, LaneDesignMode, LaneDesignMode];

  const summary = lanes.map((l) => `${l.lane}=${l.mode}`).join(" ");

  return {
    ok: true,
    plan: {
      lanes,
      summary,
      allDistinct: true,
      detectedCharacteristics: ["forced_by_env"],
      scored: [],
    },
  };
}
