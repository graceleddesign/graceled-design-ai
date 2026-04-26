/**
 * Deterministic V2 brief signal planner.
 *
 * Produces `toneHint` and `motifHints` from project text fields — no LLM calls.
 *
 * Design constraints:
 * - Pure function, no side effects.
 * - Conservative: false confidence is worse than neutral fallback.
 * - Motifs are abstract/compositional nouns — not cheesy clip-art keywords.
 * - Tone scoring requires at least 2 matching signals for non-neutral output,
 *   except for explicit design-note overrides which require only 1.
 * - Returns at most 4 motif hints.
 */

import type { TonalVariant } from "../grammars";

// ── Public types ──────────────────────────────────────────────────────────────

export interface BriefSignalInput {
  title: string;
  subtitle?: string | null;
  scripturePassages?: string | null;
  description?: string | null;
  designNotes?: string | null;
}

export type ToneSource =
  | "explicit_design_note"
  | "title_keywords"
  | "description_keywords"
  | "scripture_keywords"
  | "fallback";

export interface BriefSignalDebug {
  /** How the tone was decided. */
  toneSource: ToneSource;
  /** Words/phrases that triggered the tone choice. */
  toneSignalWords: string[];
  /** Where each motif hint came from, e.g. ["scripture:john", "title:deep"]. */
  motifSources: string[];
}

export interface BriefSignals {
  toneHint: TonalVariant;
  motifHints: string[];
  debug: BriefSignalDebug;
}

// ── Tone inference ────────────────────────────────────────────────────────────

// Signal words for each tone, matched case-insensitively as substrings.
// Neutral has no signals — it is the fallback when nothing else scores.
const TONE_SIGNALS: Readonly<Record<Exclude<TonalVariant, "neutral">, readonly string[]>> = {
  light: [
    "light", "glory", "glorious", "radiant", "radiance",
    "hope", "hopeful", "resurrection", "risen", "rise",
    "dawn", "daybreak", "bright", "brightness", "shine",
    "illuminate", "illumination", "heaven", "ascend", "ascension",
    "glorif", "transfigur", "new life", "eternal life",
    "sunrise", "morning", "living light",
  ],
  vivid: [
    "joy", "joyful", "celebrat", "mission", "bold", "boldly",
    "abundance", "abundant", "feast", "feasting",
    "jubilee", "pentecost", "spirit", "alive", "living",
  ],
  dark: [
    "lament", "suffering", "suffer", "cross", "crucif",
    "wilderness", "night", "deep", "shadow", "valley",
    "darkness", "grief", "mourn", "desert", "exile",
    "sacrifice", "broken", "tomb", "gethsemane", "golgotha",
    "anguish", "sorrows", "trial", "betrayal",
  ],
  mono: [
    "simple", "minimal", "minimalist",
    "quiet", "stillness", "silence", "meditation", "contemplat",
    "ashes", "ash wednesday", "lenten", "lent",
    "repentance", "monochrome", "black and white",
  ],
};

// Minimum number of matched signals required to commit to a non-neutral tone.
// Explicit design-note matches only need 1 (user said it directly).
const INFER_THRESHOLD = 2;
const EXPLICIT_THRESHOLD = 1;

function scoreTone(text: string): Record<Exclude<TonalVariant, "neutral">, string[]> {
  const lower = text.toLowerCase();
  const matched: Record<Exclude<TonalVariant, "neutral">, string[]> = {
    light: [], vivid: [], dark: [], mono: [],
  };
  for (const [tone, signals] of Object.entries(TONE_SIGNALS) as [Exclude<TonalVariant, "neutral">, readonly string[]][]) {
    for (const sig of signals) {
      if (lower.includes(sig) && !matched[tone].includes(sig)) {
        matched[tone].push(sig);
      }
    }
  }
  return matched;
}

function pickTone(
  matched: Record<Exclude<TonalVariant, "neutral">, string[]>,
  threshold: number
): { tone: TonalVariant; signals: string[] } {
  let best: Exclude<TonalVariant, "neutral"> | null = null;
  let bestCount = 0;
  for (const [tone, signals] of Object.entries(matched) as [Exclude<TonalVariant, "neutral">, string[]][]) {
    if (signals.length >= threshold && signals.length > bestCount) {
      best = tone;
      bestCount = signals.length;
    }
  }
  if (best) return { tone: best, signals: matched[best] };
  return { tone: "neutral", signals: [] };
}

// ── Scripture-aware motif inference ──────────────────────────────────────────

