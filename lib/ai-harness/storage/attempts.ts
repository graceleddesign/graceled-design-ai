import "server-only";

import { Prisma, type AiAttempt as PrismaAiAttempt, type AiRun as PrismaAiRun } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  AiErrorClass,
  AiAttemptCreateInput,
  AiAttemptFailureInput,
  AiAttemptRecord,
  AiAttemptSuccessInput,
  AiInputJsonValue,
  AiJsonValue,
  AiRunCompleteInput,
  AiRunCreateInput,
  AiRunRecord
} from "@/lib/ai-harness/core/types";

function toNullableJsonInput(value: AiInputJsonValue | null | undefined): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  return value ?? Prisma.DbNull;
}

function toJsonObjectPatch(
  value: AiInputJsonValue | null | undefined,
  fallbackKey: string
): Record<string, Prisma.InputJsonValue | null> {
  if (typeof value === "undefined" || value === null) {
    return {};
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, Prisma.InputJsonValue | null>;
  }

  return {
    [fallbackKey]: value as Prisma.InputJsonValue
  };
}

function mergeJsonObjectInput(
  existing: AiJsonValue | null,
  additions: Record<string, Prisma.InputJsonValue | null | undefined>
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  const normalizedEntries = Object.entries(additions).filter(([, value]) => typeof value !== "undefined");
  if (normalizedEntries.length === 0) {
    return toNullableJsonInput(existing as AiInputJsonValue | null);
  }

  const existingRecord =
    existing && typeof existing === "object" && !Array.isArray(existing) ? (existing as Record<string, AiJsonValue>) : null;
  const nextValue = {
    ...(existingRecord || {}),
    ...Object.fromEntries(normalizedEntries)
  } as Prisma.InputJsonValue;

  return toNullableJsonInput(nextValue);
}

function mapAiRun(record: PrismaAiRun): AiRunRecord {
  return {
    id: record.id,
    productKey: record.productKey,
    featureKey: record.featureKey,
    projectId: record.projectId,
    generationId: record.generationId,
    round: record.round,
    laneKey: record.laneKey,
    benchmarkCaseKey: record.benchmarkCaseKey,
    status: record.status as AiRunRecord["status"],
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    metadataJson: record.metadataJson as AiJsonValue | null
  };
}

function mapAiAttempt(record: PrismaAiAttempt): AiAttemptRecord {
  return {
    id: record.id,
    runId: record.runId,
    providerKey: record.providerKey as AiAttemptRecord["providerKey"],
    modelKey: record.modelKey as AiAttemptRecord["modelKey"],
    operationKey: record.operationKey as AiAttemptRecord["operationKey"],
    promptVersion: record.promptVersion,
    requestHash: record.requestHash,
    providerRequestId: record.providerRequestId,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    latencyMs: record.latencyMs,
    success: record.success,
    errorClass: record.errorClass as AiAttemptRecord["errorClass"],
    providerStatusCode: record.providerStatusCode,
    outputJson: record.outputJson as AiJsonValue | null
  };
}

async function loadAiRun(id: string): Promise<AiRunRecord> {
  return mapAiRun(
    await prisma.aiRun.findUniqueOrThrow({
      where: {
        id
      }
    })
  );
}

async function loadAiAttempt(id: string): Promise<AiAttemptRecord> {
  return mapAiAttempt(
    await prisma.aiAttempt.findUniqueOrThrow({
      where: {
        id
      }
    })
  );
}

function resolveLatencyMs(startedAt: Date, completedAt: Date): number {
  return Math.max(0, completedAt.getTime() - startedAt.getTime());
}

export async function createAiRun(input: AiRunCreateInput): Promise<AiRunRecord> {
  return mapAiRun(
    await prisma.aiRun.create({
      data: {
        productKey: input.productKey,
        featureKey: input.featureKey,
        projectId: input.projectId ?? null,
        generationId: input.generationId ?? null,
        round: input.round ?? null,
        laneKey: input.laneKey ?? null,
        benchmarkCaseKey: input.benchmarkCaseKey ?? null,
        status: "RUNNING",
        metadataJson: toNullableJsonInput(input.metadataJson ?? null)
      }
    })
  );
}

export async function completeAiRun(input: AiRunCompleteInput): Promise<AiRunRecord> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.aiRun.findUniqueOrThrow({
      where: {
        id: input.id
      }
    });

    if (existing.completedAt || existing.status !== "RUNNING") {
      return mapAiRun(existing);
    }

    const completedAt = new Date();
    const updateResult = await tx.aiRun.updateMany({
      where: {
        id: input.id,
        status: "RUNNING",
        completedAt: null
      },
      data: {
        status: input.status,
        completedAt,
        metadataJson: toNullableJsonInput(input.metadataJson ?? null)
      }
    });

    if (updateResult.count !== 1) {
      return mapAiRun(
        await tx.aiRun.findUniqueOrThrow({
          where: {
            id: input.id
          }
        })
      );
    }

    return mapAiRun(
      await tx.aiRun.findUniqueOrThrow({
        where: {
          id: input.id
        }
      })
    );
  });
}

