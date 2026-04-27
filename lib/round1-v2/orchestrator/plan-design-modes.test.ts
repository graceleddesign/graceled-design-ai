import assert from "node:assert/strict";
import test from "node:test";
import { planDesignModes } from "./plan-design-modes";
import {
  isDesignMode,
  getDesignModeMeta,
  isDefaultEnabledDesignMode,
  DESIGN_MODES,
  DEFAULT_ENABLED_MODES,
} from "../design-modes";

// ── Type helper tests ─────────────────────────────────────────────────────────

test("isDesignMode accepts valid modes", () => {
  assert.ok(isDesignMode("typography_led"));
  assert.ok(isDesignMode("cinematic_atmospheric"));
  assert.ok(isDesignMode("retro_print"));
});

test("isDesignMode rejects invalid strings", () => {
  assert.ok(!isDesignMode("not_a_mode"));
  assert.ok(!isDesignMode(""));
  assert.ok(!isDesignMode(42));
  assert.ok(!isDesignMode(null));
});

test("getDesignModeMeta returns correct metadata", () => {
  const meta = getDesignModeMeta("typography_led");
  assert.equal(meta.mode, "typography_led");
  assert.ok(meta.defaultEnabled);
  assert.ok(!meta.experimental);
  assert.ok(meta.referenceAnchors.includes("ref_0033"));
});

test("retro_print is experimental and not default-enabled", () => {
  const meta = getDesignModeMeta("retro_print");
  assert.ok(meta.experimental);
  assert.ok(!meta.defaultEnabled);
  assert.ok(!isDefaultEnabledDesignMode("retro_print"));
});

test("playful_seasonal is not default-enabled", () => {
  assert.ok(!isDefaultEnabledDesignMode("playful_seasonal"));
});

test("DEFAULT_ENABLED_MODES does not contain retro_print or playful_seasonal", () => {
  assert.ok(!DEFAULT_ENABLED_MODES.includes("retro_print"));
  assert.ok(!DEFAULT_ENABLED_MODES.includes("playful_seasonal"));
});

test("all 9 design modes are defined", () => {
  assert.equal(DESIGN_MODES.length, 9);
});

// ── Planner: basic contract ───────────────────────────────────────────────────

const BASE_INPUT = {
  title: "The Gospel of John",
  scripturePassages: "Gospel of John",
  toneHint: "neutral" as const,
  motifHints: ["light", "water"],
  runSeed: "test-seed-001",
};

test("planner always returns exactly 3 lanes", () => {
  const plan = planDesignModes(BASE_INPUT);
  assert.equal(plan.lanes.length, 3);
  assert.equal(plan.lanes[0].lane, "A");
  assert.equal(plan.lanes[1].lane, "B");
  assert.equal(plan.lanes[2].lane, "C");
});

test("planner returns 3 distinct modes for Gospel of John", () => {
  const plan = planDesignModes(BASE_INPUT);
  const modes = plan.lanes.map((l) => l.mode);
  const distinct = new Set(modes);
  assert.equal(distinct.size, 3, `Expected 3 distinct modes, got: ${modes.join(", ")}`);
  assert.ok(plan.allDistinct);
});

test("planner avoids retro_print by default", () => {
  const plan = planDesignModes(BASE_INPUT);
  const modes = plan.lanes.map((l) => l.mode);
  assert.ok(!modes.includes("retro_print"), `retro_print should not appear: ${modes.join(", ")}`);
});

test("planner is deterministic — same input produces same triad", () => {
  const a = planDesignModes(BASE_INPUT);
  const b = planDesignModes(BASE_INPUT);
  assert.deepEqual(
    a.lanes.map((l) => l.mode),
    b.lanes.map((l) => l.mode)
  );
});

// ── Planner: Gospel of John / whole-book scriptural ──────────────────────────

test("Gospel of John does not default all lanes to cinematic_atmospheric", () => {
  const plan = planDesignModes(BASE_INPUT);
  const cinematicCount = plan.lanes.filter((l) => l.mode === "cinematic_atmospheric").length;
  assert.ok(
    cinematicCount <= 1,
    `Expected ≤1 cinematic_atmospheric lane for Gospel of John, got ${cinematicCount}: ${plan.lanes.map((l) => l.mode).join(", ")}`
  );
});

test("Gospel of John includes at least one of: typography_led, minimal_editorial", () => {
  const plan = planDesignModes(BASE_INPUT);
  const modes = plan.lanes.map((l) => l.mode);
  const hasExpositoryMode = modes.some((m) => m === "typography_led" || m === "minimal_editorial");
  assert.ok(
    hasExpositoryMode,
    `Expected typography_led or minimal_editorial for expository series, got: ${modes.join(", ")}`
  );
});

