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
  assert.ok(
    prompt.toLowerCase().includes("text-free") || prompt.toLowerCase().includes("letterform"),
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
