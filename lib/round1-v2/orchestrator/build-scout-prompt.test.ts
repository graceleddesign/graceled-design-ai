import assert from "node:assert/strict";
import test from "node:test";
import { GRAMMAR_BANK, GRAMMAR_KEYS, TONAL_VARIANTS } from "../grammars";
import { buildScoutPlan } from "./build-scout-plan";
import { buildScoutPrompt, TONE_DESCRIPTIONS } from "./build-scout-prompt";
import type { ScoutSlot } from "./build-scout-plan";

// Build a minimal slot for a given grammar key
function makeSlot(grammarKey: (typeof GRAMMAR_KEYS)[number], overrides?: Partial<ScoutSlot>): ScoutSlot {
  const grammar = GRAMMAR_BANK[grammarKey];
  return {
    grammarKey,
    diversityFamily: grammar.diversityFamily,
    tone: "neutral",
    motifBinding: ["fire"],
    seed: 12345,
    promptSpec: {
      template: grammar.scoutPromptTemplate,
      motifBinding: ["fire"],
      tone: "neutral",
      negativeHints: [],
    },
    ...overrides,
  };
}

test("TONE_DESCRIPTIONS has an entry for every tonal variant", () => {
  for (const tone of TONAL_VARIANTS) {
    assert.ok(TONE_DESCRIPTIONS[tone], `missing tone description for: ${tone}`);
    assert.ok(TONE_DESCRIPTIONS[tone].length > 5, `tone description too short for: ${tone}`);
  }
});

test("buildScoutPrompt returns a non-empty string", () => {
  const slot = makeSlot("centered_focal_motif");
  const prompt = buildScoutPrompt(slot);
  assert.ok(typeof prompt === "string" && prompt.length > 0);
});

test("{motif} placeholder is replaced in prompt", () => {
  const slot = makeSlot("centered_focal_motif");
  const prompt = buildScoutPrompt(slot);
  assert.ok(!prompt.includes("{motif}"), "literal {motif} found in prompt output");
  assert.ok(prompt.includes("fire"), "motif binding 'fire' not found in prompt");
});

test("{tone} placeholder is replaced in prompt", () => {
  const slot = makeSlot("centered_focal_motif", { tone: "dark" });
  const prompt = buildScoutPrompt(slot);
  assert.ok(!prompt.includes("{tone}"), "literal {tone} found in prompt output");
  assert.ok(prompt.includes("dark"), "tone description not reflected in prompt");
});

test("prompt contains text-free enforcement language", () => {
  for (const key of GRAMMAR_KEYS) {
    const slot = makeSlot(key);
    const prompt = buildScoutPrompt(slot);
    const lower = prompt.toLowerCase();
    assert.ok(
      lower.includes("no text") || lower.includes("text-free") || lower.includes("no letter") ||
      lower.includes("no readable") || lower.includes("background plate"),
      `${key}: no text-free enforcement language found in prompt`
    );
  }
});

test("prompt contains STRICT_TEXT_PURGE_BLOCK content", () => {
  const slot = makeSlot("centered_focal_motif");
  const prompt = buildScoutPrompt(slot);
  const lower = prompt.toLowerCase();
  // STRICT_TEXT_PURGE_BLOCK must be present — check for its distinctive phrases
  assert.ok(lower.includes("no readable text"), `expected 'no readable text' in prompt`);
  assert.ok(lower.includes("background plate"), `expected 'background plate' in prompt`);
  assert.ok(lower.includes("letterform"), `expected 'letterform' in prompt`);
});

test("prompt contains motif anchoring with primary motif language", () => {
  const slot = makeSlot("centered_focal_motif", {
    motifBinding: ["cross", "light"],
    promptSpec: {
      template: GRAMMAR_BANK["centered_focal_motif"].scoutPromptTemplate,
      motifBinding: ["cross", "light"],
      tone: "neutral",
      negativeHints: [],
    },
  });
  const prompt = buildScoutPrompt(slot);
  assert.ok(prompt.includes("Primary motif:"), `expected 'Primary motif:' in prompt`);
  assert.ok(prompt.includes("cross"), `expected primary motif 'cross' in anchoring`);
  assert.ok(prompt.includes("Supporting elements:"), `expected 'Supporting elements:' for secondary motif`);
  assert.ok(prompt.includes("light"), `expected supporting motif 'light' in prompt`);
});

test("single motif: primary anchor present, no Supporting elements line", () => {
  const slot = makeSlot("horizon_band", {
    motifBinding: ["water"],
    promptSpec: {
      template: GRAMMAR_BANK["horizon_band"].scoutPromptTemplate,
      motifBinding: ["water"],
      tone: "neutral",
      negativeHints: [],
    },
  });
  const prompt = buildScoutPrompt(slot);
  assert.ok(prompt.includes("Primary motif:"), `expected 'Primary motif:' in prompt`);
  assert.ok(!prompt.includes("Supporting elements:"), `unexpected 'Supporting elements:' for single motif`);
});

test("prompt does NOT contain affirmative poster/title/cover design language", () => {
  // These are phrases that invite the model to produce a poster-style design.
  // "poster" and "sign" appearing in negations ("no poster", "no signage") are fine.
  const BANNED_PHRASES = [
    "sermon series background art",
    "premium sermon series",
    "flyer",
    "title card",
    "headline",
    "design with text",
  ];
  for (const key of GRAMMAR_KEYS) {
    const slot = makeSlot(key);
    const prompt = buildScoutPrompt(slot);
    const lower = prompt.toLowerCase();
    for (const banned of BANNED_PHRASES) {
      assert.ok(
        !lower.includes(banned),
        `${key}: banned phrase '${banned}' found in prompt: ${prompt.slice(0, 120)}`
      );
    }
  }
});

