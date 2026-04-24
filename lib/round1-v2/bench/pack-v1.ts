import type { RawBriefInput } from "../briefs/types";
import type { TonalVariant } from "../grammars";
import { normalizeBrief } from "../briefs/normalize-brief";
import { type ScoutPlanInput } from "../orchestrator/build-scout-plan";

export type BriefCategory = "topical" | "scriptural" | "seasonal" | "abstract";
export type TitleLength = "short" | "medium" | "long";
export type MotifDensity = "light" | "heavy";

export interface BenchmarkFixture {
  id: string;
  label: string;
  tone: TonalVariant;
  category: BriefCategory;
  titleLength: TitleLength;
  motifDensity: MotifDensity;
  rawInput: RawBriefInput;
}

export const BENCHMARK_PACK_V1: BenchmarkFixture[] = [
  {
    id: "rest-light-short-abstract",
    label: "Rest — light, motif-light, short title",
    tone: "light",
    category: "abstract",
    titleLength: "short",
    motifDensity: "light",
    rawInput: {
      title: "Rest",
      subtitle: null,
      description: "A series on Sabbath, stillness, and trusting God in quiet.",
      toneHint: "light",
      motifHints: ["stillness", "open_water"],
    },
  },
  {
    id: "generosity-vivid-long-topical",
    label: "Generosity — vivid, motif-heavy, long title",
    tone: "vivid",
    category: "topical",
    titleLength: "long",
    motifDensity: "heavy",
    rawInput: {
      title: "Generosity: A Four-Week Series on Giving",
      subtitle: "More Blessed to Give",
      description: "A topical series on generosity, stewardship, and open-handed living.",
      toneHint: "vivid",
      motifHints: ["open_hands", "abundance", "harvest", "grain"],
    },
  },
  {
    id: "back-to-basics-neutral-medium-topical",
    label: "Back to Basics — neutral, motif-light, medium title",
    tone: "neutral",
    category: "topical",
    titleLength: "medium",
    motifDensity: "light",
    rawInput: {
      title: "Back to Basics",
      description: "Returning to the core foundations of Christian faith.",
      toneHint: "neutral",
      motifHints: ["foundation", "stone"],
    },
  },
  {
    id: "into-the-deep-dark-medium-abstract",
    label: "Into the Deep — dark, motif-heavy, medium title",
    tone: "dark",
    category: "abstract",
    titleLength: "medium",
    motifDensity: "heavy",
    rawInput: {
      title: "Into the Deep",
      description: "An exploration of faith in uncertainty, depth, and surrender.",
      toneHint: "dark",
      motifHints: ["deep_water", "ocean_depth", "darkness"],
    },
  },
  {
    id: "advent-mono-long-seasonal",
    label: "Advent: Waiting for Light — mono, scriptural, long title, seasonal",
    tone: "mono",
    category: "seasonal",
    titleLength: "long",
    motifDensity: "heavy",
    rawInput: {
      title: "Advent: Waiting for Light",
      subtitle: "A Four-Sunday Advent Series",
      scripturePassages: "Isaiah 9:2",
      description: "Advent series about the coming light into darkness.",
      toneHint: "mono",
      motifHints: ["candle_flame", "dawn_light", "shadow"],
    },
  },
  {
    id: "new-light-short-abstract",
    label: "New — light, motif-light, hostile short title",
    tone: "light",
    category: "abstract",
    titleLength: "short",
    motifDensity: "light",
    rawInput: {
      title: "New",
      description: "New beginnings, fresh start, renewal.",
      toneHint: "light",
      motifHints: [],
    },
  },
  {
    id: "fire-and-water-vivid-medium-topical",
    label: "Fire and Water — vivid, motif-heavy, medium title",
    tone: "vivid",
    category: "topical",
    titleLength: "medium",
    motifDensity: "heavy",
    rawInput: {
      title: "Fire and Water",
      description: "A series on spiritual contrasts, transformation, and the Holy Spirit.",
      toneHint: "vivid",
      motifHints: ["flame", "flowing_water", "contrast", "transformation"],
    },
  },
  {
    id: "psalm23-dark-long-scriptural",
    label: "The Valley — dark, motif-heavy, long title, scriptural",
    tone: "dark",
    category: "scriptural",
    titleLength: "long",
    motifDensity: "heavy",
    rawInput: {
      title: "The Valley: Finding Peace in Psalm 23",
      subtitle: "Even Here",
      scripturePassages: "Psalm 23",
      toneHint: "dark",
      motifHints: ["shepherd_staff", "shadow", "green_pasture"],
    },
  },
  {
    id: "unbroken-neutral-medium-abstract",
    label: "Unbroken — neutral, motif-light, medium title",
    tone: "neutral",
    category: "abstract",
    titleLength: "medium",
    motifDensity: "light",
    rawInput: {
      title: "Unbroken",
      description: "A series on God's faithfulness through hardship and restoration.",
      toneHint: "neutral",
      motifHints: ["wholeness", "restoration"],
    },
  },
  {
    id: "go-mono-short-topical",
    label: "Go — mono, hostile very-short title, topical",
    tone: "mono",
    category: "topical",
    titleLength: "short",
    motifDensity: "light",
    rawInput: {
      title: "Go",
      subtitle: "A Missions Series",
      description: "A series on the Great Commission and going into the world.",
      toneHint: "mono",
      motifHints: ["movement", "direction"],
    },
  },
];

// Maps a benchmark fixture to a ScoutPlanInput so it can feed buildScoutPlan directly.
export function fixtureToScoutPlanInput(
  fixture: BenchmarkFixture,
  runSeed: string
): ScoutPlanInput {
  const brief = normalizeBrief(fixture.rawInput);
  return {
    runSeed,
    tone: brief.toneTarget,
    motifs: brief.motifs,
    negativeHints: brief.negativeHints,
  };
}
