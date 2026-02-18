import { z } from "zod";

export const STYLE_FAMILY_VALUES = [
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
  ornament: z
    .object({
      kind: z.enum(["none", "rule_dot", "wheat", "grain", "frame"]),
      weight: z.enum(["thin", "med", "bold"])
    })
    .optional()
});

export type LockupRecipe = z.infer<typeof LockupRecipeSchema>;

export const DesignBriefSchema = z.object({
  seriesTitle: z.string().trim().min(1),
  seriesSubtitle: z.string().trim().nullable(),
  passage: z.string().trim().nullable(),
  backgroundPrompt: z.string().trim().nullable(),
  styleFamilies: z.tuple([StyleFamilySchema, StyleFamilySchema, StyleFamilySchema]),
  deliverables: z.tuple([AspectSchema, AspectSchema, AspectSchema]),
  lockupRecipe: LockupRecipeSchema
});

export type DesignBrief = z.infer<typeof DesignBriefSchema>;

export const DEFAULT_DELIVERABLES: [Aspect, Aspect, Aspect] = ["square", "wide", "tall"];

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function mapPresetKeyToStyleFamily(presetKey: string): StyleFamily {
  const normalized = presetKey.trim().toLowerCase();
  if (!normalized) {
    return "minimal_clean";
  }

  if (normalized.includes("wheat")) {
    return "illustration_wheatfield";
  }
  if (normalized.startsWith("photo_")) {
    return "photographic_titleplate";
  }
  if (normalized.startsWith("illus_")) {
    return "handmade_organic";
  }
  if (normalized.startsWith("seasonal_")) {
    return "classic_serif";
  }
  if (normalized.startsWith("type_")) {
    if (normalized.includes("brutalist") || normalized.includes("high_contrast")) {
      return "bold_modern";
    }
    if (normalized.includes("editorial")) {
      return "editorial";
    }
    return "minimal_clean";
  }
  if (normalized.startsWith("texture_")) {
    return "handmade_organic";
  }
  if (normalized.startsWith("geo_")) {
    return "bold_modern";
  }
  if (normalized.startsWith("abstract_")) {
    return "editorial";
  }

  return "minimal_clean";
}

export function deriveStyleFamiliesFromPresetKeys(selectedPresetKeys: readonly string[]): [StyleFamily, StyleFamily, StyleFamily] {
  const normalized = selectedPresetKeys.map((value) => value.trim()).filter(Boolean);
  const keyA = normalized[0] || "type_clean_min_v1";
  const keyB = normalized[1] || "type_editorial_v1";
  const keyC = normalized[2] || "photo_color_block_v1";

  return [mapPresetKeyToStyleFamily(keyA), mapPresetKeyToStyleFamily(keyB), mapPresetKeyToStyleFamily(keyC)];
}

export function deriveDefaultLockupRecipe(params: {
  styleFamily: StyleFamily;
  seriesTitle: string;
  seriesSubtitle?: string | null;
}): LockupRecipe {
  const hasSubtitle = Boolean(normalizeOptionalText(params.seriesSubtitle));
  const titleLength = params.seriesTitle.trim().length;
  const titleIsLong = titleLength > 24;

  if (params.styleFamily === "illustration_wheatfield") {
    return {
      layoutIntent: "handmade_organic",
      titleTreatment: "stacked",
      hierarchy: {
        titleScale: titleIsLong ? 1.2 : 1.45,
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
      ornament: {
        kind: "wheat",
        weight: "med"
      }
    };
  }

  if (params.styleFamily === "classic_serif") {
    return {
      layoutIntent: "classic_serif",
      titleTreatment: "boxed",
      hierarchy: {
        titleScale: titleIsLong ? 1.12 : 1.32,
        subtitleScale: hasSubtitle ? 0.64 : 0.52,
        tracking: 0.015,
        case: "title_case"
      },
      alignment: "left",
      placement: {
        anchor: "top_left",
        safeMarginPct: 0.08,
        maxTitleWidthPct: 0.56
      },
      ornament: {
        kind: "frame",
        weight: "thin"
      }
    };
  }

  if (params.styleFamily === "bold_modern") {
    return {
      layoutIntent: "bold_modern",
      titleTreatment: "overprint",
      hierarchy: {
        titleScale: titleIsLong ? 1.34 : 1.72,
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
      ornament: {
        kind: "none",
        weight: "med"
      }
    };
  }

  if (params.styleFamily === "handmade_organic") {
    return {
      layoutIntent: "handmade_organic",
      titleTreatment: "stacked",
      hierarchy: {
        titleScale: titleIsLong ? 1.16 : 1.42,
        subtitleScale: hasSubtitle ? 0.58 : 0.48,
        tracking: 0.04,
        case: "title_case"
      },
      alignment: "left",
      placement: {
        anchor: "top_left",
        safeMarginPct: 0.09,
        maxTitleWidthPct: 0.6
      },
      ornament: {
        kind: "grain",
        weight: "med"
      }
    };
  }

  if (params.styleFamily === "photographic_titleplate") {
    return {
      layoutIntent: "photographic_titleplate",
      titleTreatment: "outline",
      hierarchy: {
        titleScale: titleIsLong ? 1.1 : 1.32,
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
      ornament: {
        kind: "none",
        weight: "med"
      }
    };
  }

  if (params.styleFamily === "editorial") {
    return {
      layoutIntent: "editorial",
      titleTreatment: titleIsLong ? "split" : "stacked",
      hierarchy: {
        titleScale: titleIsLong ? 1.12 : 1.34,
        subtitleScale: hasSubtitle ? 0.62 : 0.5,
        tracking: 0.02,
        case: "as_is"
      },
      alignment: "left",
      placement: {
        anchor: "top_left",
        safeMarginPct: 0.08,
        maxTitleWidthPct: 0.57
      },
      ornament: {
        kind: "rule_dot",
        weight: "thin"
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
  lockupRecipe?: unknown;
  deliverables?: [Aspect, Aspect, Aspect];
}): DesignBrief {
  const seriesTitle = params.seriesTitle.trim();
  const styleFamilies = deriveStyleFamiliesFromPresetKeys(params.selectedPresetKeys);
  const fallbackLockupRecipe = deriveDefaultLockupRecipe({
    styleFamily: styleFamilies[0],
    seriesTitle,
    seriesSubtitle: params.seriesSubtitle
  });
  const parsedLockupRecipe = LockupRecipeSchema.safeParse(params.lockupRecipe);

  return {
    seriesTitle,
    seriesSubtitle: normalizeOptionalText(params.seriesSubtitle),
    passage: normalizeOptionalText(params.passage),
    backgroundPrompt: normalizeOptionalText(params.backgroundPrompt),
    styleFamilies,
    deliverables: params.deliverables || DEFAULT_DELIVERABLES,
    lockupRecipe: parsedLockupRecipe.success ? parsedLockupRecipe.data : fallbackLockupRecipe
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
