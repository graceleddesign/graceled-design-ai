import { z } from "zod";
import { getLockupPresetById } from "@/lib/lockups/presets";

export const TEMPLATE_STYLE_FAMILY_VALUES = [
  "clean-min",
  "editorial-photo",
  "modern-collage",
  "illustrated-heritage"
] as const;

export type TemplateStyleFamily = (typeof TEMPLATE_STYLE_FAMILY_VALUES)[number];

// Legacy values remain valid for stored generations.
export const STYLE_FAMILY_VALUES = [
  ...TEMPLATE_STYLE_FAMILY_VALUES,
  "editorial",
  "classic_serif",
  "bold_modern",
  "handmade_organic",
  "photographic_titleplate",
  "minimal_clean",
  "illustration_wheatfield"
] as const;

export type StyleFamily = (typeof STYLE_FAMILY_VALUES)[number];

export const ASPECT_VALUES = ["square", "wide", "tall"] as const;
export type Aspect = (typeof ASPECT_VALUES)[number];

export const StyleFamilySchema = z.enum(STYLE_FAMILY_VALUES);
export const AspectSchema = z.enum(ASPECT_VALUES);
const HEX_COLOR_REGEX = /^#(?:[0-9a-fA-F]{6})$/;

const FocalPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1)
});

const TitleEchoSchema = z.object({
  enabled: z.boolean(),
  opacity: z.number().min(0).max(0.1),
  dxPct: z.number().min(-0.02).max(0.02),
  dyPct: z.number().min(-0.02).max(0.02),
  blur: z.number().min(0).max(24).optional()
});

const TitleSizeClampSchema = z
  .object({
    minPx: z.number().min(24).max(260),
    maxPx: z.number().min(28).max(320)
  })
  .refine((value) => value.maxPx >= value.minPx, {
    message: "maxPx must be greater than or equal to minPx"
  });

export const LockupRecipeSchema = z.object({
  layoutIntent: z.enum([
    "editorial",
    "classic_serif",
    "bold_modern",
    "handmade_organic",
    "photographic_titleplate",
    "minimal_clean"
  ]),
  titleTreatment: z.enum(["stacked", "singleline", "split", "boxed", "overprint", "outline", "badge"]),
  hierarchy: z.object({
    titleScale: z.number().min(1).max(2.5),
    subtitleScale: z.number().min(0.4).max(1.2),
    tracking: z.number().min(-0.08).max(0.2),
    case: z.enum(["as_is", "upper", "small_caps", "title_case"])
  }),
  alignment: z.enum(["left", "center", "right"]),
  placement: z.object({
    anchor: z.enum(["top_left", "top_center", "center", "bottom_left", "bottom_center"]),
    safeMarginPct: z.number().min(0.04).max(0.12),
    maxTitleWidthPct: z.number().min(0.35).max(0.75)
  }),
  lineHeight: z
    .object({
      title: z.number().min(0.84).max(1.5),
      subtitle: z.number().min(0.96).max(1.6)
    })
    .optional(),
  titleSizeClamp: z
    .object({
      square: TitleSizeClampSchema.optional(),
      wide: TitleSizeClampSchema.optional(),
      tall: TitleSizeClampSchema.optional()
    })
    .optional(),
  minTitleAreaPct: z.number().min(0.08).max(0.45).optional(),
  maxTitleAreaPct: z.number().min(0.12).max(0.6).optional(),
  focalPoint: FocalPointSchema.optional(),
  titleEcho: TitleEchoSchema.optional(),
  ornament: z
    .object({
      kind: z.enum(["none", "rule_dot", "wheat", "grain", "frame"]),
      weight: z.enum(["thin", "med", "bold"])
    })
    .optional()
});

export type LockupRecipe = z.infer<typeof LockupRecipeSchema>;

export const ResolvedLockupPaletteSchema = z.object({
  titleColor: z.string().regex(HEX_COLOR_REGEX),
  subtitleColor: z.string().regex(HEX_COLOR_REGEX),
  accentColor: z.string().regex(HEX_COLOR_REGEX),
  outlineColor: z.string().regex(HEX_COLOR_REGEX),
  ornamentColor: z.string().regex(HEX_COLOR_REGEX),
  boxFillColor: z.string().regex(HEX_COLOR_REGEX).optional()
});

