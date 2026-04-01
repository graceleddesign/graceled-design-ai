import "server-only";

import { Prisma, type AiAttempt as PrismaAiAttempt, type AiRun as PrismaAiRun } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
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
  return mapAiRun(
    await prisma.aiRun.update({
      where: {
        id: input.id
      },
      data: {
        status: input.status,
        completedAt: new Date(),
        metadataJson: toNullableJsonInput(input.metadataJson ?? null)
      }
    })
  );
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
  const existing = await prisma.aiAttempt.findUniqueOrThrow({
    where: {
      id: input.id
    }
  });
  const completedAt = input.completedAt ?? new Date();

  return mapAiAttempt(
    await prisma.aiAttempt.update({
      where: {
        id: input.id
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
    })
  );
}

export async function completeAiAttemptFailure(input: AiAttemptFailureInput): Promise<AiAttemptRecord> {
  const existing = await prisma.aiAttempt.findUniqueOrThrow({
    where: {
      id: input.id
    }
  });
  const completedAt = input.completedAt ?? new Date();

  return mapAiAttempt(
    await prisma.aiAttempt.update({
      where: {
        id: input.id
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
    })
  );
}
