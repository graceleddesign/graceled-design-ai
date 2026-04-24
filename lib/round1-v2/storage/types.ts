import type { ScoutRejectReason } from "../eval/evaluate-scout";
import type { ScoutImageStats } from "../eval/image-stats";

// Domain-level record types returned by the storage layer.
// These are plain objects — callers never see raw Prisma types.

export type ScoutRunStatus = "PENDING" | "SUCCESS" | "FAILED";
export type RebuildStatus = "PENDING" | "SUCCESS" | "FAILED" | "SKIPPED";

export interface ScoutRunRecord {
  id: string;
  generationId: string;
  runSeed: string;
  slotIndex: number;
  grammarKey: string;
  diversityFamily: string;
  tone: string;
  motifBinding: string[];
  seed: number;
  providerId: string;
  prompt: string;
  status: ScoutRunStatus;
  failureReason: string | null;
  assetPath: string | null;
  latencyMs: number | null;
  providerModel: string | null;
  createdAt: Date;
}

export interface ScoutEvalRecord {
  id: string;
  scoutRunId: string;
  hardReject: boolean;
  rejectReasons: ScoutRejectReason[];
  textDetected: boolean;
  toneScore: number;
  structureScore: number;
  marginScore: number;
  compositeScore: number;
  imageStats: ScoutImageStats | null;
  createdAt: Date;
}

export interface RebuildAttemptRecord {
  id: string;
  generationId: string;
  scoutRunId: string | null;
  optionIndex: number;
  providerId: string;
  attemptOrder: number;
  status: RebuildStatus;
  failureReason: string | null;
  assetPath: string | null;
  latencyMs: number | null;
  providerModel: string | null;
  createdAt: Date;
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateScoutRunInput {
  generationId: string;
  runSeed: string;
  slotIndex: number;
  grammarKey: string;
  diversityFamily: string;
  tone: string;
  motifBinding: string[];
  seed: number;
  providerId: string;
  prompt: string;
  promptSpec: Record<string, unknown>;
}

export interface UpdateScoutRunResultInput {
  id: string;
  status: "SUCCESS" | "FAILED";
  failureReason?: string;
  assetPath?: string;
  latencyMs?: number;
  providerModel?: string;
}

export interface CreateScoutEvalInput {
  scoutRunId: string;
  hardReject: boolean;
  rejectReasons: ScoutRejectReason[];
  textDetected: boolean;
  toneScore: number;
  structureScore: number;
  marginScore: number;
  compositeScore: number;
  imageStats: ScoutImageStats | null;
}

export interface CreateRebuildAttemptInput {
  generationId: string;
  scoutRunId?: string;
  optionIndex: number;
  providerId: string;
  attemptOrder: number;
}

export interface UpdateRebuildAttemptResultInput {
  id: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  failureReason?: string;
  assetPath?: string;
  latencyMs?: number;
  providerModel?: string;
}
