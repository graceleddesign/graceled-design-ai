type OverlayLineInput = {
  title: string | null | undefined;
  subtitle?: string | null | undefined;
  scripturePassages?: string | null | undefined;
};

type OverlayDisplayContent = {
  title: string;
  subtitle: string;
  scripturePassages: string;
};

const PLACEHOLDER_LINES = new Set([
  "sermon series",
  "the book of",
  "book of",
  "series title",
  "series subtitle",
  "title here",
  "subtitle here"
]);
const PLACEHOLDER_FRAGMENT_PATTERNS = [
  /\bsermon\s+series\b/gi,
  /\bthe\s+book\s+of\b/gi,
  /\bbook\s+of\b/gi,
  /\bseries\s+title\b/gi,
  /\bseries\s+subtitle\b/gi,
  /\btitle\s+here\b/gi,
  /\bsubtitle\s+here\b/gi,
  /\bplaceholder\b/gi
];

function cleanText(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

function stripPlaceholderFragments(value: string): string {
  let sanitized = value;
  for (const pattern of PLACEHOLDER_FRAGMENT_PATTERNS) {
    sanitized = sanitized.replace(pattern, " ");
  }
  return sanitized.replace(/\s+/g, " ").trim();
}

function sanitizeDisplayLine(value: string | null | undefined): string {
  const clean = cleanText(value);
  if (!clean) {
    return "";
  }

  return stripPlaceholderFragments(clean);
}

export function normalizeLine(value: string | null | undefined): string {
  const clean = cleanText(value).toLowerCase();
  if (!clean) {
    return "";
  }

  return clean
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_LINES.has(normalizeLine(value));
}

function isRedundantSubtitle(title: string, subtitle: string): boolean {
  const normalizedTitle = normalizeLine(title);
  const normalizedSubtitle = normalizeLine(subtitle);
  if (!normalizedTitle || !normalizedSubtitle) {
    return true;
  }

  if (normalizedTitle === normalizedSubtitle) {
    return true;
  }

  return normalizedTitle.includes(normalizedSubtitle) || normalizedSubtitle.includes(normalizedTitle);
}

export function buildOverlayDisplayContent(input: OverlayLineInput): OverlayDisplayContent {
  const titleCandidate = sanitizeDisplayLine(input.title);
  const subtitleCandidate = sanitizeDisplayLine(input.subtitle);
  const title = titleCandidate && !isPlaceholder(titleCandidate) ? titleCandidate : "Untitled Series";
  const subtitle =
    subtitleCandidate && !isPlaceholder(subtitleCandidate) && !isRedundantSubtitle(title, subtitleCandidate)
      ? subtitleCandidate
      : "";

  return {
    title,
    subtitle,
    // Text rendering policy: only title + optional subtitle are allowed on artwork.
    scripturePassages: ""
  };
}
