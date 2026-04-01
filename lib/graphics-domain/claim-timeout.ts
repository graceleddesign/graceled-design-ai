const DEFAULT_CLAIMED_GENERATION_EXECUTION_TIMEOUT_MS = 90_000;
const ROUND1_EXPLORATION_CLAIMED_GENERATION_EXECUTION_TIMEOUT_MS = 240_000;

export {
  DEFAULT_CLAIMED_GENERATION_EXECUTION_TIMEOUT_MS,
  ROUND1_EXPLORATION_CLAIMED_GENERATION_EXECUTION_TIMEOUT_MS
};

export function resolveClaimedGenerationExecutionTimeoutMs(params: {
  round: number;
  backgroundExploration: boolean;
}): number {
  // Round 1 exploration can queue behind the shared live-image budget and still
  // legitimately spend time on multiple background candidates before settlement.
  if (params.round === 1 && params.backgroundExploration) {
    return ROUND1_EXPLORATION_CLAIMED_GENERATION_EXECUTION_TIMEOUT_MS;
  }

  return DEFAULT_CLAIMED_GENERATION_EXECUTION_TIMEOUT_MS;
}
