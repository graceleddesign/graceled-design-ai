const DEFAULT_SYMBOL_DIRECTIVES = [
  "radiant light burst",
  "vine branch silhouette",
  "circular stone form"
] as const;

type SymbolDirectiveRule = {
  pattern: RegExp;
  directives: readonly string[];
};

const SYMBOL_DIRECTIVE_RULES: readonly SymbolDirectiveRule[] = [
  {
    pattern: /\b(word|logos|incarnat(?:ion|ional)|made flesh)\b/i,
    directives: ["radiant light burst", "starburst flare", "abstract wave mark"]
  },
  {
    pattern: /\b(true\s+vine|vine|branch(?:es)?|grape(?:s)?|leaf|leaves)\b/i,
    directives: ["vine branch silhouette", "leaf cluster silhouette", "grape cluster silhouette"]
  },
  {
    pattern: /\b(bread\s+of\s+life|bread|loaf|communion|eucharist|table)\b/i,
    directives: ["simple loaf silhouette", "broken bread form", "cup silhouette"]
  },
  {
    pattern: /\b(cross|empty\s+tomb|tomb|stone\s+rolled\s+away|stone\s+door)\b/i,
    directives: ["cross silhouette", "circular stone disk", "open stone-ring doorway"]
  },
  {
    pattern: /\b(resurrection|risen|new\s+life|victory\s+over\s+death)\b/i,
    directives: ["dawn radiance arc", "sprouting seed silhouette", "open stone-ring doorway"]
  },
  {
    pattern: /\b(gospel|good\s+news|kingdom)\b/i,
    directives: ["beacon ray burst", "horizon path mark", "city-gate silhouette"]
  },
  {
    pattern: /\b(light|radiance|glory|shine|dawn|lamp|star)\b/i,
    directives: ["radiant light burst", "starburst flare", "luminous arc lines"]
  },
  {
    pattern: /\b(water|river|well|stream|sea)\b/i,
    directives: ["flowing wave bands", "water ripple rings", "spring source swirl"]
  },
  {
    pattern: /\b(path|way|road|journey|pilgrim)\b/i,
    directives: ["winding path silhouette", "footstep trail marks", "horizon lane lines"]
  },
  {
    pattern: /\b(seed|sprout|growth|harvest|grain|wheat)\b/i,
    directives: ["sprouting seed silhouette", "grain stalk silhouette", "harvest sheaf form"]
  }
];

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueOrdered(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = normalizeKey(trimmed);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export function buildSymbolDirectives(rawMotifTokens: readonly string[], max = 6): string[] {
  const tokens = uniqueOrdered(rawMotifTokens);
  const directives: string[] = [];

  for (const token of tokens) {
    const normalized = normalizeKey(token);
    if (!normalized) {
      continue;
    }

    for (const rule of SYMBOL_DIRECTIVE_RULES) {
      if (rule.pattern.test(normalized)) {
        directives.push(...rule.directives);
      }
    }
  }

  const dedupedDirectives = uniqueOrdered(directives);
  if (dedupedDirectives.length > 0) {
    return dedupedDirectives.slice(0, Math.max(1, max));
  }

  return [...DEFAULT_SYMBOL_DIRECTIVES].slice(0, Math.max(1, max));
}

export const SYMBOL_ONLY_TEXT_BAN_DIRECTIVE =
  "Do not render any words, labels, or letterforms, not even single words like 'incarnation'. Use symbols only.";
