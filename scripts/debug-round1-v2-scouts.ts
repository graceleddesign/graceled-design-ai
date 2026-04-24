/**
 * Manual scout-generation debug runner for Round 1 V2.
 *
 * Usage:
 *   node --import tsx scripts/debug-round1-v2-scouts.ts [fixture-id]
 *   node --import tsx scripts/debug-round1-v2-scouts.ts             # runs first fixture
 *   node --import tsx scripts/debug-round1-v2-scouts.ts rest-light-short-abstract
 *
 * Without FAL_API_KEY:  prints prompts only (dry run).
 * With FAL_API_KEY set: generates scouts, evaluates, selects A/B/C, saves PNGs to /tmp/v2-scouts/.
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
plan.slots.forEach((slot, i) => {
  const prompt = buildScoutPrompt(slot);
  console.log(`\n[${i + 1}] grammar=${slot.grammarKey}  family=${slot.diversityFamily}  seed=${slot.seed}`);
  console.log(`    ${prompt}`);
});

const hasFalKey = Boolean(process.env.FAL_API_KEY?.trim());
if (!hasFalKey) {
  console.log("\n[dry run] FAL_API_KEY not set — skipping image generation.\n");
  process.exit(0);
}

// Live generation path — dynamic imports prevent "server-only" guard affecting dry-run.
const { falFluxSchnellProvider } = await import("../lib/round1-v2/providers/fal-flux-schnell");
const { runScoutBatch } = await import("../lib/round1-v2/orchestrator/run-scout-batch");
const { evaluateScout } = await import("../lib/round1-v2/eval/evaluate-scout");
const { selectScouts } = await import("../lib/round1-v2/orchestrator/select-scouts");

const outDir = join("/tmp", "v2-scouts", fixture.id);
mkdirSync(outDir, { recursive: true });

console.log(`\n--- Generating ${plan.slots.length} scouts via Flux Schnell ---`);
const batchResult = await runScoutBatch(plan, falFluxSchnellProvider, { concurrency: 4 });

// Evaluate each scout
console.log("\n--- Evaluating scouts ---");
const evals = await Promise.all(
  batchResult.results.map(async (r, i) => {
    if (r.status !== "success" || !r.imageBytes) {
      return {
        hardReject: true,
        rejectReasons: ["stats_unavailable" as const],
        toneScore: 0, structureScore: 0, marginScore: 0, compositeScore: 0,
        imageStats: null, textDetected: false,
      };
    }
    const ev = await evaluateScout({ slot: plan.slots[i], imageBytes: r.imageBytes });
    const label = `${r.slot.grammarKey}_${r.slot.seed}`;
    const stats = ev.imageStats;
    console.log(
      `  [${i + 1}] ${label}` +
      `  reject=${ev.hardReject}  score=${ev.compositeScore.toFixed(3)}` +
      (ev.rejectReasons.length ? `  reasons=${ev.rejectReasons.join(",")}` : "") +
      (stats ? `  lum=${stats.meanLuminance.toFixed(1)}  stdDev=${stats.luminanceStdDev.toFixed(1)}  edge=${stats.edgeDensity.toFixed(4)}` : "")
    );
    return ev;
  })
);

// Select A/B/C
const selection = selectScouts(plan, batchResult.results, evals);

console.log("\n--- Selection ---");
if (selection.shortfall) {
  console.warn(`  ⚠ SHORTFALL: only ${selection.selected.length}/3 scouts selected`);
}
for (const s of selection.selected) {
  const label = `${s.slot.grammarKey}_${s.slot.seed}`;
  console.log(`  ${s.label}: ${label}  score=${s.compositeScore.toFixed(3)}  ${s.selectionReason}`);
}
if (selection.rejected.length > 0) {
  console.log(`  Rejected (${selection.rejected.length}):`);
  for (const r of selection.rejected) {
    console.log(`    ✗ slot[${r.slotIndex}] ${r.slot.grammarKey} — ${r.rejectionReason}`);
  }
}

// Save winning scouts to disk
console.log(`\n--- Saving scouts to ${outDir} ---`);
for (const result of batchResult.results) {
  const label = `${result.slot.grammarKey}_${result.slot.seed}`;
  if (result.status === "success" && result.imageBytes) {
    const outPath = join(outDir, `${label}.png`);
    writeFileSync(outPath, result.imageBytes);
    const isSelected = selection.selected.find((s) => s.slotIndex === batchResult.results.indexOf(result));
    const flag = isSelected ? ` [${isSelected.label}]` : "";
    console.log(`  ✓ ${label}${flag}  ${result.latencyMs}ms  → ${outPath}`);
  } else {
    console.error(`  ✗ ${label}  FAILED: ${result.error}`);
  }
}

console.log(
  `\nDone: ${batchResult.successCount}/${batchResult.results.length} generated, ` +
  `${selection.selected.length}/3 selected in ${batchResult.totalLatencyMs}ms\n`
);
