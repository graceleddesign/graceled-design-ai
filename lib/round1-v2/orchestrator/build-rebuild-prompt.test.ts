import assert from "node:assert/strict";
import test from "node:test";
import { buildRebuildPrompt } from "./build-rebuild-prompt";
import { GRAMMAR_KEYS } from "../grammars";

test("rebuild prompt contains motif phrase for single motif", () => {
  const prompt = buildRebuildPrompt({
    grammarKey: "centered_focal_motif",
    tone: "neutral",
    motifBinding: ["hope"],
    negativeHints: [],
  });
  assert.ok(prompt.includes("hope"), `expected 'hope' in: ${prompt}`);
});

test("rebuild prompt contains motif phrase for multiple motifs", () => {
  const prompt = buildRebuildPrompt({
    grammarKey: "horizon_band",
    tone: "dark",
    motifBinding: ["water", "fire"],
    negativeHints: [],
  });
  assert.ok(prompt.includes("water"), `expected 'water' in: ${prompt}`);
  assert.ok(prompt.includes("fire"), `expected 'fire' in: ${prompt}`);
});

test("rebuild prompt falls back gracefully for empty motif binding", () => {
  const prompt = buildRebuildPrompt({
    grammarKey: "layered_atmospheric",
    tone: "light",
    motifBinding: [],
    negativeHints: [],
  });
  assert.ok(prompt.includes("abstract visual theme"), `expected fallback phrase in: ${prompt}`);
});

test("rebuild prompt includes tone description", () => {
  const prompt = buildRebuildPrompt({
    grammarKey: "textural_field",
    tone: "vivid",
    motifBinding: ["flame"],
    negativeHints: [],
  });
  assert.ok(prompt.toLowerCase().includes("vibrant") || prompt.toLowerCase().includes("saturated"),
    `expected vivid tone language in: ${prompt}`);
});

test("rebuild prompt appends negative hints when present", () => {
  const prompt = buildRebuildPrompt({
    grammarKey: "geometric_block_composition",
    tone: "mono",
    motifBinding: ["stone"],
    negativeHints: ["red", "orange"],
  });
  assert.ok(prompt.includes("red"), `expected negative hint 'red' in: ${prompt}`);
  assert.ok(prompt.includes("orange"), `expected negative hint 'orange' in: ${prompt}`);
});

test("rebuild prompt does not append Avoid clause when negativeHints is empty", () => {
  const prompt = buildRebuildPrompt({
    grammarKey: "edge_anchored_motif",
    tone: "neutral",
    motifBinding: ["cross"],
    negativeHints: [],
  });
  assert.ok(!prompt.includes("Avoid:"), `unexpected Avoid clause in: ${prompt}`);
});

test("rebuild prompt always ends with text-free enforcement", () => {
  const prompt = buildRebuildPrompt({
    grammarKey: "centered_focal_motif",
    tone: "dark",
    motifBinding: ["mountain"],
    negativeHints: [],
  });
  const lower = prompt.toLowerCase();
  assert.ok(
    lower.includes("text-free") || lower.includes("letterform") ||
    lower.includes("no readable text") || lower.includes("background plate"),
    `expected text-free enforcement in: ${prompt}`
  );
});

test("rebuild prompt includes quality upgrade language", () => {
  const prompt = buildRebuildPrompt({
    grammarKey: "layered_atmospheric",
    tone: "neutral",
    motifBinding: ["sky"],
    negativeHints: [],
  });
  assert.ok(
    prompt.toLowerCase().includes("ultra") || prompt.toLowerCase().includes("professional") || prompt.toLowerCase().includes("rich"),
    `expected quality language in: ${prompt}`
  );
});

test("rebuild prompt contains STRICT_TEXT_PURGE_BLOCK content", () => {
  const prompt = buildRebuildPrompt({
    grammarKey: "horizon_band",
    tone: "dark",
    motifBinding: ["cross"],
    negativeHints: [],
  });
  const lower = prompt.toLowerCase();
  assert.ok(lower.includes("no readable text"), `expected 'no readable text' in rebuild prompt`);
  assert.ok(lower.includes("background plate"), `expected 'background plate' in rebuild prompt`);
  assert.ok(lower.includes("letterform"), `expected 'letterform' in rebuild prompt`);
});

