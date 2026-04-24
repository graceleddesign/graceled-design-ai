import type { ScoutSlot } from "./build-scout-plan";
import type { TonalVariant } from "../grammars";

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

// Build the FLUX Schnell prompt string for a single scout slot.
// Substitutes {motif} and {tone} from the grammar template,
// then appends a global text-free enforcement footer.
export function buildScoutPrompt(slot: ScoutSlot): string {
  const motifPhrase = resolveMotifPhrase(slot.motifBinding);
  const toneDesc = TONE_DESCRIPTIONS[slot.tone];

  let prompt = slot.promptSpec.template
    .replace(/\{motif\}/g, motifPhrase)
    .replace(/\{tone\}/g, toneDesc);

  // Reinforce negative hints if present.
  if (slot.promptSpec.negativeHints.length > 0) {
    const hintsPhrase = slot.promptSpec.negativeHints.join(", ");
    prompt += ` Avoid: ${hintsPhrase}.`;
  }

  return prompt.trim();
}

export { TONE_DESCRIPTIONS };
