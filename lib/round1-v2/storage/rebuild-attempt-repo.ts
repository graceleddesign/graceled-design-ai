import "server-only";

import type { RebuildAttempt as PrismaRebuildAttempt } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  RebuildAttemptRecord,
  CreateRebuildAttemptInput,
  UpdateRebuildAttemptResultInput,
} from "./types";

function mapRebuildAttempt(r: PrismaRebuildAttempt): RebuildAttemptRecord {
  return {
    id: r.id,
    generationId: r.generationId,
    scoutRunId: r.scoutRunId,
    optionIndex: r.optionIndex,
    providerId: r.providerId,
    attemptOrder: r.attemptOrder,
    status: r.status as RebuildAttemptRecord["status"],
    failureReason: r.failureReason,
    assetPath: r.assetPath,
    latencyMs: r.latencyMs,
    providerModel: r.providerModel,
    createdAt: r.createdAt,
  };
}

export async function createRebuildAttempt(input: CreateRebuildAttemptInput): Promise<RebuildAttemptRecord> {
  return mapRebuildAttempt(
    await prisma.rebuildAttempt.create({
      data: {
        generationId: input.generationId,
        scoutRunId: input.scoutRunId ?? null,
        optionIndex: input.optionIndex,
        providerId: input.providerId,
        attemptOrder: input.attemptOrder,
        status: "PENDING",
      },
    })
  );
}

export async function updateRebuildAttemptResult(input: UpdateRebuildAttemptResultInput): Promise<RebuildAttemptRecord> {
  return mapRebuildAttempt(
    await prisma.rebuildAttempt.update({
      where: { id: input.id },
      data: {
        status: input.status,
        failureReason: input.failureReason ?? null,
        assetPath: input.assetPath ?? null,
        latencyMs: input.latencyMs ?? null,
        providerModel: input.providerModel ?? null,
      },
    })
  );
}

export async function getRebuildAttemptsByGenerationId(generationId: string): Promise<RebuildAttemptRecord[]> {
  const rows = await prisma.rebuildAttempt.findMany({
    where: { generationId },
    orderBy: [{ optionIndex: "asc" }, { attemptOrder: "asc" }],
  });
  return rows.map(mapRebuildAttempt);
}
