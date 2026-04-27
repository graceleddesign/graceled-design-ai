/**
 * Deterministic V2 design-mode lane planner.
 *
 * Accepts normalized brief signals and returns a 3-lane A/B/C design-mode plan.
 * No LLM calls. Pure function — same inputs always produce the same output.
 *
 * Phase 1: modes are metadata only. This planner does not change generation behavior.
 */

import {
  type DesignMode,
  DESIGN_MODE_META,
  DEFAULT_ENABLED_MODES,
  isDefaultEnabledDesignMode,
} from "../design-modes";
import type { TonalVariant } from "../grammars";

// ── Public types ──────────────────────────────────────────────────────────────

export interface DesignModePlanInput {
  /** Series title (required for length and concept analysis) */
  title: string;
  /** Optional subtitle */
  subtitle?: string | null;
  /** Scripture passages — detect whole-book expository series */
  scripturePassages?: string | null;
  /** Optional description and design notes (for keyword matching) */
  description?: string | null;
  designNotes?: string | null;
  /** Tone already inferred by planBriefSignals */
  toneHint: TonalVariant;
  /** Motif hints already inferred by planBriefSignals */
  motifHints: string[];
  /**
   * Optional run seed for deterministic tie-breaking.
   * Same seed → same mode triad for a given brief.
   */
  runSeed?: string;
  /**
   * Explicit override: if set, always include retro_print.
   * Normal planner never picks it.
   */
  allowRetroPrint?: boolean;
}

export interface LaneDesignMode {
  lane: "A" | "B" | "C";
  mode: DesignMode;
  /** Why this mode was chosen for this lane */
  rationale: string;
  /** Curated pro-tier reference anchors from the owned library */
  referenceAnchors: readonly string[];
  /** Whether a forced override or fallback logic was applied */
  forced: boolean;
  /** Whether a fallback/default was used because signals were ambiguous */
  usedFallback: boolean;
}

export interface DesignModePlan {
  lanes: [LaneDesignMode, LaneDesignMode, LaneDesignMode];
  /** Human-readable one-liner: "A=typography_led B=cinematic_atmospheric C=graphic_symbol" */
  summary: string;
  /** Whether all 3 lanes have distinct modes */
  allDistinct: boolean;
  /** Debug: detected brief characteristics that drove mode selection */
  detectedCharacteristics: string[];
  /** Debug: modes considered and their scores */
  scored: Array<{ mode: DesignMode; score: number; reasons: string[] }>;
}

// ── Characteristic detection ──────────────────────────────────────────────────

interface BriefCharacteristics {
  isShortTitle: boolean;
  isLongTitle: boolean;
  isScripturalWholeBook: boolean;
  isSeasonal: boolean;
  isConcreteMetaphor: boolean;
  isExpository: boolean;
  isAtmospheric: boolean;
  isExpressive: boolean;
  isRetroSignal: boolean;
  isJoyfulCelebratory: boolean;
  isSeriousDark: boolean;
  hasIllustrationLanguage: boolean;
}

const SEASONAL_WORDS = ["easter", "christmas", "advent", "kickoff", "launch", "celebration", "holiday", "pentecost"];
const CONCRETE_METAPHOR_WORDS = ["cross", "heart", "light", "door", "anchor", "key", "rock", "stone", "crown", "sword", "shield", "flame", "fire", "water", "river", "mountain", "vine", "branch", "bread", "shepherd", "lamb"];
const ATMOSPHERIC_WORDS = ["awakening", "focused", "hope", "hope", "silence", "still", "quiet", "peace", "rest", "breath", "wind", "spirit", "glory", "radiance", "dawn", "wilderness", "shadow", "valley", "depth", "wonder"];
const EXPRESSIVE_WORDS = ["messy", "chaos", "broken", "struggle", "collage", "craft", "hand-made", "sketch", "raw", "unfinished"];
const RETRO_WORDS = ["retro", "vintage", "print", "risograph", "letterpress", "poster", "old school", "throwback"];
const JOYFUL_WORDS = ["joy", "celebration", "celebrate", "alive", "abundant", "abundance", "jubilee", "praise", "victory", "triumphant"];
const DARK_WORDS = ["lament", "grief", "suffering", "suffer", "cross", "crucif", "tomb", "gethsemane", "anguish", "trial", "betray", "exile", "wilderness", "desert", "night", "shadow"];
const ILLUSTRATION_WORDS = ["illustration", "illustrative", "drawn", "painting", "watercolor", "ink", "sketch", "collage", "hand-lettered"];

// Whole-book scriptural series: Gospel of John, Ephesians, Philippians, etc.
const WHOLE_BOOK_PATTERNS = [
  "gospel of john", "book of john", "john 1", "ephesians", "philippians", "colossians",
  "galatians", "romans", "acts", "hebrews", "genesis", "exodus", "psalms",
  "proverbs", "ruth", "james", "revelation", "isaiah",
];

