import "server-only";

import { getMotifBankContext, type MotifBankContext } from "@/lib/bible-motif-bank";
import { GENERIC_CHRISTIAN_MOTIFS, isGenericMotif } from "@/lib/motif-guardrails";
import { getOpenAI } from "@/lib/openai";

export type BibleCreativeBrief = {
  // High-level art-direction summary used in background prompt context.
  summary: string;
  // Conceptual ideas to steer mood and composition.
  themes: string[];
  // Concrete visual cues for background/ornament language (symbolic only).
  motifs: string[];
  // Generic icons that are explicitly permitted for this series context (usually empty).
  allowedGenericMotifs: string[];
  // Adjectives used to tune title/subtitle lockup tone.
  typographyMood: string[];
  // Small emblem concepts used when one direction requests a series mark attempt.
  markIdeas: string[];
  // Safety and quality guardrails passed to prompt builders.
  doNotUse: string[];
};

export type ExtractBibleCreativeBriefParams = {
  title: string;
  subtitle?: string | null;
  scripturePassages?: string | null;
  description?: string | null;
  designNotes?: string | null;
  motifBankContext?: MotifBankContext;
};

const BIBLE_BRIEF_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "themes", "motifs", "allowedGenericMotifs", "typographyMood", "markIdeas", "doNotUse"],
  properties: {
    summary: { type: "string" },
    themes: {
      type: "array",
      minItems: 4,
      maxItems: 8,
      items: { type: "string" }
    },
    motifs: {
      type: "array",
      minItems: 6,
      maxItems: 10,
      items: { type: "string" }
    },
    allowedGenericMotifs: {
      type: "array",
      minItems: 0,
      maxItems: 4,
      items: { type: "string" }
    },
    typographyMood: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: { type: "string" }
    },
    markIdeas: {
      type: "array",
      minItems: 3,
      maxItems: 6,
      items: { type: "string" }
    },
    doNotUse: {
      type: "array",
      items: { type: "string" }
    }
  }
} as const;

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "series",
  "church",
  "sermon",
  "title",
  "subtitle",
  "verse",
  "verses",
  "chapter",
  "chapters",
  "book",
  "books"
]);

const FACE_CENTRIC_PATTERN = /\b(face|portrait|headshot|jesus\s+face|realistic\s+person|person\s+portrait)\b/i;
const MARK_TEXT_PATTERN = /\b(wordmark|text\s+lockup|lettering|extra\s+words?|slogan)\b/i;

const DEFAULT_THEMES = [
  "scripture-rooted identity",
  "hope under pressure",
  "renewal and formation",
  "community and belonging",
  "faithful endurance",
  "grace and transformation"
];
const DEFAULT_TYPOGRAPHY_MOOD = ["reverent", "clear", "confident"];
const DEFAULT_MARK_IDEAS = [
  "single-color symbolic seal",
  "monoline object icon",
  "geometric scripture-inspired crest"
];
const DEFAULT_DO_NOT_USE = [
  "no photoreal faces",
  "no portrait of Jesus",
  "no UI labels",
  "no stock watermark look",
  "no extra words beyond title/subtitle",
  "avoid generic Christian stock motifs unless directly justified by this series context"
];

const GENERIC_MOTIF_BAN_PHRASES = GENERIC_CHRISTIAN_MOTIFS.map((item) => `avoid generic ${item}`);

function truncate(value: string | null | undefined, maxLength: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    return "";
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3 && !STOP_WORDS.has(item));
}

function uniqueStrings(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const normalized = item.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(item.trim());
  }
  return result;
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeList(params: {
  value: unknown;
  min: number;
  max: number;
  fallback: string[];
  disallowPattern?: RegExp;
}): string[] {
  const raw = Array.isArray(params.value)
    ? params.value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  const filtered = raw.filter((item) => !(params.disallowPattern && params.disallowPattern.test(item)));
  const deduped = uniqueStrings(filtered);

  const merged = [...deduped];
  for (const fallbackItem of params.fallback) {
    if (merged.length >= params.max) {
      break;
    }
    if (!merged.some((item) => item.toLowerCase() === fallbackItem.toLowerCase())) {
      merged.push(fallbackItem);
    }
  }

  const sized = merged.slice(0, params.max);
  if (sized.length >= params.min) {
    return sized;
  }

  return params.fallback.slice(0, params.max);
}

