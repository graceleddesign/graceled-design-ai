import type { ScoutSlot } from "./build-scout-plan";
import { GRAMMAR_BANK } from "../grammars";
import type { TonalVariant } from "../grammars";
import { STRICT_TEXT_PURGE_BLOCK } from "./prompt-constants";

// Short atmospheric descriptions for each tonal variant — Flux-optimized language.
const TONE_DESCRIPTIONS: Record<TonalVariant, string> = {
  light: "bright, high-key, airy and light with pale tones",
  vivid: "saturated, bold, and vibrant with rich color",
  neutral: "balanced mid-tone, muted, and sophisticated",
  dark: "deep shadows, rich darks, and cinematic contrast",
  mono: "black and white, monochrome, depth through value contrast only",
};

function resolveMotifPhrase(motifBinding: string[]): string {
  if (motifBinding.length === 0) return "an abstract visual theme";
  if (motifBinding.length === 1) return motifBinding[0];
  const last = motifBinding[motifBinding.length - 1];
  const rest = motifBinding.slice(0, -1);
  return `${rest.join(", ")} and ${last}`;
}

/**
 * Build motif anchoring sentences from the binding list.
 *
 * "Primary motif: X." drives the model toward a recognizable visual form.
 * "Supporting elements: Y, Z." prevents the secondary motifs from being lost.
 */
function buildMotifAnchor(motifBinding: string[]): string {
  if (motifBinding.length === 0) return "";
  const primary = motifBinding[0];
  const supporting = motifBinding.slice(1);
  let anchor = `Primary motif: ${primary} — visually clear and identifiable as a recognizable form, not abstract noise.`;
  if (supporting.length > 0) {
    anchor += ` Supporting elements: ${supporting.join(", ")}.`;
  }
  return anchor;
}

/**
 * Build the Flux Schnell prompt string for a single scout slot.
 *
 * Structure:
 *   1. Grammar composition template (spatial/depth instructions + motif + tone)
 *   2. Motif anchoring (primary motif clarity enforcement)
 *   3. avoidTextProne guard (if applicable to this grammar)
 *   4. Negative hints (if any)
 *   5. STRICT_TEXT_PURGE_BLOCK
 */
export function buildScoutPrompt(slot: ScoutSlot): string {
  const motifPhrase = resolveMotifPhrase(slot.motifBinding);
  const toneDesc = TONE_DESCRIPTIONS[slot.tone];

  // 1. Composition template
  let prompt = slot.promptSpec.template
    .replace(/\{motif\}/g, motifPhrase)
    .replace(/\{tone\}/g, toneDesc);

  // 2. Motif anchoring
  const motifAnchor = buildMotifAnchor(slot.motifBinding);
  if (motifAnchor) {
    prompt += " " + motifAnchor;
  }

  // 3. Extra guard for text-prone grammars
  const grammar = GRAMMAR_BANK[slot.grammarKey as keyof typeof GRAMMAR_BANK];
  if (grammar?.avoidTextProne) {
    prompt += " No signage-like composition. No central text panel or flat areas resembling a poster frame.";
  }

  // 4. Negative hints
  if (slot.promptSpec.negativeHints.length > 0) {
    const hintsPhrase = slot.promptSpec.negativeHints.join(", ");
    prompt += ` Avoid: ${hintsPhrase}.`;
  }

  // 5. Strict text-purge block (always last)
  prompt += " " + STRICT_TEXT_PURGE_BLOCK;

  return prompt.trim();
}

export { TONE_DESCRIPTIONS };
