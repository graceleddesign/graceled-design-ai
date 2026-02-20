const GENERIC_MOTIF_PATTERNS: readonly RegExp[] = [
  /\bdoves?\b/i,
  /\bflames?\b/i,
  /\bcross(?:es)?\b/i,
  /\bwheat(?:\s+stalks?)?\b/i,
  /\bsunburst(?:s)?\b/i,
  /\bchurch\s+(?:building|icon|silhouette|steeple)\b/i,
  /\bpraying\s+hands?\b/i,
  /\braised\s+hands?\b/i,
  /\b(?:ichthys|jesus\s+fish|fish\s+symbol)\b/i,
  /\b(?:bible\s+icon|book\s+icon|open\s+bible)\b/i,
  /\bcrowns?\b/i,
  /\b(?:halo|light\s+rays?)\b/i,
  /\bstained\s+glass\b/i,
  /\b(?:shepherd|lamb)\b/i
];

export const GENERIC_CHRISTIAN_MOTIFS = [
  "dove",
  "flame",
  "cross",
  "wheat",
  "sunburst",
  "church building",
  "praying hands",
  "raised hands",
  "fish/ichthys",
  "bible/book icon",
  "crown",
  "generic halo light rays",
  "generic stained glass",
  "generic shepherd/lamb"
] as const;

export function isGenericMotif(motif: string): boolean {
  const value = typeof motif === "string" ? motif.trim() : "";
  if (!value) {
    return false;
  }

  return GENERIC_MOTIF_PATTERNS.some((pattern) => pattern.test(value));
}

export function genericMotifRatio(motifs: string[]): number {
  const normalized = motifs
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  if (normalized.length === 0) {
    return 0;
  }

  const genericCount = normalized.filter((item) => isGenericMotif(item)).length;
  return genericCount / normalized.length;
}
