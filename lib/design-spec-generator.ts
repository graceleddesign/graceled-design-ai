import { createHash } from "crypto";
import { openai } from "@/lib/openai";
import {
  DESIGN_SPEC_SCHEMA,
  type DesignSpec
} from "@/lib/design-spec";
import { buildSymbolDirectives } from "@/lib/motif-symbol-directives";

type GenerateDesignSpecParams = {
  projectId: string;
  seriesTitle: string;
  subtitle?: string | null;
  sermonTitle?: string | null;
  passageRef?: string | null;
  motifScope?: string | null;
  motifFocus: string[];
  referenceId: string;
  referenceCluster: string;
  referenceTier: string;
  round: number;
  optionIndex: number;
};

const DESIGN_SPEC_SYSTEM_PROMPT = [
  "You are an expert art director for modern church sermon graphics.",
  "Return strict JSON only. No markdown. No prose outside JSON.",
  "Output must describe a finished, cohesive sermon poster direction (not wireframes).",
  "Typography must feel integrated with composition and motif.",
  "Background must contain NO readable words."
].join(" ");

const DESIGN_SPEC_JSON_HINT = {
  reference: { id: "string", cluster: "string", tier: "string" },
  composition: {
    templateKey: "string",
    typeRegion: "left|right|top|bottom|center",
    motifRegion: "left|right|top|bottom|center",
    overlap: "separate|overlay|mask|plate",
    asymmetry: "low|med|high"
  },
  titleIntegrationMode: "PLATE|MASK|GRID_LOCK|TYPE_AS_TEXTURE|CUTOUT",
  typographySystem: {
    hierarchy: "heroTitle|stackedTitle|smallCaps|condensedHero",
    caseRule: "upper|title|mixed",
    lineBreakStrategy: "balanced|rag_right|rag_left|block",
    tracking: "tight|normal|wide",
    subtitleStyle: "small|caps|ruleSeparated|pill"
  },
  motifTreatment: {
    primarySymbols: ["string"],
    symbolDirectives: ["string"],
    abstraction: "literal|symbolic|abstract",
    texture: "engraved|paper|grain|halftone|none",
    colorUse: "mono|duotone|triad|full"
  },
  palette: {
    intent: "bright|muted|cinematic|print",
    contrast: "high|med|low",
    background: "light|dark"
  },
  doNot: {
    noScaffoldFrames: true,
    noRuledPaperAsOnlyDesign: true,
    noBordersOnly: true,
    noStickerClipartUnlessFunTier: true,
    noReadableBackgroundText: true
  }
};

function hashToInt(seed: string): number {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 8);
  return Number.parseInt(hex, 16) >>> 0;
}

function pick<T>(items: readonly T[], seed: string): T {
  const index = hashToInt(seed) % items.length;
  return items[index];
}

