/**
 * Manual scout-generation debug runner for Round 1 V2.
 *
 * Usage:
 *   node --import tsx scripts/debug-round1-v2-scouts.ts [fixture-id]
 *   node --import tsx scripts/debug-round1-v2-scouts.ts             # runs first fixture
 *   node --import tsx scripts/debug-round1-v2-scouts.ts rest-light-short-abstract
 *
 * With FAL_API_KEY set: calls Flux Schnell and saves scout images to /tmp/v2-scouts/.
 * Without FAL_API_KEY:  prints prompts only (dry run).
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { normalizeBrief } from "../lib/round1-v2/briefs/normalize-brief";
import { buildScoutPlan } from "../lib/round1-v2/orchestrator/build-scout-plan";
import { buildScoutPrompt } from "../lib/round1-v2/orchestrator/build-scout-prompt";
import { BENCHMARK_PACK_V1 } from "../lib/round1-v2/bench/pack-v1";

const fixtureId = process.argv[2] ?? null;
const fixture = fixtureId
  ? BENCHMARK_PACK_V1.find((f) => f.id === fixtureId)
  : BENCHMARK_PACK_V1[0];

if (!fixture) {
  console.error(`[v2-scouts] Unknown fixture ID: ${fixtureId}`);
  console.error(`Available IDs: ${BENCHMARK_PACK_V1.map((f) => f.id).join(", ")}`);
  process.exit(1);
}

const runSeed = `debug-${fixture.id}-${Date.now()}`;
const brief = normalizeBrief(fixture.rawInput);
const plan = buildScoutPlan({ runSeed, tone: brief.toneTarget, motifs: brief.motifs, negativeHints: brief.negativeHints });

console.log("\n=== Round 1 V2 Scout Debug ===");
console.log(`Fixture : ${fixture.label}`);
console.log(`Tone    : ${brief.toneTarget}`);
console.log(`Motifs  : ${brief.motifs.join(", ") || "(none)"}`);
console.log(`Slots   : ${plan.slots.length} (${plan.distinctFamilyCount} distinct families)`);
console.log(`Seed    : ${runSeed}`);

console.log("\n--- Scout Prompts ---");
const prompts = plan.slots.map((slot, i) => {
  const prompt = buildScoutPrompt(slot);
  console.log(`\n[${i + 1}] grammar=${slot.grammarKey} family=${slot.diversityFamily} seed=${slot.seed}`);
  console.log(`    ${prompt}`);
  return { slot, prompt };
});

const hasFalKey = Boolean(process.env.FAL_API_KEY?.trim());
if (!hasFalKey) {
  console.log("\n[dry run] FAL_API_KEY not set — skipping image generation.");
  console.log("Set FAL_API_KEY to generate actual scout images.\n");
  process.exit(0);
}

// Live generation path — only reached when FAL_API_KEY is set.
// Dynamic import prevents "server-only" guard from affecting dry-run path.
const { falFluxSchnellProvider } = await import("../lib/round1-v2/providers/fal-flux-schnell");
const { runScoutBatch } = await import("../lib/round1-v2/orchestrator/run-scout-batch");

const outDir = join("/tmp", "v2-scouts", fixture.id);
mkdirSync(outDir, { recursive: true });

console.log(`\n--- Generating ${plan.slots.length} scouts via Flux Schnell ---`);
console.log(`Output: ${outDir}`);

const batchResult = await runScoutBatch(plan, falFluxSchnellProvider, { concurrency: 4 });

for (const result of batchResult.results) {
  const label = `${result.slot.grammarKey}_${result.slot.seed}`;
  if (result.status === "success" && result.imageBytes) {
    const outPath = join(outDir, `${label}.png`);
    writeFileSync(outPath, result.imageBytes);
    console.log(`  ✓ ${label}  ${result.latencyMs}ms  → ${outPath}`);
  } else {
    console.error(`  ✗ ${label}  FAILED: ${result.error}`);
  }
}

console.log(
  `\nDone: ${batchResult.successCount}/${batchResult.results.length} succeeded in ${batchResult.totalLatencyMs}ms\n`
);
