/**
 * V2 canary: Gospel of John project.
 *
 * Runs runRoundOneV2 against a real project in the local DB and verifies
 * the production-valid evidence contract in the settled output.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/canary-v2-gospel-of-john.ts [projectId]
 */

import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

// Resolve DB path relative to repo root before any Prisma init
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${path.join(repoRoot, "prisma", "dev.db")}`;
}

// ── Run ───────────────────────────────────────────────────────────────────────

const PROJECT_ID = process.argv[2] ?? "cmodststn0001lnb2to0buygy";

console.log(`\n=== V2 Canary: Gospel of John ===`);
console.log(`Project ID: ${PROJECT_ID}`);
console.log(`Root: ${repoRoot}`);
console.log(`DB: ${process.env.DATABASE_URL}\n`);

// Import prisma via direct relative path (avoids @/ alias issue)
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

// Verify project exists
const project = await prisma.project.findFirst({
  where: { id: PROJECT_ID },
  select: { id: true, series_title: true, round1EngineOverride: true },
});

if (!project) {
  console.error(`ERROR: Project ${PROJECT_ID} not found`);
  await prisma.$disconnect();
  process.exit(1);
}

console.log(`Project: "${project.series_title}" (engine override: ${project.round1EngineOverride})`);

if (project.round1EngineOverride !== "v2") {
  console.error(`ERROR: round1EngineOverride is "${project.round1EngineOverride}", expected "v2"`);
  await prisma.$disconnect();
  process.exit(1);
}

// Clean up any existing generations for this project (fresh canary run)
const deleted = await prisma.generation.deleteMany({ where: { projectId: PROJECT_ID } });
if (deleted.count > 0) {
  console.log(`Cleaned up ${deleted.count} existing generation(s)`);
}
await prisma.$disconnect();

// ── Run the orchestrator ──────────────────────────────────────────────────────

console.log(`\nStarting runRoundOneV2...\n`);

const { runRoundOneV2 } = await import("../lib/round1-v2/orchestrator/index.js");
const result = await runRoundOneV2(PROJECT_ID);

if ("error" in result && result.error) {
  console.error(`\nORCHESTRATOR ERROR: ${result.error}`);
  process.exit(1);
}

// ── Verify DB output ──────────────────────────────────────────────────────────

console.log(`\n=== Verifying settled generations ===\n`);

const { PrismaClient: PC2 } = await import("@prisma/client");
const prisma2 = new PC2();

const generations = await prisma2.generation.findMany({
  where: { projectId: PROJECT_ID, round: 1 },
  include: { assets: true },
  orderBy: { createdAt: "asc" },
});

const { resolveProductionValidOption } = await import("../lib/production-valid-option.js");

let completedCount = 0;
let failedCount = 0;
let evidenceGapCount = 0;

for (const gen of generations) {
  const output = gen.output as Record<string, unknown> | null;
  const meta = (output as any)?.meta ?? {};
  const pv = meta?.productionValidation ?? null;
  const debug = meta?.debug ?? null;

  const assetRecords = gen.assets.map((a: any) => ({
    kind: a.kind,
    slot: a.slot,
    file_path: a.file_path,
  }));

  const resolved = resolveProductionValidOption({
    output,
    dbStatus: gen.status,
    assets: assetRecords,
  });

  const label = (output as any)?.meta?.debug?.v2
    ? `Lane ${(output as any)?.notes?.match(/lane ([ABC])/)?.[1] ?? "?"}`
    : `Gen ${gen.id.slice(-8)}`;

  console.log(`--- ${label} (${gen.id.slice(-12)}) ---`);
  console.log(`  DB status:          ${gen.status}`);
  console.log(`  resolvedStatus:     ${resolved.status}`);
  console.log(`  valid:              ${resolved.valid}`);

  // Background evidence
  const bgEvidence = pv?.background ?? null;
  console.log(`  productionValidation.background exists: ${!!bgEvidence}`);
  if (bgEvidence) {
    console.log(`    source:      ${bgEvidence.source}`);
    console.log(`    textFree:    ${bgEvidence.textFree}`);
    console.log(`    scaffoldFree:${bgEvidence.scaffoldFree}`);
    console.log(`    motifPresent:${bgEvidence.motifPresent}`);
    console.log(`    toneFit:     ${bgEvidence.toneFit}`);
  }

  // Aspects
  const aspects = pv?.aspects ?? null;
  console.log(`  productionValidation.aspects exists: ${!!aspects}`);
  if (aspects) {
    console.log(`    widescreen:  ${JSON.stringify(aspects.widescreen)}`);
    console.log(`    square:      ${JSON.stringify(aspects.square)}`);
    console.log(`    vertical:    ${JSON.stringify(aspects.vertical)}`);
  }

  // debug.aspectAssets
  const aspectAssets = debug?.aspectAssets ?? null;
  console.log(`  debug.aspectAssets exists: ${!!aspectAssets}`);
  if (aspectAssets) {
    console.log(`    ${JSON.stringify(aspectAssets)}`);
  }

  // Asset slots
  const assetSlots = assetRecords.map((a: any) => `${a.kind}:${a.slot}`).join(", ");
  console.log(`  assets (${assetRecords.length}): ${assetSlots || "(none)"}`);

  // Failed checks
  if (!resolved.valid) {
    console.log(`  FAILED CHECKS (background): ${resolved.failedChecks.background.join(", ")}`);
    console.log(`  FAILED CHECKS (aspects):    ${JSON.stringify(resolved.failedChecks.aspects)}`);
    console.log(`  FAILED CHECKS (lockup):     ${resolved.failedChecks.lockup.join(", ")}`);
  }

  // Notes (failure reason)
  const notes = (output as any)?.notes ?? null;
  if (notes && gen.status === "FAILED") {
    console.log(`  failure notes: ${notes}`);
  }

  // Missing-evidence messages
  const bgChecks = resolved.failedChecks.background;
  const missingEvidenceMessages = bgChecks.filter((r: string) =>
    r.includes("_missing") || r.includes("_check_missing")
  );
  if (missingEvidenceMessages.length > 0) {
    console.log(`  ⚠ MISSING EVIDENCE: ${missingEvidenceMessages.join(", ")}`);
    evidenceGapCount++;
  }

  // Fallback preview check
  const fallbackPaths = debug?.fallbackPreview ?? null;
  const hasFallbackMsg = notes?.includes("Settled fallback preview asset");
  if (hasFallbackMsg) {
    console.log(`  ⚠ FALLBACK PREVIEW: "${notes}"`);
  }

  if (gen.status === "COMPLETED") completedCount++;
  else failedCount++;

  console.log();
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`=== Summary ===`);
console.log(`Total generations: ${generations.length}`);
console.log(`Completed: ${completedCount}/${generations.length}`);
console.log(`Failed:    ${failedCount}/${generations.length}`);
console.log(`Evidence gaps (missing check messages): ${evidenceGapCount}`);

if (evidenceGapCount === 0 && completedCount > 0) {
  console.log(`\n✓ Evidence contract satisfied — no missing-evidence messages`);
} else if (evidenceGapCount > 0) {
  console.log(`\n✗ Evidence gaps detected — productionValidation not fully populated`);
} else {
  console.log(`\n⚠ No completed lanes — all failed`);
}

await prisma2.$disconnect();
