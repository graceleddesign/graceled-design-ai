import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CLAIMED_GENERATION_EXECUTION_TIMEOUT_MS,
  ROUND1_EXPLORATION_CLAIMED_GENERATION_EXECUTION_TIMEOUT_MS,
  resolveClaimedGenerationExecutionTimeoutMs
} from "@/lib/graphics-domain/claim-timeout";

test("only the round 1 exploration background path receives the extended claim lease", () => {
  assert.equal(
    resolveClaimedGenerationExecutionTimeoutMs({
      round: 1,
      backgroundExploration: true
    }),
    ROUND1_EXPLORATION_CLAIMED_GENERATION_EXECUTION_TIMEOUT_MS
  );

  assert.equal(
    resolveClaimedGenerationExecutionTimeoutMs({
      round: 1,
      backgroundExploration: false
    }),
    DEFAULT_CLAIMED_GENERATION_EXECUTION_TIMEOUT_MS
  );

  assert.equal(
    resolveClaimedGenerationExecutionTimeoutMs({
      round: 2,
      backgroundExploration: true
    }),
    DEFAULT_CLAIMED_GENERATION_EXECUTION_TIMEOUT_MS
  );
});

test("the extended round 1 exploration lease covers a queued slow-provider window that exceeded the legacy 90s lease", () => {
  const simulatedQueuedSlowProviderMs = 60_000 + 55_000;
  const legacyLeaseMs = DEFAULT_CLAIMED_GENERATION_EXECUTION_TIMEOUT_MS;
  const extendedLeaseMs = resolveClaimedGenerationExecutionTimeoutMs({
    round: 1,
    backgroundExploration: true
  });

  assert.ok(simulatedQueuedSlowProviderMs > legacyLeaseMs);
  assert.ok(simulatedQueuedSlowProviderMs < extendedLeaseMs);
});
