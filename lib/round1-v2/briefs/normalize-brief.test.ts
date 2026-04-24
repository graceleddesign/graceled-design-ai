import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBrief } from "./normalize-brief";
import type { RawBriefInput } from "./types";

const MINIMAL: RawBriefInput = {
  title: "Rest",
};

test("title is trimmed", () => {
  const result = normalizeBrief({ title: "  Rest  " });
  assert.equal(result.title, "Rest");
});

test("subtitle is null when absent", () => {
  assert.equal(normalizeBrief(MINIMAL).subtitle, null);
});

test("subtitle is null when empty string", () => {
  assert.equal(normalizeBrief({ title: "Rest", subtitle: "  " }).subtitle, null);
});

test("subtitle is preserved when non-empty", () => {
  const result = normalizeBrief({ title: "Rest", subtitle: "A Series" });
  assert.equal(result.subtitle, "A Series");
});

test("scripturePassages is null when absent", () => {
  assert.equal(normalizeBrief(MINIMAL).scripturePassages, null);
});

test("scripturePassages is preserved when provided", () => {
  const result = normalizeBrief({ title: "Rest", scripturePassages: "Psalm 23" });
  assert.equal(result.scripturePassages, "Psalm 23");
});

test("toneTarget defaults to neutral when no toneHint", () => {
  assert.equal(normalizeBrief(MINIMAL).toneTarget, "neutral");
});

test("toneTarget uses toneHint when provided", () => {
  const result = normalizeBrief({ title: "Rest", toneHint: "dark" });
  assert.equal(result.toneTarget, "dark");
});

test("motifs is empty when no motifHints", () => {
  assert.deepEqual(normalizeBrief(MINIMAL).motifs, []);
});

test("motifs are taken from motifHints, trimmed, empty strings filtered", () => {
  const result = normalizeBrief({ title: "Rest", motifHints: ["  fire  ", "", "water"] });
  assert.deepEqual(result.motifs, ["fire", "water"]);
});

test("negativeHints is empty when no avoidColors or extras", () => {
  assert.deepEqual(normalizeBrief(MINIMAL).negativeHints, []);
});

test("negativeHints are extracted from avoidColors comma-split", () => {
  const result = normalizeBrief({ title: "Rest", avoidColors: "red, blue,  green" });
  assert.deepEqual(result.negativeHints, ["red", "blue", "green"]);
});

test("negativeHints include negativeHintExtras", () => {
  const result = normalizeBrief({
    title: "Rest",
    avoidColors: "red",
    negativeHintExtras: ["no doves"],
  });
  assert.deepEqual(result.negativeHints, ["red", "no doves"]);
});

test("styleIntent is null when no designNotes", () => {
  assert.equal(normalizeBrief(MINIMAL).styleIntent, null);
});

test("styleIntent uses designNotes when provided", () => {
  const result = normalizeBrief({ title: "Rest", designNotes: "Modern, minimal" });
  assert.equal(result.styleIntent, "Modern, minimal");
});

test("topicalContext is null when no description", () => {
  assert.equal(normalizeBrief(MINIMAL).topicalContext, null);
});

test("topicalContext uses description when provided", () => {
  const result = normalizeBrief({ title: "Rest", description: "A series on Sabbath." });
  assert.equal(result.topicalContext, "A series on Sabbath.");
});

test("fully populated input round-trips correctly", () => {
  const input: RawBriefInput = {
    title: " Into the Deep ",
    subtitle: " Part One ",
    scripturePassages: "Psalm 42:7",
    description: "A series on depth and surrender.",
    designNotes: "Dark, moody, contemplative",
    avoidColors: "pink, yellow",
    toneHint: "dark",
    motifHints: ["ocean", "depth"],
    negativeHintExtras: ["no fish"],
  };
  const result = normalizeBrief(input);
  assert.equal(result.title, "Into the Deep");
  assert.equal(result.subtitle, "Part One");
  assert.equal(result.scripturePassages, "Psalm 42:7");
  assert.equal(result.toneTarget, "dark");
  assert.deepEqual(result.motifs, ["ocean", "depth"]);
  assert.deepEqual(result.negativeHints, ["pink", "yellow", "no fish"]);
  assert.equal(result.styleIntent, "Dark, moody, contemplative");
  assert.equal(result.topicalContext, "A series on depth and surrender.");
});
