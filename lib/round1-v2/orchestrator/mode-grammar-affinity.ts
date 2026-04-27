/**
 * DesignMode → grammar affinity.
 *
 * Each DesignMode has a preferred set of composition grammars that suit its
 * visual register. Scout planning uses this to pick mode-compatible grammars
 * for each lane's 3 scout slots.
 *
 * Affinity is a *preference list*, not a hard filter — if motif/tone constraints
 * eliminate the preferred grammars, the planner falls back to the full set.
 */

import type { GrammarKey } from "../grammars";
import type { DesignMode } from "../design-modes";

const PREFERRED_GRAMMARS: Readonly<Record<DesignMode, readonly GrammarKey[]>> = {
  typography_led: [
    // Quiet plate / restrained backgrounds where typography can dominate.
    "textural_field",
    "geometric_block_composition",
    "layered_atmospheric",
  ],
  minimal_editorial: [
    "textural_field",
    "horizon_band",
    "layered_atmospheric",
  ],
  graphic_symbol: [
    "centered_focal_motif",
    "edge_anchored_motif",
    "geometric_block_composition",
  ],
  modern_abstract: [
    "geometric_block_composition",
    "textural_field",
    "layered_atmospheric",
  ],
  photo_composite: [
    "edge_anchored_motif",
    "centered_focal_motif",
    "horizon_band",
  ],
  cinematic_atmospheric: [
    "layered_atmospheric",
    "horizon_band",
    "edge_anchored_motif",
  ],
  illustrative_collage: [
    "geometric_block_composition",
    "textural_field",
    "centered_focal_motif",
  ],
  playful_seasonal: [
    "geometric_block_composition",
    "centered_focal_motif",
    "textural_field",
  ],
  retro_print: [
    "geometric_block_composition",
    "textural_field",
    "horizon_band",
  ],
};

export function getPreferredGrammarsForMode(mode: DesignMode): readonly GrammarKey[] {
  return PREFERRED_GRAMMARS[mode];
}
