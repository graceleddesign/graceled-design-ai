import "server-only";

import { Prisma, type BenchmarkCase as PrismaBenchmarkCase, type BenchmarkRun as PrismaBenchmarkRun } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  AiBenchmarkCaseDefinition,
  AiInputJsonValue,
  AiJsonValue,
  AiRunRecord,
  BenchmarkCaseRecord,
  BenchmarkRunRecord
} from "@/lib/ai-harness/core/types";

function toNullableJsonInput(value: AiInputJsonValue | null | undefined): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  return value ?? Prisma.DbNull;
}

function mapBenchmarkCase(record: PrismaBenchmarkCase): BenchmarkCaseRecord {
  return {
    id: record.id,
    caseKey: record.caseKey,
    name: record.name,
    inputJson: record.inputJson as BenchmarkCaseRecord["inputJson"],
    enabled: record.enabled,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function mapBenchmarkRun(record: PrismaBenchmarkRun): BenchmarkRunRecord {
  return {
    id: record.id,
    caseKey: record.caseKey,
    runId: record.runId,
    codeVersion: record.codeVersion,
    providerConfigVersion: record.providerConfigVersion,
    summaryJson: record.summaryJson as AiJsonValue | null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

async function loadBenchmarkCase(caseKey: string): Promise<BenchmarkCaseRecord> {
  return mapBenchmarkCase(
    await prisma.benchmarkCase.findUniqueOrThrow({
      where: {
        caseKey
      }
    })
  );
}

async function loadBenchmarkRun(runId: string): Promise<BenchmarkRunRecord> {
  return mapBenchmarkRun(
    await prisma.benchmarkRun.findUniqueOrThrow({
      where: {
        runId
      }
    })
  );
}

export async function upsertBenchmarkCase(definition: AiBenchmarkCaseDefinition): Promise<BenchmarkCaseRecord> {
  return mapBenchmarkCase(
    await prisma.benchmarkCase.upsert({
      where: {
        caseKey: definition.caseKey
      },
      create: {
        caseKey: definition.caseKey,
        name: definition.name,
        inputJson: definition.inputJson,
        enabled: definition.enabled ?? true
      },
      update: {
        name: definition.name,
        inputJson: definition.inputJson,
        enabled: definition.enabled ?? true
      }
    })
  );
}

export async function logBenchmarkRun(params: {
  run: AiRunRecord;
  benchmarkCase?: AiBenchmarkCaseDefinition | null;
  codeVersion?: string | null;
  providerConfigVersion?: string | null;
  summaryJson?: BenchmarkRunRecord["summaryJson"];
}): Promise<BenchmarkRunRecord | null> {
  if (!params.run.benchmarkCaseKey) {
    return null;
  }

  const benchmarkCase =
    params.benchmarkCase ??
    ({
      caseKey: params.run.benchmarkCaseKey,
      name: params.run.benchmarkCaseKey,
        inputJson: {}
    } satisfies AiBenchmarkCaseDefinition);
  await upsertBenchmarkCase(benchmarkCase);

  return mapBenchmarkRun(
    await prisma.benchmarkRun.upsert({
      where: {
        runId: params.run.id
      },
      create: {
        caseKey: benchmarkCase.caseKey,
        runId: params.run.id,
        codeVersion: params.codeVersion ?? null,
        providerConfigVersion: params.providerConfigVersion ?? null,
        summaryJson: toNullableJsonInput(params.summaryJson ?? null)
      },
      update: {
        caseKey: benchmarkCase.caseKey,
        codeVersion: params.codeVersion ?? null,
        providerConfigVersion: params.providerConfigVersion ?? null,
        summaryJson: toNullableJsonInput(params.summaryJson ?? null)
      }
    })
  );
}
