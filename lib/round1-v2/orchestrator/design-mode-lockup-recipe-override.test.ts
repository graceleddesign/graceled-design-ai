import assert from "node:assert/strict";
import test from "node:test";
import {
  getDesignModeLockupRecipeOverride,
  shouldSuppressAutoScrim,
} from "./design-mode-lockup-recipes";

// ── Visible scale guarantees ─────────────────────────────────────────────────

test("typography_led titleScale is significantly larger than cinematic_atmospheric", () => {
  const typo = getDesignModeLockupRecipeOverride("typography_led");
  const cine = getDesignModeLockupRecipeOverride("cinematic_atmospheric");
  // Expect at least ~1.8x difference in titleScale to be visible to the eye.
  assert.ok(
    typo.hierarchy.titleScale >= cine.hierarchy.titleScale * 1.8,
    `expected typography_led (${typo.hierarchy.titleScale}) >= 1.8 * cinematic (${cine.hierarchy.titleScale})`
  );
});

test("typography_led wide titleSizeClamp.maxPx is much larger than cinematic_atmospheric", () => {
  const typo = getDesignModeLockupRecipeOverride("typography_led");
  const cine = getDesignModeLockupRecipeOverride("cinematic_atmospheric");
  const typoMax = typo.titleSizeClamp?.wide?.maxPx ?? 0;
  const cineMax = cine.titleSizeClamp?.wide?.maxPx ?? 0;
  assert.ok(
    typoMax >= cineMax * 2,
    `expected typography_led wide maxPx (${typoMax}) >= 2 * cinematic (${cineMax})`
  );
});

test("typography_led titleScale at the schema maximum (2.5)", () => {
  const typo = getDesignModeLockupRecipeOverride("typography_led");
  assert.equal(typo.hierarchy.titleScale, 2.5);
});

test("minimal_editorial titleScale is small/refined (<= 1.1)", () => {
  const r = getDesignModeLockupRecipeOverride("minimal_editorial");
  assert.ok(
    r.hierarchy.titleScale <= 1.1,
    `expected minimal_editorial titleScale <= 1.1, got ${r.hierarchy.titleScale}`
  );
});

test("minimal_editorial wide titleSizeClamp.maxPx is small (<=110)", () => {
  const r = getDesignModeLockupRecipeOverride("minimal_editorial");
  const maxPx = r.titleSizeClamp?.wide?.maxPx ?? 9999;
  assert.ok(maxPx <= 110, `expected minimal_editorial wide maxPx <= 110, got ${maxPx}`);
});

test("minimal_editorial includes a rule/frame ornament", () => {
  const r = getDesignModeLockupRecipeOverride("minimal_editorial");
  assert.ok(r.ornament);
  assert.match(r.ornament!.kind, /rule_dot|frame/);
});

test("typography_led, minimal_editorial, cinematic_atmospheric have distinct alignments or anchors", () => {
  const typo = getDesignModeLockupRecipeOverride("typography_led");
  const min = getDesignModeLockupRecipeOverride("minimal_editorial");
  const cine = getDesignModeLockupRecipeOverride("cinematic_atmospheric");
  const sigs = new Set([
    `${typo.alignment}|${typo.placement.anchor}|${typo.titleTreatment}`,
    `${min.alignment}|${min.placement.anchor}|${min.titleTreatment}`,
    `${cine.alignment}|${cine.placement.anchor}|${cine.titleTreatment}`,
  ]);
  assert.equal(sigs.size, 3, `expected 3 distinct alignment/anchor/treatment sigs, got ${[...sigs].join(" / ")}`);
});

// ── Scrim suppression ─────────────────────────────────────────────────────────

test("typography_led suppresses auto scrim", () => {
  assert.equal(shouldSuppressAutoScrim("typography_led"), true);
});

test("minimal_editorial suppresses auto scrim", () => {
  assert.equal(shouldSuppressAutoScrim("minimal_editorial"), true);
});

test("cinematic_atmospheric does NOT suppress auto scrim (preserves baseline)", () => {
  assert.equal(shouldSuppressAutoScrim("cinematic_atmospheric"), false);
});

test("graphic_symbol, modern_abstract, photo_composite do not suppress scrim by default", () => {
  for (const mode of ["graphic_symbol", "modern_abstract", "photo_composite"] as const) {
    assert.equal(shouldSuppressAutoScrim(mode), false);
  }
});
