export type PromptProfileKey = "round1_reference_first" | "round1_exploration" | "round2_refine";

export type PromptProfileIncludeFlags = {
  includeBucketRules: boolean;
  includeToneRules: boolean;
  includeMediumRules: boolean;
  includeVariationTemplate: boolean;
  includeTitleStage: boolean;
  includeBibleBrief: boolean;
  includeStyleFamilyRules: boolean;
};

export type PromptProfile = {
  hardRules: string[];
  softGuidance: string[];
  includeFlags: PromptProfileIncludeFlags;
};

const MINIMAL_REFERENCE_FIRST_FLAGS: PromptProfileIncludeFlags = {
  includeBucketRules: false,
  includeToneRules: false,
  includeMediumRules: false,
  includeVariationTemplate: true,
  includeTitleStage: false,
  includeBibleBrief: false,
  includeStyleFamilyRules: false
};

const FULL_CONSTRAINT_FLAGS: PromptProfileIncludeFlags = {
  includeBucketRules: true,
  includeToneRules: true,
  includeMediumRules: true,
  includeVariationTemplate: true,
  includeTitleStage: true,
  includeBibleBrief: true,
  includeStyleFamilyRules: true
};

const REFINE_CONSTRAINT_FLAGS: PromptProfileIncludeFlags = {
  includeBucketRules: false,
  includeToneRules: false,
  includeMediumRules: false,
  includeVariationTemplate: true,
  includeTitleStage: true,
  includeBibleBrief: true,
  includeStyleFamilyRules: false
};

export const PROMPT_PROFILES: Record<PromptProfileKey, PromptProfile> = {
  round1_reference_first: {
    hardRules: [
      "BACKGROUND MUST BE TEXT-FREE.",
      "DESIGN COMPLETENESS: deliver a finished design, never a wireframe or scaffold.",
      "Include a clear focal motif tied to motifFocus."
    ],
    softGuidance: [
      "REFERENCE ANCHOR IS HIGHEST PRIORITY.",
      "Use the variation template as a composition goal, not a hard template application."
    ],
    includeFlags: MINIMAL_REFERENCE_FIRST_FLAGS
  },
  round1_exploration: {
    hardRules: [
      "Keep backgrounds text-free and production-ready.",
      "Apply bucket/tone/medium/style-family constraints as hard guardrails."
    ],
    softGuidance: [
      "Use references as inspiration while preserving originality.",
      "Favor clear hierarchy and strong focal clarity."
    ],
    includeFlags: FULL_CONSTRAINT_FLAGS
  },
  round2_refine: {
    hardRules: [
      "Preserve readability and production polish.",
      "Honor approved style constraints while executing refinement changes."
    ],
    softGuidance: [
      "Prioritize continuity with the selected direction.",
      "Increase precision over novelty unless feedback asks for larger changes."
    ],
    includeFlags: REFINE_CONSTRAINT_FLAGS
  }
};

export function resolvePromptProfileKey(params: {
  explorationMode?: boolean;
  referenceId?: string | null;
}): PromptProfileKey {
  const referenceId = typeof params.referenceId === "string" ? params.referenceId.trim() : "";
  if (params.explorationMode && referenceId) {
    return "round1_reference_first";
  }
  if (params.explorationMode) {
    return "round1_exploration";
  }
  return "round2_refine";
}

export function resolvePromptProfile(params: {
  explorationMode?: boolean;
  referenceId?: string | null;
}): { key: PromptProfileKey; profile: PromptProfile } {
  const key = resolvePromptProfileKey(params);
  return {
    key,
    profile: PROMPT_PROFILES[key]
  };
}