function detect(text: string, words: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w));
}

function detectCharacteristics(input: DesignModePlanInput): BriefCharacteristics {
  const allText = [
    input.title,
    input.subtitle ?? "",
    input.description ?? "",
    input.designNotes ?? "",
    input.scripturePassages ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const titleWordCount = input.title.trim().split(/\s+/).length;

  return {
    isShortTitle: titleWordCount <= 3,
    isLongTitle: titleWordCount > 5,
    isScripturalWholeBook: WHOLE_BOOK_PATTERNS.some((p) =>
      allText.toLowerCase().includes(p)
    ),
    isSeasonal: detect(allText, SEASONAL_WORDS),
    isConcreteMetaphor: detect(allText, CONCRETE_METAPHOR_WORDS),
    isExpository: detect(allText, ["through", "study of", "a study", "an expository", "walk through", "series through"]) || titleWordCount <= 2,
    isAtmospheric: detect(allText, ATMOSPHERIC_WORDS),
    isExpressive: detect(allText, EXPRESSIVE_WORDS),
    isRetroSignal: detect(allText, RETRO_WORDS),
    isJoyfulCelebratory: detect(allText, JOYFUL_WORDS),
    isSeriousDark: detect(allText, DARK_WORDS),
    hasIllustrationLanguage: detect(allText, ILLUSTRATION_WORDS),
  };
}

// ── Scoring ───────────────────────────────────────────────────────────────────

interface ScoredMode {
  mode: DesignMode;
  score: number;
  reasons: string[];
}

function scoreMode(
  mode: DesignMode,
  ch: BriefCharacteristics,
  toneHint: TonalVariant,
  allowRetroPrint = false
): ScoredMode {
  const meta = DESIGN_MODE_META[mode];
  let score = 0;
  const reasons: string[] = [];

  // Tone affinity
  if (meta.toneAffinities.includes(toneHint)) {
    score += 2;
    reasons.push(`tone_affinity(${toneHint})`);
  }

  // Mode-specific characteristic boosts
  switch (mode) {
    case "typography_led":
      if (ch.isShortTitle) { score += 3; reasons.push("short_title"); }
      if (ch.isExpository) { score += 2; reasons.push("expository"); }
      if (ch.isScripturalWholeBook && ch.isShortTitle) { score += 2; reasons.push("scripture_book_short"); }
      if (ch.isLongTitle) { score -= 2; reasons.push("long_title_penalty"); }
      if (ch.isSeasonal) { score -= 1; reasons.push("seasonal_mild_penalty"); }
      break;

    case "graphic_symbol":
      if (ch.isConcreteMetaphor) { score += 4; reasons.push("concrete_metaphor"); }
      if (ch.isExpository) { score += 1; reasons.push("expository"); }
      if (ch.isAtmospheric && !ch.isConcreteMetaphor) { score -= 2; reasons.push("atmospheric_penalty"); }
      break;

    case "photo_composite":
      if (!ch.isAtmospheric && !ch.isExpository) { score += 2; reasons.push("non_atmospheric_non_expository"); }
      if (ch.isSeriousDark) { score += 1; reasons.push("serious_tone"); }
      if (ch.isScripturalWholeBook) { score += 1; reasons.push("scripture_book"); }
      break;

    case "cinematic_atmospheric":
      if (ch.isAtmospheric) { score += 3; reasons.push("atmospheric"); }
      if (ch.isSeriousDark) { score += 1; reasons.push("serious_tone"); }
      if (ch.isScripturalWholeBook) { score += 1; reasons.push("scripture_book"); }
      // Always gets a baseline — a reliable fallback mode
      score += 1;
      reasons.push("baseline");
      break;

    case "minimal_editorial":
      if (ch.isExpository) { score += 3; reasons.push("expository"); }
      if (ch.isScripturalWholeBook) { score += 3; reasons.push("scripture_book"); }
      if (toneHint === "mono" || toneHint === "dark") { score += 2; reasons.push("quiet_tone"); }
      if (ch.isSeasonal) { score -= 2; reasons.push("seasonal_penalty"); }
      if (ch.isJoyfulCelebratory) { score -= 1; reasons.push("joyful_mild_penalty"); }
      break;

    case "modern_abstract":
      if (ch.isJoyfulCelebratory) { score += 2; reasons.push("joyful_celebratory"); }
      if (toneHint === "vivid") { score += 2; reasons.push("vivid_tone"); }
      if (ch.isAtmospheric) { score += 1; reasons.push("atmospheric"); }
      if (ch.isScripturalWholeBook) { score += 1; reasons.push("scripture_book"); }
      break;

    case "illustrative_collage":
      if (ch.hasIllustrationLanguage) { score += 5; reasons.push("explicit_illustration_language"); }
      if (ch.isExpressive) { score += 3; reasons.push("expressive_tone"); }
      if (!ch.hasIllustrationLanguage && !ch.isExpressive) { score -= 1; reasons.push("no_illustration_signal"); }
      break;

    case "playful_seasonal":
      // Only score meaningfully if seasonal
      if (ch.isSeasonal) { score += 5; reasons.push("seasonal"); }
      else { score = -99; reasons.push("no_seasonal_signal_gated"); }
      break;

    case "retro_print":
      if (allowRetroPrint && ch.isRetroSignal) {
        score += 5;
        reasons.push("retro_signal_unlocked");
      } else {
        score = -99;
        reasons.push("gated_experimental");
      }
      break;
  }

  return { mode, score, reasons };
}

// ── FNV-1a seed for deterministic tie-breaking ────────────────────────────────

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ── Main planner ─────────────────────────────────────────────────────────────

/**
 * Plan 3 distinct DesignModes for A/B/C lanes.
 *
 * Behavior guarantees:
 * - Always returns exactly 3 lanes.
 * - Prefers 3 distinct modes; falls back to repeating with variant note if pool is exhausted.
 * - Never selects retro_print unless allowRetroPrint is true.
 * - Never selects playful_seasonal unless brief contains seasonal signals.
 */
export function planDesignModes(input: DesignModePlanInput): DesignModePlan {
  const ch = detectCharacteristics(input);
  const detectedCharacteristics = Object.entries(ch)
    .filter(([, v]) => v === true)
    .map(([k]) => k);

  // Build pool: default-enabled modes, plus conditionally unlocked modes.
  // playful_seasonal and retro_print are not in DEFAULT_ENABLED_MODES; add them only when signals justify.
  const pool: DesignMode[] = [
    ...DEFAULT_ENABLED_MODES,
    ...(ch.isSeasonal ? ["playful_seasonal" as DesignMode] : []),
    ...(input.allowRetroPrint ? ["retro_print" as DesignMode] : []),
  ];

  const scored = pool
    .map((mode) => scoreMode(mode, ch, input.toneHint, input.allowRetroPrint))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Deterministic tie-breaking via seed
      const seedVal = input.runSeed ? fnv1a(input.runSeed) : 0;
      const ai = pool.indexOf(a.mode);
      const bi = pool.indexOf(b.mode);
      return (ai + seedVal) % pool.length - (bi + seedVal) % pool.length;
    });

  // Pick top 3 distinct modes, respecting avoidIfCoPresent constraints
  const pickedModes: DesignMode[] = [];
  const pickedScored: ScoredMode[] = [];

  for (const s of scored) {
    if (pickedModes.length >= 3) break;
    if (s.score < -50) continue; // gated/ineligible
    // Avoid co-presence conflicts
    const meta = DESIGN_MODE_META[s.mode];
    const conflicts = meta.avoidIfCoPresent.some((m) => pickedModes.includes(m));
    if (conflicts) continue;
    if (!pickedModes.includes(s.mode)) {
      pickedModes.push(s.mode);
      pickedScored.push(s);
    }
  }

  // Safety fallback: if we couldn't get 3 distinct modes, repeat from scored list
  // (this can only happen if the default pool is very small, which is a config error)
  let usedFallback = false;
  if (pickedModes.length < 3) {
    usedFallback = true;
    const fallbacks: DesignMode[] = ["cinematic_atmospheric", "minimal_editorial", "modern_abstract"];
    for (const fb of fallbacks) {
      if (pickedModes.length >= 3) break;
      if (!pickedModes.includes(fb)) {
        pickedModes.push(fb);
        pickedScored.push({ mode: fb, score: 0, reasons: ["emergency_fallback"] });
      }
    }
  }

  const labels = ["A", "B", "C"] as const;
  const lanes = labels.map((lane, i) => {
    const mode = pickedModes[i];
    const s = pickedScored[i];
    const meta = DESIGN_MODE_META[mode];
    return {
      lane,
      mode,
      rationale: s.reasons.join(", "),
      referenceAnchors: meta.referenceAnchors,
      forced: false,
      usedFallback,
    } satisfies LaneDesignMode;
  }) as [LaneDesignMode, LaneDesignMode, LaneDesignMode];

  const summary = lanes.map((l) => `${l.lane}=${l.mode}`).join(" ");
  const allDistinct = new Set(lanes.map((l) => l.mode)).size === 3;

  return {
    lanes,
    summary,
    allDistinct,
    detectedCharacteristics,
    scored,
  };
}
