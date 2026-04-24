// Round 1 V2 engine configuration.
// Phase 1 scope: wide aspect only, 3 non-fallback backgrounds.

export type Round1Engine = "v1" | "v2";

export const ROUND1_V2_CONFIG = {
  // Scout stage
  scoutCount: 9,
  scoutConcurrency: 4,

  // Rebuild stage
  rebuildFallbackBudget: 1, // max extra Flux Dev fallback attempts per lane on Flux Pro failure

  // Shadow mode
  shadowSamplingRate: 0.1, // fraction of V1 launches that also run V2 in shadow

  // Aspect constraint
  supportedAspects: ["wide"] as const,
} as const;

export type SupportedAspect = (typeof ROUND1_V2_CONFIG.supportedAspects)[number];