function parseResponseText(response: unknown): string {
  if (!response || typeof response !== "object") {
    return "";
  }

  const outputText = (response as { output_text?: unknown }).output_text;
  if (typeof outputText === "string" && outputText.trim()) {
    return outputText;
  }

  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return "";
  }

  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const segment of content) {
      if (!segment || typeof segment !== "object") {
        continue;
      }
      const textValue = (segment as { text?: unknown }).text;
      if (typeof textValue === "string" && textValue.trim()) {
        chunks.push(textValue.trim());
      }
    }
  }

  return chunks.join("\n").trim();
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  if (!text.trim()) {
    return null;
  }

  const normalized = text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(normalized);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    const firstBrace = normalized.indexOf("{");
    const lastBrace = normalized.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        const sliced = JSON.parse(normalized.slice(firstBrace, lastBrace + 1));
        if (sliced && typeof sliced === "object" && !Array.isArray(sliced)) {
          return sliced as Record<string, unknown>;
        }
      } catch {
        return null;
      }
    }
    return null;
  }

  return null;
}

function resolveMotifBankContext(params: ExtractBibleCreativeBriefParams): MotifBankContext {
  return (
    params.motifBankContext ||
    getMotifBankContext({
      title: params.title,
      subtitle: params.subtitle,
      scripturePassages: params.scripturePassages,
      description: params.description,
      designNotes: params.designNotes
    })
  );
}

function inferThemeHints(params: ExtractBibleCreativeBriefParams, motifBankContext: MotifBankContext): string[] {
  const source = [params.title, params.subtitle || "", params.scripturePassages || "", params.description || "", params.designNotes || ""]
    .filter(Boolean)
    .join(" ");
  const tokenText = tokenize(source).join(" ");

  const themes: string[] = [];
  const addTheme = (value: string) => {
    if (!themes.includes(value)) {
      themes.push(value);
    }
  };

  if (motifBankContext.bookNames.length > 0) {
    addTheme(`${motifBankContext.bookNames[0]} passage context`);
  }
  if (motifBankContext.topicNames.length > 0) {
    addTheme(`${motifBankContext.topicNames[0]} topical context`);
  } else if (motifBankContext.bookNames.length === 0 && motifBankContext.fallbackMode === "genre") {
    addTheme("genre-driven scripture context");
  }

  for (const tone of motifBankContext.toneHints.slice(0, 3)) {
    addTheme(`${tone} biblical tone`);
  }

  if (/\badoption|inheritance|sonship|daughtership|family\b/.test(tokenText)) {
    addTheme("belonging and inheritance");
  }
  if (/\blight|dark|lamp|dawn|shine\b/.test(tokenText)) {
    addTheme("light in contrast");
  }
  if (/\bwater|river|sea|well|stream|jar\b/.test(tokenText)) {
    addTheme("renewal and provision");
  }
  if (/\bfreedom|liberty|chains?|yoke|release\b/.test(tokenText)) {
    addTheme("freedom from bondage");
  }
  if (/\btable|meal|bread|cup|communion|feast\b/.test(tokenText)) {
    addTheme("table fellowship");
  }
  if (/\bjourney|road|path|pilgrim|wilderness\b/.test(tokenText)) {
    addTheme("pilgrimage and formation");
  }
  if (/\bjustice|mercy|repent|restoration\b/.test(tokenText)) {
    addTheme("justice and restoration");
  }

  return normalizeList({
    value: themes,
    min: 4,
    max: 8,
    fallback: DEFAULT_THEMES
  });
}

