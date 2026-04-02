export type Round1LiveWorkBudget = {
  backgroundCandidateCount: number;
  lockupCandidateCount: number;
  maxTextRetriesPerBackground: number;
};

const ROUND1_EXPLORATION_BACKGROUND_CANDIDATE_COUNT = 4;
const ROUND1_EXPLORATION_LOCKUP_CANDIDATE_COUNT = 2;
const CHEAP_MODE_ROUND1_BACKGROUND_CANDIDATE_COUNT = 1;
// Keep the no-notes live path to a single provider-backed background candidate.
// A second serial candidate doubles the slow-provider work before authoritative
// settlement, while the path already retains local reranking and honest failure
// semantics if that single candidate is not production-valid.
const ROUND1_NO_NOTES_BACKGROUND_CANDIDATE_COUNT = 1;
const ROUND1_NO_NOTES_LOCKUP_CANDIDATE_COUNT = 1;
const ROUND1_NO_NOTES_MAX_TEXT_RETRIES = 1;

export function resolveRound1LiveWorkBudget(params: {
  round: number;
  hasDesignNotes: boolean;
  devCheapMode: boolean;
  explorationMaxTextRetriesPerBackground: number;
}): Round1LiveWorkBudget {
  const shouldThrottleNoNotesRound1 = params.round === 1 && !params.hasDesignNotes;
  if (shouldThrottleNoNotesRound1) {
    return {
      backgroundCandidateCount: params.devCheapMode
        ? CHEAP_MODE_ROUND1_BACKGROUND_CANDIDATE_COUNT
        : ROUND1_NO_NOTES_BACKGROUND_CANDIDATE_COUNT,
      lockupCandidateCount: ROUND1_NO_NOTES_LOCKUP_CANDIDATE_COUNT,
      maxTextRetriesPerBackground: ROUND1_NO_NOTES_MAX_TEXT_RETRIES
    };
  }

  return {
    backgroundCandidateCount: ROUND1_EXPLORATION_BACKGROUND_CANDIDATE_COUNT,
    lockupCandidateCount: ROUND1_EXPLORATION_LOCKUP_CANDIDATE_COUNT,
    maxTextRetriesPerBackground: params.explorationMaxTextRetriesPerBackground
  };
}

export function estimateSerialBackgroundProviderCallsBeforeSettlement(params: {
  backgroundCandidateCount: number;
  maxTextRetriesPerBackground: number;
  includeTextArtifactRetry: boolean;
}): number {
  return (
    params.backgroundCandidateCount *
    (1 + Math.max(0, params.maxTextRetriesPerBackground) + (params.includeTextArtifactRetry ? 1 : 0))
  );
}