// Each entry: [match_substring_lower, motif_hints[], source_label]
const SCRIPTURE_MOTIF_RULES: Array<[string, string[], string]> = [
  // John / Gospel of John
  ["gospel of john", ["light", "water", "vine", "bread"], "scripture:john"],
  ["john", ["light", "water", "vine", "doorway"], "scripture:john"],
  // Ruth
  ["ruth", ["grain field", "harvest", "redemption"], "scripture:ruth"],
  // Psalms
  ["psalm", ["mountain", "still water", "shepherd", "refuge"], "scripture:psalms"],
  // Exodus
  ["exodus", ["wilderness", "flame", "crossing", "doorway"], "scripture:exodus"],
  // Genesis
  ["genesis", ["garden", "light", "roots", "seeds"], "scripture:genesis"],
  // Isaiah
  ["isaiah", ["light", "mountain", "river", "servant"], "scripture:isaiah"],
  // Revelation
  ["revelation", ["light", "city", "river", "crown"], "scripture:revelation"],
  // Acts
  ["acts", ["flame", "wind", "movement"], "scripture:acts"],
  // Hebrews
  ["hebrews", ["mountain", "anchor", "fire", "cloud"], "scripture:hebrews"],
  // Advent/Christmas via common passages
  ["isaiah 9", ["light", "dawn", "radiance"], "scripture:isaiah9"],
  ["luke 2", ["light", "star", "manger"], "scripture:luke2"],
  ["matthew 2", ["star", "light", "journey"], "scripture:matthew2"],
];

function motifFromScripture(scripturePassages: string): { motifs: string[]; sources: string[] } {
  const lower = scripturePassages.toLowerCase();
  const motifs: string[] = [];
  const sources: string[] = [];

  for (const [pattern, hints, source] of SCRIPTURE_MOTIF_RULES) {
    if (lower.includes(pattern)) {
      for (const hint of hints) {
        if (!motifs.includes(hint)) motifs.push(hint);
      }
      sources.push(source);
      if (motifs.length >= 4) break;
    }
  }

  return { motifs, sources };
}

// ── Keyword-driven motif inference ────────────────────────────────────────────

// [keyword_lower, motif_hints[], source_suffix]
// Applied to title + subtitle + description text.
const KEYWORD_MOTIF_RULES: Array<[string, string[], string]> = [
  // Water / depth
  ["deep water", ["deep water", "ocean depth"], "keyword:deep_water"],
  ["ocean", ["ocean", "deep water"], "keyword:ocean"],
  ["deep", ["depth", "still water"], "keyword:deep"],
  ["water", ["water", "river"], "keyword:water"],
  ["river", ["river", "flowing water"], "keyword:river"],
  ["sea", ["water", "horizon"], "keyword:sea"],
  // Light / radiance
  ["resurrection", ["garden", "dawn light", "stone"], "keyword:resurrection"],
  ["risen", ["garden", "dawn light", "stone"], "keyword:risen"],
  ["radianc", ["radiance", "light"], "keyword:radiance"],
  ["glory", ["radiance", "light"], "keyword:glory"],
  ["light", ["light", "radiance"], "keyword:light"],
  ["dawn", ["dawn light", "horizon"], "keyword:dawn"],
  ["advent", ["candle light", "waiting", "dawn light"], "keyword:advent"],
  ["christmas", ["star light", "doorway", "dawn light"], "keyword:christmas"],
  ["easter", ["garden", "stone", "dawn light"], "keyword:easter"],
  // Fire / spirit
  ["fire", ["flame", "wind"], "keyword:fire"],
  ["flame", ["flame"], "keyword:flame"],
  ["spirit", ["wind", "flame"], "keyword:spirit"],
  // Rest / stillness
  ["sabbath", ["stillness", "open water", "horizon"], "keyword:sabbath"],
  ["rest", ["stillness", "horizon", "open water"], "keyword:rest"],
  ["stillness", ["stillness", "still water"], "keyword:stillness"],
  // Growth / abundance
  ["generosity", ["open hands", "grain field", "abundance"], "keyword:generosity"],
  ["giving", ["open hands", "grain field"], "keyword:giving"],
  ["abundance", ["grain field", "abundance", "vine"], "keyword:abundance"],
  ["harvest", ["grain field", "harvest"], "keyword:harvest"],
  ["vine", ["vine", "branches"], "keyword:vine"],
  // Path / journey
  ["journey", ["path", "horizon"], "keyword:journey"],
  ["mission", ["path", "horizon", "movement"], "keyword:mission"],
  ["way", ["path"], "keyword:way"],
  ["go", ["path", "movement"], "keyword:go"],
  // Cross / sacrifice
  ["cross", ["stone", "shadow", "veil"], "keyword:cross"],
  ["sacrifice", ["stone", "shadow"], "keyword:sacrifice"],
  ["suffering", ["shadow", "stone", "wilderness"], "keyword:suffering"],
  // Foundation / basics
  ["foundation", ["stone", "roots", "ground"], "keyword:foundation"],
  ["basics", ["stone", "roots"], "keyword:basics"],
  ["roots", ["roots", "ground"], "keyword:roots"],
  // Wilderness / desert
  ["wilderness", ["wilderness", "stone", "horizon"], "keyword:wilderness"],
  ["desert", ["wilderness", "stone", "sand"], "keyword:desert"],
  // New / renewal
  ["new creation", ["garden", "seeds", "dawn light"], "keyword:new_creation"],
  ["renewal", ["garden", "seeds", "dawn light"], "keyword:renewal"],
  ["new", ["seeds", "garden"], "keyword:new"],
  // Psalm-style
  ["psalm 23", ["still water", "shepherd", "shadow valley"], "keyword:psalm23"],
  ["valley", ["shadow valley", "wilderness", "mountain"], "keyword:valley"],
  ["shepherd", ["shepherd", "still water", "mountain"], "keyword:shepherd"],
  ["mountain", ["mountain", "stone"], "keyword:mountain"],
  // Other specific series names
  ["back to basics", ["stone", "roots", "ground"], "keyword:back_to_basics"],
  ["unbroken", ["roots", "stone", "wholeness"], "keyword:unbroken"],
];

