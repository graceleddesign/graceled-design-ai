import type { RawBriefInput, NormalizedBrief } from "./types";

// Deterministic placeholder normalizer.
// Phase 1: pure string cleanup + structured-hint pass-through.
// The toneHint and motifHints fields are populated by GPT-5 mini in production
// and set explicitly in test fixtures. When absent, safe defaults are used.
export function normalizeBrief(input: RawBriefInput): NormalizedBrief {
  const title = input.title.trim();
  const subtitle = input.subtitle?.trim() || null;
  const scripturePassages = input.scripturePassages?.trim() || null;
  const designNotes = input.designNotes?.trim() || null;
  const description = input.description?.trim() || null;

  const toneTarget = input.toneHint ?? "neutral";

  const motifs = (input.motifHints ?? []).map((m) => m.trim()).filter(Boolean);

  const negativeHints: string[] = [
    ...(input.avoidColors?.split(",").map((s) => s.trim()).filter(Boolean) ?? []),
    ...(input.negativeHintExtras ?? []),
  ];

  const styleIntent = designNotes || null;
  const topicalContext = description || null;

  return {
    title,
    subtitle,
    scripturePassages,
    toneTarget,
    motifs,
    negativeHints,
    styleIntent,
    topicalContext,
  };
}
