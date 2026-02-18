import "server-only";

type BackgroundPromptProject = {
  seriesTitle: string;
  seriesSubtitle: string | null;
  scripturePassages: string | null;
  seriesDescription: string | null;
};

type PreviewShape = "square" | "wide" | "tall";

const PRESET_STYLE_BY_KEY: Record<string, string> = {
  type_clean_min_v1: "Swiss/modern minimal, paper grain, thin rules, subtle geometric accents",
  abstract_gradient_modern_v1: "smooth modern gradients + soft light, abstract",
  geo_shapes_negative_v1: "bold geometric negative space shapes",
  illus_flat_min_v1: "minimal flat illustration shapes, simple forms, no characters",
  photo_color_block_v1: "photographic feel abstracted, NO real people, bold color blocks",
  mark_icon_abstract_v1: "abstract mark-like shapes, logo-less, icon-like forms"
};

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "your",
  "you",
  "our",
  "are",
  "into",
  "about",
  "into",
  "series",
  "church",
  "sermon"
]);

function cleanToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function buildThemeKeywordList(project: BackgroundPromptProject): string[] {
  const source = [project.seriesTitle, project.seriesSubtitle, project.scripturePassages, project.seriesDescription]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .join(" ");

  if (!source) {
    return [];
  }

  const keywords: string[] = [];
  const seen = new Set<string>();

  for (const rawPart of source.split(/\s+/)) {
    const token = cleanToken(rawPart);
    if (token.length < 3 || STOP_WORDS.has(token) || seen.has(token)) {
      continue;
    }

    seen.add(token);
    keywords.push(token);

    if (keywords.length >= 12) {
      break;
    }
  }

  return keywords;
}

function paletteHint(palette: string[]): string {
  if (palette.length === 0) {
    return "Color palette accents: refined neutrals with one restrained accent.";
  }

  return `Color palette accents: ${palette.join(", ")}.`;
}

function cleanMinimalPrompt(shape: PreviewShape): string {
  if (shape === "square") {
    return "Minimal modern sermon series background, warm off-white paper texture, very subtle grain, sparse geometric lines and 1-2 soft abstract shapes. IMPORTANT: leave a large clean negative-space area on the LEFT-CENTER for typography (no elements there). no text, no letters, no words, no typography, no signage, no logos, no watermarks. High-end church media design, calm and premium.";
  }

  if (shape === "wide") {
    return "Minimal modern sermon series background, warm off-white paper texture, subtle grain, sparse geometric lines and soft abstract shapes. IMPORTANT: leave a wide clean negative-space band on the LEFT 55% for typography; keep most visual interest on the RIGHT side. no text, no letters, no words, no typography, no signage, no logos, no watermarks. High-end church media design, calm and premium.";
  }

  return "Minimal modern sermon series background, warm off-white paper texture, subtle grain, sparse geometric lines and soft abstract shapes. IMPORTANT: leave a large clean negative-space area in the UPPER-MIDDLE for typography; keep visual interest mostly in lower third. no text, no letters, no words, no typography, no signage, no logos, no watermarks. High-end church media design, calm and premium.";
}

export function buildBackgroundPrompt(params: {
  presetKey: string;
  project: BackgroundPromptProject;
  palette: string[];
  seed: string;
  shape?: PreviewShape;
}): string {
  if (params.presetKey === "type_clean_min_v1") {
    return cleanMinimalPrompt(params.shape || "wide");
  }

  const styleCue =
    PRESET_STYLE_BY_KEY[params.presetKey] ||
    "premium modern sermon series background, abstract editorial composition, subtle texture";
  const themeKeywords = buildThemeKeywordList(params.project);

  return [
    "Premium church sermon series graphic background,",
    styleCue,
    "modern, high-end, minimal, tasteful texture, subtle depth, balanced composition, negative space.",
    "No text, no letters, no words, no typography, no signage, no logos, no watermarks, no numbers, and no symbols that read as words.",
    paletteHint(params.palette),
    themeKeywords.length > 0
      ? `Theme cues: ${themeKeywords.join(", ")}.`
      : "Theme cues: modern worship, hope, reverence, cinematic atmosphere.",
    `Variation seed: ${params.seed}.`
  ].join(" ");
}
