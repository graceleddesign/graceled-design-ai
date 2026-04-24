import "server-only";

import type {
  ScoutRun as PrismaScoutRun,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  ScoutRunRecord,
  CreateScoutRunInput,
  UpdateScoutRunResultInput,
} from "./types";

function mapScoutRun(r: PrismaScoutRun): ScoutRunRecord {
  return {
    id: r.id,
    generationId: r.generationId,
    runSeed: r.runSeed,
    slotIndex: r.slotIndex,
    grammarKey: r.grammarKey,
    diversityFamily: r.diversityFamily,
    tone: r.tone,
    motifBinding: r.motifBinding as string[],
    seed: r.seed,
    providerId: r.providerId,
    prompt: r.prompt,
    status: r.status as ScoutRunRecord["status"],
    failureReason: r.failureReason,
    assetPath: r.assetPath,
    latencyMs: r.latencyMs,
    providerModel: r.providerModel,
    createdAt: r.createdAt,
  };
}

export async function createScoutRun(input: CreateScoutRunInput): Promise<ScoutRunRecord> {
  return mapScoutRun(
    await prisma.scoutRun.create({
      data: {
        generationId: input.generationId,
        runSeed: input.runSeed,
        slotIndex: input.slotIndex,
        grammarKey: input.grammarKey,
        diversityFamily: input.diversityFamily,
        tone: input.tone,
        motifBinding: input.motifBinding,
        seed: input.seed,
        providerId: input.providerId,
        prompt: input.prompt,
        promptSpecJson: input.promptSpec as import("@prisma/client").Prisma.InputJsonValue,
        status: "PENDING",
      },
    })
  );
}

export async function updateScoutRunResult(input: UpdateScoutRunResultInput): Promise<ScoutRunRecord> {
  return mapScoutRun(
    await prisma.scoutRun.update({
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

export async function getScoutRunsByGenerationId(generationId: string): Promise<ScoutRunRecord[]> {
  const rows = await prisma.scoutRun.findMany({
    where: { generationId },
    orderBy: { slotIndex: "asc" },
  });
  return rows.map(mapScoutRun);
}
