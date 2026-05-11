// Prompt builder for the experimental Imagen 4 modern_abstract path.
//
// CRITICAL: The prompt body below is copied verbatim from
// scripts/benchmark-imagen4-geometric-keyart.mts — specifically the
// `prism_refraction` prompt (Output 3), which was the only prompt in the
// geometric-keyart spike that produced a strong text-free, modern abstract,
// Gospel-of-John-resonant key-art plate. Do not paraphrase. Do not "improve."
//
// The prompt is intentionally non-parametric: the proven output came from
// this exact text. The benchmark also confirmed that any title-like language
// (series title, "The Gospel of John", "title", "poster", "book cover",
// "graphic with text") causes Imagen 4 to render readable typography, which
// destroys the background plate.

// Verbatim from scripts/benchmark-imagen4-geometric-keyart.mts.
const TEXT_FREE_PREFIX =
  "TEXT-FREE IMAGE ONLY. Pure abstract background/key-art plate. " +
  "No readable text. No letters. No numbers. No words. No logos. No captions. " +
  "No watermarks. No handwriting. No inscriptions. No signs. No banners. " +
  "No book-cover layout. No poster layout. No UI panels. No typography-like marks. " +
  "No pseudo-letterforms. " +
  "If any text would appear, remove it completely and replace it with abstract shape, texture, light, or negative space.";

// Verbatim from scripts/benchmark-imagen4-geometric-keyart.mts (prism_refraction, Output 3).
const PRISM_REFRACTION_BODY =
  "Create a premium abstract design plate using prism-like refraction, layered glassy geometry, " +
  "restrained contrast, and a single directional light source. " +
  "The visual should suggest light revealed through darkness and testimony/witness through abstract form. " +
  "Strong composition, designed negative space, modern editorial restraint. " +
  "Not a generic gradient. Not stock spirituality.";

export const IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY = "prism_refraction_light_on_dark" as const;

/**
 * Build the Imagen 4 prompt for the modern_abstract experimental path.
 *
 * The prompt is the exact proven prism_refraction prompt from the
 * geometric-keyart benchmark. No series title, no Bible book names, no
 * title-like phrases are ever inserted. The hard text-free prohibition
 * leads. Known failure-family terms are not introduced.
 */
export function buildImagen4ModernAbstractPrompt(): string {
  return `${TEXT_FREE_PREFIX}\n\n${PRISM_REFRACTION_BODY}`;
}

export const __IMAGEN4_PROMPT_INTERNALS = {
  TEXT_FREE_PREFIX,
  PRISM_REFRACTION_BODY,
};
