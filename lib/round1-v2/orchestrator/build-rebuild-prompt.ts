import { GRAMMAR_BANK, type GrammarKey, type TonalVariant } from "../grammars";
import { TONE_DESCRIPTIONS } from "./build-scout-prompt";
import { STRICT_TEXT_PURGE_BLOCK } from "./prompt-constants";
import type { DesignMode } from "../design-modes";
import {
  buildDesignModePromptDirective,
  buildDesignModeNegativeDirective,
} from "./design-mode-prompt-directives";

export interface RebuildPromptInput {
  grammarKey: GrammarKey;
  tone: TonalVariant;
  motifBinding: string[];
  negativeHints: string[];
  designMode?: DesignMode;
}

// Quality upgrade footer — quality language only; text-purge handled by STRICT_TEXT_PURGE_BLOCK.
const QUALITY_FOOTER =
  "Ultra-detailed cinematic quality. Professional lighting and atmospheric depth. Rich tonal range.";

function resolveMotifPhrase(motifBinding: string[]): string {
  if (motifBinding.length === 0) return "an abstract visual theme";
  if (motifBinding.length === 1) return motifBinding[0];
  const last = motifBinding[motifBinding.length - 1];
  return `${motifBinding.slice(0, -1).join(", ")} and ${last}`;
}

/**
 * Build motif clarity enforcement for rebuild prompts.
 *
 * "Primary subject" language drives the model to commit to a clear, readable form.
 */
function buildMotifClarity(motifBinding: string[]): string {
  if (motifBinding.length === 0) return "";
  const primary = motifBinding[0];
  const supporting = motifBinding.slice(1);
  let clause =
    `The primary motif is ${primary} — visually dominant and clearly readable as a recognizable form. ` +
    `Avoid amorphous or muddy shapes. Avoid an empty or low-detail result.`;
  if (supporting.length > 0) {
    clause += ` Supporting elements: ${supporting.join(", ")}.`;
  }
  return clause;
}

/**
 * Build the canonical rebuild prompt for a selected scout direction.
 *
 * Structured in order:
 *   1. Composition (grammar template — spatial/depth)
 *   2. Motif (primary subject clarity + supporting)
 *   3. Quiet space (low-detail region for the lockup, without mentioning text)
 *   4. avoidTextProne guard (if applicable)
 *   5. Negative hints (if any)
 *   6. STRICT_TEXT_PURGE_BLOCK
 *   7. Quality footer
 */
export function buildRebuildPrompt(input: RebuildPromptInput): string {
  const grammar = GRAMMAR_BANK[input.grammarKey];
  const motifPhrase = resolveMotifPhrase(input.motifBinding);
  const toneDesc = TONE_DESCRIPTIONS[input.tone];

  // 1. Composition (template)
  let prompt = grammar.rebuildPromptTemplate
    .replace(/\{motif\}/g, motifPhrase)
    .replace(/\{tone\}/g, toneDesc);

  // 2. Motif clarity
  const motifClarity = buildMotifClarity(input.motifBinding);
  if (motifClarity) {
    prompt += " " + motifClarity;
  }

  // 2b. DesignMode positive directive (mode-specific design intent)
  if (input.designMode) {
    prompt += " " + buildDesignModePromptDirective(input.designMode);
  }

  // 3. Quiet space instruction (no mention of text)
  prompt +=
    " Include a calm, low-detail region that remains visually quiet — uncluttered open space in at least one area of the frame.";

  // 4. Extra guard for text-prone grammars
  if (grammar.avoidTextProne) {
    prompt += " No signage-like composition. No central text panel or flat surfaces that resemble a poster or sign.";
  }

  // 5. Negative hints (combine project-level + design-mode-level)
  const negatives = [...input.negativeHints];
  if (input.designMode) {
    const modeNeg = buildDesignModeNegativeDirective(input.designMode);
    if (modeNeg) negatives.push(modeNeg);
  }
  if (negatives.length > 0) {
    prompt += ` Avoid: ${negatives.join(", ")}.`;
  }

  // 6. Strict text-purge block
  prompt += " " + STRICT_TEXT_PURGE_BLOCK;

  // 7. Quality footer
  prompt += " " + QUALITY_FOOTER;

  return prompt.trim();
}

/**
 * Build a text-purge retry prompt for a direction that failed background_text_detected.
 *
 * Stronger framing — makes clear this is a correction from a failed attempt.
 * Uses STRICT_TEXT_PURGE_BLOCK as the anchor, plus a correction header.
 */
export function buildTextPurgedRebuildPrompt(input: RebuildPromptInput): string {
  const grammar = GRAMMAR_BANK[input.grammarKey];
  const motifPhrase = resolveMotifPhrase(input.motifBinding);
  const toneDesc = TONE_DESCRIPTIONS[input.tone];

  // Composition template
  let prompt = grammar.rebuildPromptTemplate
    .replace(/\{motif\}/g, motifPhrase)
    .replace(/\{tone\}/g, toneDesc);

  // Motif clarity
  const motifClarity = buildMotifClarity(input.motifBinding);
  if (motifClarity) {
    prompt += " " + motifClarity;
  }

  // DesignMode positive directive
  if (input.designMode) {
    prompt += " " + buildDesignModePromptDirective(input.designMode);
  }

  // Quiet space
  prompt +=
    " Include a calm, low-detail region that remains visually quiet — uncluttered open space in at least one area of the frame.";

  // avoidTextProne guard
  if (grammar.avoidTextProne) {
    prompt += " No signage-like composition. No central text panel or flat surfaces that resemble a poster or sign.";
  }

  // Negative hints (combine project + design-mode negatives)
  const negatives = [...input.negativeHints];
  if (input.designMode) {
    const modeNeg = buildDesignModeNegativeDirective(input.designMode);
    if (modeNeg) negatives.push(modeNeg);
  }
  if (negatives.length > 0) {
    prompt += ` Avoid: ${negatives.join(", ")}.`;
  }

  // Text-purge: STRICT block + explicit correction header
  prompt +=
    " CORRECTION: previous generation contained text artifacts. " +
    STRICT_TEXT_PURGE_BLOCK +
    " Do not place any text, letterforms, or symbols anywhere in this image.";

  // Quality footer
  prompt += " " + QUALITY_FOOTER;

  return prompt.trim();
}
