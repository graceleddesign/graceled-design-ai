import assert from "node:assert/strict";
import test from "node:test";
import { getDesignModeLockupRecipe } from "./design-mode-lockup-recipes";
import { DESIGN_MODES, type DesignMode } from "../design-modes";

test("recipe is defined for every DesignMode", () => {
  for (const mode of DESIGN_MODES) {
    const recipe = getDesignModeLockupRecipe(mode);
    assert.ok(recipe);
    assert.ok(typeof recipe.lockupPresetId === "string" && recipe.lockupPresetId.length > 0);
    assert.ok(["left", "center", "right"].includes(recipe.align));
    assert.ok(recipe.label.length > 0);
  }
});

test("typography_led recipe is title-dominant", () => {
  const recipe = getDesignModeLockupRecipe("typography_led");
  assert.equal(recipe.titleDominant, true);
});

test("minimal_editorial recipe is NOT title-dominant and uses clean integration", () => {
  const recipe = getDesignModeLockupRecipe("minimal_editorial");
  assert.equal(recipe.titleDominant, false);
  assert.equal(recipe.integrationMode, "clean");
});

test("graphic_symbol recipe uses a plate-style integration", () => {
  const recipe = getDesignModeLockupRecipe("graphic_symbol");
  assert.ok(["plate", "stamp", "grid_lock"].includes(recipe.integrationMode));
});

test("cinematic_atmospheric recipe preserves baseline (clean integration)", () => {
  const recipe = getDesignModeLockupRecipe("cinematic_atmospheric");
  assert.equal(recipe.integrationMode, "clean");
  assert.equal(recipe.align, "left");
});

test("recipes are distinct for typography_led, minimal_editorial, graphic_symbol, cinematic_atmospheric", () => {
  const modes: DesignMode[] = [
    "typography_led",
    "minimal_editorial",
    "graphic_symbol",
    "cinematic_atmospheric",
  ];
  const recipes = modes.map(getDesignModeLockupRecipe);
  const labels = new Set(recipes.map((r) => r.label));
  assert.equal(labels.size, modes.length, `Expected ${modes.length} distinct recipe labels, got ${labels.size}: ${[...labels].join(", ")}`);
  // Recipe signatures (preset+align+integration) should differ across these 4 core modes
  const signatures = new Set(
    recipes.map((r) => `${r.lockupPresetId}|${r.align}|${r.integrationMode}`)
  );
  assert.equal(signatures.size, modes.length, `Expected distinct recipe signatures: ${[...signatures].join(" / ")}`);
});

test("recipe is deterministic — same mode always returns the same recipe", () => {
  for (const mode of DESIGN_MODES) {
    const a = getDesignModeLockupRecipe(mode);
    const b = getDesignModeLockupRecipe(mode);
    assert.deepEqual(a, b);
  }
});
