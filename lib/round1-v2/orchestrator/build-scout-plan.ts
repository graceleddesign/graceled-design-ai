import { GRAMMAR_BANK, GRAMMAR_KEYS, type GrammarKey, type TonalVariant } from "../grammars";
import { ROUND1_V2_CONFIG } from "../config";
import type { DesignMode } from "../design-modes";
import { getPreferredGrammarsForMode } from "./mode-grammar-affinity";

export type LaneKey = "A" | "B" | "C";
export const LANE_KEYS: readonly LaneKey[] = ["A", "B", "C"];

export interface LaneModeSpec {
  laneKey: LaneKey;
  designMode: DesignMode;
}

export interface ScoutPlanInput {
  runSeed: string;
  tone: TonalVariant;
  motifs: string[];
  negativeHints: string[];
  count?: number;
  /** Optional lane/mode plan — when provided, generate 3 scout slots per lane (mode-aware). */
  lanes?: readonly LaneModeSpec[];
  /** Optional total slots per lane (default 3) — only used when `lanes` is provided. */
  slotsPerLane?: number;
}

export interface ScoutPromptSpec {
  template: string;
  motifBinding: string[];
  tone: TonalVariant;
  negativeHints: string[];
}

export interface ScoutSlot {
  grammarKey: GrammarKey;
  diversityFamily: string;
  tone: TonalVariant;
  motifBinding: string[];
  seed: number;
  promptSpec: ScoutPromptSpec;
  /** Lane this slot is planned for. Present when scout plan is lane-aware. */
  laneKey?: LaneKey;
  /** DesignMode this slot is planned for. Present when scout plan is lane-aware. */
  designMode?: DesignMode;
}

export interface ScoutPlan {
  slots: ScoutSlot[];
  runSeed: string;
  tone: TonalVariant;
  distinctFamilyCount: number;
  /** Whether this plan is lane-aware (slots carry laneKey + designMode). */
  laneAware?: boolean;
}

// FNV-1a 32-bit — deterministic, no external deps.
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function slotSeed(runSeed: string, index: number): number {
  return fnv1a(`${runSeed}:slot:${index}`);
}

export function buildScoutPlan(input: ScoutPlanInput): ScoutPlan {
  // Lane-aware path: when caller supplies `lanes`, generate slotsPerLane scouts
  // per lane using mode-affinity grammars. Each slot carries laneKey + designMode.
  if (input.lanes && input.lanes.length > 0) {
    return buildLaneAwarePlan(input);
  }

  const count = input.count ?? ROUND1_V2_CONFIG.scoutCount;

  // Filter grammars by tone compatibility, then by motif compatibility.
  // A grammar is motif-compatible if at least one provided motif is not in its
  // incompatibleMotifTypes list. When no motifs are given, all tone-compatible
  // grammars are eligible.
  const eligibleKeys = GRAMMAR_KEYS.filter((key) => {
    const grammar = GRAMMAR_BANK[key];
    if (!grammar.compatibleTones.includes(input.tone)) return false;
    if (input.motifs.length === 0) return true;
    return input.motifs.some((m) => !grammar.incompatibleMotifTypes.includes(m));
  });

  // Safety fallback: if all grammars were filtered out (e.g. every motif incompatible
  // with every grammar), use the full key list rather than producing an empty plan.
  const keys: readonly GrammarKey[] = eligibleKeys.length > 0 ? eligibleKeys : GRAMMAR_KEYS;

  // Use a seeded starting offset so different runSeeds begin at different grammars
  // while the sequence remains fully deterministic for a given seed.
  const startOffset = fnv1a(input.runSeed) % keys.length;

  const slots: ScoutSlot[] = [];
  for (let i = 0; i < count; i++) {
    const key = keys[(startOffset + i) % keys.length];
    const grammar = GRAMMAR_BANK[key];

    const motifBinding =
      input.motifs.length > 0
        ? input.motifs.filter((m) => !grammar.incompatibleMotifTypes.includes(m))
        : [];

    const slot: ScoutSlot = {
      grammarKey: key,
      diversityFamily: grammar.diversityFamily,
      tone: input.tone,
      motifBinding,
      seed: slotSeed(input.runSeed, i),
      promptSpec: {
        template: grammar.scoutPromptTemplate,
        motifBinding,
        tone: input.tone,
        negativeHints: input.negativeHints,
      },
    };
    slots.push(slot);
  }

  const distinctFamilyCount = new Set(slots.map((s) => s.diversityFamily)).size;

  return { slots, runSeed: input.runSeed, tone: input.tone, distinctFamilyCount, laneAware: false };
}

function buildLaneAwarePlan(input: ScoutPlanInput): ScoutPlan {
  const slotsPerLane = input.slotsPerLane ?? 3;
  const lanes = input.lanes ?? [];

  // Tone+motif eligible grammars (used as fallback when mode-affinity is empty).
  const toneMotifEligible = GRAMMAR_KEYS.filter((key) => {
    const grammar = GRAMMAR_BANK[key];
    if (!grammar.compatibleTones.includes(input.tone)) return false;
    if (input.motifs.length === 0) return true;
    return input.motifs.some((m) => !grammar.incompatibleMotifTypes.includes(m));
  });
  const fallbackKeys: readonly GrammarKey[] =
    toneMotifEligible.length > 0 ? toneMotifEligible : GRAMMAR_KEYS;

  const slots: ScoutSlot[] = [];
  let globalIndex = 0;

  for (const lane of lanes) {
    // Mode-preferred grammars, intersected with tone+motif eligibility.
    const preferred = getPreferredGrammarsForMode(lane.designMode);
    const eligible = preferred.filter((g) => fallbackKeys.includes(g));
    const laneKeys = eligible.length > 0 ? eligible : fallbackKeys;

    // Per-lane seeded offset so different runs walk different starting grammars.
    const laneOffset = fnv1a(`${input.runSeed}:lane:${lane.laneKey}`) % laneKeys.length;

    for (let i = 0; i < slotsPerLane; i++) {
      const key = laneKeys[(laneOffset + i) % laneKeys.length];
      const grammar = GRAMMAR_BANK[key];
      const motifBinding =
        input.motifs.length > 0
          ? input.motifs.filter((m) => !grammar.incompatibleMotifTypes.includes(m))
          : [];

      slots.push({
        grammarKey: key,
        diversityFamily: grammar.diversityFamily,
        tone: input.tone,
        motifBinding,
        seed: slotSeed(input.runSeed, globalIndex),
        promptSpec: {
          template: grammar.scoutPromptTemplate,
          motifBinding,
          tone: input.tone,
          negativeHints: input.negativeHints,
        },
        laneKey: lane.laneKey,
        designMode: lane.designMode,
      });
      globalIndex++;
    }
  }

  const distinctFamilyCount = new Set(slots.map((s) => s.diversityFamily)).size;

  return {
    slots,
    runSeed: input.runSeed,
    tone: input.tone,
    distinctFamilyCount,
    laneAware: true,
  };
}
