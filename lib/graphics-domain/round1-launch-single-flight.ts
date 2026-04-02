import { randomUUID } from "crypto";
import { Prisma, PrismaClient } from "@prisma/client";

const ROUND_ONE = 1;
const ROUND_ONE_MARKER_PRODUCT_KEY = "graceled-design-ai";
const ROUND_ONE_MARKER_FEATURE_KEY = "project_round1_launch_single_flight";
const ROUND_ONE_MARKER_ID_PREFIX = "project-round1-launch";
const ROUND_ONE_MARKER_STALE_MS = 5 * 60 * 1000;
const ACTIVE_GENERATION_STATUSES = ["QUEUED", "RUNNING"] as const;

type PrismaLike = Pick<PrismaClient, "$transaction" | "aiRun" | "generation">;

type RoundOneLaunchPhase = "LAUNCHING" | "GENERATIONS_CREATED" | "SETTLED";
type RoundOneLaunchTerminalStatus = "COMPLETED" | "FAILED";

type RoundOneLaunchMarkerMetadata = {
  version: 1;
  launchToken: string;
  phase: RoundOneLaunchPhase;
  generationIds: string[];
  outcome?: RoundOneLaunchTerminalStatus;
  note?: string | null;
};

export type RoundOneLaunchLease = {
  markerId: string;
  projectId: string;
  launchToken: string;
  startedAt: Date;
};

export type RoundOneLaunchAcquireResult =
  | {
      kind: "acquired";
      lease: RoundOneLaunchLease;
    }
  | {
      kind: "duplicate";
      existingGenerationIds: string[];
      reason: "active-generation-cluster" | "launch-marker-in-flight";
    };

type RoundOneLaunchTransactionResult = RoundOneLaunchAcquireResult | { kind: "retry" };

function buildMarkerId(projectId: string): string {
  return `${ROUND_ONE_MARKER_ID_PREFIX}:${projectId}`;
}

function buildMarkerMetadata(params: {
  launchToken: string;
  phase: RoundOneLaunchPhase;
  generationIds?: string[];
  outcome?: RoundOneLaunchTerminalStatus;
  note?: string | null;
}): Prisma.InputJsonValue {
  const metadata: RoundOneLaunchMarkerMetadata = {
    version: 1,
    launchToken: params.launchToken,
    phase: params.phase,
    generationIds: params.generationIds || [],
    ...(params.outcome
      ? {
          outcome: params.outcome
        }
      : {}),
    ...(typeof params.note === "undefined"
      ? {}
      : {
          note: params.note
        })
  };

  return metadata as Prisma.InputJsonValue;
}

function readMarkerMetadata(value: Prisma.JsonValue | null): RoundOneLaunchMarkerMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 || typeof candidate.launchToken !== "string" || typeof candidate.phase !== "string") {
    return null;
  }

  const generationIds = Array.isArray(candidate.generationIds)
    ? candidate.generationIds.filter((entry): entry is string => typeof entry === "string")
    : [];

  return {
    version: 1,
    launchToken: candidate.launchToken,
    phase:
      candidate.phase === "LAUNCHING" || candidate.phase === "GENERATIONS_CREATED" || candidate.phase === "SETTLED"
        ? candidate.phase
        : "LAUNCHING",
    generationIds,
    outcome: candidate.outcome === "COMPLETED" || candidate.outcome === "FAILED" ? candidate.outcome : undefined,
    note: typeof candidate.note === "string" || candidate.note === null ? candidate.note : undefined
  };
}

function isKnownRequestError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function isMarkerStale(startedAt: Date, now: Date, staleMs: number): boolean {
  return now.getTime() - startedAt.getTime() > staleMs;
}

