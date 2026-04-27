import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDesignModePromptDirective,
  buildDesignModeNegativeDirective,
} from "./design-mode-prompt-directives";
import { buildScoutPrompt } from "./build-scout-prompt";
import { buildRebuildPrompt, buildTextPurgedRebuildPrompt } from "./build-rebuild-prompt";
import type { ScoutSlot } from "./build-scout-plan";
import type { DesignMode } from "../design-modes";
import { DESIGN_MODES } from "../design-modes";
import { GRAMMAR_BANK } from "../grammars";

const ALL_DEFAULT_MODES: DesignMode[] = [
  "typography_led",
  "graphic_symbol",
  "photo_composite",
  "cinematic_atmospheric",
  "minimal_editorial",
  "modern_abstract",
  "illustrative_collage",
  "playful_seasonal",
  "retro_print",
];

const BASE_SLOT: ScoutSlot = {
  grammarKey: "centered_focal_motif",
  diversityFamily: GRAMMAR_BANK.centered_focal_motif.diversityFamily,
  tone: "neutral",
  motifBinding: ["light"],
  seed: 1234,
  promptSpec: {
    template: GRAMMAR_BANK.centered_focal_motif.scoutPromptTemplate,
    motifBinding: ["light"],
    tone: "neutral",
    negativeHints: [],
  },
};

// ── Directive helper tests ────────────────────────────────────────────────────

test("buildDesignModePromptDirective returns non-empty string for every DesignMode", () => {
  for (const mode of DESIGN_MODES) {
    const directive = buildDesignModePromptDirective(mode);
    assert.ok(typeof directive === "string");
    assert.ok(directive.length > 30, `directive for ${mode} too short`);
  }
});

test("typography_led directive does NOT ask the image model to render text", () => {
  const directive = buildDesignModePromptDirective("typography_led");
  // Must steer toward background plate, not toward rendering type
  assert.match(directive, /typography system|typography will live/i);
  assert.doesNotMatch(directive, /\brender (?:text|typography|type|words|letters)\b/i);
  assert.doesNotMatch(directive, /\b(write|spell|inscribe|letter\s)/i);
});

test("graphic_symbol directive uses graphic/symbol/vector language and avoids photo-first language", () => {
  const directive = buildDesignModePromptDirective("graphic_symbol");
  assert.match(directive, /graphic|symbol|mark|vector|icon|badge|shape/i);
  // Should explicitly steer away from stock photo realism
  assert.match(directive, /no stock-photo|photographic realism|flat or near-flat/i);
});

test("cinematic_atmospheric directive remains close to existing cinematic language", () => {
  const directive = buildDesignModePromptDirective("cinematic_atmospheric");
  assert.match(directive, /cinematic|atmospher/i);
  assert.match(directive, /focal|composed|quiet zone/i);
});

test("minimal_editorial directive enforces restraint and avoids clutter", () => {
  const directive = buildDesignModePromptDirective("minimal_editorial");
  assert.match(directive, /restraint|whitespace|quiet|minimal|fine/i);
  assert.match(directive, /no.*clutter|no.*scen|no.*illustration/i);
});

test("playful_seasonal directive includes celebratory energy and forbids clipart", () => {
  const directive = buildDesignModePromptDirective("playful_seasonal");
  assert.match(directive, /playful|celebratory|bold color|energy/i);
  assert.match(directive, /no.*clipart|cheesy/i);
});

test("buildDesignModeNegativeDirective returns non-empty for every default mode", () => {
  for (const mode of ALL_DEFAULT_MODES) {
    const neg = buildDesignModeNegativeDirective(mode);
    assert.ok(typeof neg === "string");
    assert.ok(neg.length > 0, `negative directive for ${mode} unexpectedly empty`);
  }
});

// ── Scout prompt integration ─────────────────────────────────────────────────

test("scout prompt includes mode-specific directive when designMode is supplied", () => {
  for (const mode of ALL_DEFAULT_MODES) {
    const prompt = buildScoutPrompt(BASE_SLOT, mode);
    const directive = buildDesignModePromptDirective(mode);
    // Use the first 40 characters of the directive as a unique-enough probe
    const probe = directive.slice(0, 40);
    assert.ok(
      prompt.includes(probe),
      `scout prompt for mode=${mode} missing directive probe: ${probe}`
    );
  }
});

test("scout prompt without designMode is unchanged from prior behavior shape", () => {
  const promptNoMode = buildScoutPrompt(BASE_SLOT);
  const promptWithMode = buildScoutPrompt(BASE_SLOT, "typography_led");
  assert.notEqual(promptNoMode, promptWithMode);
  // The no-mode prompt must still end with the strict text-purge block
  assert.match(promptNoMode, /no readable text|no letters|signage|do not render typography/i);
});

test("typography_led scout prompt does not instruct model to render text", () => {
  const prompt = buildScoutPrompt(BASE_SLOT, "typography_led");
  // Strict text-purge block must still be present (anti-text safety)
  assert.match(prompt, /no readable text|no letters|signage|do not render typography/i);
  // Must not contain affirmative render-text instructions. The strict block already
  // contains "Do not render typography" — only catch positive imperatives.
  assert.doesNotMatch(prompt, /\b(spell out|write the word|write the title|inscribe the)\b/i);
  // The directive must talk about typography as something the *compositor* will lay,
  // not something the image model should produce.
  assert.match(prompt, /typography will live|typography system|support a dominant typography/i);
});

test("graphic_symbol scout prompt avoids scenic/photo-first framing", () => {
  const prompt = buildScoutPrompt(BASE_SLOT, "graphic_symbol");
  assert.match(prompt, /graphic|symbol|mark|vector|icon|badge|shape/i);
  // Negative directive should append photo/clipart avoidance
  assert.match(prompt, /stock photography|photorealistic scenery|clipart/i);
});

// ── Rebuild prompt integration ───────────────────────────────────────────────

test("rebuild prompt includes mode-specific directive when designMode is supplied", () => {
  for (const mode of ALL_DEFAULT_MODES) {
    const prompt = buildRebuildPrompt({
      grammarKey: "centered_focal_motif",
      tone: "neutral",
      motifBinding: ["light"],
      negativeHints: [],
      designMode: mode,
    });
    const probe = buildDesignModePromptDirective(mode).slice(0, 40);
    assert.ok(
      prompt.includes(probe),
      `rebuild prompt for mode=${mode} missing directive probe: ${probe}`
    );
  }
});

test("rebuild prompt without designMode keeps strict text-purge enforcement", () => {
  const prompt = buildRebuildPrompt({
    grammarKey: "centered_focal_motif",
    tone: "neutral",
    motifBinding: ["light"],
    negativeHints: [],
  });
  assert.match(prompt, /no readable text|no letters|signage|do not render typography/i);
});

test("text-purged rebuild prompt also accepts and uses designMode", () => {
  const prompt = buildTextPurgedRebuildPrompt({
    grammarKey: "centered_focal_motif",
    tone: "neutral",
    motifBinding: ["light"],
    negativeHints: [],
    designMode: "graphic_symbol",
  });
  assert.match(prompt, /CORRECTION/);
  assert.ok(prompt.includes(buildDesignModePromptDirective("graphic_symbol").slice(0, 40)));
});
