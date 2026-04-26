import assert from "node:assert/strict";
import test from "node:test";
import { planBriefSignals } from "./plan-brief-signals";

// ── Tone inference ────────────────────────────────────────────────────────────

test("neutral fallback when no signal words are present", () => {
  const result = planBriefSignals({
    title: "The Church Series",
    description: "A series on church community.",
  });
  assert.equal(result.toneHint, "neutral");
  assert.equal(result.debug.toneSource, "fallback");
});

test("dark tone inferred from title with 2+ dark signals", () => {
  const result = planBriefSignals({
    title: "Into the Deep",
    description: "A series on faith in the wilderness and shadow of suffering.",
  });
  assert.equal(result.toneHint, "dark");
  assert.ok(
    result.debug.toneSource === "title_keywords" || result.debug.toneSource === "description_keywords",
    `expected title_keywords or description_keywords, got ${result.debug.toneSource}`
  );
});

test("dark tone: single dark word in title does not trigger (threshold=2)", () => {
  const result = planBriefSignals({
    title: "Deep Faith",
    description: "A series on trusting God.",
  });
  // "deep" alone is only 1 signal — should not reach dark threshold
  // result can be neutral (or dark if description also has signal — but this description doesn't)
  // We only assert it doesn't incorrectly fire from title alone when count < 2
  // "deep" = 1 dark signal in title → should stay neutral
  assert.equal(result.toneHint, "neutral", "single dark word in title should not exceed threshold");
});

test("light tone inferred from title", () => {
  const result = planBriefSignals({
    title: "Glory and Light: A Series on Hope",
  });
  assert.equal(result.toneHint, "light");
  assert.equal(result.debug.toneSource, "title_keywords");
  assert.ok(result.debug.toneSignalWords.length >= 2);
});

test("vivid tone inferred from description", () => {
  const result = planBriefSignals({
    title: "Forward",
    description: "A bold celebration of mission and joyful living for God's kingdom.",
  });
  assert.equal(result.toneHint, "vivid");
  assert.equal(result.debug.toneSource, "description_keywords");
});

test("mono tone inferred from title keywords", () => {
  const result = planBriefSignals({
    title: "Ash Wednesday: Quiet Repentance",
    description: "A minimal, contemplative Lenten series on stillness and ashes.",
  });
  assert.equal(result.toneHint, "mono");
});

test("explicit design note overrides title inference", () => {
  // Title suggests light, but designNotes says dark explicitly
  const result = planBriefSignals({
    title: "Glory and Light",
    description: "A series on hope and radiance.",
    designNotes: "Use dark, moody visuals — deep shadows and contrast.",
  });
  assert.equal(result.toneHint, "dark");
  assert.equal(result.debug.toneSource, "explicit_design_note");
});

test("explicit design note with mono wins over title", () => {
  const result = planBriefSignals({
    title: "Fire and Joy",
    description: "A vivid celebration series.",
    designNotes: "Minimal, monochrome aesthetic.",
  });
  assert.equal(result.toneHint, "mono");
  assert.equal(result.debug.toneSource, "explicit_design_note");
});

// ── Motif inference — scripture ───────────────────────────────────────────────

test("Gospel of John produces light/water/vine/bread motifs", () => {
  const result = planBriefSignals({
    title: "The Gospel of John",
    scripturePassages: "Gospel of John",
  });
  assert.ok(result.motifHints.length > 0, "should produce motif hints");
  // Should include at least some canonical John motifs
  const hasJohnMotif =
    result.motifHints.some((m) => ["light", "water", "vine", "bread", "doorway"].includes(m));
  assert.ok(hasJohnMotif, `expected John motifs in ${result.motifHints.join(", ")}`);
  assert.ok(result.debug.motifSources.some((s) => s.includes("john")));
});

test("John 1:1 scripture passage triggers John motifs", () => {
  const result = planBriefSignals({
    title: "In the Beginning",
    scripturePassages: "John 1:1-14",
  });
  const hasJohnMotif =
    result.motifHints.some((m) => ["light", "water", "vine", "bread", "doorway"].includes(m));
  assert.ok(hasJohnMotif, `expected John motifs in ${result.motifHints.join(", ")}`);
});

test("Psalm 23 produces shepherd/still water motifs", () => {
  const result = planBriefSignals({
    title: "The Valley",
    subtitle: "Finding Peace in Psalm 23",
    scripturePassages: "Psalm 23",
  });
  assert.ok(result.motifHints.length > 0);
  const hasPsalmMotif =
    result.motifHints.some((m) => m.includes("shepherd") || m.includes("water") || m.includes("mountain") || m.includes("refuge"));
  assert.ok(hasPsalmMotif, `expected psalm motifs in ${result.motifHints.join(", ")}`);
});