function motifFromKeywords(text: string, sourcePrefix: string): { motifs: string[]; sources: string[] } {
  const lower = text.toLowerCase();
  const motifs: string[] = [];
  const sources: string[] = [];

  for (const [keyword, hints, source] of KEYWORD_MOTIF_RULES) {
    if (lower.includes(keyword)) {
      let added = false;
      for (const hint of hints) {
        if (!motifs.includes(hint)) {
          motifs.push(hint);
          added = true;
        }
      }
      if (added) sources.push(source);
      if (motifs.length >= 5) break;
    }
  }

  return { motifs, sources };
}

// ── Main planner ──────────────────────────────────────────────────────────────

/**
 * Deterministic brief signal planner.
 *
 * Returns a toneHint and motifHints derived from project text fields.
 * Requires no LLM calls and is fully testable.
 *
 * Priority order for tone:
 *   1. Explicit tone word in designNotes (threshold = 1 signal)
 *   2. Title + subtitle keyword match (threshold = 2 signals)
 *   3. Description keyword match (threshold = 2 signals)
 *   4. Scripture keyword match (threshold = 1 signal, conservative)
 *   5. Fallback: neutral
 *
 * Priority order for motifs:
 *   1. Scripture-specific motif rules
 *   2. Title + subtitle keywords
 *   3. Description keywords
 *   (deduplicated, capped at 4)
 */
export function planBriefSignals(input: BriefSignalInput): BriefSignals {
  const { title, subtitle, scripturePassages, description, designNotes } = input;

  // ── Tone ─────────────────────────────────────────────────────────────────

  let toneHint: TonalVariant = "neutral";
  let toneSource: ToneSource = "fallback";
  let toneSignalWords: string[] = [];

  // 1. Explicit design note (user-written, trust more)
  if (designNotes) {
    const noteMatches = scoreTone(designNotes);
    const result = pickTone(noteMatches, EXPLICIT_THRESHOLD);
    if (result.tone !== "neutral") {
      toneHint = result.tone;
      toneSource = "explicit_design_note";
      toneSignalWords = result.signals;
    }
  }

  // 2. Title + subtitle (strong signal — user chose these words deliberately)
  if (toneSource === "fallback") {
    const titleText = [title, subtitle].filter(Boolean).join(" ");
    const titleMatches = scoreTone(titleText);
    const result = pickTone(titleMatches, INFER_THRESHOLD);
    if (result.tone !== "neutral") {
      toneHint = result.tone;
      toneSource = "title_keywords";
      toneSignalWords = result.signals;
    }
  }

  // 3. Description keywords (moderate signal)
  if (toneSource === "fallback" && description) {
    const descMatches = scoreTone(description);
    const result = pickTone(descMatches, INFER_THRESHOLD);
    if (result.tone !== "neutral") {
      toneHint = result.tone;
      toneSource = "description_keywords";
      toneSignalWords = result.signals;
    }
  }

  // 4. Scripture passage keywords (light inference only — scriptures often cover many tones)
  if (toneSource === "fallback" && scripturePassages) {
    const scriptureMatches = scoreTone(scripturePassages);
    // Conservative: require 2 signals even from scripture
    const result = pickTone(scriptureMatches, 2);
    if (result.tone !== "neutral") {
      toneHint = result.tone;
      toneSource = "scripture_keywords";
      toneSignalWords = result.signals;
    }
  }

  // ── Motifs ────────────────────────────────────────────────────────────────

  const allMotifs: string[] = [];
  const allMotifSources: string[] = [];

  function addMotifs(motifs: string[], sources: string[]) {
    for (const m of motifs) {
      if (!allMotifs.includes(m) && allMotifs.length < 4) {
        allMotifs.push(m);
      }
    }
    for (const s of sources) {
      if (!allMotifSources.includes(s)) {
        allMotifSources.push(s);
      }
    }
  }

  // 1. Scripture-specific motifs (most reliable mapping)
  if (scripturePassages) {
    const { motifs, sources } = motifFromScripture(scripturePassages);
    addMotifs(motifs, sources);
  }

  // 2. Title + subtitle keywords
  const titleText = [title, subtitle].filter(Boolean).join(" ");
  if (titleText) {
    const { motifs, sources } = motifFromKeywords(titleText, "title");
    addMotifs(motifs, sources);
  }

  // 3. Description keywords
  if (description && allMotifs.length < 3) {
    const { motifs, sources } = motifFromKeywords(description, "desc");
    addMotifs(motifs, sources);
  }

  return {
    toneHint,
    motifHints: allMotifs,
    debug: {
      toneSource,
      toneSignalWords,
      motifSources: allMotifSources,
    },
  };
}
