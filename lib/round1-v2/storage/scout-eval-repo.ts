import "server-only";

import type { ScoutEval as PrismaScoutEval } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ScoutEvalRecord, CreateScoutEvalInput } from "./types";
import type { ScoutRejectReason } from "../eval/evaluate-scout";
import type { ScoutImageStats } from "../eval/image-stats";

function mapScoutEval(r: PrismaScoutEval): ScoutEvalRecord {
  return {
    id: r.id,
    scoutRunId: r.scoutRunId,
    hardReject: r.hardReject,
    rejectReasons: r.rejectReasons as ScoutRejectReason[],
    textDetected: r.textDetected,
    toneScore: r.toneScore,
    structureScore: r.structureScore,
    marginScore: r.marginScore,
    compositeScore: r.compositeScore,
    imageStats: r.imageStatsJson as ScoutImageStats | null,
    createdAt: r.createdAt,
  };
}

export async function createScoutEval(input: CreateScoutEvalInput): Promise<ScoutEvalRecord> {
  return mapScoutEval(
    await prisma.scoutEval.create({
      data: {
        scoutRunId: input.scoutRunId,
        hardReject: input.hardReject,
        rejectReasons: input.rejectReasons,
        textDetected: input.textDetected,
        toneScore: input.toneScore,
        structureScore: input.structureScore,
        marginScore: input.marginScore,
        compositeScore: input.compositeScore,
        imageStatsJson: (input.imageStats ?? undefined) as Record<string, number> | undefined,
      },
    })
  );
}

export async function getScoutEvalByRunId(scoutRunId: string): Promise<ScoutEvalRecord | null> {
  const row = await prisma.scoutEval.findUnique({ where: { scoutRunId } });
  return row ? mapScoutEval(row) : null;
}