function ensureCandidateCoverage(params: {
  values: string[];
  candidates: string[];
  minFromCandidates: number;
  max: number;
}): string[] {
  const result = uniqueStrings(params.values).slice(0, params.max);
  if (params.minFromCandidates <= 0) {
    return result;
  }

  const candidateSet = new Set(params.candidates.map((item) => normalizeKey(item)));
  let candidateCount = result.filter((item) => candidateSet.has(normalizeKey(item))).length;

  for (const candidate of params.candidates) {
    if (candidateCount >= params.minFromCandidates || result.length >= params.max) {
      break;
    }

    const normalizedCandidate = normalizeKey(candidate);
    if (result.some((item) => normalizeKey(item) === normalizedCandidate)) {
      continue;
    }
    result.push(candidate);
    candidateCount += 1;
  }

  return result.slice(0, params.max);
}

function seededGenericSet(motifBankContext: MotifBankContext): Set<string> {
  return new Set(
    uniqueStrings([...motifBankContext.motifCandidates, ...motifBankContext.allowedGenericMotifs]).map((item) =>
      normalizeKey(item)
    )
  );
}

function filterMotifsByGenericPolicy(motifs: string[], motifBankContext: MotifBankContext): string[] {
  const seededSet = seededGenericSet(motifBankContext);
  return motifs.filter((motif) => !isGenericMotif(motif) || seededSet.has(normalizeKey(motif)));
}

function buildFallbackBrief(params: ExtractBibleCreativeBriefParams, motifBankContext: MotifBankContext): BibleCreativeBrief {
  const summaryTitle = truncate(params.title, 120) || "Untitled Series";
  const summaryReference = truncate(params.scripturePassages, 120);
  const summaryDescription = truncate(params.description, 180);
  const summaryBooks = motifBankContext.bookNames.length > 0 ? motifBankContext.bookNames.join(", ") : "No explicit book detected";
  const summaryTopics = motifBankContext.topicNames.length > 0 ? motifBankContext.topicNames.join(", ") : "No explicit topic detected";

  const summary = [
    `Symbolic creative brief for "${summaryTitle}".`,
    `Book context: ${summaryBooks}.`,
    `Topic context: ${summaryTopics}.`,
    summaryReference ? `Passage context: ${summaryReference}.` : "Passage context is broad and should stay symbolic.",
    summaryDescription ? `Mood context: ${summaryDescription}.` : "Mood context should remain reverent, modern, and uncluttered."
  ].join(" ");

  const themes = inferThemeHints(params, motifBankContext);

  const motifs = filterMotifsByGenericPolicy(
    ensureCandidateCoverage({
      values: motifBankContext.motifCandidates.slice(0, 6),
      candidates: motifBankContext.motifCandidates,
      minFromCandidates: motifBankContext.fallbackMode === "none" ? 0 : 5,
      max: 10
    }),
    motifBankContext
  );

  const markIdeas = normalizeList({
    value: ensureCandidateCoverage({
      values: motifBankContext.markIdeaCandidates.slice(0, 3),
      candidates: motifBankContext.markIdeaCandidates,
      minFromCandidates: motifBankContext.fallbackMode === "none" ? 0 : 2,
      max: 6
    }),
    min: 3,
    max: 6,
    fallback: DEFAULT_MARK_IDEAS,
    disallowPattern: MARK_TEXT_PATTERN
  });

  const moodTokens: string[] = [];
  const tokenText = tokenize([params.title, params.subtitle || "", params.description || "", params.designNotes || ""].join(" ")).join(" ");
  if (/\bminimal|clean|simple\b/.test(tokenText)) moodTokens.push("minimal");
  if (/\bbold|strong|confident\b/.test(tokenText)) moodTokens.push("bold");
  if (/\bquiet|gentle|calm|peace\b/.test(tokenText)) moodTokens.push("calm");
  if (/\bclassic|heritage|vintage\b/.test(tokenText)) moodTokens.push("heritage");
  if (/\bcinematic|dramatic\b/.test(tokenText)) moodTokens.push("cinematic");

  for (const toneHint of motifBankContext.toneHints.slice(0, 2)) {
    moodTokens.push(toneHint);
  }

  const typographyMood = normalizeList({
    value: moodTokens,
    min: 2,
    max: 5,
    fallback: DEFAULT_TYPOGRAPHY_MOOD
  });

  const seededSet = seededGenericSet(motifBankContext);
  const allowedGenericMotifs = uniqueStrings(
    [
      ...motifBankContext.allowedGenericMotifs,
      ...motifs.filter((motif) => isGenericMotif(motif) && seededSet.has(normalizeKey(motif)))
    ].filter((motif) => isGenericMotif(motif) && seededSet.has(normalizeKey(motif)))
  ).slice(0, 4);

  return {
    summary,
    themes,
    motifs: normalizeList({
      value: motifs,
      min: 6,
      max: 10,
      fallback: motifBankContext.motifCandidates.slice(0, 10)
    }),
    allowedGenericMotifs,
    typographyMood,
    markIdeas,
    doNotUse: uniqueStrings([
      ...DEFAULT_DO_NOT_USE,
      ...motifBankContext.antiMotifs,
      ...GENERIC_MOTIF_BAN_PHRASES
    ])
  };
}

