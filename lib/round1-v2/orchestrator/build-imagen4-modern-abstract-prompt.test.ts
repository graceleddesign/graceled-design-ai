import assert from "node:assert/strict";
import test from "node:test";
import {
  buildImagen4ModernAbstractPrompt,
  IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY,
  __IMAGEN4_PROMPT_INTERNALS,
} from "./build-imagen4-modern-abstract-prompt";

test("prompt family identifier is the prism/refraction proven family", () => {
  assert.equal(IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY, "prism_refraction_light_on_dark");
});

test("prompt builder does not include any title-like phrase", () => {
  const p = buildImagen4ModernAbstractPrompt();
  const lower = p.toLowerCase();
  // No series titles, no Bible book names — must never appear at all.
  const neverAtAll = [
    "the gospel of john",
    "gospel of john",
    "john",
    "graphic with text",
    "series title",
  ];
  for (const f of neverAtAll) {
    assert.ok(!lower.includes(f), `prompt must not contain "${f}"`);
  }
  // "title", "poster", and "book cover" may appear ONLY inside an explicit
  // negative/prohibition ("No poster layout.", "No book-cover layout."). They
  // must never appear in positive/instructional context.
  const onlyAsProhibition: Array<{ token: string; allowedPrefix: string[] }> = [
    { token: "title", allowedPrefix: [] }, // appears in "No typography-like marks" via "title"? no. ensure absent.
    { token: "poster", allowedPrefix: ["no poster layout"] },
    { token: "book cover", allowedPrefix: ["no book-cover layout"] },
    { token: "book-cover", allowedPrefix: ["no book-cover layout"] },
  ];
  for (const { token, allowedPrefix } of onlyAsProhibition) {
    if (!lower.includes(token)) continue;
    // Every occurrence must be inside one of the allowed prohibition phrases.
    const occurrences = lower.split(token).length - 1;
    let inAllowed = 0;
    for (const ap of allowedPrefix) {
      inAllowed += lower.split(ap).length - 1;
    }
    assert.equal(
      occurrences,
      inAllowed,
      `"${token}" appears outside an allowed prohibition phrase`
    );
  }
});

test("prompt builder leads with hard text-free prohibition", () => {
  const p = buildImagen4ModernAbstractPrompt();
  // Prefix must be at index 0 and contain the unambiguous prohibition.
  assert.ok(p.startsWith("TEXT-FREE IMAGE ONLY."), "prompt must begin with TEXT-FREE IMAGE ONLY.");
  const required = [
    "No readable text",
    "No letters",
    "No numbers",
    "No words",
    "No logos",
    "No captions",
    "No watermarks",
    "No handwriting",
    "No inscriptions",
    "No signs",
    "No banners",
    "No UI panels",
    "No typography-like marks",
    "No pseudo-letterforms",
  ];
  for (const r of required) {
    assert.ok(p.includes(r), `prompt must include explicit prohibition "${r}"`);
  }
});

test("prompt builder does NOT introduce known failure-family terms", () => {
  const p = buildImagen4ModernAbstractPrompt().toLowerCase();
  // The proven prompt is restrained — it must not invite the known failure
  // families (vines/branches, doorways/interiors, water/baptism photography,
  // corporate wallpaper, geometric tile patterns).
  const forbidden = [
    "vine",
    "branch",
    "botanical",
    "doorway",
    "interior scene",
    "water droplet",
    "ocean",
    "river",
    "baptism",
    "corporate wallpaper",
    "geometric tile",
    "worship gradient",
  ];
  for (const f of forbidden) {
    assert.ok(!p.includes(f), `prompt must not invite known failure family "${f}"`);
  }
});

test("prompt builder uses the EXACT proven prism_refraction body from benchmark", () => {
  // Hard invariant: the body must be the verbatim text from
  // scripts/benchmark-imagen4-geometric-keyart.mts (Output 3 — strong pass).
  const expected =
    "Create a premium abstract design plate using prism-like refraction, layered glassy geometry, " +
    "restrained contrast, and a single directional light source. " +
    "The visual should suggest light revealed through darkness and testimony/witness through abstract form. " +
    "Strong composition, designed negative space, modern editorial restraint. " +
    "Not a generic gradient. Not stock spirituality.";
  assert.equal(__IMAGEN4_PROMPT_INTERNALS.PRISM_REFRACTION_BODY, expected);
  assert.ok(buildImagen4ModernAbstractPrompt().includes(expected));
});

test("prompt builder uses the EXACT proven text-free prefix from benchmark", () => {
  const expected =
    "TEXT-FREE IMAGE ONLY. Pure abstract background/key-art plate. " +
    "No readable text. No letters. No numbers. No words. No logos. No captions. " +
    "No watermarks. No handwriting. No inscriptions. No signs. No banners. " +
    "No book-cover layout. No poster layout. No UI panels. No typography-like marks. " +
    "No pseudo-letterforms. " +
    "If any text would appear, remove it completely and replace it with abstract shape, texture, light, or negative space.";
  assert.equal(__IMAGEN4_PROMPT_INTERNALS.TEXT_FREE_PREFIX, expected);
});
