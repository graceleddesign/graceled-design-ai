// Round 1 V2 engine configuration.
// Phase 1 scope: wide aspect only, 3 non-fallback backgrounds.

export type Round1Engine = "v1" | "v2";

export const ROUND1_V2_CONFIG = {
  // Scout stage
  scoutCount: 9,
  scoutConcurrency: 4,

  // Provider timeouts — hard deadline per individual FAL call.
  // A timed-out scout counts as one failed scout; the batch continues.
  // A timed-out rebuild fails that lane attempt; backfill continues if candidates remain.
  scoutProviderTimeoutMs: 45_000,   // 45 s per Flux Schnell scout call
  rebuildProviderTimeoutMs: 90_000, // 90 s per Nano Banana Pro / Nano Banana rebuild call

  // Rebuild stage
  rebuildFallbackBudget: 1, // max extra Nano Banana 2 fallback attempts per lane on Nano Banana Pro failure

  // Backfill stage — if a lane fails rebuild/validation, try this many additional
  // scouts from the already-generated (not-selected) pool before giving up.
  laneBackfillBudget: 2,

  // Shadow mode
  shadowSamplingRate: 0.1, // fraction of V1 launches that also run V2 in shadow

  // Aspect constraint
  supportedAspects: ["wide"] as const,
} as const;

export type SupportedAspect = (typeof ROUND1_V2_CONFIG.supportedAspects)[number];