test("geometric_block_composition includes anti-signage guard", () => {
  const slot = makeSlot("geometric_block_composition");
  const prompt = buildScoutPrompt(slot);
  const lower = prompt.toLowerCase();
  assert.ok(
    lower.includes("signage") || lower.includes("poster") || lower.includes("text panel"),
    `expected anti-signage guard in geometric_block_composition prompt`
  );
});

test("prompts include cinematic background plate framing", () => {
  for (const key of GRAMMAR_KEYS) {
    const slot = makeSlot(key);
    const prompt = buildScoutPrompt(slot);
    assert.ok(
      prompt.toLowerCase().includes("cinematic") || prompt.toLowerCase().includes("background plate"),
      `${key}: expected cinematic background plate framing`
    );
  }
});

test("all six grammar keys produce valid, non-empty prompts", () => {
  for (const key of GRAMMAR_KEYS) {
    const slot = makeSlot(key);
    const prompt = buildScoutPrompt(slot);
    assert.ok(prompt.length > 30, `${key}: prompt too short (${prompt.length} chars)`);
    assert.ok(!prompt.includes("{motif}"), `${key}: unreplaced {motif} in prompt`);
    assert.ok(!prompt.includes("{tone}"), `${key}: unreplaced {tone} in prompt`);
  }
});

test("empty motifBinding produces abstract phrase instead of empty string", () => {
  const slot = makeSlot("layered_atmospheric", {
    motifBinding: [],
    promptSpec: {
      template: GRAMMAR_BANK["layered_atmospheric"].scoutPromptTemplate,
      motifBinding: [],
      tone: "neutral",
      negativeHints: [],
    },
  });
  const prompt = buildScoutPrompt(slot);
  assert.ok(!prompt.includes("{motif}"), "literal {motif} found");
  assert.ok(prompt.length > 20, "prompt too short with empty motifs");
});

test("multiple motifBinding entries are joined naturally", () => {
  const slot = makeSlot("horizon_band", {
    motifBinding: ["water", "stone", "light"],
    promptSpec: {
      template: GRAMMAR_BANK["horizon_band"].scoutPromptTemplate,
      motifBinding: ["water", "stone", "light"],
      tone: "neutral",
      negativeHints: [],
    },
  });
  const prompt = buildScoutPrompt(slot);
  assert.ok(prompt.includes("water"), "first motif missing");
  assert.ok(prompt.includes("light"), "last motif missing");
});

test("negativeHints are appended to the prompt when present", () => {
  const slot = makeSlot("centered_focal_motif", {
    promptSpec: {
      template: GRAMMAR_BANK["centered_focal_motif"].scoutPromptTemplate,
      motifBinding: ["fire"],
      tone: "neutral",
      negativeHints: ["red tones", "crosses"],
    },
  });
  const prompt = buildScoutPrompt(slot);
  assert.ok(prompt.includes("red tones"), "negativeHint 'red tones' not in prompt");
  assert.ok(prompt.includes("crosses"), "negativeHint 'crosses' not in prompt");
});

test("prompt builder integration — buildScoutPlan slot → valid prompt for every fixture tone", () => {
  for (const tone of TONAL_VARIANTS) {
    const plan = buildScoutPlan({
      runSeed: `tone-test-${tone}`,
      tone,
      motifs: ["light", "cross"],
      negativeHints: [],
    });
    for (const slot of plan.slots) {
      const prompt = buildScoutPrompt(slot);
      assert.ok(prompt.length > 30, `${tone}/${slot.grammarKey}: prompt too short`);
      assert.ok(!prompt.includes("{motif}"), `${tone}/${slot.grammarKey}: unreplaced {motif}`);
      assert.ok(!prompt.includes("{tone}"), `${tone}/${slot.grammarKey}: unreplaced {tone}`);
    }
  }
});

test("run-scout-batch with stub provider completes all slots", async () => {
  const { runScoutBatch } = await import("./run-scout-batch");
  const { buildScoutPlan } = await import("./build-scout-plan");

  const plan = buildScoutPlan({
    runSeed: "batch-stub-test",
    tone: "neutral",
    motifs: ["light"],
    negativeHints: [],
    count: 3,
  });

  let callCount = 0;
  const stubProvider = {
    id: "stub",
    async generate() {
      callCount++;
      return {
        imageBytes: Buffer.from("fake-image"),
        latencyMs: 10,
        providerModel: "stub",
        seed: 1,
      };
    },
  };

  const result = await runScoutBatch(plan, stubProvider);
  assert.equal(result.results.length, 3);
  assert.equal(result.successCount, 3);
  assert.equal(result.failureCount, 0);
  assert.equal(callCount, 3);
});

test("run-scout-batch records failures without throwing", async () => {
  const { runScoutBatch } = await import("./run-scout-batch");
  const { buildScoutPlan } = await import("./build-scout-plan");

  const plan = buildScoutPlan({
    runSeed: "batch-fail-test",
    tone: "dark",
    motifs: [],
    negativeHints: [],
    count: 2,
  });

  const failProvider = {
    id: "fail-stub",
    async generate(): Promise<never> {
      throw new Error("provider-exploded");
    },
  };

  const result = await runScoutBatch(plan, failProvider);
  assert.equal(result.failureCount, 2);
  assert.equal(result.successCount, 0);
  for (const r of result.results) {
    assert.equal(r.status, "failed");
    assert.ok(r.error?.includes("provider-exploded"));
  }
});
