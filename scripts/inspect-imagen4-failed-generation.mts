/**
 * Inspect a failed Imagen 4 modern_abstract generation record.
 *
 * Usage:
 *   node --import tsx scripts/inspect-imagen4-failed-generation.mts <generationId>
 *
 * Prints, without making any provider calls:
 *   - status, designMode, renderer
 *   - Imagen 4 enabled / attempted / accepted
 *   - rejection reason
 *   - exact prompt sent to Imagen 4
 *   - raw rejected output path (if saved in dev)
 *   - text-detection evidence (gradient heuristic — no OCR)
 *   - full eval imageStats
 *   - provider metadata
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${path.join(repoRoot, "prisma", "dev.db")}`;
}

const generationId = process.argv[2];
if (!generationId) {
  console.error("Usage: node --import tsx scripts/inspect-imagen4-failed-generation.mts <generationId>");
  process.exit(1);
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const gen = await prisma.generation.findFirst({
  where: { id: generationId },
  select: {
    id: true,
    status: true,
    round: true,
    createdAt: true,
    updatedAt: true,
    input: true,
    output: true,
  },
});

await prisma.$disconnect();

if (!gen) {
  console.error(`Generation not found: ${generationId}`);
  process.exit(1);
}

const inp = (gen.input ?? {}) as Record<string, unknown>;
const out = (gen.output ?? {}) as Record<string, unknown>;
const meta = (out.meta ?? {}) as Record<string, unknown>;
const debug = (meta.debug ?? {}) as Record<string, unknown>;
const i4 = (debug.imagen4ModernAbstract ?? {}) as Record<string, unknown>;
const tde = (i4.textDetectionEvidence ?? null) as Record<string, unknown> | null;
const imgStats = tde ? (tde.imageStats ?? null) as Record<string, unknown> | null : null;

// ── Header ────────────────────────────────────────────────────────────────────

console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║   Imagen 4 Failed Generation Inspector                  ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

// ── Core status ───────────────────────────────────────────────────────────────

console.log("── Status ──────────────────────────────────────────────────");
console.log(`  ID            : ${gen.id}`);
console.log(`  Status        : ${gen.status}`);
console.log(`  Round         : ${gen.round}`);
console.log(`  Created       : ${gen.createdAt?.toISOString() ?? "(unknown)"}`);
console.log(`  Updated       : ${gen.updatedAt?.toISOString() ?? "(unknown)"}`);
console.log(`  designMode    : ${inp.designMode ?? debug.designMode ?? "(not set)"}`);
console.log(`  renderer      : ${inp.renderer ?? "(not set)"}`);
console.log(`  v2            : ${inp.v2 ?? false}`);
console.log();

// ── Imagen 4 debug fields ────────────────────────────────────────────────────

console.log("── Imagen 4 Debug ──────────────────────────────────────────");
console.log(`  enabled       : ${i4.enabled ?? false}`);
console.log(`  attempted     : ${i4.attempted ?? false}`);
console.log(`  accepted      : ${i4.accepted ?? "(not set)"}`);
console.log(`  provider      : ${i4.provider ?? "(not set)"}`);
console.log(`  promptFamily  : ${i4.promptFamily ?? "(not set)"}`);
console.log(`  rejectionReason: ${i4.rejectionReason ?? "(none)"}`);
console.log(`  latencyMs     : ${i4.latencyMs ?? "(not recorded)"}`);
console.log(`  providerErrorKind: ${i4.providerErrorKind ?? "(none)"}`);

const override = i4.acceptanceOverride as Record<string, unknown> | undefined;
if (override?.applied) {
  console.log();
  console.log(`  ⚠  acceptanceOverride APPLIED — tone gate waived`);
  console.log(`     reason    : ${override.reason}`);
  console.log(`     original  : ${JSON.stringify(override.originalRejectReasons)}`);
  const actual = override.actual as Record<string, unknown> | undefined;
  if (actual) {
    console.log(`     actual    : toneScore=${actual.toneScore} structureScore=${actual.structureScore} marginScore=${actual.marginScore} edgeDensity=${actual.edgeDensity}`);
  }
  const thresh = override.thresholds as Record<string, unknown> | undefined;
  if (thresh) {
    console.log(`     thresholds: structureScoreMin=${thresh.structureScoreMin} marginScoreMin=${thresh.marginScoreMin} edgeDensityMax=${thresh.edgeDensityMax}`);
  }
}
console.log();

// ── Exact prompt ─────────────────────────────────────────────────────────────

console.log("── Exact Prompt Sent to Imagen 4 ───────────────────────────");
const promptStr = i4.prompt as string | undefined;
if (promptStr) {
  console.log(`  promptFamily  : ${i4.promptFamily ?? "(not set)"}`);
  console.log();
  console.log("  ┌─ prompt text ─────────────────────────────────────────");
  for (const line of promptStr.split(/\n/)) {
    console.log(`  │  ${line}`);
  }
  console.log("  └───────────────────────────────────────────────────────");
} else {
  console.log("  (prompt not recorded in this generation — regenerate to capture it)");
}
console.log();

// ── Raw rejected output ───────────────────────────────────────────────────────

console.log("── Raw Rejected Output ──────────────────────────────────────");
const rawPath = i4.rejectedRawPath as string | undefined;
if (rawPath) {
  console.log(`  ✓ Saved to: ${rawPath}`);
  console.log("    Open this file to inspect the raw Imagen output before text detection fired.");
} else {
  console.log("  (not saved — was this run with NODE_ENV != production or IMAGEN4_DEBUG_REJECTED_OUTPUTS=true?)");
  console.log("  To save on next run, ensure NODE_ENV=development (default for npm run dev).");
}
console.log();

// ── Text detection evidence ───────────────────────────────────────────────────

console.log("── Text Detection Evidence ──────────────────────────────────");
if (tde) {
  console.log(`  detected      : ${tde.detected}`);
  console.log(`  rejectReasons : ${JSON.stringify(tde.rejectReasons)}`);
  console.log(`  evaluatorNote : ${tde.evaluatorNote}`);
  console.log();
  console.log("  ⚠  The evaluator uses a pixel-gradient heuristic (no OCR).");
  console.log("     No text string, confidence score, or bounding box is available.");
  console.log("     If detected=true but the image looks text-free, this may be a");
  console.log("     false positive from busy geometric art with high edge density.");
  console.log();
  console.log("  Eval scores:");
  console.log(`    toneScore     : ${tde.toneScore ?? "(n/a)"}`);
  console.log(`    structureScore: ${tde.structureScore ?? "(n/a)"}`);
  console.log(`    marginScore   : ${tde.marginScore ?? "(n/a)"}`);
  console.log(`    compositeScore: ${tde.compositeScore ?? "(n/a)"}`);
  if (imgStats) {
    console.log();
    console.log("  Image stats (64×64 sample):");
    console.log(`    meanLuminance    : ${imgStats.meanLuminance ?? "(n/a)"}`);
    console.log(`    meanSaturation   : ${imgStats.meanSaturation ?? "(n/a)"}`);
    console.log(`    luminanceStdDev  : ${imgStats.luminanceStdDev ?? "(n/a)"}`);
    console.log(`    edgeDensity      : ${imgStats.edgeDensity ?? "(n/a)"}`);
    console.log(`    sepiaLikelihood  : ${imgStats.sepiaLikelihood ?? "(n/a)"}`);
    console.log(`    sampleCount      : ${imgStats.sampleCount ?? "(n/a)"}`);
    console.log();
    const edge = typeof imgStats.edgeDensity === "number" ? imgStats.edgeDensity : null;
    if (edge !== null) {
      if (edge > 0.05) {
        console.log("  ⚠  High edgeDensity (>0.05): consistent with either rendered text OR");
        console.log("     busy geometric art. Inspect the raw image to distinguish.");
      } else if (edge > 0.02) {
        console.log("  ℹ  Moderate edgeDensity (0.02–0.05): possible text or complex geometry.");
      } else {
        console.log("  ℹ  Low edgeDensity: unlikely to be text — check other reject reasons.");
      }
    }
  } else {
    console.log("  Image stats: (not available — imageStats was null)");
  }
} else {
  console.log("  (textDetectionEvidence not present — was this a provider error?)");
  if (i4.providerErrorKind) {
    console.log(`  Provider error kind: ${i4.providerErrorKind}`);
    console.log("  The lane failed before evaluation; no image was produced to check.");
  }
}
console.log();

// ── Provider metadata ─────────────────────────────────────────────────────────

console.log("── Provider Metadata ────────────────────────────────────────");
const provMeta = i4.providerMetadata as Record<string, unknown> | undefined;
if (provMeta) {
  for (const [k, v] of Object.entries(provMeta)) {
    console.log(`  ${k.padEnd(18)}: ${v}`);
  }
} else {
  console.log("  (not available)");
}
console.log();

// ── Raw debug dump ────────────────────────────────────────────────────────────

console.log("── Full output.meta.debug.imagen4ModernAbstract (JSON) ──────");
console.log(JSON.stringify(i4, null, 2).split("\n").map(l => "  " + l).join("\n"));
console.log();