test("Ruth scripture produces grain/harvest/redemption motifs", () => {
  const result = planBriefSignals({
    title: "Ruth: A Story of Redemption",
    scripturePassages: "Ruth",
  });
  const hasRuthMotif =
    result.motifHints.some((m) => m.includes("grain") || m.includes("harvest") || m.includes("redemption") || m.includes("field"));
  assert.ok(hasRuthMotif, `expected Ruth motifs in ${result.motifHints.join(", ")}`);
});

test("Advent title produces candle/dawn/waiting motifs", () => {
  const result = planBriefSignals({
    title: "Advent: Waiting for Light",
    subtitle: "A Four-Sunday Advent Series",
  });
  assert.ok(result.motifHints.length > 0, "should produce motif hints for Advent");
  const hasAdventMotif =
    result.motifHints.some((m) => m.includes("candle") || m.includes("dawn") || m.includes("light") || m.includes("waiting") || m.includes("star"));
  assert.ok(hasAdventMotif, `expected Advent motifs in ${result.motifHints.join(", ")}`);
});

// ── Motif inference — keywords ────────────────────────────────────────────────

test("Into the Deep title produces depth/water motifs", () => {
  const result = planBriefSignals({
    title: "Into the Deep",
    description: "An exploration of faith in uncertainty and deep waters.",
  });
  const hasDepthMotif =
    result.motifHints.some((m) => m.includes("water") || m.includes("deep") || m.includes("depth") || m.includes("ocean"));
  assert.ok(hasDepthMotif, `expected depth/water motifs in ${result.motifHints.join(", ")}`);
});

test("Rest/Sabbath title produces stillness/water motifs", () => {
  const result = planBriefSignals({
    title: "Rest",
    description: "A series on Sabbath and trusting God in quiet.",
  });
  const hasRestMotif =
    result.motifHints.some((m) => m.includes("stillness") || m.includes("water") || m.includes("horizon"));
  assert.ok(hasRestMotif, `expected rest/stillness motifs in ${result.motifHints.join(", ")}`);
});

test("Generosity title produces open hands/grain/abundance motifs", () => {
  const result = planBriefSignals({
    title: "Generosity: A Four-Week Series on Giving",
  });
  const hasGenMotif =
    result.motifHints.some((m) => m.includes("hands") || m.includes("grain") || m.includes("abundance"));
  assert.ok(hasGenMotif, `expected generosity motifs in ${result.motifHints.join(", ")}`);
});

test("Back to Basics title produces foundation/roots/stone motifs", () => {
  const result = planBriefSignals({
    title: "Back to Basics",
    description: "Returning to the core foundations of Christian faith.",
  });
  const hasFoundationMotif =
    result.motifHints.some((m) => m.includes("stone") || m.includes("roots") || m.includes("foundation") || m.includes("ground"));
  assert.ok(hasFoundationMotif, `expected foundation motifs in ${result.motifHints.join(", ")}`);
});

// ── Planner caps ──────────────────────────────────────────────────────────────

test("motifHints are capped at 4", () => {
  const result = planBriefSignals({
    title: "Resurrection: Light and New Life",
    subtitle: "A series on the risen Christ",
    scripturePassages: "John 20, Psalm 23",
    description: "Deep exploration of resurrection, hope, light, and the shepherd who leads us.",
  });
  assert.ok(result.motifHints.length <= 4, `expected ≤4 motifs, got ${result.motifHints.length}: ${result.motifHints.join(", ")}`);
});

test("empty input returns neutral tone and no motifs", () => {
  const result = planBriefSignals({ title: "" });
  assert.equal(result.toneHint, "neutral");
  assert.equal(result.motifHints.length, 0);
  assert.equal(result.debug.toneSource, "fallback");
});

test("no motif duplicates in output", () => {
  const result = planBriefSignals({
    title: "Into the Deep",
    description: "A series on deep water and ocean depth and depth of faith.",
    scripturePassages: "Psalm 23",
  });
  const unique = new Set(result.motifHints);
  assert.equal(unique.size, result.motifHints.length, `duplicate motifs: ${result.motifHints.join(", ")}`);
});

// ── "Into the Deep" fixture gets dark, not neutral ───────────────────────────

test("Into the Deep with dark description gets dark tone", () => {
  const result = planBriefSignals({
    title: "Into the Deep",
    description: "An exploration of faith in uncertainty, depth, surrender, and shadow. A series on the wilderness and suffering.",
  });
  assert.equal(result.toneHint, "dark",
    `expected dark, got ${result.toneHint} (signals: ${result.debug.toneSignalWords.join(",")})`);
});

// ── Psalm 23 fixture gets dark tone (valley/shadow) ─────────────────────────

test("The Valley — Psalm 23 — gets dark tone", () => {
  const result = planBriefSignals({
    title: "The Valley: Finding Peace in Psalm 23",
    subtitle: "Even Here",
    scripturePassages: "Psalm 23",
    description: "A journey through suffering, shadow, and the shepherd's comfort.",
  });
  assert.equal(result.toneHint, "dark",
    `expected dark, got ${result.toneHint}`);
});
