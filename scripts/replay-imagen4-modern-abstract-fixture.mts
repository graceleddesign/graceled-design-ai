/**
 * Local replay for the Imagen 4 modern_abstract acceptance pipeline.
 *
 * Runs the evaluator + waiver check against a local fixture image without
 * calling any paid provider. Useful for:
 *   - Verifying the waiver applies to a saved rejected raw output.
 *   - Testing evaluator thresholds against new fixture images.
 *   - Confirming the pipeline would produce "accepted" before a live run.
 *
 * Usage:
 *   node --import tsx scripts/replay-imagen4-modern-abstract-fixture.mts [imagePath] [tone]
 *
 *   imagePath  Path to a PNG file (default: test/fixtures/round1-v2/imagen4-modern-abstract-prism-dark.png)
 *   tone       Tonal variant hint: light | dark | vivid | mono | neutral  (default: light)
 *
 * Examples:
 *   node --import tsx scripts/replay-imagen4-modern-abstract-fixture.mts
 *   node --import tsx scripts/replay-imagen4-modern-abstract-fixture.mts tmp/imagen4-rejected/abc-raw.png light
 *   node --import tsx scripts/replay-imagen4-modern-abstract-fixture.mts my-plate.png neutral
 *
 * No provider calls are made. No DB writes occur.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(__dirname, "..");

// ── Args ──────────────────────────────────────────────────────────────────────

const DEFAULT_FIXTURE = resolve(repoRoot, "test/fixtures/round1-v2/imagen4-modern-abstract-prism-dark.png");
const imagePath = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : DEFAULT_FIXTURE;
const toneArg = (process.argv[3] ?? "light") as "light" | "dark" | "vivid" | "mono" | "neutral";
const validTones = ["light", "dark", "vivid", "mono", "neutral"] as const;
if (!validTones.includes(toneArg)) {
  console.error(`Invalid tone "${toneArg}". Must be one of: ${validTones.join(", ")}`);
  process.exit(1);
}

// ── Imports ───────────────────────────────────────────────────────────────────

const { evaluateScout } = await import("../lib/round1-v2/eval/evaluate-scout.js");
const { checkImagen4ModernAbstractToneWaiver, PRISM_TONE_WAIVER_THRESHOLDS } =
  await import("../lib/round1-v2/orchestrator/imagen4-modern-abstract-acceptance.js");
const { IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY } =
  await import("../lib/round1-v2/orchestrator/build-imagen4-modern-abstract-prompt.js");

// ── Load image ────────────────────────────────────────────────────────────────

let imageBytes: Buffer;
try {
  imageBytes = readFileSync(imagePath);
} catch {
  console.error(`Could not read image: ${imagePath}`);
  process.exit(1);
}

// ── Eval ──────────────────────────────────────────────────────────────────────

const syntheticSlot = {
  grammarKey: "imagen4_modern_abstract" as const,
  diversityFamily: "imagen4_modern_abstract",
  tone: toneArg,
  motifBinding: [] as string[],
  seed: 0,
  promptSpec: { template: "", motifBinding: [] as string[], tone: toneArg, negativeHints: [] as string[] },
};

console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║   Imagen 4 Modern Abstract Pipeline Replay               ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");
console.log(`  Image  : ${imagePath}`);
console.log(`  Tone   : ${toneArg}`);
console.log(`  Prompt : ${IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY}`);
console.log();

const evalRes = await evaluateScout({ slot: syntheticSlot as Parameters<typeof evaluateScout>[0]["slot"], imageBytes });

// ── Build evidence (mirrors evidenceFromEval in the lane runner) ──────────────

const evidence = {
  source: "generated" as const,
  sourceGenerationId: null,
  textFree: !evalRes.rejectReasons.includes("text_artifact_detected"),
  scaffoldFree: !evalRes.rejectReasons.includes("scaffold_collapse"),
  motifPresent: !evalRes.rejectReasons.includes("design_presence_absent"),
  toneFit: !evalRes.rejectReasons.includes("tone_implausible"),
  referenceFit: null,
};

const reasons: string[] = [];
if (evidence.textFree === false)    reasons.push("background_text_detected");
if (evidence.scaffoldFree === false) reasons.push("background_scaffold_like");
if (evidence.motifPresent === false) reasons.push("background_blank_or_motif_weak");
if (evidence.toneFit === false)     reasons.push("background_tone_fit_failed");
const acceptance = { accepted: reasons.length === 0, invalidReasons: reasons };

// ── Waiver check ──────────────────────────────────────────────────────────────

const waiver = !acceptance.accepted
  ? checkImagen4ModernAbstractToneWaiver(IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY, evalRes, acceptance)
  : null;
const effectivelyAccepted = acceptance.accepted || waiver !== null;

// ── Report ────────────────────────────────────────────────────────────────────

console.log("── Evaluator Output ────────────────────────────────────────");
console.log(`  textDetected    : ${evalRes.textDetected}`);
console.log(`  rejectReasons   : ${JSON.stringify(evalRes.rejectReasons)}`);
console.log(`  toneScore       : ${evalRes.toneScore.toFixed(4)}`);
console.log(`  structureScore  : ${evalRes.structureScore.toFixed(4)}`);
console.log(`  marginScore     : ${evalRes.marginScore.toFixed(4)}`);
console.log(`  compositeScore  : ${evalRes.compositeScore.toFixed(4)}`);
if (evalRes.imageStats) {
  console.log(`  meanLuminance   : ${evalRes.imageStats.meanLuminance.toFixed(2)}`);
  console.log(`  meanSaturation  : ${evalRes.imageStats.meanSaturation.toFixed(2)}`);
  console.log(`  edgeDensity     : ${evalRes.imageStats.edgeDensity.toFixed(6)}`);
  console.log(`  luminanceStdDev : ${evalRes.imageStats.luminanceStdDev.toFixed(4)}`);
}
console.log();

console.log("── Standard Acceptance ─────────────────────────────────────");
console.log(`  accepted        : ${acceptance.accepted}`);
if (!acceptance.accepted) {
  console.log(`  invalidReasons  : ${JSON.stringify(acceptance.invalidReasons)}`);
}
console.log();

console.log("── Tone Waiver Check ────────────────────────────────────────");
console.log(`  Thresholds      : structureScore>=${PRISM_TONE_WAIVER_THRESHOLDS.structureScoreMin} marginScore>=${PRISM_TONE_WAIVER_THRESHOLDS.marginScoreMin} edgeDensity<=${PRISM_TONE_WAIVER_THRESHOLDS.edgeDensityMax}`);
if (waiver) {
  console.log(`  waiver applied  : YES`);
  console.log(`  reason          : ${waiver.reason}`);
  console.log(`  original reasons: ${JSON.stringify(waiver.originalRejectReasons)}`);
  console.log(`  actual values   : toneScore=${waiver.actual.toneScore} structureScore=${waiver.actual.structureScore.toFixed(4)} marginScore=${waiver.actual.marginScore.toFixed(4)} edgeDensity=${waiver.actual.edgeDensity}`);
} else if (acceptance.accepted) {
  console.log(`  waiver applied  : NO (standard gate passed, no waiver needed)`);
} else {
  const edgeDensity = evalRes.imageStats?.edgeDensity ?? null;
  const reasons_why_not: string[] = [];
  if (acceptance.invalidReasons.length !== 1 || acceptance.invalidReasons[0] !== "background_tone_fit_failed") {
    reasons_why_not.push(`failure is not tone-only: ${JSON.stringify(acceptance.invalidReasons)}`);
  }
  if (evalRes.textDetected) reasons_why_not.push("text detected");
  if (evalRes.structureScore < PRISM_TONE_WAIVER_THRESHOLDS.structureScoreMin) {
    reasons_why_not.push(`structureScore ${evalRes.structureScore.toFixed(4)} < ${PRISM_TONE_WAIVER_THRESHOLDS.structureScoreMin}`);
  }
  if (evalRes.marginScore < PRISM_TONE_WAIVER_THRESHOLDS.marginScoreMin) {
    reasons_why_not.push(`marginScore ${evalRes.marginScore.toFixed(4)} < ${PRISM_TONE_WAIVER_THRESHOLDS.marginScoreMin}`);
  }
  if (edgeDensity === null) {
    reasons_why_not.push("imageStats unavailable");
  } else if (edgeDensity > PRISM_TONE_WAIVER_THRESHOLDS.edgeDensityMax) {
    reasons_why_not.push(`edgeDensity ${edgeDensity.toFixed(6)} > ${PRISM_TONE_WAIVER_THRESHOLDS.edgeDensityMax}`);
  }
  console.log(`  waiver applied  : NO`);
  for (const r of reasons_why_not) console.log(`    blocked by: ${r}`);
}
console.log();

console.log("── Final Verdict ────────────────────────────────────────────");
if (effectivelyAccepted) {
  const via = waiver ? "tone waiver (dark prism override)" : "standard gate";
  console.log(`  ✓ ACCEPTED via ${via}`);
  console.log(`    This image would proceed to the V2 compositor.`);
} else {
  console.log(`  ✗ REJECTED`);
  console.log(`    reasons: ${JSON.stringify(acceptance.invalidReasons)}`);
  console.log(`    The lane would settle as FAILED.`);
}
console.log();
