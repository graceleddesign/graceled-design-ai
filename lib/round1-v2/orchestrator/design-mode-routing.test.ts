import assert from "node:assert/strict";
import test from "node:test";
import { canRenderDesignModeLocally } from "./design-mode-renderer";
import { planDesignModes } from "./plan-design-modes";

// These tests prove the routing decision the orchestrator makes per lane.
// They do not exercise FAL or DB — the orchestrator's actual routing path
// is a single line: `if (canRenderDesignModeLocally(mode))`.

test("routing partitions a Gospel of John plan into local + AI lanes", () => {
  const plan = planDesignModes({
    title: "The Gospel of John",
    scripturePassages: "Gospel of John",
    toneHint: "neutral",
    motifHints: ["light", "water"],
    runSeed: "routing-test-1",
  });
  const local = plan.lanes.filter((l) => canRenderDesignModeLocally(l.mode));
  const ai = plan.lanes.filter((l) => !canRenderDesignModeLocally(l.mode));
  // We should have at least one of each for a balanced expository plan.
  assert.ok(local.length >= 1, `expected at least 1 local lane, got ${local.length}`);
  assert.ok(ai.length >= 1, `expected at least 1 AI lane, got ${ai.length}`);
  assert.equal(local.length + ai.length, 3);
});

test("routing: typography_led + minimal_editorial route locally; cinematic_atmospheric routes to AI", () => {
  assert.equal(canRenderDesignModeLocally("typography_led"), true);
  assert.equal(canRenderDesignModeLocally("minimal_editorial"), true);
  assert.equal(canRenderDesignModeLocally("modern_abstract"), true);
  assert.equal(canRenderDesignModeLocally("graphic_symbol"), true);
  assert.equal(canRenderDesignModeLocally("cinematic_atmospheric"), false);
  assert.equal(canRenderDesignModeLocally("photo_composite"), false);
});

test("routing: an all-cinematic-tone plan still routes through AI for cinematic lanes", () => {
  // Build a brief that strongly biases toward cinematic_atmospheric
  const plan = planDesignModes({
    title: "Awakening to Hope",
    description: "A contemplative atmospheric study of dawn and stillness",
    toneHint: "light",
    motifHints: ["dawn light"],
    runSeed: "routing-test-cinematic",
  });
  // We don't require all 3 to be cinematic — just that any cinematic lane is AI.
  for (const lane of plan.lanes) {
    if (lane.mode === "cinematic_atmospheric") {
      assert.equal(canRenderDesignModeLocally(lane.mode), false);
    }
  }
});

test("routing: orchestrator-level invariant — every lane is either local OR AI, never both", () => {
  const plan = planDesignModes({
    title: "Test Series",
    toneHint: "neutral",
    motifHints: [],
    runSeed: "routing-invariant",
  });
  for (const lane of plan.lanes) {
    const isLocal = canRenderDesignModeLocally(lane.mode);
    // The boolean is well-defined; this asserts the contract is total.
    assert.ok(typeof isLocal === "boolean");
  }
});
