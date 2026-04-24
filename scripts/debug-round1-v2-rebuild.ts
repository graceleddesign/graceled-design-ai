/**
 * End-to-end debug runner for Round 1 V2: scouts → evaluate → select → rebuild.
 *
 * Usage:
 *   node --import tsx scripts/debug-round1-v2-rebuild.ts [fixture-id]
 *   node --import tsx scripts/debug-round1-v2-rebuild.ts             # runs first fixture
 *   node --import tsx scripts/debug-round1-v2-rebuild.ts rest-light-short-abstract
 *
 * Without FAL_API_KEY: prints scout plan and rebuild prompts only (dry run).
 * With FAL_API_KEY:    generates scouts, evaluates, selects, rebuilds, saves PNGs to /tmp/v2-rebuild/.
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { normalizeBrief } from "../lib/round1-v2/briefs/normalize-brief";
import { buildScoutPlan } from "../lib/round1-v2/orchestrator/build-scout-plan";
import { buildScoutPrompt } from "../lib/round1-v2/orchestrator/build-scout-prompt";
import { buildRebuildPrompt } from "../lib/round1-v2/orchestrator/build-rebuild-prompt";
import { BENCHMARK_PACK_V1 } from "../lib/round1-v2/bench/pack-v1";
import type { GrammarKey } from "../lib/round1-v2/grammars";

const fixtureId = process.argv[2] ?? null;
const fixture = fixtureId
  ? BENCHMARK_PACK_V1.find((f) => f.id === fixtureId)
  : BENCHMARK_PACK_V1[0];

if (!fixture) {
  console.error(`[v2-rebuild] Unknown fixture ID: ${fixtureId}`);
  console.error(`Available IDs: ${BENCHMARK_PACK_V1.map((f) => f.id).join(", ")}`);
  process.exit(1);
}

const runSeed = `debug-rebuild-${fixture.id}-${Date.now()}`;
const brief = normalizeBrief(fixture.rawInput);
const plan = buildScoutPlan({ runSeed, tone: brief.toneTarget, motifs: brief.motifs, negativeHints: brief.negativeHints });

console.log("\n=== Round 1 V2 Rebuild Debug ===");
console.log(`Fixture : ${fixture.label}`);
console.log(`Tone    : ${brief.toneTarget}`);
console.log(`Motifs  : ${brief.motifs.join(", ") || "(none)"}`);
console.log(`Slots   : ${plan.slots.length} scouts`);
console.log(`Seed    : ${runSeed}`);

const hasFalKey = Boolean(process.env.FAL_API_KEY?.trim());

if (!hasFalKey) {
  // Dry run: show scout prompts and what rebuild prompts would be generated.
  console.log("\n--- Scout Prompts (sample) ---");
  plan.slots.slice(0, 3).forEach((slot, i) => {
    const prompt = buildScoutPrompt(slot);
    console.log(`\n[${i + 1}] ${slot.grammarKey}`);
    console.log(`    ${prompt}`);
  });

  console.log("\n--- Rebuild Prompts (all grammars in plan) ---");
  const seen = new Set<string>();
  for (const slot of plan.slots) {
    if (seen.has(slot.grammarKey)) continue;
    seen.add(slot.grammarKey);
    const prompt = buildRebuildPrompt({
      grammarKey: slot.grammarKey as GrammarKey,
      tone: slot.tone,
      motifBinding: slot.motifBinding,
      negativeHints: brief.negativeHints,
    });
    console.log(`\n[rebuild] ${slot.grammarKey}`);
    console.log(`    ${prompt}`);
  }

  console.log("\n[dry run] FAL_API_KEY not set — skipping generation.\n");
  process.exit(0);
}

// ── Live generation path ──────────────────────────────────────────────────────

const { falFluxSchnellProvider } = await import("../lib/round1-v2/providers/fal-flux-schnell");
const { runScoutBatch } = await import("../lib/round1-v2/orchestrator/run-scout-batch");
const { evaluateScout } = await import("../lib/round1-v2/eval/evaluate-scout");
const { selectScouts } = await import("../lib/round1-v2/orchestrator/select-scouts");
const { runRebuildBatch } = await import("../lib/round1-v2/orchestrator/run-rebuild-batch");
const { falNanaBananaPro } = await import("../lib/round1-v2/providers/fal-nano-banana-pro");
const { falNanaBanana2 } = await import("../lib/round1-v2/providers/fal-nano-banana-2");

const outDir = join("/tmp", "v2-rebuild", fixture.id);
mkdirSync(outDir, { recursive: true });

// Stage 1: Scout
console.log(`\n--- Generating ${plan.slots.length} scouts via Flux Schnell ---`);
const batchResult = await runScoutBatch(plan, falFluxSchnellProvider, { concurrency: 4 });

// Stage 2: Evaluate
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
    console.log(
      `  [${i + 1}] ${r.slot.grammarKey}` +
      `  reject=${ev.hardReject}  score=${ev.compositeScore.toFixed(3)}` +
      (ev.rejectReasons.length ? `  (${ev.rejectReasons.join(",")})` : "")
    );
    return ev;
  })
);

// Stage 3: Select
const selection = selectScouts(plan, batchResult.results, evals);
console.log("\n--- Selection ---");
if (selection.shortfall) {
  console.warn(`  ⚠ SHORTFALL: only ${selection.selected.length}/3 selected`);
}
for (const s of selection.selected) {
  console.log(`  ${s.label}: ${s.slot.grammarKey}  score=${s.compositeScore.toFixed(3)}`);
}

if (selection.selected.length === 0) {
  console.error("\nNo scouts selected — cannot rebuild. Exiting.");
  process.exit(1);
}

// Stage 4: Rebuild
console.log(`\n--- Rebuilding ${selection.selected.length} selected scouts via Nano Banana Pro ---`);
const rebuildResult = await runRebuildBatch(brief, selection.selected, falNanaBananaPro, falNanaBanana2);

console.log("\n--- Rebuild Results ---");
for (const r of rebuildResult.results) {
  const fallbackNote = r.usedFallback ? " [fallback]" : "";
  if (r.status === "success" && r.imageBytes) {
    const outPath = join(outDir, `${r.label}-${r.selectedScout.slot.grammarKey}.png`);
    writeFileSync(outPath, r.imageBytes);
    console.log(`  ✓ ${r.label}${fallbackNote}  ${r.providerId}  ${r.latencyMs}ms  → ${outPath}`);
  } else {
    console.error(`  ✗ ${r.label}  FAILED: ${r.error}`);
  }
}

console.log(
  `\nDone: scouts=${batchResult.successCount}/${plan.slots.length}` +
  `  selected=${selection.selected.length}/3` +
  `  rebuilt=${rebuildResult.successCount}/${selection.selected.length}` +
  `  total=${Date.now() - Date.now()}ms\n`
);
