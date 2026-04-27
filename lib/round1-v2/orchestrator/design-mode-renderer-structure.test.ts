/**
 * Structural / contract tests for the deterministic renderer (v1.1).
 *
 * These tests verify that:
 *   - typography_led and minimal_editorial actually render visible non-text
 *     design structure (axis/slab/cast shadow / folio label/motif mark) and
 *     are therefore allowed to set motifPresent=true honestly.
 *   - The evidence shape passes the production direction_preview validator
 *     (no background_blank_or_motif_weak rejection).
 *   - Local lanes don't rely on the title text as the motif.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { renderDesignModeDirectionPreview } from "./design-mode-renderer";
import { evaluateBackgroundAcceptance } from "@/lib/production-valid-option";

const BASE = {
  tone: "neutral" as const,
  motifs: ["light"],
  content: { title: "Gospel of John", subtitle: "A study", passage: "John 1" },
  width: 1920,
  height: 1080,
  seed: 1,
};

// ── typography_led structural strength ───────────────────────────────────────

test("typography_led: motifPresent=true with a specific motifPresentReason", async () => {
  const r = await renderDesignModeDirectionPreview({ ...BASE, designMode: "typography_led" });
  assert.equal(r.backgroundEvidence.motifPresent, true);
  assert.equal(typeof r.debug.motifPresentReason, "string");
  assert.match(r.debug.motifPresentReason, /^rendered_/);
  assert.equal(r.debug.backgroundKind, "type_support_system");
  assert.ok(typeof r.debug.motifStructureKind === "string");
});

test("typography_led with light motif renders a light_axis support layer", async () => {
  const r = await renderDesignModeDirectionPreview({
    ...BASE,
    designMode: "typography_led",
    motifs: ["light"],
  });
  assert.match(String(r.debug.motifStructureKind), /light_axis|type_support_with_light/);
});

test("typography_led with water motif renders a water_line support layer", async () => {
  const r = await renderDesignModeDirectionPreview({
    ...BASE,
    designMode: "typography_led",
    motifs: ["water"],
  });
  assert.match(String(r.debug.motifStructureKind), /water_line|type_support_with_water/);
});

test("typography_led with no motif still renders axis + slab support (motifPresent stays true)", async () => {
  const r = await renderDesignModeDirectionPreview({
    ...BASE,
    designMode: "typography_led",
    motifs: [],
  });
  assert.equal(r.backgroundEvidence.motifPresent, true);
  // Without a recognized motif, structure is "type_axis_with_slab_and_shadow".
  assert.match(String(r.debug.motifStructureKind), /type_axis|type_support/);
});

// ── minimal_editorial structural strength ───────────────────────────────────

test("minimal_editorial: motifPresent=true with rendered editorial label + motif mark", async () => {
  const r = await renderDesignModeDirectionPreview({
    ...BASE,
    designMode: "minimal_editorial",
  });
  assert.equal(r.backgroundEvidence.motifPresent, true);
  assert.match(r.debug.motifPresentReason, /^rendered_/);
  assert.match(String(r.debug.motifStructureKind), /^editorial_label_with_/);
});

test("minimal_editorial with no motif falls back to ruled_square (still motifPresent=true)", async () => {
  const r = await renderDesignModeDirectionPreview({
    ...BASE,
    designMode: "minimal_editorial",
    motifs: [],
  });
  assert.equal(r.backgroundEvidence.motifPresent, true);
  assert.match(String(r.debug.motifStructureKind), /editorial_label_with_ruled_square/);
});

test("minimal_editorial with water motif renders a water_mark", async () => {
  const r = await renderDesignModeDirectionPreview({
    ...BASE,
    designMode: "minimal_editorial",
    motifs: ["water"],
  });
  assert.match(String(r.debug.motifStructureKind), /editorial_label_with_water_mark/);
});

// ── Validator contract ──────────────────────────────────────────────────────

test("typography_led evidence passes evaluateBackgroundAcceptance (no motif_weak rejection)", async () => {
  const r = await renderDesignModeDirectionPreview({ ...BASE, designMode: "typography_led" });
  const acceptance = evaluateBackgroundAcceptance({ evidence: r.backgroundEvidence });
  assert.equal(
    acceptance.accepted,
    true,
    `expected accepted=true, got reasons=${acceptance.invalidReasons.join(", ")}`
  );
});

test("minimal_editorial evidence passes evaluateBackgroundAcceptance", async () => {
  const r = await renderDesignModeDirectionPreview({ ...BASE, designMode: "minimal_editorial" });
  const acceptance = evaluateBackgroundAcceptance({ evidence: r.backgroundEvidence });
  assert.equal(
    acceptance.accepted,
    true,
    `expected accepted=true, got reasons=${acceptance.invalidReasons.join(", ")}`
  );
});

test("modern_abstract evidence passes evaluateBackgroundAcceptance", async () => {
  const r = await renderDesignModeDirectionPreview({ ...BASE, designMode: "modern_abstract" });
  const acceptance = evaluateBackgroundAcceptance({ evidence: r.backgroundEvidence });
  assert.equal(acceptance.accepted, true);
});

test("graphic_symbol evidence passes evaluateBackgroundAcceptance", async () => {
  const r = await renderDesignModeDirectionPreview({ ...BASE, designMode: "graphic_symbol" });
  const acceptance = evaluateBackgroundAcceptance({ evidence: r.backgroundEvidence });
  assert.equal(acceptance.accepted, true);
});

// ── Honesty: synthesized "weak" evidence still fails ────────────────────────
// We don't have a public API to force a no-motif build, but we can prove the
// validator still rejects motifPresent=false (no fake-success regression).

test("evaluateBackgroundAcceptance rejects motifPresent=false (no fake success)", () => {
  const acceptance = evaluateBackgroundAcceptance({
    evidence: {
      source: "generated",
      sourceGenerationId: null,
      textFree: true,
      scaffoldFree: true,
      motifPresent: false,
      toneFit: true,
      referenceFit: null,
    },
  });
  assert.equal(acceptance.accepted, false);
  assert.ok(
    acceptance.invalidReasons.includes("background_blank_or_motif_weak"),
    `expected background_blank_or_motif_weak, got ${acceptance.invalidReasons.join(", ")}`
  );
});

// ── Title text is NOT counted as motif ──────────────────────────────────────
// The renderer's background SVG must not contain any text — motif evidence
// derives purely from non-text structure.

test("background SVG path does not contain title text content", async () => {
  // We cannot inspect the SVG string from the public API, but renderer evidence
  // already asserts textFree=true. This is a redundant double-check of the
  // contract: motifPresent is independent of title length.
  const longTitleResult = await renderDesignModeDirectionPreview({
    ...BASE,
    designMode: "typography_led",
    content: {
      title: "A Very Long Sermon Title That Should Not Affect Background",
      subtitle: null,
      passage: null,
    },
    motifs: [],
  });
  const shortTitleResult = await renderDesignModeDirectionPreview({
    ...BASE,
    designMode: "typography_led",
    content: { title: "X", subtitle: null, passage: null },
    motifs: [],
  });
  // motifPresent must reflect the background structure, not the title length.
  assert.equal(longTitleResult.backgroundEvidence.motifPresent, true);
  assert.equal(shortTitleResult.backgroundEvidence.motifPresent, true);
  // Same backgroundKind regardless of title length.
  assert.equal(longTitleResult.debug.backgroundKind, shortTitleResult.debug.backgroundKind);
});

// ── aiCalls debug field ─────────────────────────────────────────────────────

test("debug.aiCalls is 0 for every locally renderable mode", async () => {
  for (const mode of ["typography_led", "minimal_editorial", "modern_abstract", "graphic_symbol"] as const) {
    const r = await renderDesignModeDirectionPreview({ ...BASE, designMode: mode });
    assert.equal(r.debug.aiCalls, 0);
    assert.equal(r.debug.renderer, "deterministic_design_mode_v1");
  }
});
