import "server-only";

import { Prisma, PrismaClient } from "@prisma/client";
import { abandonAiRuns } from "@/lib/ai-harness/storage/attempts";
import { readPersistedGenerationExecutionState } from "@/lib/generation-state";
import {
  finalizeRoundOneLaunchSingleFlight,
  type RoundOneLaunchLease
} from "@/lib/graphics-domain/round1-launch-single-flight";

type GenerationAttemptOwner = {
  token: string;
  attemptNumber: number;
};

type PrismaLike = Pick<PrismaClient, "$transaction" | "generation" | "asset" | "aiRun">;

export type RoundOneGenerationTerminalization = {
  generationId: string;
  status: "COMPLETED" | "FAILED";
  output: Prisma.InputJsonValue | null;
  clearAssetSlots?: readonly string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function withSettledGenerationExecutionOutput(
  output: Prisma.JsonValue | Prisma.InputJsonValue | null
): Prisma.InputJsonValue | null {
  if (!isRecord(output)) {
    return output as Prisma.InputJsonValue | null;
  }

  const outputRecord = output as Record<string, unknown>;
  const existingMeta = isRecord(outputRecord.meta) ? outputRecord.meta : {};
  const existingExecution = readPersistedGenerationExecutionState(output);

  return {
    ...outputRecord,
    meta: {
      ...existingMeta,
      execution: {
        version: 1,
        phase: "SETTLED",
        activeAttemptToken: null,
        activeAttemptNumber: existingExecution?.activeAttemptNumber ?? null
      }
    }
  } as Prisma.InputJsonValue;
}

export async function assertGenerationAttemptStillActive(params: {
  prisma: Pick<PrismaClient, "generation">;
  generationId: string;
  attemptOwner: GenerationAttemptOwner;
}): Promise<void> {
  const row = await params.prisma.generation.findUnique({
    where: {
      id: params.generationId
    },
    select: {
      status: true,
      output: true
    }
  });

  const execution = readPersistedGenerationExecutionState(row?.output);
  const stillOwned =
    row?.status === "RUNNING" &&
    execution?.phase === "RUNNING" &&
    execution.activeAttemptToken === params.attemptOwner.token &&
    execution.activeAttemptNumber === params.attemptOwner.attemptNumber;

  if (!stillOwned) {
    throw new Error(`CLAIMED_GENERATION_EXECUTION_INACTIVE:${params.generationId}`);
  }
}

export async function finalizeRoundOneAuthoritativeSettlement(params: {
  prisma: PrismaLike;
  lease: RoundOneLaunchLease;
  generationTerminalizations: readonly RoundOneGenerationTerminalization[];
  launchTerminalStatus: "COMPLETED" | "FAILED";
  note?: string | null;
  staleWorkMessage?: string;
  staleWorkRunMetadataJson?: Prisma.InputJsonValue | null;
  staleWorkAttemptOutputJson?: Prisma.InputJsonValue | null;
}): Promise<{
  reconciledGenerationIds: string[];
  abandonedRunIds: string[];
  abandonedAttemptIds: string[];
  finalized: boolean;
}> {
  const generationTerminalizations = params.generationTerminalizations.filter((terminalization) => terminalization.generationId.trim().length > 0);
  const generationIds = [...new Set(generationTerminalizations.map((terminalization) => terminalization.generationId))];

  const reconciledGenerationIds = await params.prisma.$transaction(async (tx) => {
    const reconciled: string[] = [];

    for (const terminalization of generationTerminalizations) {
      const nextOutput = withSettledGenerationExecutionOutput(terminalization.output);
      await tx.generation.update({
        where: {
          id: terminalization.generationId
        },
        data: {
          status: terminalization.status,
          output: nextOutput === null ? Prisma.DbNull : nextOutput
        }
      });

      if ((terminalization.clearAssetSlots || []).length > 0) {
        await tx.asset.deleteMany({
          where: {
            generationId: terminalization.generationId,
            slot: {
              in: [...new Set(terminalization.clearAssetSlots || [])]
            }
          }
        });
      }

      reconciled.push(terminalization.generationId);
    }

    return reconciled;
  });

  const lingeringRuns = generationIds.length
    ? await params.prisma.aiRun.findMany({
        where: {
          generationId: {
            in: generationIds
          },
          status: "RUNNING"
        },
        select: {
          id: true
        }
      })
    : [];
  const abandonedHarnessWork =
    lingeringRuns.length > 0
      ? await abandonAiRuns({
          runIds: lingeringRuns.map((run) => run.id),
          errorClass: "TIMEOUT",
          message:
            params.staleWorkMessage ||
            "Round 1 authoritative settlement terminalized the launch before lingering background work completed.",
          attemptOutputJson: params.staleWorkAttemptOutputJson ?? {
            abandonedReason: "ROUND_TERMINALIZED"
          },
          runMetadataJson: params.staleWorkRunMetadataJson ?? {
            terminalizationReason: "ROUND_TERMINALIZED"
          }
        })
      : {
          runIds: [],
          attemptIds: []
        };

  const finalized = await finalizeRoundOneLaunchSingleFlight({
    prisma: params.prisma,
    lease: params.lease,
    terminalStatus: params.launchTerminalStatus,
    generationIds,
    note: params.note
  });

  return {
    reconciledGenerationIds,
    abandonedRunIds: abandonedHarnessWork.runIds,
    abandonedAttemptIds: abandonedHarnessWork.attemptIds,
    finalized
  };
}
