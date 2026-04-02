import assert from "node:assert/strict";
import test from "node:test";
import { ROUND1_EXPLORATION_CLAIMED_GENERATION_EXECUTION_TIMEOUT_MS } from "@/lib/graphics-domain/claim-timeout";
import {
  estimateSerialBackgroundProviderCallsBeforeSettlement,
  resolveRound1LiveWorkBudget
} from "@/lib/graphics-domain/round1-live-work-budget";

test("round 1 no-notes live work budget trims serial provider work while leaving non-target paths unchanged", () => {
  const explorationMaxTextRetriesPerBackground = 3;
  const noNotesBudget = resolveRound1LiveWorkBudget({
    round: 1,
    hasDesignNotes: false,
    devCheapMode: false,
    explorationMaxTextRetriesPerBackground
  });
  const notesBudget = resolveRound1LiveWorkBudget({
    round: 1,
    hasDesignNotes: true,
    devCheapMode: false,
    explorationMaxTextRetriesPerBackground
  });
  const roundTwoBudget = resolveRound1LiveWorkBudget({
    round: 2,
    hasDesignNotes: false,
    devCheapMode: false,
    explorationMaxTextRetriesPerBackground
  });

  assert.deepEqual(noNotesBudget, {
    backgroundCandidateCount: 1,
    lockupCandidateCount: 1,
    maxTextRetriesPerBackground: 1
  });
  assert.deepEqual(notesBudget, {
    backgroundCandidateCount: 4,
    lockupCandidateCount: 2,
    maxTextRetriesPerBackground: explorationMaxTextRetriesPerBackground
  });
  assert.deepEqual(roundTwoBudget, notesBudget);

  const simulatedSlowProviderMsPerCall = 55_000;
  const legacyNoNotesBackgroundCandidateCount = 2;
  const currentNoNotesProviderMs =
    estimateSerialBackgroundProviderCallsBeforeSettlement({
      backgroundCandidateCount: noNotesBudget.backgroundCandidateCount,
      maxTextRetriesPerBackground: noNotesBudget.maxTextRetriesPerBackground,
      includeTextArtifactRetry: true
    }) * simulatedSlowProviderMsPerCall;
  const legacyNoNotesProviderMs =
    estimateSerialBackgroundProviderCallsBeforeSettlement({
      backgroundCandidateCount: legacyNoNotesBackgroundCandidateCount,
      maxTextRetriesPerBackground: noNotesBudget.maxTextRetriesPerBackground,
      includeTextArtifactRetry: true
    }) * simulatedSlowProviderMsPerCall;

  assert.ok(currentNoNotesProviderMs < ROUND1_EXPLORATION_CLAIMED_GENERATION_EXECUTION_TIMEOUT_MS);
  assert.ok(legacyNoNotesProviderMs > ROUND1_EXPLORATION_CLAIMED_GENERATION_EXECUTION_TIMEOUT_MS);
});