export async function acquireRoundOneLaunchSingleFlight(params: {
  prisma: PrismaLike;
  projectId: string;
  now?: Date;
  staleMs?: number;
}): Promise<RoundOneLaunchAcquireResult> {
  const markerId = buildMarkerId(params.projectId);
  const staleMs = params.staleMs ?? ROUND_ONE_MARKER_STALE_MS;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const startedAt = params.now ?? new Date();
    const launchToken = randomUUID();
    const transactionResult = await params.prisma.$transaction<RoundOneLaunchTransactionResult>(async (tx) => {
      const activeGenerationRows = await tx.generation.findMany({
        where: {
          projectId: params.projectId,
          round: ROUND_ONE,
          status: {
            in: [...ACTIVE_GENERATION_STATUSES]
          }
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true
        }
      });

      if (activeGenerationRows.length > 0) {
        return {
          kind: "duplicate" as const,
          existingGenerationIds: activeGenerationRows.map((row) => row.id),
          reason: "active-generation-cluster" as const
        };
      }

      const existingMarker = await tx.aiRun.findUnique({
        where: {
          id: markerId
        },
        select: {
          status: true,
          startedAt: true,
          completedAt: true,
          metadataJson: true
        }
      });

      if (!existingMarker) {
        try {
          await tx.aiRun.create({
            data: {
              id: markerId,
              productKey: ROUND_ONE_MARKER_PRODUCT_KEY,
              featureKey: ROUND_ONE_MARKER_FEATURE_KEY,
              projectId: params.projectId,
              round: ROUND_ONE,
              status: "RUNNING",
              startedAt,
              completedAt: null,
              metadataJson: buildMarkerMetadata({
                launchToken,
                phase: "LAUNCHING"
              })
            }
          });

          return {
            kind: "acquired" as const,
            lease: {
              markerId,
              projectId: params.projectId,
              launchToken,
              startedAt
            }
          };
        } catch (error) {
          if (isKnownRequestError(error, "P2002")) {
            return { kind: "retry" as const };
          }
          throw error;
        }
      }

      const existingMetadata = readMarkerMetadata(existingMarker.metadataJson);
      if (existingMarker.status === "RUNNING" && !isMarkerStale(existingMarker.startedAt, startedAt, staleMs)) {
        return {
          kind: "duplicate" as const,
          existingGenerationIds: existingMetadata?.generationIds || [],
          reason: "launch-marker-in-flight" as const
        };
      }

      const reacquireResult = await tx.aiRun.updateMany({
        where: {
          id: markerId,
          status: existingMarker.status,
          startedAt: existingMarker.startedAt,
          completedAt: existingMarker.completedAt
        },
        data: {
          productKey: ROUND_ONE_MARKER_PRODUCT_KEY,
          featureKey: ROUND_ONE_MARKER_FEATURE_KEY,
          projectId: params.projectId,
          generationId: null,
          round: ROUND_ONE,
          laneKey: null,
          benchmarkCaseKey: null,
          status: "RUNNING",
          startedAt,
          completedAt: null,
          metadataJson: buildMarkerMetadata({
            launchToken,
            phase: "LAUNCHING"
          })
        }
      });

      if (reacquireResult.count !== 1) {
        return { kind: "retry" as const };
      }

      return {
        kind: "acquired" as const,
        lease: {
          markerId,
          projectId: params.projectId,
          launchToken,
          startedAt
        }
      };
    });

    if (transactionResult.kind !== "retry") {
      return transactionResult;
    }
  }

  throw new Error(`Failed to acquire Round 1 single-flight marker for project ${params.projectId}.`);
}

export async function attachRoundOneLaunchGenerationIds(params: {
  prisma: PrismaLike;
  lease: RoundOneLaunchLease;
  generationIds: string[];
}): Promise<boolean> {
  const updateResult = await params.prisma.aiRun.updateMany({
    where: {
      id: params.lease.markerId,
      status: "RUNNING",
      startedAt: params.lease.startedAt
    },
    data: {
      metadataJson: buildMarkerMetadata({
        launchToken: params.lease.launchToken,
        phase: "GENERATIONS_CREATED",
        generationIds: params.generationIds
      })
    }
  });

  return updateResult.count === 1;
}

export async function finalizeRoundOneLaunchSingleFlight(params: {
  prisma: PrismaLike;
  lease: RoundOneLaunchLease;
  terminalStatus: RoundOneLaunchTerminalStatus;
  generationIds?: string[];
  note?: string | null;
}): Promise<boolean> {
  const completedAt = new Date();
  const updateResult = await params.prisma.aiRun.updateMany({
    where: {
      id: params.lease.markerId,
      status: "RUNNING",
      startedAt: params.lease.startedAt
    },
    data: {
      status: params.terminalStatus,
      completedAt,
      metadataJson: buildMarkerMetadata({
        launchToken: params.lease.launchToken,
        phase: "SETTLED",
        generationIds: params.generationIds || [],
        outcome: params.terminalStatus,
        note: params.note
      })
    }
  });

  return updateResult.count === 1;
}