export type ResolvedLockupPalette = z.infer<typeof ResolvedLockupPaletteSchema>;

export const DesignBriefSchema = z.object({
  seriesTitle: z.string().trim().min(1),
  seriesSubtitle: z.string().trim().nullable(),
  passage: z.string().trim().nullable(),
  backgroundPrompt: z.string().trim().nullable(),
  keywords: z.array(z.string().trim().min(1)).max(16).optional(),
  styleFamilies: z.tuple([StyleFamilySchema, StyleFamilySchema, StyleFamilySchema]),
  deliverables: z.tuple([AspectSchema, AspectSchema, AspectSchema]),
  lockupPresetId: z.string().trim().min(1).optional(),
  lockupRecipe: LockupRecipeSchema,
  resolvedLockupPalette: ResolvedLockupPaletteSchema.optional()
});

export type DesignBrief = z.infer<typeof DesignBriefSchema>;

export const DEFAULT_DELIVERABLES: [Aspect, Aspect, Aspect] = ["square", "wide", "tall"];

const ROUND_OPTION_TEMPLATE_FAMILIES: readonly TemplateStyleFamily[] = [
  "editorial-photo",
  "modern-collage",
  "illustrated-heritage"
] as const;

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function fnv1aHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function deterministicTemplateFamilyOrder(seed: string): TemplateStyleFamily[] {
  const families = [...ROUND_OPTION_TEMPLATE_FAMILIES];
  if (families.length <= 1) {
    return families;
  }

  const hash = fnv1aHash(seed || "style-family-seed");
  const start = hash % families.length;
  let stride = ((hash >>> 7) % (families.length - 1)) + 1;
  while (gcd(stride, families.length) !== 1) {
    stride = (stride % families.length) + 1;
  }

  return Array.from({ length: families.length }, (_, index) => families[(start + index * stride) % families.length]);
}

export function canonicalizeStyleFamily(styleFamily: StyleFamily | string): TemplateStyleFamily {
  const normalized = styleFamily.trim().toLowerCase();
  if (normalized === "clean-min" || normalized === "minimal_clean") {
    return "clean-min";
  }
  if (normalized === "editorial-photo" || normalized === "editorial" || normalized === "photographic_titleplate") {
    return "editorial-photo";
  }
  if (normalized === "modern-collage" || normalized === "bold_modern") {
    return "modern-collage";
  }
  if (
    normalized === "illustrated-heritage" ||
    normalized === "illustration_wheatfield" ||
    normalized === "classic_serif" ||
    normalized === "handmade_organic"
  ) {
    return "illustrated-heritage";
  }
  return "clean-min";
}

export function mapPresetKeyToStyleFamily(presetKey: string): StyleFamily {
  const normalized = presetKey.trim().toLowerCase();
  if (!normalized) {
    return "clean-min";
  }

  if (normalized.startsWith("photo_") || normalized.includes("cinematic")) {
    return "editorial-photo";
  }

  if (
    normalized.startsWith("illus_") ||
    normalized.startsWith("seasonal_") ||
    normalized.includes("wheat") ||
    normalized.includes("engraved")
  ) {
    return "illustrated-heritage";
  }

  if (
    normalized.startsWith("abstract_") ||
    normalized.startsWith("geo_") ||
    normalized.startsWith("texture_") ||
    normalized.startsWith("mark_") ||
    normalized.includes("brutalist") ||
    normalized.includes("high_contrast") ||
    normalized.includes("text_system")
  ) {
    return "modern-collage";
  }

  if (normalized.includes("editorial")) {
    return "editorial-photo";
  }

  return "clean-min";
}

function normalizeStyleTuple(input: readonly StyleFamily[], seed: string): [StyleFamily, StyleFamily, StyleFamily] {
  const optionOrder = deterministicTemplateFamilyOrder(seed);
  const picked = new Set<TemplateStyleFamily>();

  for (const family of input) {
    const canonical = canonicalizeStyleFamily(family);
    if (!ROUND_OPTION_TEMPLATE_FAMILIES.includes(canonical)) {
      continue;
    }
    picked.add(canonical);
    if (picked.size >= 3) {
      break;
    }
  }

  for (const fallback of optionOrder) {
    if (picked.size >= 3) {
      break;
    }
    picked.add(fallback);
  }

  const result = [...picked];
  return [result[0], result[1], result[2]];
}

