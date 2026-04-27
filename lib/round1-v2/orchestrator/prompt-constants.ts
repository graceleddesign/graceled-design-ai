/**
 * Shared text-purge and quality constraints for V2 prompt construction.
 *
 * Injected into BOTH scout and rebuild prompts.
 * Redundancy across multiple formulations is intentional — the more
 * angles the model sees this constraint, the stronger the enforcement.
 */

/**
 * Strict text-purge block.
 *
 * Must appear in every V2 background prompt (scout + rebuild + text-retry).
 * Do NOT weaken or shorten — the failure mode is text artifacts, not long prompts.
 */
export const STRICT_TEXT_PURGE_BLOCK =
  "Absolutely no readable text of any kind. " +
  "No letters, numbers, words, captions, logos, signage, watermarks, inscriptions, " +
  "banners, plaques, UI elements, or symbols that resemble letterforms or glyphs. " +
  "Do not render typography of any kind. " +
  "Do not include title-like areas, text panels, sign-like surfaces, or flat graphic design layouts. " +
  "If any text or letterform would appear, replace it with abstract texture or remove it entirely. " +
  "This is a pure background plate — no graphic overlays, no embedded design elements.";
