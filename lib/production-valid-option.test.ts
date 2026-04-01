import assert from "node:assert/strict";
import test from "node:test";
import { resolveProductionValidOptionStatus } from "@/lib/production-valid-option";

function buildFallbackLikeOutput(phase: "RUNNING" | "SETTLED") {
  return {
    status: "FALLBACK" as const,
    meta: {
      execution: {
        version: 1 as const,
        phase,
        activeAttemptToken: phase === "RUNNING" ? "attempt-token" : null,
        activeAttemptNumber: 1
      },
      debug: {
        backgroundSource: "fallback" as const,
        lockupSource: "fallback" as const
      }
    }
  };
}

test("terminal failed rows do not read as in progress when execution metadata is stale", () => {
  const staleRunningOutput = buildFallbackLikeOutput("RUNNING");

  assert.equal(
    resolveProductionValidOptionStatus({
      output: staleRunningOutput,
      dbStatus: "FAILED"
    }),
    "FALLBACK"
  );
});

test("active rows still read as in progress while the DB status is running", () => {
  const runningOutput = buildFallbackLikeOutput("RUNNING");

  assert.equal(
    resolveProductionValidOptionStatus({
      output: runningOutput,
      dbStatus: "RUNNING"
    }),
    "IN_PROGRESS"
  );
});
