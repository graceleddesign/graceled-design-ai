import "server-only";

import { Prisma, type AiEvalResult as PrismaAiEvalResult } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AiEvalPersistInput, AiEvalResultRecord, AiInputJsonValue, AiJsonValue } from "@/lib/ai-harness/core/types";

function toNullableJsonInput(value: AiInputJsonValue | null | undefined): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  return value ?? Prisma.DbNull;
}

function mapAiEvalResult(record: PrismaAiEvalResult): AiEvalResultRecord {
  return {
    id: record.id,
    runId: record.runId,
    attemptId: record.attemptId,
    evalKey: record.evalKey,
    passed: record.passed,
    score: record.score,
    reasonKey: record.reasonKey,
    detailsJson: record.detailsJson as AiJsonValue | null,
    createdAt: record.createdAt
  };
}

async function loadAiEvalResult(id: string): Promise<AiEvalResultRecord> {
  return mapAiEvalResult(
    await prisma.aiEvalResult.findUniqueOrThrow({
      where: {
        id
      }
    })
  );
}

export async function persistAiEvalResult(input: AiEvalPersistInput): Promise<AiEvalResultRecord | null> {
  try {
    return mapAiEvalResult(
      await prisma.aiEvalResult.create({
        data: {
          runId: input.runId,
          attemptId: input.attemptId ?? null,
          evalKey: input.evalKey,
          passed: input.passed,
          score: input.score ?? null,
          reasonKey: input.reasonKey ?? null,
          detailsJson: toNullableJsonInput(input.detailsJson ?? null)
        }
      })
    );
  } catch (error) {
    console.error("[EVAL-WRITE-FAILED]", error);
    return null;
  }
}

export async function persistAiEvalResults(inputs: readonly AiEvalPersistInput[]): Promise<AiEvalResultRecord[]> {
  const results = await Promise.all(inputs.map((input) => persistAiEvalResult(input)));
  return results.filter((r): r is AiEvalResultRecord => r !== null);
}