function truncate(value: string | null | undefined, max = 220): string {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1).trim()}…`;
}

function safeArrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseResponseText(response: unknown): string {
  if (!response || typeof response !== "object") {
    return "";
  }

  const outputText = (response as { output_text?: unknown }).output_text;
  if (typeof outputText === "string" && outputText.trim()) {
    return outputText.trim();
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
    return null;
  }

  return null;
}

function normalizeSymbols(symbols: string[], motifFocus: string[]): string[] {
  return buildSymbolDirectives([...symbols, ...motifFocus], 6);
}

function coerceDesignSpec(candidate: Record<string, unknown>, fallback: DesignSpec, motifFocus: string[]): DesignSpec | null {
  const parsed = DESIGN_SPEC_SCHEMA.safeParse(candidate);
  if (!parsed.success) {
    return null;
  }

  const next = parsed.data;
  const symbols = normalizeSymbols(next.motifTreatment.primarySymbols, motifFocus);
  const symbolDirectives = buildSymbolDirectives(
    [...safeArrayOfStrings(next.motifTreatment.symbolDirectives), ...symbols],
    8
  );

  return {
    ...next,
    titleIntegrationMode: next.titleIntegrationMode,
    motifTreatment: {
      ...next.motifTreatment,
      primarySymbols: symbols,
      symbolDirectives
    },
    doNot: {
      noScaffoldFrames: true,
      noRuledPaperAsOnlyDesign: true,
      noBordersOnly: true,
      noStickerClipartUnlessFunTier: true,
      noReadableBackgroundText: true
    }
  };
}

function buildFallbackDesignSpec(params: GenerateDesignSpecParams): DesignSpec {
  const seedBase = `${params.projectId}|round-${params.round}|option-${params.optionIndex}|${params.referenceId}`;
  const motifFocus = params.motifFocus.slice(0, 4);
  const motifRegion = pick(["left", "right", "top", "bottom", "center"] as const, `${seedBase}|motifRegion`);
  const typeRegion = pick(["left", "right", "top", "bottom", "center"] as const, `${seedBase}|typeRegion`);
  const overlap = pick(["separate", "overlay", "mask", "plate"] as const, `${seedBase}|overlap`);
  const asymmetry = pick(["low", "med", "high"] as const, `${seedBase}|asymmetry`);
  const hierarchy = pick(["heroTitle", "stackedTitle", "smallCaps", "condensedHero"] as const, `${seedBase}|hierarchy`);
  const caseRule = pick(["upper", "title", "mixed"] as const, `${seedBase}|caseRule`);
  const lineBreakStrategy = pick(["balanced", "rag_right", "rag_left", "block"] as const, `${seedBase}|breaks`);
  const tracking = pick(["tight", "normal", "wide"] as const, `${seedBase}|tracking`);
  const subtitleStyle = pick(["small", "caps", "ruleSeparated", "pill"] as const, `${seedBase}|subtitleStyle`);
  const texture = pick(["engraved", "paper", "grain", "halftone", "none"] as const, `${seedBase}|texture`);
  const abstraction =
    params.motifScope === "whole_book"
      ? pick(["symbolic", "abstract"] as const, `${seedBase}|abstraction`)
      : pick(["literal", "symbolic", "abstract"] as const, `${seedBase}|abstraction`);
  const colorUse = pick(["mono", "duotone", "triad", "full"] as const, `${seedBase}|colorUse`);
  const paletteIntent = pick(["bright", "muted", "cinematic", "print"] as const, `${seedBase}|paletteIntent`);
  const contrast = pick(["high", "med", "low"] as const, `${seedBase}|contrast`);
  const background =
    params.referenceCluster === "minimal" || params.referenceCluster === "texture"
      ? "light"
      : pick(["light", "dark"] as const, `${seedBase}|background`);
  const fallbackSymbols = normalizeSymbols(motifFocus, []);

  return {
    reference: {
      id: params.referenceId,
      cluster: params.referenceCluster || "other",
      tier: params.referenceTier || "unknown"
    },
    composition: {
      templateKey: `round1_goal_${typeRegion}_${motifRegion}_${overlap}`,
      typeRegion,
      motifRegion,
      overlap,
      asymmetry
    },
    titleIntegrationMode: pick(
      ["PLATE", "MASK", "GRID_LOCK", "TYPE_AS_TEXTURE", "CUTOUT"] as const,
      `${seedBase}|integration`
    ),
    typographySystem: {
      hierarchy,
      caseRule,
      lineBreakStrategy,
      tracking,
      subtitleStyle
    },
    motifTreatment: {
      primarySymbols: fallbackSymbols,
      symbolDirectives: fallbackSymbols,
      abstraction,
      texture,
      colorUse
    },
    palette: {
      intent: paletteIntent,
      contrast,
      background
    },
    doNot: {
      noScaffoldFrames: true,
      noRuledPaperAsOnlyDesign: true,
      noBordersOnly: true,
      noStickerClipartUnlessFunTier: true,
      noReadableBackgroundText: true
    }
  };
}

function buildPrompt(params: GenerateDesignSpecParams, fallback: DesignSpec): string {
  const motifFocus = params.motifFocus.slice(0, 6).join(" | ") || "(none)";
  return [
    "Return one JSON object matching this schema exactly:",
    JSON.stringify(DESIGN_SPEC_JSON_HINT, null, 2),
    "Hard requirements:",
    "- choose composition goals: typeRegion, motifRegion, overlap, asymmetry, templateKey",
    "- choose titleIntegrationMode",
    "- choose all typographySystem fields",
    "- motifTreatment.primarySymbols must be concrete visual symbol directives (no theological words)",
    "- motifTreatment.symbolDirectives should mirror primarySymbols using symbol-only cues",
    "- all doNot flags must be true",
    "- no readable background words allowed",
    `Stability seed: ${params.projectId}|round-${params.round}|option-${params.optionIndex}`,
    `Series title: ${truncate(params.seriesTitle, 160)}`,
    `Series subtitle: ${truncate(params.subtitle, 160) || "(none)"}`,
    `Sermon title: ${truncate(params.sermonTitle, 160) || "(none)"}`,
    `Passage reference: ${truncate(params.passageRef, 160) || "(none)"}`,
    `Motif scope: ${params.motifScope || "unspecified"}`,
    `Motif focus candidates: ${motifFocus}`,
    `Reference ID: ${params.referenceId}`,
    `Reference cluster: ${params.referenceCluster}`,
    `Reference tier: ${params.referenceTier}`,
    "Keep it production-ready and specific to this series direction.",
    `Fallback hint (if uncertain): ${JSON.stringify(fallback)}`
  ].join("\n");
}

export async function generateDesignSpec(params: GenerateDesignSpecParams): Promise<DesignSpec> {
  const fallback = buildFallbackDesignSpec(params);
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return fallback;
  }

  const userPrompt = buildPrompt(params, fallback);
  const model = process.env.OPENAI_MAIN_MODEL?.trim() || "gpt-4.1-mini";

  const runAttempt = async (retryReason?: string): Promise<DesignSpec | null> => {
    const retryLine = retryReason ? `\nRetry correction notes: ${retryReason}` : "";
    const response = await openai.responses.create({
      model,
      temperature: 0.4,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: DESIGN_SPEC_SYSTEM_PROMPT }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: `${userPrompt}${retryLine}` }]
        }
      ]
    });

    const parsed = parseJsonObject(parseResponseText(response));
    if (!parsed) {
      return null;
    }
    return coerceDesignSpec(parsed, fallback, params.motifFocus);
  };

  try {
    const first = await runAttempt();
    if (first) {
      return first;
    }

    const second = await runAttempt("Return valid JSON strictly matching the required shape and enum values.");
    return second || fallback;
  } catch {
    return fallback;
  }
}

export function readDesignSpecFromUnknown(value: unknown): DesignSpec | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const parsed = DESIGN_SPEC_SCHEMA.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function readPrimarySymbols(value: unknown): string[] {
  return readSymbolDirectives(value);
}

export function readSymbolDirectives(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const motifTreatment = (value as { motifTreatment?: unknown }).motifTreatment;
  if (!motifTreatment || typeof motifTreatment !== "object" || Array.isArray(motifTreatment)) {
    return [];
  }
  const directives = safeArrayOfStrings((motifTreatment as { symbolDirectives?: unknown }).symbolDirectives);
  const primary = safeArrayOfStrings((motifTreatment as { primarySymbols?: unknown }).primarySymbols);
  return buildSymbolDirectives([...directives, ...primary], 8);
}
