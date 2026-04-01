import type { Prisma } from "@prisma/client";

export const GRAPHICS_PRODUCT_KEY = "graphics";
export const GRAPHICS_BACKGROUND_FEATURE_KEY = "background_generation";
export const GRAPHICS_BACKGROUND_PROMPT_VERSION = "graphics.background.template.v1";

export function buildGraphicsBackgroundRunMetadata(params: {
  presetKey: string;
  optionIndex: number;
  referenceCount: number;
  candidateSuffix?: string | null;
  variationTemplateKey?: string | null;
  stageHint?: string | null;
}): Prisma.InputJsonValue {
  return {
    presetKey: params.presetKey,
    optionIndex: params.optionIndex,
    referenceCount: params.referenceCount,
    candidateSuffix: params.candidateSuffix ?? null,
    variationTemplateKey: params.variationTemplateKey ?? null,
    stageHint: params.stageHint ?? null
  };
}
