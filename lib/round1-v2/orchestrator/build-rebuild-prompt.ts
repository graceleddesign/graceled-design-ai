import { GRAMMAR_BANK, type GrammarKey, type TonalVariant } from "../grammars";
import { TONE_DESCRIPTIONS } from "./build-scout-prompt";

export interface RebuildPromptInput {
  grammarKey: GrammarKey;
  tone: TonalVariant;
  motifBinding: string[];
  negativeHints: string[];
}

// Upgrade phrases that lift the rebuild above scout quality.
const QUALITY_FOOTER =
  "Ultra-detailed composition, professional studio lighting, rich tonal depth. " +
  "Completely text-free — no letters, words, numbers, or letterforms anywhere in the image.";

// Stronger text-removal footer used in text-detection retry passes.
const TEXT_PURGE_FOOTER =
  "CRITICAL REQUIREMENT: Pure visual background only — absolutely zero text. " +
  "Do not include any letters, numbers, words, signage, captions, labels, scripture text, " +
  "title text, watermarks, UI text, poster text, banners, inscriptions, engravings, " +
  "typographic artifacts, or any symbol that resembles a letterform or glyph. " +
  "No readable marks of any kind. Only pure artistic composition: shapes, colors, light, " +
  "texture, depth. Ultra-detailed, professional studio quality.";

function resolveMotifPhrase(motifBinding: string[]): string {
  if (motifBinding.length === 0) return "an abstract visual theme";
  if (motifBinding.length === 1) return motifBinding[0];
  const last = motifBinding[motifBinding.length - 1];
  return `${motifBinding.slice(0, -1).join(", ")} and ${last}`;
}

// Build a text-purge retry prompt for a direction that failed background_text_detected.
// Uses TEXT_PURGE_FOOTER instead of QUALITY_FOOTER for stronger text-removal enforcement.
export function buildTextPurgedRebuildPrompt(input: RebuildPromptInput): string {
  const grammar = GRAMMAR_BANK[input.grammarKey];
  const motifPhrase = resolveMotifPhrase(input.motifBinding);
  const toneDesc = TONE_DESCRIPTIONS[input.tone];

  let prompt = grammar.rebuildPromptTemplate
    .replace(/\{motif\}/g, motifPhrase)
    .replace(/\{tone\}/g, toneDesc);

  if (input.negativeHints.length > 0) {
    prompt += ` Avoid: ${input.negativeHints.join(", ")}.`;
  }

  prompt += " " + TEXT_PURGE_FOOTER;
  return prompt.trim();
}

// Build the canonical rebuild prompt for a selected scout direction.
// Uses the grammar's rebuildPromptTemplate as a structural anchor,
// then appends quality and text-free enforcement.
export function buildRebuildPrompt(input: RebuildPromptInput): string {
  const grammar = GRAMMAR_BANK[input.grammarKey];
  const motifPhrase = resolveMotifPhrase(input.motifBinding);
  const toneDesc = TONE_DESCRIPTIONS[input.tone];

  let prompt = grammar.rebuildPromptTemplate
    .replace(/\{motif\}/g, motifPhrase)
    .replace(/\{tone\}/g, toneDesc);

  if (input.negativeHints.length > 0) {
    prompt += ` Avoid: ${input.negativeHints.join(", ")}.`;
  }

  prompt += " " + QUALITY_FOOTER;

  return prompt.trim();
}
