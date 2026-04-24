// Pure helpers: map V2 domain objects → storage input types.
// These have no Prisma dependency and can be used in tests and scripts alike.

import type { ScoutSlot } from "../orchestrator/build-scout-plan";
import type { ScoutGenerationResult } from "../orchestrator/run-scout-batch";
import type { ScoutEvalResult } from "../eval/evaluate-scout";
import type { SelectedScout } from "../orchestrator/select-scouts";
import type {
  CreateScoutRunInput,
  UpdateScoutRunResultInput,
  CreateScoutEvalInput,
  CreateRebuildAttemptInput,
} from "./types";

export function buildCreateScoutRunInput(opts: {
  generationId: string;
  runSeed: string;
  slotIndex: number;
  slot: ScoutSlot;
  providerId: string;
  prompt: string;
}): CreateScoutRunInput {
  return {
    generationId: opts.generationId,
    runSeed: opts.runSeed,
    slotIndex: opts.slotIndex,
    grammarKey: opts.slot.grammarKey,
    diversityFamily: opts.slot.diversityFamily,
    tone: opts.slot.tone,
    motifBinding: opts.slot.motifBinding,
    seed: opts.slot.seed,
    providerId: opts.providerId,
    prompt: opts.prompt,
    promptSpec: opts.slot.promptSpec as unknown as Record<string, unknown>,
  };
}

export function buildUpdateScoutRunResultInput(
  id: string,
  result: ScoutGenerationResult
): UpdateScoutRunResultInput {
  if (result.status === "success") {
    return {
      id,
      status: "SUCCESS",
      latencyMs: result.latencyMs,
      providerModel: result.providerModel,
    };
  }
  return {
    id,
    status: "FAILED",
    failureReason: result.error ?? "unknown",
  };
}

export function buildCreateScoutEvalInput(
  scoutRunId: string,
  ev: ScoutEvalResult
): CreateScoutEvalInput {
  return {
    scoutRunId,
    hardReject: ev.hardReject,
    rejectReasons: ev.rejectReasons,
    textDetected: ev.textDetected,
    toneScore: ev.toneScore,
    structureScore: ev.structureScore,
    marginScore: ev.marginScore,
    compositeScore: ev.compositeScore,
    imageStats: ev.imageStats,
  };
}

export function buildCreateRebuildAttemptInput(opts: {
  generationId: string;
  selected: SelectedScout;
  scoutRunId?: string;
  providerId: string;
  attemptOrder: number;
}): CreateRebuildAttemptInput {
  return {
    generationId: opts.generationId,
    scoutRunId: opts.scoutRunId,
    optionIndex: opts.selected.slotIndex,
    providerId: opts.providerId,
    attemptOrder: opts.attemptOrder,
  };
}
