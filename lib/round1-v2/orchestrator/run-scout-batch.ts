import type { ScoutPlan, ScoutSlot } from "./build-scout-plan";
import { buildScoutPrompt } from "./build-scout-prompt";
import type { ScoutProvider, ScoutResult } from "../providers/scout-provider";
import { SCOUT_WIDE_WIDTH_PX, SCOUT_WIDE_HEIGHT_PX } from "../providers/scout-provider";
import { ROUND1_V2_CONFIG } from "../config";

export interface ScoutGenerationResult {
  slot: ScoutSlot;
  prompt: string;
  status: "success" | "failed";
  imageBytes?: Buffer;
  latencyMs?: number;
  providerModel?: string;
  error?: string;
}

export interface ScoutBatchResult {
  results: ScoutGenerationResult[];
  totalLatencyMs: number;
  successCount: number;
  failureCount: number;
}

// Bounded-concurrency async pool: dispatches tasks up to `concurrency` at a time.
async function asyncPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const i = nextIndex++;
        await fn(items[i], i);
      }
    }
  );
  await Promise.all(workers);
}

// Run all scout slots in a plan against the given provider, respecting concurrency limits.
// Provider is injected so callers can swap in a stub for testing without network access.
export async function runScoutBatch(
  plan: ScoutPlan,
  provider: ScoutProvider,
  options?: { concurrency?: number }
): Promise<ScoutBatchResult> {
  const concurrency = options?.concurrency ?? ROUND1_V2_CONFIG.scoutConcurrency;
  const results: ScoutGenerationResult[] = Array(plan.slots.length);
  const batchStart = Date.now();

  // Log one summary of the prompt parameters for this batch (not the full prompts).
  const grammarSummary = [...new Set(plan.slots.map((s) => s.grammarKey))].join(",");
  const primaryMotif = plan.slots[0]?.motifBinding[0] ?? "(none)";
  console.log(
    `[v2] prompt summary: grammars=[${grammarSummary}] primaryMotif=${primaryMotif} tone=${plan.tone} textPurge=true`
  );

  await asyncPool(plan.slots, concurrency, async (slot, i) => {
    const prompt = buildScoutPrompt(slot);
    try {
      const scoutResult: ScoutResult = await provider.generate({
        prompt,
        widthPx: SCOUT_WIDE_WIDTH_PX,
        heightPx: SCOUT_WIDE_HEIGHT_PX,
        seed: slot.seed,
      });
      results[i] = {
        slot,
        prompt,
        status: "success",
        imageBytes: scoutResult.imageBytes,
        latencyMs: scoutResult.latencyMs,
        providerModel: scoutResult.providerModel,
      };
    } catch (err) {
      results[i] = {
        slot,
        prompt,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });

  const totalLatencyMs = Date.now() - batchStart;
  const successCount = results.filter((r) => r.status === "success").length;
  const failureCount = results.length - successCount;

  return { results, totalLatencyMs, successCount, failureCount };
}
