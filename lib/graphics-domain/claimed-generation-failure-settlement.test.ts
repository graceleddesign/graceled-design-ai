import assert from "node:assert/strict";
import test from "node:test";
import { settleUnexpectedClaimedGenerationFailure } from "@/lib/graphics-domain/claimed-generation-failure-settlement";

test("claim timeouts wait for tracked background work exhaustion before terminal failed settlement", async () => {
  const events: string[] = [];
  let releaseFinalize: (() => void) | null = null;
  const finalizeBarrier = new Promise<void>((resolve) => {
    releaseFinalize = resolve;
  });

  const resultPromise = settleUnexpectedClaimedGenerationFailure({
    claimTimedOut: true,
    finalizeTimedOutBackgroundWork: async () => {
      events.push("finalize:start");
      await finalizeBarrier;
      events.push("finalize:end");
    },
    persistTerminalFailure: async () => {
      events.push("persist");
      return true;
    },
    readPersistedStatus: async () => {
      events.push("read");
      return "IN_PROGRESS";
    }
  });

  await Promise.resolve();
  assert.deepEqual(events, ["finalize:start"]);

  releaseFinalize?.();

  assert.equal(await resultPromise, "FAILED_GENERATION");
  assert.deepEqual(events, ["finalize:start", "finalize:end", "persist"]);
});

test("unexpected exhausted failures still settle honestly as failed generations", async () => {
  assert.equal(
    await settleUnexpectedClaimedGenerationFailure({
      claimTimedOut: false,
      persistTerminalFailure: async () => true,
      readPersistedStatus: async () => "IN_PROGRESS"
    }),
    "FAILED_GENERATION"
  );
});

test("ownership-loss fallbacks preserve the stored authoritative status instead of overwriting success", async () => {
  const events: string[] = [];

  const status = await settleUnexpectedClaimedGenerationFailure({
    claimTimedOut: false,
    persistTerminalFailure: async () => {
      events.push("persist");
      return false;
    },
    readPersistedStatus: async () => {
      events.push("read");
      return "COMPLETED";
    }
  });

  assert.equal(status, "COMPLETED");
  assert.deepEqual(events, ["persist", "read"]);
});
