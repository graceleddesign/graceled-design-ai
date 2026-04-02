import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const WORKDIR = "/Users/robrussell/Documents/GraceLed Designs AI";

function buildRunningGenerationOutput(status: "COMPLETED" | "FAILED_GENERATION" | "FALLBACK", token: string, attemptNumber: number) {
  return {
    status,
    meta: {
      execution: {
        version: 1,
        phase: "RUNNING",
        activeAttemptToken: token,
        activeAttemptNumber: attemptNumber
      }
    }
  };
}

test("authoritative round 1 settlement terminalizes the launch, reconciles running rows, and blocks late background/eval writes", async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousOpenAiApiKey = process.env.OPENAI_API_KEY;
  const previousNodePath = process.env.NODE_PATH;
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "graceled-round1-settlement-"));
  const databasePath = path.join(tempDir, "round1-settlement.sqlite");
  const databaseUrl = `file:${databasePath}`;
  const stubNodeModulesPath = path.join(tempDir, "node_modules");
  const serverOnlyStubPath = path.join(stubNodeModulesPath, "server-only");

  process.env.DATABASE_URL = databaseUrl;
  process.env.OPENAI_API_KEY = previousOpenAiApiKey || "test-openai-key";
  mkdirSync(serverOnlyStubPath, {
    recursive: true
  });
  writeFileSync(path.join(serverOnlyStubPath, "index.js"), "module.exports = {};\n");
  process.env.NODE_PATH = previousNodePath ? `${stubNodeModulesPath}${path.delimiter}${previousNodePath}` : stubNodeModulesPath;
  Module._initPaths();
  delete (globalThis as typeof globalThis & { prisma?: unknown }).prisma;
  copyFileSync(path.join(WORKDIR, "prisma", "dev.db"), databasePath);

  const { prisma } = await import("@/lib/prisma");
  const {
    acquireRoundOneLaunchSingleFlight,
    attachRoundOneLaunchGenerationIds
  } = await import("@/lib/graphics-domain/round1-launch-single-flight");
  const {
    assertGenerationAttemptStillActive,
    finalizeRoundOneAuthoritativeSettlement
  } = await import("@/lib/graphics-domain/round1-authoritative-settlement");
  const { createGraphicsBackgroundAiRun } = await import("@/lib/graphics-domain/generation");
  const { runAiEvalDefinitions } = await import("@/lib/ai-harness/evals/runner");

  try {
    const projectId = "project_round1_authoritative";
    await prisma.organization.create({
      data: {
        id: "org_round1_authoritative",
        name: "Round 1 Org",
        slug: "round1-org"
      }
    });
    await prisma.user.create({
      data: {
        id: "user_round1_authoritative",
        email: "round1@example.com",
        passwordHash: "hash"
      }
    });
    await prisma.project.create({
      data: {
        id: projectId,
        organizationId: "org_round1_authoritative",
        createdById: "user_round1_authoritative",
        series_title: "Round 1 authoritative settlement"
      }
    });
    const acquired = await acquireRoundOneLaunchSingleFlight({
      prisma,
      projectId
    });
    if (acquired.kind !== "acquired") {
      assert.fail("expected round 1 launch lease acquisition to succeed");
    }

    const generationIds = ["round1_gen_a", "round1_gen_b", "round1_gen_c"] as const;
    const attemptOwners = {
      round1_gen_a: {
        token: "attempt-token-a",
        attemptNumber: 1
      },
      round1_gen_b: {
        token: "attempt-token-b",
        attemptNumber: 2
      },
      round1_gen_c: {
        token: "attempt-token-c",
        attemptNumber: 3
      }
    } as const;
    const outputByGenerationId = {
      round1_gen_a: buildRunningGenerationOutput("COMPLETED", attemptOwners.round1_gen_a.token, attemptOwners.round1_gen_a.attemptNumber),
      round1_gen_b: buildRunningGenerationOutput("FAILED_GENERATION", attemptOwners.round1_gen_b.token, attemptOwners.round1_gen_b.attemptNumber),
      round1_gen_c: buildRunningGenerationOutput("FALLBACK", attemptOwners.round1_gen_c.token, attemptOwners.round1_gen_c.attemptNumber)
    } as const;
    for (const generationId of generationIds) {
      await prisma.generation.create({
        data: {
          id: generationId,
          projectId,
          round: 1,
          status: "RUNNING",
          output: outputByGenerationId[generationId]
        }
      });
    }

    await prisma.asset.createMany({
      data: [
        {
          projectId,
          generationId: "round1_gen_b",
          kind: "IMAGE",
          slot: "square_main",
          file_path: "/tmp/round1_gen_b-square.png"
        },
        {
          projectId,
          generationId: "round1_gen_c",
          kind: "IMAGE",
          slot: "square_main",
          file_path: "/tmp/round1_gen_c-square.png"
        }
      ]
    });
    assert.equal(
      await attachRoundOneLaunchGenerationIds({
        prisma,
        lease: acquired.lease,
        generationIds: [...generationIds]
      }),
      true
    );

    const lingeringRun = await prisma.aiRun.create({
      data: {
        id: "linger_run_round1_gen_b",
        productKey: "graceled-design-ai",
        featureKey: "graphics_background_generation",
        projectId,
        generationId: "round1_gen_b",
        round: 1,
        status: "RUNNING"
      }
    });
    const lingeringAttempt = await prisma.aiAttempt.create({
      data: {
        id: "linger_attempt_round1_gen_b",
        runId: lingeringRun.id,
        providerKey: "openai_image",
        modelKey: "openai_image_default",
        operationKey: "generate_background_image",
        promptVersion: "test_v1",
        requestHash: "req_hash_round1_gen_b"
      }
    });
    const settlement = await finalizeRoundOneAuthoritativeSettlement({
      prisma,
      lease: acquired.lease,
      generationTerminalizations: [
        {
          generationId: "round1_gen_a",
          status: "COMPLETED",
          output: outputByGenerationId.round1_gen_a
        },
        {
          generationId: "round1_gen_b",
          status: "FAILED",
          output: outputByGenerationId.round1_gen_b,
          clearAssetSlots: ["square_main"]
        },
        {
          generationId: "round1_gen_c",
          status: "FAILED",
          output: outputByGenerationId.round1_gen_c,
          clearAssetSlots: ["square_main"]
        }
      ],
      launchTerminalStatus: "FAILED",
      note: "round_authoritative_settlement"
    });
    assert.equal(settlement.finalized, true);
    assert.deepEqual(settlement.reconciledGenerationIds.sort(), [...generationIds].sort());
    assert.deepEqual(settlement.abandonedRunIds, [lingeringRun.id]);
    assert.deepEqual(settlement.abandonedAttemptIds, [lingeringAttempt.id]);

    const launchMarker = await prisma.aiRun.findUniqueOrThrow({
      where: {
        id: acquired.lease.markerId
      }
    });
    const launchMetadata = launchMarker.metadataJson as {
      phase?: string;
      outcome?: string;
      generationIds?: string[];
    } | null;
    assert.equal(launchMarker.status, "FAILED");
    assert.ok(launchMarker.completedAt);
    assert.equal(launchMetadata?.phase, "SETTLED");
    assert.equal(launchMetadata?.outcome, "FAILED");
    assert.deepEqual(launchMetadata?.generationIds, [...generationIds]);

    const persistedGenerations = await prisma.generation.findMany({
      where: {
        id: {
          in: [...generationIds]
        }
      },
      orderBy: {
        id: "asc"
      }
    });
    assert.deepEqual(
      persistedGenerations.map((row) => [row.id, row.status]),
      [
        ["round1_gen_a", "COMPLETED"],
        ["round1_gen_b", "FAILED"],
        ["round1_gen_c", "FAILED"]
      ]
    );

    for (const row of persistedGenerations) {
      const output = row.output as {
        status?: string;
        meta?: {
          execution?: {
            phase?: string;
            activeAttemptToken?: string | null;
          };
        };
      } | null;
      assert.equal(output?.meta?.execution?.phase, "SETTLED");
      assert.equal(output?.meta?.execution?.activeAttemptToken ?? null, null);
    }

    assert.equal(
      await prisma.asset.count({
        where: {
          generationId: {
            in: ["round1_gen_b", "round1_gen_c"]
          },
          slot: "square_main"
        }
      }),
      0
    );

    assert.equal(
      await prisma.aiRun.count({
        where: {
          generationId: {
            in: [...generationIds]
          },
          status: "RUNNING"
        }
      }),
      0
    );
    assert.equal(
      await prisma.aiAttempt.count({
        where: {
          id: lingeringAttempt.id,
          completedAt: null
        }
      }),
      0
    );
    const staleAssert = () =>
      assertGenerationAttemptStillActive({
        prisma,
        generationId: "round1_gen_b",
        attemptOwner: attemptOwners.round1_gen_b
      });
    await assert.rejects(staleAssert, /CLAIMED_GENERATION_EXECUTION_INACTIVE/);

    const runCountBeforeLateBackgroundAttempt = await prisma.aiRun.count({
      where: {
        generationId: "round1_gen_b"
      }
    });
    await assert.rejects(
      createGraphicsBackgroundAiRun({
        projectId,
        generationId: "round1_gen_b",
        round: 1,
        assertActive: staleAssert
      }),
      /CLAIMED_GENERATION_EXECUTION_INACTIVE/
    );
    assert.equal(
      await prisma.aiRun.count({
        where: {
          generationId: "round1_gen_b"
        }
      }),
      runCountBeforeLateBackgroundAttempt
    );

    const evalCountBefore = await prisma.aiEvalResult.count({
      where: {
        runId: lingeringRun.id
      }
    });
    await assert.rejects(
      runAiEvalDefinitions({
        runId: lingeringRun.id,
        attemptId: lingeringAttempt.id,
        subject: {
          settled: true
        },
        assertActive: staleAssert,
        definitions: [
          {
            evalKey: "test.round1_settlement_guard",
            evaluate: async () => ({
              passed: false,
              score: 0,
              reasonKey: "round_terminalized",
              detailsJson: {
                blocked: true
              }
            })
          }
        ]
      }),
      /CLAIMED_GENERATION_EXECUTION_INACTIVE/
    );
    assert.equal(
      await prisma.aiEvalResult.count({
        where: {
          runId: lingeringRun.id
        }
      }),
      evalCountBefore
    );
  } finally {
    await prisma.$disconnect();
    delete (globalThis as typeof globalThis & { prisma?: unknown }).prisma;
    if (typeof previousDatabaseUrl === "string") {
      process.env.DATABASE_URL = previousDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
    if (typeof previousOpenAiApiKey === "string") {
      process.env.OPENAI_API_KEY = previousOpenAiApiKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    if (typeof previousNodePath === "string") {
      process.env.NODE_PATH = previousNodePath;
    } else {
      delete process.env.NODE_PATH;
    }
    Module._initPaths();
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});