function coerceBrief(
  parsed: Record<string, unknown> | null,
  fallback: BibleCreativeBrief,
  motifBankContext: MotifBankContext
): BibleCreativeBrief {
  if (!parsed) {
    return fallback;
  }

  const summary = typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : fallback.summary;

  const themes = normalizeList({
    value: parsed.themes,
    min: 4,
    max: 8,
    fallback: fallback.themes
  });

  const parsedMotifs = normalizeList({
    value: parsed.motifs,
    min: 6,
    max: 10,
    fallback: fallback.motifs,
    disallowPattern: FACE_CENTRIC_PATTERN
  });

  const motifs = normalizeList({
    value: ensureCandidateCoverage({
      values: filterMotifsByGenericPolicy(parsedMotifs, motifBankContext),
      candidates: motifBankContext.motifCandidates,
      minFromCandidates: motifBankContext.fallbackMode === "none" ? 0 : 5,
      max: 10
    }),
    min: 6,
    max: 10,
    fallback: fallback.motifs
  });

  const markIdeas = normalizeList({
    value: ensureCandidateCoverage({
      values: normalizeList({
        value: parsed.markIdeas,
        min: 3,
        max: 6,
        fallback: fallback.markIdeas,
        disallowPattern: MARK_TEXT_PATTERN
      }),
      candidates: motifBankContext.markIdeaCandidates,
      minFromCandidates: motifBankContext.fallbackMode === "none" ? 0 : 2,
      max: 6
    }),
    min: 3,
    max: 6,
    fallback: fallback.markIdeas,
    disallowPattern: MARK_TEXT_PATTERN
  });

  const seededSet = seededGenericSet(motifBankContext);
  const requestedAllowedGeneric = normalizeList({
    value: parsed.allowedGenericMotifs,
    min: 0,
    max: 4,
    fallback: fallback.allowedGenericMotifs
  }).filter((item) => isGenericMotif(item) && seededSet.has(normalizeKey(item)));

  const allowedGenericMotifs = uniqueStrings([
    ...requestedAllowedGeneric,
    ...motifs.filter((item) => isGenericMotif(item) && seededSet.has(normalizeKey(item)))
  ]).slice(0, 4);

  const doNotUse = uniqueStrings([
    ...normalizeList({
      value: parsed.doNotUse,
      min: 6,
      max: 20,
      fallback: fallback.doNotUse
    }),
    ...DEFAULT_DO_NOT_USE,
    ...motifBankContext.antiMotifs,
    ...GENERIC_MOTIF_BAN_PHRASES
  ]);

  if (!doNotUse.some((item) => /photoreal\s+faces?/i.test(item))) {
    doNotUse.push("no photoreal faces");
  }
  if (!doNotUse.some((item) => /portrait\s+of\s+jesus/i.test(item))) {
    doNotUse.push("no portrait of Jesus");
  }
  if (!doNotUse.some((item) => /generic\s+christian\s+stock\s+motifs?/i.test(item))) {
    doNotUse.push("avoid generic Christian stock motifs unless directly justified by this series context");
  }

  return {
    summary,
    themes,
    motifs: uniqueStrings(motifs),
    allowedGenericMotifs,
    typographyMood: normalizeList({
      value: parsed.typographyMood,
      min: 2,
      max: 5,
      fallback: fallback.typographyMood
    }),
    markIdeas,
    doNotUse
  };
}