export function deriveStyleFamiliesFromPresetKeys(
  selectedPresetKeys: readonly string[],
  styleFamilySeed?: string
): [StyleFamily, StyleFamily, StyleFamily] {
  const normalized = selectedPresetKeys.map((value) => value.trim()).filter(Boolean);
  const mapped = normalized.map((key) => mapPresetKeyToStyleFamily(key));
  const seedBase = styleFamilySeed || normalized.join("|") || "default-style-families";
  return normalizeStyleTuple(mapped, seedBase);
}

function keywordToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveKeywords(backgroundPrompt: string | null): string[] | undefined {
  if (!backgroundPrompt) {
    return undefined;
  }

  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "from",
    "church",
    "sermon",
    "series",
    "graphic",
    "design",
    "modern",
    "minimal",
    "title",
    "subtitle"
  ]);

  const tokens = keywordToken(backgroundPrompt)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && token.length <= 28)
    .filter((token) => !stopWords.has(token));

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    deduped.push(token);
    if (deduped.length >= 12) {
      break;
    }
  }

  return deduped.length > 0 ? deduped : undefined;
}

export function deriveDefaultLockupRecipe(params: {
  styleFamily: StyleFamily;
  seriesTitle: string;
  seriesSubtitle?: string | null;
}): LockupRecipe {
  const hasSubtitle = Boolean(normalizeOptionalText(params.seriesSubtitle));
  const titleLength = params.seriesTitle.trim().length;
  const titleIsLong = titleLength > 24;
  const templateStyleFamily = canonicalizeStyleFamily(params.styleFamily);

  if (templateStyleFamily === "illustrated-heritage") {
    return {
      layoutIntent: "handmade_organic",
      titleTreatment: "stacked",
      hierarchy: {
        titleScale: titleIsLong ? 1.2 : 1.42,
        subtitleScale: hasSubtitle ? 0.58 : 0.5,
        tracking: 0.03,
        case: "title_case"
      },
      alignment: "left",
      placement: {
        anchor: "top_left",
        safeMarginPct: 0.085,
        maxTitleWidthPct: 0.58
      },
      lineHeight: {
        title: 1.08,
        subtitle: 1.2
      },
      titleSizeClamp: {
        square: { minPx: 52, maxPx: 138 },
        wide: { minPx: 48, maxPx: 126 },
        tall: { minPx: 58, maxPx: 152 }
      },
      focalPoint: {
        x: 0.45,
        y: 0.5
      },
      titleEcho: {
        enabled: false,
        opacity: 0.06,
        dxPct: 0.006,
        dyPct: 0.006
      },
      ornament: {
        kind: "wheat",
        weight: "med"
      }
    };
  }

  if (templateStyleFamily === "modern-collage") {
    return {
      layoutIntent: "bold_modern",
      titleTreatment: "overprint",
      hierarchy: {
        titleScale: titleIsLong ? 1.34 : 1.68,
        subtitleScale: hasSubtitle ? 0.54 : 0.42,
        tracking: -0.02,
        case: "upper"
      },
      alignment: "center",
      placement: {
        anchor: "center",
        safeMarginPct: 0.055,
        maxTitleWidthPct: 0.72
      },
      lineHeight: {
        title: 0.96,
        subtitle: 1.15
      },
      titleSizeClamp: {
        square: { minPx: 58, maxPx: 176 },
        wide: { minPx: 52, maxPx: 162 },
        tall: { minPx: 64, maxPx: 190 }
      },
      focalPoint: {
        x: 0.5,
        y: 0.5
      },
      titleEcho: {
        enabled: false,
        opacity: 0.06,
        dxPct: 0.006,
        dyPct: 0.006
      },
      ornament: {
        kind: "none",
        weight: "med"
      }
    };
  }

  if (templateStyleFamily === "editorial-photo") {
    return {
      layoutIntent: "photographic_titleplate",
      titleTreatment: "outline",
      hierarchy: {
        titleScale: titleIsLong ? 1.1 : 1.3,
        subtitleScale: hasSubtitle ? 0.6 : 0.48,
        tracking: 0.01,
        case: "upper"
      },
      alignment: "center",
      placement: {
        anchor: "bottom_center",
        safeMarginPct: 0.06,
        maxTitleWidthPct: 0.68
      },
      lineHeight: {
        title: 1.04,
        subtitle: 1.2
      },
      titleSizeClamp: {
        square: { minPx: 52, maxPx: 146 },
        wide: { minPx: 48, maxPx: 138 },
        tall: { minPx: 58, maxPx: 162 }
      },
      focalPoint: {
        x: 0.5,
        y: 0.5
      },
      titleEcho: {
        enabled: false,
        opacity: 0.06,
        dxPct: 0.006,
        dyPct: 0.006
      },
      ornament: {
        kind: "none",
        weight: "med"
      }
    };
  }

  return {
    layoutIntent: "minimal_clean",
    titleTreatment: titleIsLong ? "split" : "singleline",
    hierarchy: {
      titleScale: titleIsLong ? 1.08 : 1.24,
      subtitleScale: hasSubtitle ? 0.58 : 0.48,
      tracking: 0.03,
      case: "upper"
    },
    alignment: "left",
    placement: {
      anchor: "top_left",
      safeMarginPct: 0.08,
      maxTitleWidthPct: 0.55
    },
    lineHeight: {
      title: 1.06,
      subtitle: 1.2
    },
    titleSizeClamp: {
      square: { minPx: 50, maxPx: 132 },
      wide: { minPx: 46, maxPx: 124 },
      tall: { minPx: 56, maxPx: 148 }
    },
    focalPoint: {
      x: 0.45,
      y: 0.5
    },
    titleEcho: {
      enabled: false,
      opacity: 0.06,
      dxPct: 0.006,
      dyPct: 0.006
    },
    ornament: {
      kind: "rule_dot",
      weight: "thin"
    }
  };
}

