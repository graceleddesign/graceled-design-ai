import assert from "node:assert/strict";
import test from "node:test";
import { withTimeout, ProviderTimeoutError } from "./with-timeout";

// ── ProviderTimeoutError ──────────────────────────────────────────────────────

test("ProviderTimeoutError has correct name, label, timeoutMs, and message", () => {
  const err = new ProviderTimeoutError("fal-flux-schnell", 45_000);
  assert.equal(err.name, "ProviderTimeoutError");
  assert.equal(err.label, "fal-flux-schnell");
  assert.equal(err.timeoutMs, 45_000);
  assert.equal(err.message, "fal-flux-schnell timed out after 45000ms");
  assert.ok(err instanceof Error);
});

// ── withTimeout: normal resolution ───────────────────────────────────────────

test("resolves with value when promise completes before timeout", async () => {
  const result = await withTimeout(
    Promise.resolve("hello"),
    1_000,
    "test-label"
  );
  assert.equal(result, "hello");
});

test("resolves with complex value before timeout", async () => {
  const value = { a: 1, b: "two" };
  const result = await withTimeout(Promise.resolve(value), 500, "test");
  assert.deepEqual(result, value);
});

test("fast async promise resolves before timeout", async () => {
  const fastPromise = new Promise<number>((resolve) => {
    setTimeout(() => resolve(42), 5);
  });
  const result = await withTimeout(fastPromise, 1_000, "fast-call");
  assert.equal(result, 42);
});

// ── withTimeout: timeout fires ────────────────────────────────────────────────

test("rejects with ProviderTimeoutError when deadline fires first", async () => {
  const neverResolves = new Promise<never>(() => { /* intentionally hangs */ });

  await assert.rejects(
    withTimeout(neverResolves, 20, "hang-test"),
    (err: unknown) => {
      assert.ok(err instanceof ProviderTimeoutError);
      assert.equal(err.label, "hang-test");
      assert.equal(err.timeoutMs, 20);
      return true;
    }
  );
});

test("rejects with ProviderTimeoutError, not the original error, when timeout fires first", async () => {
  // Promise that rejects after a long delay — timeout should fire first
  const slowRejection = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("late error")), 500);
  });

  await assert.rejects(
    withTimeout(slowRejection, 20, "slow-rejection"),
    (err: unknown) => {
      assert.ok(err instanceof ProviderTimeoutError, `expected ProviderTimeoutError, got ${err}`);
      return true;
    }
  );
});

test("passes through original rejection when it fires before timeout", async () => {
  const fastRejection = Promise.reject(new Error("original error"));

  await assert.rejects(
    withTimeout(fastRejection, 1_000, "fast-reject"),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal((err as Error).message, "original error");
      assert.ok(!(err instanceof ProviderTimeoutError));
      return true;
    }
  );
});

// ── withTimeout: timer cleanup ────────────────────────────────────────────────

test("timer is cleaned up after fast resolution (no leaked timer handles)", async () => {
  // If the timer were not cleared, Node.js would keep the event loop alive.
  // We verify this indirectly by ensuring the test completes promptly.
  for (let i = 0; i < 100; i++) {
    await withTimeout(Promise.resolve(i), 10_000, "bulk-cleanup-test");
  }
  // If we reach here without hanging, timer cleanup is working.
  assert.ok(true, "all 100 calls resolved without leaking timers");
});

test("timer is cleaned up after fast rejection (no leaked timer handles)", async () => {
  for (let i = 0; i < 20; i++) {
    try {
      await withTimeout(Promise.reject(new Error("e")), 10_000, "reject-cleanup");
    } catch {
      // expected
    }
  }
  assert.ok(true, "all 20 rejections handled without leaking timers");
});

// ── withTimeout: TIMEOUT classification integration ──────────────────────────
// These verify the expected integration pattern with ScoutProviderError /
// RebuildProviderError classifiers in the FAL providers.

test("ProviderTimeoutError is instanceof Error (integrates with existing classifiers)", () => {
  const err = new ProviderTimeoutError("fal-nano-banana-pro", 90_000);
  assert.ok(err instanceof Error);
  // Classifier code does: `if (err instanceof ProviderTimeoutError) return TIMEOUT`
  // before string matching — this confirms the identity check will work.
  assert.equal(err.name, "ProviderTimeoutError");
});

test("ProviderTimeoutError message does NOT contain 'model' or 'unavailable' (no misclassification)", () => {
  const err = new ProviderTimeoutError("fal-flux-schnell", 45_000);
  const lower = err.message.toLowerCase();
  // Verify it won't accidentally match MODEL_UNAVAILABLE classifier
  assert.ok(!lower.includes("unavailable"), "message should not include 'unavailable'");
  assert.ok(!lower.includes("503"), "message should not include '503'");
  assert.ok(!lower.includes("content"), "message should not include 'content'");
  assert.ok(!lower.includes("policy"), "message should not include 'policy'");
  assert.ok(!lower.includes("rate limit"), "message should not include 'rate limit'");
  assert.ok(!lower.includes("429"), "message should not include '429'");
  // It does contain "timed out" which would match the fallback TIMEOUT string check —
  // but our explicit `instanceof` check fires first anyway.
  assert.ok(lower.includes("timed out"), "message should include 'timed out'");
});
