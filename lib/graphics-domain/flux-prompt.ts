/**
 * Flux-specific background prompt generator.
 *
 * Produces short (60-120 word) visual scene descriptions optimized for
 * diffusion models (fal.ai / Flux), rather than the design-system constraint
 * language used by the OpenAI GPT-image path.
 */

const TONE_ATMOSPHERE: Record<string, string> = {
  light: "High-key, airy atmosphere. Bright whites, pale gold, and soft cream tones dominate.",
  dark: "Deep shadows and rich darks with dramatic contrast. Warm highlights emerge from darkness.",
  vivid: "Saturated, bold color with strong tonal contrast. Rich and vibrant.",
  mono: "Black and white or near-monochrome. Depth through value contrast alone.",
  neutral: "Balanced mid-tone palette, neither bright nor dark. Muted, sophisticated color.",
};

const DESIGN_SYSTEM_TERMS = [
  "lockup",
  "safe area",
  "safe region",
  "title stage",
  "title-stage",
  "composition type",
  "badge emblem",
  "grid layout",
  "layout lane",
  "preset",
  "bucket",
  "tone target",
  "format guidance",
  "aspect ratio",
  "template",
  "variant key",
  "lane family",
  "background mode",
  "exploration set",
];

const TYPOGRAPHY_TERMS = [
  "typography",
  "typographic",
  "typeface",
  "serif",
  "sans-serif",
  "font",
  "glyph",
  "kerning",
  "tracking",
  "leading",
  "lettering",
];

export function buildFluxBackgroundPrompt(params: {
  seriesTitle: string;
  seriesDescription?: string;
  scripturePassages?: string;
  bibleCreativeBrief?: {
    themes: string[];
    motifs: string[];
    markIdeas: string[];
  } | null;
  motifFocus?: string[];
  styleFamily?: string;
  tone?: string;
  lanePrompt?: string;
  generationId: string;
}): string {
  const motifs = gatherMotifs(params);
  const themes = params.bibleCreativeBrief?.themes?.filter(Boolean) ?? [];
  const tone = params.tone ?? "neutral";

  const lines: string[] = [];

  // --- Primary scene from motifs or fallback ---
  if (motifs.length > 0) {
    lines.push(`${capitalize(motifs[0])} forms emerge with physical materiality and depth.`);
    if (motifs.length > 1) {
      lines.push(`${capitalize(motifs.slice(1).join(" and "))} woven subtly into the composition.`);
    }
  } else if (params.seriesTitle) {
    lines.push(
      `Abstract atmospheric scene evoking the essence of "${params.seriesTitle}." Organic forms with layered depth.`
    );
  } else {
    lines.push("Abstract atmospheric scene. Organic layered forms with tactile depth.");
  }

  // --- Tone atmosphere ---
  lines.push(TONE_ATMOSPHERE[tone] ?? TONE_ATMOSPHERE.neutral);

  // --- Material / texture ---
  lines.push("Paper grain texture throughout. Painterly, quiet, considered.");

  // --- Thematic resonance ---
  if (themes.length > 0) {
    const themeSlice = themes.slice(0, 2).join(" and ");
    lines.push(`The imagery suggests ${themeSlice} without depicting anything literal.`);
  }

  // --- Lane prompt visual concepts (filtered) ---
  const laneVisual = extractLaneVisualConcept(params.lanePrompt);
  if (laneVisual) {
    lines.push(laneVisual);
  }

  // --- Composition guidance ---
  lines.push(
    "Left side open, low-contrast negative space. Right side carries visual interest."
  );

  // --- Safety ---
  lines.push("No text, letters, words, or typographic forms. No human faces.");

  // --- Seed ---
  lines.push(`Seed: ${params.generationId.slice(0, 8)}.`);

  return lines.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gatherMotifs(params: {
  motifFocus?: string[];
  bibleCreativeBrief?: {
    motifs: string[];
    markIdeas: string[];
  } | null;
}): string[] {
  const focused = params.motifFocus?.filter(Boolean) ?? [];
  if (focused.length > 0) return focused.slice(0, 3);

  const briefMotifs = params.bibleCreativeBrief?.motifs?.filter(Boolean) ?? [];
  if (briefMotifs.length > 0) return briefMotifs.slice(0, 3);

  const marks = params.bibleCreativeBrief?.markIdeas?.filter(Boolean) ?? [];
  return marks.slice(0, 2);
}

function extractLaneVisualConcept(lanePrompt?: string): string | null {
  if (!lanePrompt?.trim()) return null;

  const lower = lanePrompt.toLowerCase();
  const hasTypographyTerm = TYPOGRAPHY_TERMS.some((term) => lower.includes(term));
  if (hasTypographyTerm) return null;

  const designHits = DESIGN_SYSTEM_TERMS.filter((term) => lower.includes(term));
  if (designHits.length >= 3) return null;

  const trimmed = lanePrompt.trim();
  if (trimmed.length <= 120) return trimmed;
  return trimmed.slice(0, 117) + "...";
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