// ── Planner: seasonal signals ─────────────────────────────────────────────────

test("non-seasonal brief does not include playful_seasonal", () => {
  const plan = planDesignModes({
    title: "Foundations",
    toneHint: "neutral",
    motifHints: ["stone"],
    runSeed: "test-seed-002",
  });
  const modes = plan.lanes.map((l) => l.mode);
  assert.ok(!modes.includes("playful_seasonal"), `playful_seasonal should not appear: ${modes.join(", ")}`);
});

test("seasonal brief can include playful_seasonal", () => {
  const plan = planDesignModes({
    title: "Easter Sunday",
    designNotes: "Easter celebration service",
    toneHint: "vivid",
    motifHints: ["dawn light", "garden"],
    runSeed: "test-seed-003",
  });
  const modes = plan.lanes.map((l) => l.mode);
  assert.ok(
    modes.includes("playful_seasonal"),
    `Expected playful_seasonal for Easter brief, got: ${modes.join(", ")}`
  );
});

// ── Planner: retro_print gate ─────────────────────────────────────────────────

test("retro_print is NOT included even with retro design notes unless allowRetroPrint is set", () => {
  const plan = planDesignModes({
    title: "Messy Church",
    designNotes: "retro vintage poster style risograph print",
    toneHint: "neutral",
    motifHints: [],
    runSeed: "test-seed-004",
  });
  const modes = plan.lanes.map((l) => l.mode);
  assert.ok(!modes.includes("retro_print"), `retro_print should be gated without allowRetroPrint: ${modes.join(", ")}`);
});

test("retro_print is included when allowRetroPrint=true and retro signals present", () => {
  const plan = planDesignModes({
    title: "Messy Church",
    designNotes: "retro vintage poster risograph print style",
    toneHint: "neutral",
    motifHints: [],
    runSeed: "test-seed-005",
    allowRetroPrint: true,
  });
  const modes = plan.lanes.map((l) => l.mode);
  assert.ok(modes.includes("retro_print"), `Expected retro_print with allowRetroPrint=true: ${modes.join(", ")}`);
});

// ── Planner: concrete metaphor series ────────────────────────────────────────

test("concrete metaphor series includes graphic_symbol", () => {
  const plan = planDesignModes({
    title: "The Cross",
    description: "A series centered on the cross and what it means for us",
    toneHint: "dark",
    motifHints: ["stone", "shadow"],
    runSeed: "test-seed-006",
  });
  const modes = plan.lanes.map((l) => l.mode);
  assert.ok(
    modes.includes("graphic_symbol"),
    `Expected graphic_symbol for concrete metaphor brief, got: ${modes.join(", ")}`
  );
});

// ── Planner: summary format ───────────────────────────────────────────────────

test("planner summary has correct A=... B=... C=... format", () => {
  const plan = planDesignModes(BASE_INPUT);
  assert.match(plan.summary, /^A=\S+ B=\S+ C=\S+$/);
});

test("planner scored array contains all evaluated modes with scores", () => {
  const plan = planDesignModes(BASE_INPUT);
  assert.ok(Array.isArray(plan.scored));
  assert.ok(plan.scored.length > 0);
  for (const s of plan.scored) {
    assert.ok(typeof s.score === "number");
    assert.ok(Array.isArray(s.reasons));
    assert.ok(isDesignMode(s.mode));
  }
});

test("planner detectedCharacteristics is an array of strings", () => {
  const plan = planDesignModes(BASE_INPUT);
  assert.ok(Array.isArray(plan.detectedCharacteristics));
  for (const c of plan.detectedCharacteristics) {
    assert.ok(typeof c === "string");
  }
});

test("each lane carries referenceAnchors from the mode metadata", () => {
  const plan = planDesignModes(BASE_INPUT);
  for (const lane of plan.lanes) {
    const meta = getDesignModeMeta(lane.mode);
    assert.deepEqual(lane.referenceAnchors, meta.referenceAnchors);
  }
});

// ── Planner: different seeds produce different triads for neutral brief ────────

test("different seeds can produce different mode ordering", () => {
  const seedA = planDesignModes({ ...BASE_INPUT, runSeed: "seed-alpha-001" });
  const seedB = planDesignModes({ ...BASE_INPUT, runSeed: "seed-beta-999" });
  // Both are valid (3 lanes, distinct, no retro_print) — they may differ in order
  assert.equal(seedA.lanes.length, 3);
  assert.equal(seedB.lanes.length, 3);
  // Determinism check for each seed individually
  const seedA2 = planDesignModes({ ...BASE_INPUT, runSeed: "seed-alpha-001" });
  assert.deepEqual(
    seedA.lanes.map((l) => l.mode),
    seedA2.lanes.map((l) => l.mode)
  );
});