test("rebuild prompt enforces primary motif clarity", () => {
  const prompt = buildRebuildPrompt({
    grammarKey: "edge_anchored_motif",
    tone: "light",
    motifBinding: ["dawn light", "horizon"],
    negativeHints: [],
  });
  assert.ok(
    prompt.includes("primary motif") || prompt.includes("Primary subject") || prompt.includes("primary subject"),
    `expected primary motif clarity language in: ${prompt.slice(0, 120)}`
  );
  assert.ok(
    prompt.toLowerCase().includes("visually dominant") || prompt.toLowerCase().includes("clearly readable"),
    `expected motif clarity enforcement in rebuild prompt`
  );
});

test("rebuild prompt includes quiet space instruction", () => {
  const prompt = buildRebuildPrompt({
    grammarKey: "centered_focal_motif",
    tone: "neutral",
    motifBinding: ["stone"],
    negativeHints: [],
  });
  const lower = prompt.toLowerCase();
  assert.ok(
    lower.includes("quiet") || lower.includes("calm") || lower.includes("uncluttered"),
    `expected quiet space instruction in rebuild prompt`
  );
  // Must NOT say "for text" — that invites text artifacts
  assert.ok(
    !lower.includes("for text placement") && !lower.includes("for text"),
    `rebuild prompt must not contain 'for text' language`
  );
});

test("geometric_block_composition rebuild includes anti-signage guard", () => {
  const prompt = buildRebuildPrompt({
    grammarKey: "geometric_block_composition",
    tone: "neutral",
    motifBinding: ["cross"],
    negativeHints: [],
  });
  const lower = prompt.toLowerCase();
  assert.ok(
    lower.includes("signage") || lower.includes("poster") || lower.includes("text panel"),
    `expected anti-signage guard in geometric_block_composition rebuild prompt`
  );
});

test("rebuild prompt does NOT contain affirmative poster/title framing language", () => {
  // These are affirmative design-artifact phrases that invite text artifacts.
  const BANNED = [
    "sermon series background art",
    "premium sermon series",
    "for text placement",
    "poster text",
    "title text",
  ];
  for (const key of GRAMMAR_KEYS) {
    const prompt = buildRebuildPrompt({
      grammarKey: key,
      tone: "neutral",
      motifBinding: ["light"],
      negativeHints: [],
    });
    const lower = prompt.toLowerCase();
    for (const banned of BANNED) {
      assert.ok(!lower.includes(banned), `${key}: banned phrase '${banned}' found in rebuild prompt`);
    }
  }
});

test("text-purged rebuild prompt includes correction header", () => {
  const { buildTextPurgedRebuildPrompt } = require("./build-rebuild-prompt");
  const prompt = buildTextPurgedRebuildPrompt({
    grammarKey: "centered_focal_motif",
    tone: "dark",
    motifBinding: ["shadow"],
    negativeHints: [],
  });
  const lower = prompt.toLowerCase();
  assert.ok(lower.includes("correction"), `expected correction header in text-purged prompt`);
  assert.ok(lower.includes("no readable text"), `expected STRICT_TEXT_PURGE_BLOCK in text-purged prompt`);
});

test("all grammar keys produce non-empty rebuild prompts", () => {
  for (const key of GRAMMAR_KEYS) {
    const prompt = buildRebuildPrompt({
      grammarKey: key,
      tone: "neutral",
      motifBinding: ["light"],
      negativeHints: [],
    });
    assert.ok(prompt.length > 50, `prompt too short for grammar ${key}: '${prompt}'`);
  }
});

test("rebuild prompt is distinct from scout prompt", () => {
  // Rebuild template should produce different text than scout template.
  const { buildScoutPrompt } = require("./build-scout-prompt");
  const { GRAMMAR_BANK } = require("../grammars");
  const slot = {
    grammarKey: "centered_focal_motif" as const,
    diversityFamily: GRAMMAR_BANK.centered_focal_motif.diversityFamily,
    tone: "neutral" as const,
    motifBinding: ["light"],
    seed: 1,
    promptSpec: {
      template: GRAMMAR_BANK.centered_focal_motif.scoutPromptTemplate,
      motifBinding: ["light"],
      tone: "neutral" as const,
      negativeHints: [],
    },
  };
  const scoutPrompt = buildScoutPrompt(slot);
  const rebuildPrompt = buildRebuildPrompt({
    grammarKey: "centered_focal_motif",
    tone: "neutral",
    motifBinding: ["light"],
    negativeHints: [],
  });
  assert.notEqual(scoutPrompt, rebuildPrompt, "rebuild prompt should differ from scout prompt");
});