function motifsNeedSpecificityRetry(brief: BibleCreativeBrief, motifBankContext: MotifBankContext): boolean {
  if (!brief.motifs.length) {
    return false;
  }

  const seededSet = seededGenericSet(motifBankContext);
  const genericCount = brief.motifs.filter(
    (motif) => isGenericMotif(motif) && !seededSet.has(normalizeKey(motif))
  ).length;
  const ratio = genericCount / Math.max(1, brief.motifs.length);
  const allGenericAndUnseeded = brief.motifs.every(
    (motif) => isGenericMotif(motif) && !seededSet.has(normalizeKey(motif))
  );
  return ratio > 0.4 || allGenericAndUnseeded;
}

const BIBLE_BRIEF_SYSTEM_PROMPT =
  "You are a Christian creative director. Derive visual motifs from series context and prioritize concrete, book-specific visual metaphors over generic icon language. Keep theology broad and non-denominational; focus on visual specificity.";

export async function extractBibleCreativeBrief(params: ExtractBibleCreativeBriefParams): Promise<BibleCreativeBrief> {
  const motifBankContext = resolveMotifBankContext(params);
  const fallback = buildFallbackBrief(params, motifBankContext);

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return fallback;
  }

  const motifCandidates = motifBankContext.motifCandidates.slice(0, 30);
  const markIdeaCandidates = motifBankContext.markIdeaCandidates.slice(0, 15);
  const antiMotifs = motifBankContext.antiMotifs.slice(0, 30);
  const allowedGenericSeedMotifs = motifBankContext.allowedGenericMotifs.slice(0, 6);
  const motifScopeRuleLine =
    motifBankContext.scriptureScope === "whole_book"
      ? "MOTIF SCOPE RULE: If this is a whole-book series, use book-wide themes as symbols. Do NOT pick a single story scene as the main symbol unless notes request it."
      : "";
  const wholeBookSceneRuleLine =
    motifBankContext.scriptureScope === "whole_book" && !motifBankContext.sceneMotifRequested
      ? "Do not prioritize scene motifs for motif selection. Keep motif language representative of whole-book themes."
      : "";

  const prompt = [
    "Return JSON only. No markdown. No prose outside JSON.",
    `JSON Schema: ${JSON.stringify(BIBLE_BRIEF_JSON_SCHEMA)}`,
    "Use concise strings. Keep motifs purely visual nouns or short noun phrases.",
    "Motifs must be book/passage/topic-specific and concrete: objects, scenes, or metaphors tied to THIS text context.",
    "SELECT motifs primarily from motifCandidates. Treat motifCandidates as a seeded bank.",
    motifBankContext.fallbackMode === "none"
      ? "If motifCandidates are broad fallback motifs, keep outputs concrete and non-generic."
      : "Return 6-10 motifs total with at least 5 selected from motifCandidates.",
    motifBankContext.fallbackMode === "none"
      ? "Return 3-6 markIdeas total from context-aware visual symbols."
      : "Return 3-6 markIdeas total with at least 2 selected from markIdeaCandidates.",
    "Return 4-8 short themes.",
    motifScopeRuleLine,
    wholeBookSceneRuleLine,
    `Do NOT use generic Christian icon language (${GENERIC_CHRISTIAN_MOTIFS.join(", ")}) unless the motif appears in motifCandidates or allowedGenericSeedMotifs.`,
    "allowedGenericMotifs should be empty by default; only include generic motifs that are explicitly seeded in motifCandidates or allowedGenericSeedMotifs.",
    "doNotUse must include antiMotifs and generic motif bans.",
    "Avoid face-centric depictions; prioritize symbolic imagery.",
    `Detected book keys: ${motifBankContext.bookKeys.join(", ") || "(none)"}`,
    `Detected book names: ${motifBankContext.bookNames.join(", ") || "(none)"}`,
    `Detected topic keys: ${motifBankContext.topicKeys.join(", ") || "(none)"}`,
    `Detected topic names: ${motifBankContext.topicNames.join(", ") || "(none)"}`,
    `Scripture scope: ${motifBankContext.scriptureScope}`,
    `Fallback mode: ${motifBankContext.fallbackMode}`,
    `motifCandidates: ${motifCandidates.join(" | ") || "(none)"}`,
    `markIdeaCandidates: ${markIdeaCandidates.join(" | ") || "(none)"}`,
    `antiMotifs: ${antiMotifs.join(" | ") || "(none)"}`,
    `allowedGenericSeedMotifs: ${allowedGenericSeedMotifs.join(" | ") || "(none)"}`,
    `Title: ${truncate(params.title, 200) || ""}`,
    `Subtitle: ${truncate(params.subtitle, 200) || ""}`,
    `Scripture passages (raw): ${truncate(params.scripturePassages, 300) || ""}`,
    `Series description: ${truncate(params.description, 450) || ""}`,
    `Design notes: ${truncate(params.designNotes, 300) || ""}`
  ].join("\n");

  try {
    const response = await getOpenAI().responses.create({
      model: process.env.OPENAI_MAIN_MODEL?.trim() || "gpt-4.1-mini",
      temperature: 0,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: BIBLE_BRIEF_SYSTEM_PROMPT
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt
            }
          ]
        }
      ]
    });

    const firstParsed = parseJsonObject(parseResponseText(response));
    if (!firstParsed) {
      return fallback;
    }

    const firstBrief = coerceBrief(firstParsed, fallback, motifBankContext);
    if (!motifsNeedSpecificityRetry(firstBrief, motifBankContext)) {
      return firstBrief;
    }

    const strictRetryPrompt = [
      prompt,
      `Prior motifs were too generic: ${firstBrief.motifs.join(", ") || "(none)"}.`,
      "Your prior motifs were too generic or drifted from motifCandidates.",
      "No generic Christian icons unless that motif appears in motifCandidates or allowedGenericSeedMotifs.",
      motifBankContext.fallbackMode === "none"
        ? "Provide 6-10 concrete motifs with clear object/scene specificity."
        : "Provide 6-10 motifs with at least 5 selected from motifCandidates.",
      motifBankContext.fallbackMode === "none"
        ? "Provide 3-6 concrete markIdeas."
        : "Provide 3-6 markIdeas with at least 2 selected from markIdeaCandidates.",
      "Ensure doNotUse includes antiMotifs and generic motif bans."
    ].join("\n");

    const retryResponse = await getOpenAI().responses.create({
      model: process.env.OPENAI_MAIN_MODEL?.trim() || "gpt-4.1-mini",
      temperature: 0,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: BIBLE_BRIEF_SYSTEM_PROMPT
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: strictRetryPrompt
            }
          ]
        }
      ]
    });

    const retryParsed = parseJsonObject(parseResponseText(retryResponse));
    if (!retryParsed) {
      return firstBrief;
    }
    return coerceBrief(retryParsed, firstBrief, motifBankContext);
  } catch {
    return fallback;
  }
}
