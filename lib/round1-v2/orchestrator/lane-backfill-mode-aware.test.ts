import assert from "node:assert/strict";
import test from "node:test";
import { selectEligibleBackfill, type BackfillCandidate } from "./lane-backfill";
import type { ScoutSlot } from "./build-scout-plan";

function makeCandidate(slotIndex: number, laneKey: "A" | "B" | "C", grammarKey: string, score: number): BackfillCandidate {
  const slot: ScoutSlot = {
    grammarKey: grammarKey as ScoutSlot["grammarKey"],
    diversityFamily: "fam_" + grammarKey,
    tone: "neutral",
    motifBinding: [],
    seed: 1,
    promptSpec: { template: "t", motifBinding: [], tone: "neutral", negativeHints: [] },
    laneKey,
    designMode: laneKey === "A" ? "minimal_editorial" : laneKey === "B" ? "cinematic_atmospheric" : "typography_led",
  };
  return {
    slotIndex,
    slot,
    result: { slot, prompt: "p", status: "success", imageBytes: Buffer.from([1]) },
    eval: {
      hardReject: false,
      rejectReasons: [],
      toneScore: 0,
      structureScore: 0,
      marginScore: 0,
      compositeScore: score,
      imageStats: null,
      textDetected: false,
    },
    grammarKey,
    diversityFamily: "fam_" + grammarKey,
    compositeScore: score,
  };
}

test("backfill prefers same-lane candidates before cross-lane", () => {
  const pool: BackfillCandidate[] = [
    makeCandidate(0, "B", "horizon_band", 0.95), // best score, but lane B
    makeCandidate(1, "A", "textural_field", 0.7),
    makeCandidate(2, "A", "horizon_band", 0.6),
    makeCandidate(3, "C", "centered_focal_motif", 0.8),
  ];
  const { candidates, modeRelaxed } = selectEligibleBackfill({
    pool,
    completedSlotIndices: new Set(),
    laneLabel: "A",
    maxCount: 2,
  });
  // First candidate should be from lane A even though lane B has higher score.
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].slot.laneKey, "A");
  assert.equal(candidates[1].slot.laneKey, "A");
  assert.equal(modeRelaxed, false);
});

test("backfill relaxes to cross-lane when same-lane pool exhausted, sets modeRelaxed=true", () => {
  const pool: BackfillCandidate[] = [
    makeCandidate(0, "A", "textural_field", 0.7),
    makeCandidate(1, "B", "horizon_band", 0.8),
    makeCandidate(2, "C", "centered_focal_motif", 0.6),
  ];
  const { candidates, modeRelaxed } = selectEligibleBackfill({
    pool,
    completedSlotIndices: new Set(),
    laneLabel: "A",
    maxCount: 3,
  });
  assert.equal(candidates.length, 3);
  // first should be the only same-lane candidate
  assert.equal(candidates[0].slot.laneKey, "A");
  // remaining are cross-lane → modeRelaxed must be true
  assert.equal(modeRelaxed, true);
});

test("backfill with no laneLabel keeps existing global behavior (modeRelaxed=false)", () => {
  const pool: BackfillCandidate[] = [
    makeCandidate(0, "B", "horizon_band", 0.95),
    makeCandidate(1, "A", "textural_field", 0.7),
  ];
  const { candidates, modeRelaxed } = selectEligibleBackfill({
    pool,
    completedSlotIndices: new Set(),
    maxCount: 2,
  });
  assert.equal(candidates.length, 2);
  assert.equal(modeRelaxed, false);
});

test("backfill respects completedSlotIndices (does not return already-used scouts)", () => {
  const pool: BackfillCandidate[] = [
    makeCandidate(0, "A", "textural_field", 0.9),
    makeCandidate(1, "A", "horizon_band", 0.8),
  ];
  const { candidates } = selectEligibleBackfill({
    pool,
    completedSlotIndices: new Set([0]),
    laneLabel: "A",
    maxCount: 2,
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].slotIndex, 1);
});