export function buildDesignBrief(params: {
  seriesTitle: string;
  seriesSubtitle: string | null;
  passage: string | null;
  backgroundPrompt: string | null;
  selectedPresetKeys: readonly string[];
  lockupPresetId?: string | null;
  lockupRecipe?: unknown;
  styleFamilies?: readonly StyleFamily[];
  styleFamilySeed?: string;
  deliverables?: [Aspect, Aspect, Aspect];
  resolvedLockupPalette?: unknown;
}): DesignBrief {
  const seriesTitle = params.seriesTitle.trim();
  const styleFamilies = params.styleFamilies
    ? normalizeStyleTuple(params.styleFamilies.slice(0, 3) as StyleFamily[], params.styleFamilySeed || seriesTitle)
    : deriveStyleFamiliesFromPresetKeys(params.selectedPresetKeys, params.styleFamilySeed);
  const preset = params.lockupPresetId ? getLockupPresetById(params.lockupPresetId) : null;
  const fallbackLockupRecipe = deriveDefaultLockupRecipe({
    styleFamily: preset?.styleFamily || styleFamilies[0],
    seriesTitle,
    seriesSubtitle: params.seriesSubtitle
  });
  const parsedLockupRecipe = LockupRecipeSchema.safeParse(params.lockupRecipe);
  const chosenLockupRecipe = parsedLockupRecipe.success ? parsedLockupRecipe.data : preset || fallbackLockupRecipe;
  const parsedResolvedPalette = ResolvedLockupPaletteSchema.safeParse(params.resolvedLockupPalette);

  return {
    seriesTitle,
    seriesSubtitle: normalizeOptionalText(params.seriesSubtitle),
    passage: normalizeOptionalText(params.passage),
    backgroundPrompt: normalizeOptionalText(params.backgroundPrompt),
    keywords: deriveKeywords(normalizeOptionalText(params.backgroundPrompt)),
    styleFamilies,
    deliverables: params.deliverables || DEFAULT_DELIVERABLES,
    lockupPresetId: preset?.id,
    lockupRecipe: chosenLockupRecipe,
    resolvedLockupPalette: parsedResolvedPalette.success ? parsedResolvedPalette.data : undefined
  };
}

function issuePath(path: (string | number)[]): string {
  if (path.length === 0) {
    return "root";
  }

  return path
    .map((segment, index) => {
      if (typeof segment === "number") {
        return `[${segment}]`;
      }

      return index === 0 ? segment : `.${segment}`;
    })
    .join("");
}

export function validateDesignBrief(input: unknown): { ok: true; data: DesignBrief } | { ok: false; issues: string[] } {
  const parsed = DesignBriefSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }

  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => `${issuePath(issue.path)}: ${issue.message}`)
  };
}
