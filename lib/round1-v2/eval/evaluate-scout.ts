import type { ScoutSlot } from "../orchestrator/build-scout-plan";
import type { TonalVariant } from "../grammars";
import { computeScoutImageStats, detectTextArtifact, type ScoutImageStats } from "./image-stats";

// ── Thresholds (explicit, centralised, calibrated to match V1) ───────────────

// Hard-reject thresholds
const DESIGN_MIN_LUMINANCE_STD_DEV = 20;   // below → scaffold/blank
const DESIGN_MIN_EDGE_DENSITY = 0.001;      // below → scaffold/blank

// Tone hard-reject thresholds — mirrors V1 evaluateToneCompliance
const LIGHT_MIN_LUMINANCE = 100;
const LIGHT_MAX_SEPIA_LIKELIHOOD = 0.50;
const VIVID_MIN_SATURATION = 120;
const VIVID_MIN_LUMINANCE = 115;
const DARK_MAX_LUMINANCE = 160;
const DARK_MONO_MIN_LUMINANCE = 30;
const MONO_MAX_SATURATION = 30;
const MONO_MAX_LUMINANCE = 125;

// ── Public types ─────────────────────────────────────────────────────────────

export type ScoutRejectReason =
  | "text_artifact_detected"
  | "scaffold_collapse"
  | "design_presence_absent"
  | "tone_implausible"
  | "stats_unavailable";

export interface ScoutEvalResult {
  hardReject: boolean;
  rejectReasons: ScoutRejectReason[];
  // Soft scores — 0 (worst) to 1 (best)
  toneScore: number;
  structureScore: number; // design presence strength
  marginScore: number;    // title-safe region clarity (phase 1: proxy via edge density)
  compositeScore: number; // weighted final score
  // Raw measurements for debug / benchmark reports
  imageStats: ScoutImageStats | null;
  textDetected: boolean;
}

export interface ScoutEvalInput {
  slot: ScoutSlot;
  imageBytes: Buffer;
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

function scoreTone(tone: TonalVariant, stats: ScoutImageStats): { score: number; fail: boolean } {
  if (stats.meanLuminance < DARK_MONO_MIN_LUMINANCE) return { score: 0, fail: true };

  switch (tone) {
    case "light": {
      const lumOk = stats.meanLuminance >= LIGHT_MIN_LUMINANCE;
      const sepiaOk = stats.sepiaLikelihood <= LIGHT_MAX_SEPIA_LIKELIHOOD;
      if (!lumOk || !sepiaOk) return { score: 0, fail: true };
      // Partial credit for luminance above minimum
      return { score: Math.min(1, (stats.meanLuminance - LIGHT_MIN_LUMINANCE) / 80 + 0.5), fail: false };
    }
    case "vivid": {
      const satOk = stats.meanSaturation >= VIVID_MIN_SATURATION;
      const lumOk = stats.meanLuminance >= VIVID_MIN_LUMINANCE;
      if (!satOk || !lumOk) return { score: 0, fail: true };
      return { score: Math.min(1, (stats.meanSaturation - VIVID_MIN_SATURATION) / 80 + 0.5), fail: false };
    }
    case "dark": {
      if (stats.meanLuminance > DARK_MAX_LUMINANCE) return { score: 0, fail: true };
      return { score: Math.min(1, 1 - stats.meanLuminance / (DARK_MAX_LUMINANCE * 1.5)), fail: false };
    }
    case "mono": {
      if (stats.meanSaturation > MONO_MAX_SATURATION) return { score: 0, fail: true };
      if (stats.meanLuminance > MONO_MAX_LUMINANCE) return { score: 0, fail: true };
      return { score: Math.min(1, 1 - stats.meanSaturation / (MONO_MAX_SATURATION * 2)), fail: false };
    }
    case "neutral":
      // No hard tone constraint for neutral — passes if design presence passes
      return { score: 0.75, fail: false };
  }
}

function scoreStructure(stats: ScoutImageStats): { score: number; scaffoldCollapse: boolean; designAbsent: boolean } {
  const hasStdDev = stats.luminanceStdDev >= DESIGN_MIN_LUMINANCE_STD_DEV;
  const hasEdges = stats.edgeDensity >= DESIGN_MIN_EDGE_DENSITY;

  if (!hasStdDev && !hasEdges) return { score: 0, scaffoldCollapse: true, designAbsent: false };
  if (!hasStdDev || !hasEdges) return { score: 0, scaffoldCollapse: false, designAbsent: true };

  // Normalise to 0–1 relative to "good" ranges; cap at 1
  const stdDevScore = Math.min(1, (stats.luminanceStdDev - DESIGN_MIN_LUMINANCE_STD_DEV) / 30);
  const edgeScore = Math.min(1, stats.edgeDensity / 0.05);
  return { score: (stdDevScore + edgeScore) / 2, scaffoldCollapse: false, designAbsent: false };
}

// Phase-1 proxy: clarity of the "central" region (grammar titleSafeZones are not
// pixel-sampled yet). Use inverted edge density — lower edge = cleaner region.
// Real per-bbox sampling arrives when rebuild eval needs it.
function scoreMargin(stats: ScoutImageStats): number {
  // We want title-safe regions to be visually calm — not completely empty, but
  // not over-busy either. Score is highest in the low-to-mid edge density range.
  const edge = stats.edgeDensity;
  if (edge < 0.001) return 0.1;          // too flat — barely any design
  if (edge < 0.02)  return 0.9;          // ideal calm
  if (edge < 0.05)  return 0.6;          // acceptable
  return Math.max(0, 1 - edge * 10);     // increasingly busy — lower margin safety
}

// ── Main evaluator ────────────────────────────────────────────────────────────

export async function evaluateScout(input: ScoutEvalInput): Promise<ScoutEvalResult> {
  const [imageStats, textDetected] = await Promise.all([
    computeScoutImageStats(input.imageBytes),
    detectTextArtifact(input.imageBytes),
  ]);

  const rejectReasons: ScoutRejectReason[] = [];

  if (textDetected) rejectReasons.push("text_artifact_detected");

  if (!imageStats) {
    rejectReasons.push("stats_unavailable");
    return {
      hardReject: true,
      rejectReasons,
      toneScore: 0,
      structureScore: 0,
      marginScore: 0,
      compositeScore: 0,
      imageStats: null,
      textDetected,
    };
  }

  const toneResult = scoreTone(input.slot.tone, imageStats);
  if (toneResult.fail) rejectReasons.push("tone_implausible");

  const structureResult = scoreStructure(imageStats);
  if (structureResult.scaffoldCollapse) rejectReasons.push("scaffold_collapse");
  if (structureResult.designAbsent) rejectReasons.push("design_presence_absent");

  const hardReject = rejectReasons.length > 0;
  const toneScore = toneResult.fail ? 0 : toneResult.score;
  const structureScore = structureResult.score;
  const marginScore = scoreMargin(imageStats);
  const compositeScore = hardReject
    ? 0
    : Math.min(1, toneScore * 0.5 + structureScore * 0.35 + marginScore * 0.15);

  return {
    hardReject,
    rejectReasons,
    toneScore,
    structureScore,
    marginScore,
    compositeScore,
    imageStats,
    textDetected,
  };
}
