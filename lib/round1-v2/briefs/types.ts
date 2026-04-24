import type { TonalVariant } from "../grammars";

// Raw project data fed into the normalization step.
// Matches fields available on the Project model.
// toneHint and motifHints are structured hints — manually provided in test fixtures
// and populated by the GPT-5 mini brief extractor in production.
export interface RawBriefInput {
  title: string;
  subtitle?: string | null;
  scripturePassages?: string | null;
  description?: string | null;
  designNotes?: string | null;
  avoidColors?: string | null;
  preferredAccentColors?: string | null;
  // Pre-extracted structured hints (GPT-5 mini in prod; explicit in fixtures)
  toneHint?: TonalVariant | null;
  motifHints?: string[];
  negativeHintExtras?: string[];
}

// The normalized contract consumed by the scout planner and downstream V2 stages.
export interface NormalizedBrief {
  title: string;
  subtitle: string | null;
  scripturePassages: string | null;
  toneTarget: TonalVariant;
  motifs: string[];
  negativeHints: string[];
  styleIntent: string | null;
  topicalContext: string | null;
}