export async function createAiAttempt(input: AiAttemptCreateInput): Promise<AiAttemptRecord> {
  const startedAt = input.startedAt ?? new Date();

  return mapAiAttempt(
    await prisma.aiAttempt.create({
      data: {
        runId: input.runId,
        providerKey: input.providerKey,
        modelKey: input.modelKey,
        operationKey: input.operationKey,
        promptVersion: input.promptVersion,
        requestHash: input.requestHash,
        providerRequestId: input.providerRequestId ?? null,
        startedAt
      }
    })
  );
}

export async function completeAiAttemptSuccess(input: AiAttemptSuccessInput): Promise<AiAttemptRecord> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.aiAttempt.findUniqueOrThrow({
      where: {
        id: input.id
      }
    });

    if (existing.completedAt) {
      return mapAiAttempt(existing);
    }

    const completedAt = input.completedAt ?? new Date();
    const updateResult = await tx.aiAttempt.updateMany({
      where: {
        id: input.id,
        completedAt: null
      },
      data: {
        providerRequestId: input.providerRequestId ?? null,
        completedAt,
        latencyMs: resolveLatencyMs(existing.startedAt, completedAt),
        success: true,
        errorClass: null,
        providerStatusCode: null,
        outputJson: toNullableJsonInput(input.outputJson ?? null)
      }
    });

    if (updateResult.count !== 1) {
      return mapAiAttempt(
        await tx.aiAttempt.findUniqueOrThrow({
          where: {
            id: input.id
          }
        })
      );
    }

    return mapAiAttempt(
      await tx.aiAttempt.findUniqueOrThrow({
        where: {
          id: input.id
        }
      })
    );
  });
}

export async function completeAiAttemptFailure(input: AiAttemptFailureInput): Promise<AiAttemptRecord> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.aiAttempt.findUniqueOrThrow({
      where: {
        id: input.id
      }
    });

    if (existing.completedAt) {
      return mapAiAttempt(existing);
    }

    const completedAt = input.completedAt ?? new Date();
    const updateResult = await tx.aiAttempt.updateMany({
      where: {
        id: input.id,
        completedAt: null
      },
      data: {
        ...(typeof input.providerRequestId === "undefined"
          ? {}
          : {
              providerRequestId: input.providerRequestId ?? null
            }),
        completedAt,
        latencyMs: resolveLatencyMs(existing.startedAt, completedAt),
        success: false,
        errorClass: input.errorClass,
        providerStatusCode: input.providerStatusCode ?? null,
        outputJson: toNullableJsonInput(input.outputJson ?? null)
      }
    });

    if (updateResult.count !== 1) {
      return mapAiAttempt(
        await tx.aiAttempt.findUniqueOrThrow({
          where: {
            id: input.id
          }
        })
      );
    }

    return mapAiAttempt(
      await tx.aiAttempt.findUniqueOrThrow({
        where: {
          id: input.id
        }
      })
    );
  });
}

export async function abandonAiRuns(input: {
  runIds: readonly string[];
  errorClass: Exclude<AiErrorClass, "VALIDATION_FAILED">;
  message: string;
  attemptOutputJson?: AiInputJsonValue | null;
  runMetadataJson?: AiInputJsonValue | null;
  completedAt?: Date;
}): Promise<{ runIds: string[]; attemptIds: string[] }> {
  const runIds = [...new Set(input.runIds.map((value) => value.trim()).filter(Boolean))];
  if (runIds.length === 0) {
    return {
      runIds: [],
      attemptIds: []
    };
  }

  return prisma.$transaction(async (tx) => {
    const completedAt = input.completedAt ?? new Date();
    const openRuns = await tx.aiRun.findMany({
      where: {
        id: {
          in: runIds
        },
        status: "RUNNING"
      }
    });
    const openRunIds = openRuns.map((run) => run.id);

    if (openRunIds.length === 0) {
      return {
        runIds: [],
        attemptIds: []
      };
    }

    const openAttempts = await tx.aiAttempt.findMany({
      where: {
        runId: {
          in: openRunIds
        },
        completedAt: null
      }
    });
    const attemptOutputPatch = {
      errorClass: input.errorClass,
      message: input.message,
      staleWork: true,
      ...toJsonObjectPatch(input.attemptOutputJson ?? null, "details")
    };
    const runMetadataPatch = {
      errorClass: input.errorClass,
      message: input.message,
      staleWork: true,
      ...toJsonObjectPatch(input.runMetadataJson ?? null, "details")
    };

    for (const attempt of openAttempts) {
      await tx.aiAttempt.updateMany({
        where: {
          id: attempt.id,
          completedAt: null
        },
        data: {
          completedAt,
          latencyMs: resolveLatencyMs(attempt.startedAt, completedAt),
          success: false,
          errorClass: input.errorClass,
          providerStatusCode: null,
          outputJson: mergeJsonObjectInput(attempt.outputJson as AiJsonValue | null, attemptOutputPatch)
        }
      });
    }

    for (const run of openRuns) {
      await tx.aiRun.updateMany({
        where: {
          id: run.id,
          status: "RUNNING"
        },
        data: {
          status: "FAILED",
          completedAt,
          metadataJson: mergeJsonObjectInput(run.metadataJson as AiJsonValue | null, runMetadataPatch)
        }
      });
    }

    return {
      runIds: openRunIds,
      attemptIds: openAttempts.map((attempt) => attempt.id)
    };
  });
}
