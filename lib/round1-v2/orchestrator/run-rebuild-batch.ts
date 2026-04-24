import type { NormalizedBrief } from "../briefs/types";
import type { SelectedScout, SelectionLabel } from "./select-scouts";
import type { RebuildProvider } from "../providers/rebuild-provider";
import { RebuildProviderError } from "../providers/rebuild-provider";
import { REBUILD_WIDE_WIDTH_PX, REBUILD_WIDE_HEIGHT_PX } from "../providers/rebuild-provider";
import { buildRebuildPrompt } from "./build-rebuild-prompt";
import type { GrammarKey } from "../grammars";
import { ROUND1_V2_CONFIG } from "../config";

export interface RebuildLaneResult {
  label: SelectionLabel;
  selectedScout: SelectedScout;
  status: "success" | "failed";
  imageBytes?: Buffer;
  latencyMs?: number;
  providerModel?: string;
  providerId?: string;
  error?: string;
  usedFallback: boolean;
  rebuildAttemptId?: string;
}

export interface RebuildBatchResult {
  results: RebuildLaneResult[];
  successCount: number;
  failureCount: number;
  totalLatencyMs: number;
}

export interface RebuildBatchOptions {
  // IDs of the persisted ScoutRun rows, keyed by slotIndex, for FK lineage.
  scoutRunIds?: Map<number, string>;
  // Prisma generationId — if provided, RebuildAttempt records are persisted.
  generationId?: string;
}

// Build a deterministic rebuild seed from the scout seed so reruns are stable.
function rebuildSeed(scoutSeed: number, attemptOrder: number): number {
  return (scoutSeed ^ (0xdeadbeef * (attemptOrder + 1))) >>> 0;
}

async function attemptRebuild(
  provider: RebuildProvider,
  prompt: string,
  seed: number
): Promise<{ imageBytes: Buffer; latencyMs: number; providerModel: string; seed: number }> {
  return provider.generate({
    prompt,
    widthPx: REBUILD_WIDE_WIDTH_PX,
    heightPx: REBUILD_WIDE_HEIGHT_PX,
    seed,
  });
}

export async function runRebuildBatch(
  brief: NormalizedBrief,
  selected: SelectedScout[],
  primaryProvider: RebuildProvider,
  fallbackProvider: RebuildProvider,
  options?: RebuildBatchOptions
): Promise<RebuildBatchResult> {
  const batchStart = Date.now();
  const results: RebuildLaneResult[] = [];

  // Persist helpers are loaded lazily so this file stays importable in dry-run/test contexts.
  const persistEnabled = Boolean(options?.generationId);
  let storage: typeof import("../storage") | null = null;
  if (persistEnabled) {
    storage = await import("../storage");
  }

  for (const scout of selected) {
    const prompt = buildRebuildPrompt({
      grammarKey: scout.slot.grammarKey as GrammarKey,
      tone: scout.slot.tone,
      motifBinding: scout.slot.motifBinding,
      negativeHints: brief.negativeHints,
    });

    const scoutRunId = options?.scoutRunIds?.get(scout.slotIndex);

    let rebuildAttemptId: string | undefined;
    let usedFallback = false;
    let lastError: string | undefined;
    let succeeded = false;
    let imageBytes: Buffer | undefined;
    let latencyMs: number | undefined;
    let providerModel: string | undefined;
    let providerId: string | undefined;

    // Attempt 0: primary (Nano Banana Pro)
    for (let attempt = 0; attempt <= ROUND1_V2_CONFIG.rebuildFallbackBudget; attempt++) {
      const isFirstAttempt = attempt === 0;
      const provider = isFirstAttempt ? primaryProvider : fallbackProvider;
      const seed = rebuildSeed(scout.slot.seed, attempt);

      // Persist attempt placeholder
      if (storage && options?.generationId) {
        try {
          const rec = await storage.createRebuildAttempt({
            generationId: options.generationId,
            scoutRunId,
            optionIndex: scout.slotIndex,
            providerId: provider.id,
            attemptOrder: attempt,
          });
          if (isFirstAttempt) rebuildAttemptId = rec.id;
        } catch {
          // Persistence failure never blocks generation
        }
      }

      try {
        const res = await attemptRebuild(provider, prompt, seed);
        imageBytes = res.imageBytes;
        latencyMs = res.latencyMs;
        providerModel = res.providerModel;
        providerId = provider.id;
        usedFallback = !isFirstAttempt;
        succeeded = true;

        if (storage && rebuildAttemptId) {
          try {
            await storage.updateRebuildAttemptResult({
              id: rebuildAttemptId,
              status: "SUCCESS",
              latencyMs: res.latencyMs,
              providerModel: res.providerModel,
            });
          } catch { /* non-blocking */ }
        }
        break;
      } catch (err) {
        const isRetryable =
          err instanceof RebuildProviderError ? err.isRetryable : false;
        lastError = err instanceof Error ? err.message : String(err);

        if (storage && rebuildAttemptId) {
          try {
            await storage.updateRebuildAttemptResult({
              id: rebuildAttemptId,
              status: isRetryable && attempt < ROUND1_V2_CONFIG.rebuildFallbackBudget
                ? "FAILED"
                : "FAILED",
              failureReason: lastError,
            });
          } catch { /* non-blocking */ }
        }

        if (!isRetryable) break; // content policy and unknown → no fallback
      }
    }

    results.push({
      label: scout.label,
      selectedScout: scout,
      status: succeeded ? "success" : "failed",
      imageBytes,
      latencyMs,
      providerModel,
      providerId,
      error: succeeded ? undefined : lastError,
      usedFallback,
      rebuildAttemptId,
    });
  }

  const totalLatencyMs = Date.now() - batchStart;
  const successCount = results.filter((r) => r.status === "success").length;

  return {
    results,
    successCount,
    failureCount: results.length - successCount,
    totalLatencyMs,
  };
}
