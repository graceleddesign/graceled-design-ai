import type { ScoutPlan, ScoutSlot, LaneKey } from "./build-scout-plan";
import { LANE_KEYS } from "./build-scout-plan";
import type { ScoutGenerationResult } from "./run-scout-batch";
import type { ScoutEvalResult } from "../eval/evaluate-scout";

export type SelectionLabel = "A" | "B" | "C";

export interface SelectedScout {
  label: SelectionLabel;
  slotIndex: number;
  slot: ScoutSlot;
  result: ScoutGenerationResult;
  eval: ScoutEvalResult;
  grammarKey: string;
  diversityFamily: string;
  compositeScore: number;
  selectionReason: string;
}

export interface RejectedScout {
  slotIndex: number;
  slot: ScoutSlot;
  eval: ScoutEvalResult;
  rejectionReason: string;
}

export interface ScoutSelection {
  selected: SelectedScout[];
  rejected: RejectedScout[];
  shortfall: boolean;
  shortfallCount: number;
  // Metadata for benchmark reports
  candidateCount: number;
  hardRejectCount: number;
  distinctFamilyCount: number;
}

const SELECTION_LABELS: SelectionLabel[] = ["A", "B", "C"];

export function selectScouts(
  plan: ScoutPlan,
  results: ScoutGenerationResult[],
  evals: ScoutEvalResult[]
): ScoutSelection {
  if (results.length !== plan.slots.length || evals.length !== plan.slots.length) {
    throw new Error(
      `selectScouts: lengths must match (plan=${plan.slots.length}, results=${results.length}, evals=${evals.length})`
    );
  }

  const rejected: RejectedScout[] = [];
  const candidates: Array<{
    slotIndex: number;
    slot: ScoutSlot;
    result: ScoutGenerationResult;
    eval: ScoutEvalResult;
  }> = [];

  // Partition into candidates vs hard-rejected
  for (let i = 0; i < plan.slots.length; i++) {
    const slot = plan.slots[i];
    const result = results[i];
    const ev = evals[i];

    if (result.status === "failed") {
      rejected.push({
        slotIndex: i,
        slot,
        eval: ev,
        rejectionReason: `generation_failed: ${result.error ?? "unknown"}`,
      });
      continue;
    }

    if (ev.hardReject) {
      rejected.push({
        slotIndex: i,
        slot,
        eval: ev,
        rejectionReason: ev.rejectReasons.join(", "),
      });
      continue;
    }

    candidates.push({ slotIndex: i, slot, result, eval: ev });
  }

  // Sort by composite score descending
  candidates.sort((a, b) => b.eval.compositeScore - a.eval.compositeScore);

  // ── Lane-aware path ──────────────────────────────────────────────────────
  // When the plan is lane-aware (slots carry laneKey), pick one winner per
  // lane label from that lane's own scout group. This guarantees A/B/C come
  // from the planned lane/designMode bucket rather than from a global score
  // ranking that might collapse to a single mode's winners.
  if (plan.laneAware) {
    const laneAwareSelected: SelectedScout[] = [];
    const consumedSlotIndices = new Set<number>();
    const remainderForFallback: typeof candidates = [];

    for (const laneKey of LANE_KEYS) {
      const laneCandidates = candidates.filter(
        (c) => c.slot.laneKey === laneKey && !consumedSlotIndices.has(c.slotIndex)
      );
      if (laneCandidates.length === 0) continue;
      const winner = laneCandidates[0]; // already sorted by composite score
      laneAwareSelected.push({
        label: laneKey as SelectionLabel,
        slotIndex: winner.slotIndex,
        slot: winner.slot,
        result: winner.result,
        eval: winner.eval,
        grammarKey: winner.slot.grammarKey,
        diversityFamily: winner.slot.diversityFamily,
        compositeScore: winner.eval.compositeScore,
        selectionReason: `score=${winner.eval.compositeScore.toFixed(3)} grammar=${winner.slot.grammarKey} lane=${laneKey} mode=${winner.slot.designMode ?? "(none)"}`,
      });
      consumedSlotIndices.add(winner.slotIndex);
    }

    // Lanes that had no eligible candidates get filled from cross-lane remainder
    // (mode-relaxed). Note this is selection-time relaxation; backfill will also
    // get a chance to relax later.
    const missingLanes = LANE_KEYS.filter(
      (lk) => !laneAwareSelected.some((s) => s.label === lk)
    );
    if (missingLanes.length > 0) {
      const crossLaneRemainder = candidates.filter(
        (c) => !consumedSlotIndices.has(c.slotIndex)
      );
      for (const laneKey of missingLanes) {
        if (crossLaneRemainder.length === 0) break;
        const fallback = crossLaneRemainder.shift()!;
        laneAwareSelected.push({
          label: laneKey as SelectionLabel,
          slotIndex: fallback.slotIndex,
          slot: fallback.slot,
          result: fallback.result,
          eval: fallback.eval,
          grammarKey: fallback.slot.grammarKey,
          diversityFamily: fallback.slot.diversityFamily,
          compositeScore: fallback.eval.compositeScore,
          selectionReason: `score=${fallback.eval.compositeScore.toFixed(3)} grammar=${fallback.slot.grammarKey} lane=${laneKey} mode=${fallback.slot.designMode ?? "(none)"} (mode-relaxed)`,
        });
        consumedSlotIndices.add(fallback.slotIndex);
      }
    }

    // Order selections A,B,C
    laneAwareSelected.sort(
      (a, b) => LANE_KEYS.indexOf(a.label as LaneKey) - LANE_KEYS.indexOf(b.label as LaneKey)
    );

    // Mark remaining unselected as rejected
    for (const c of candidates) {
      if (!consumedSlotIndices.has(c.slotIndex)) {
        remainderForFallback.push(c);
      }
    }
    for (const c of remainderForFallback) {
      rejected.push({
        slotIndex: c.slotIndex,
        slot: c.slot,
        eval: c.eval,
        rejectionReason: "not_selected: lane_winner_chosen",
      });
    }

    const shortfallCount = Math.max(0, 3 - laneAwareSelected.length);
    return {
      selected: laneAwareSelected,
      rejected,
      shortfall: shortfallCount > 0,
      shortfallCount,
      candidateCount: candidates.length,
      hardRejectCount: rejected.filter(
        (r) =>
          !r.rejectionReason.startsWith("not_selected") &&
          !r.rejectionReason.startsWith("generation_failed")
      ).length,
      distinctFamilyCount: new Set(laneAwareSelected.map((s) => s.diversityFamily)).size,
    };
  }

  // ── Legacy (non-lane-aware) path ─────────────────────────────────────────
  const selected: SelectedScout[] = [];
  const usedGrammarKeys = new Set<string>();
  const usedDiversityFamilies = new Set<string>();
  const remainderRejected: typeof candidates = [];

  // Greedy selection with distinctiveness enforcement:
  // prefer candidates from a different grammarKey first,
  // then prefer different diversityFamily within same grammar family group.
  for (const candidate of candidates) {
    if (selected.length >= 3) {
      remainderRejected.push(candidate);
      continue;
    }

    const grammarKey = candidate.slot.grammarKey;
    const diversityFamily = candidate.slot.diversityFamily;

    if (usedGrammarKeys.has(grammarKey)) {
      // Grammar already selected — defer to later unless no better option exists
      remainderRejected.push(candidate);
      continue;
    }

    const label = SELECTION_LABELS[selected.length];
    selected.push({
      label,
      slotIndex: candidate.slotIndex,
      slot: candidate.slot,
      result: candidate.result,
      eval: candidate.eval,
      grammarKey,
      diversityFamily,
      compositeScore: candidate.eval.compositeScore,
      selectionReason: `score=${candidate.eval.compositeScore.toFixed(3)} grammar=${grammarKey}`,
    });
    usedGrammarKeys.add(grammarKey);
    usedDiversityFamilies.add(diversityFamily);
  }

  // If still short, relax grammar-key constraint and pull from deferred pool
  if (selected.length < 3) {
    for (const candidate of remainderRejected) {
      if (selected.length >= 3) break;
      const label = SELECTION_LABELS[selected.length];
      selected.push({
        label,
        slotIndex: candidate.slotIndex,
        slot: candidate.slot,
        result: candidate.result,
        eval: candidate.eval,
        grammarKey: candidate.slot.grammarKey,
        diversityFamily: candidate.slot.diversityFamily,
        compositeScore: candidate.eval.compositeScore,
        selectionReason: `score=${candidate.eval.compositeScore.toFixed(3)} grammar=${candidate.slot.grammarKey} (relaxed-uniqueness)`,
      });
    }
  }

  // Anything in remainderRejected that wasn't picked goes to rejected with reason
  const selectedIndices = new Set(selected.map((s) => s.slotIndex));
  for (const candidate of remainderRejected) {
    if (!selectedIndices.has(candidate.slotIndex)) {
      rejected.push({
        slotIndex: candidate.slotIndex,
        slot: candidate.slot,
        eval: candidate.eval,
        rejectionReason: usedGrammarKeys.has(candidate.slot.grammarKey)
          ? `not_selected: duplicate_grammar_key=${candidate.slot.grammarKey}`
          : "not_selected: lower_score",
      });
    }
  }

  const shortfallCount = Math.max(0, 3 - selected.length);

  return {
    selected,
    rejected,
    shortfall: shortfallCount > 0,
    shortfallCount,
    candidateCount: candidates.length,
    hardRejectCount: rejected.filter(
      (r) => !r.rejectionReason.startsWith("not_selected") && !r.rejectionReason.startsWith("generation_failed")
    ).length,
    distinctFamilyCount: new Set(selected.map((s) => s.diversityFamily)).size,
  };
}
