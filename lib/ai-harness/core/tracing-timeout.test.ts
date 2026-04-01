import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const WORKDIR = "/Users/robrussell/Documents/GraceLed Designs AI";

function buildClaimTimeoutError(generationId: string, timeoutMs: number): Error {
  const error = new Error(`CLAIMED_GENERATION_EXECUTION_TIMEOUT:${generationId}:${timeoutMs}`);
  error.name = "ClaimedGenerationExecutionTimeoutError";
  return error;
}

async function waitForAttempt(
  prisma: {
    aiAttempt: {
      findFirst: (args: {
        where: { runId: string };
        orderBy: { startedAt: "asc" | "desc" };
      }) => Promise<{ id: string } | null>;
    };
  },
  runId: string
): Promise<{ id: string }> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const record = await prisma.aiAttempt.findFirst({
      where: {
        runId
      },
      orderBy: {
        startedAt: "asc"
      }
    });
    if (record) {
      return record;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for AiAttempt creation for run ${runId}`);
}

test("claim timeout terminalizes background harness work and leaves normal success behavior unchanged", async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousOpenAiApiKey = process.env.OPENAI_API_KEY;
  const previousNodePath = process.env.NODE_PATH;
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "graceled-ai-timeout-"));
  const databasePath = path.join(tempDir, "timeout-test.sqlite");
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
  const { traceAiProviderCall } = await import("@/lib/ai-harness/core/tracing");
  const { runAiEvalDefinitions } = await import("@/lib/ai-harness/evals/runner");
  const {
    abandonGraphicsBackgroundAiRuns,
    createGraphicsBackgroundAiRun,
    finalizeGraphicsBackgroundAiRun
  } = await import("@/lib/graphics-domain/generation");

  const route = {
    operation: {
      key: "generate_background_image",
      providerKey: "openai_image",
      defaultModelKey: "openai_image_default",
      enabled: true
    },
    provider: {
      key: "openai_image",
      name: "OpenAI Image",
      enabled: true,
      supportedOperations: ["generate_background_image"]
    },
    model: {
      key: "openai_image_default",
      providerKey: "openai_image",
      enabled: true,
      supportedOperations: ["generate_background_image"],
      providerModel: "gpt-4.1-mini"
    },
    providerConfigVersion: "openai_image:openai_image_default:gpt-4.1-mini"
  } as const;

  try {
    const timeoutMs = 1000;
    const timeoutGenerationId = "generation_timeout";
    const timeoutError = buildClaimTimeoutError(timeoutGenerationId, timeoutMs);
    let executionActive = true;
    let resolveLateCall: ((value: {
      output: { ok: true };
      providerRequestId: string;
      outputJson: { ok: true };
    }) => void) | null = null;

    const timedOutRunHandle = await createGraphicsBackgroundAiRun({
      projectId: "project_timeout",
      generationId: timeoutGenerationId,
      round: 1
    });

    const lateCompletion = new Promise<{
      output: { ok: true };
      providerRequestId: string;
      outputJson: { ok: true };
    }>((resolve) => {
      resolveLateCall = resolve;
    });

    const timedOutTrace = traceAiProviderCall({
      run: timedOutRunHandle.run,
      route,
      promptVersion: "test_v1",
      requestBody: {
        prompt: "timeout"
      },
      assertActive: () => {
        if (!executionActive) {
          throw timeoutError;
        }
      },
      call: async () => lateCompletion
    });

    const openAttempt = await waitForAttempt(prisma, timedOutRunHandle.run.id);

    await abandonGraphicsBackgroundAiRuns({
      runIds: [timedOutRunHandle.run.id],
      generationId: timeoutGenerationId,
      timeoutMs
    });
    executionActive = false;
    resolveLateCall?.({
      output: { ok: true },
      providerRequestId: "req_late_timeout",
      outputJson: { ok: true }
    });

    await assert.rejects(timedOutTrace, /CLAIMED_GENERATION_EXECUTION_TIMEOUT|AI_ATTEMPT_ALREADY_TERMINAL/);

    const timedOutRun = await prisma.aiRun.findUniqueOrThrow({
      where: {
        id: timedOutRunHandle.run.id
      }
    });
    const timedOutAttempt = await prisma.aiAttempt.findUniqueOrThrow({
      where: {
        id: openAttempt.id
      }
    });

    assert.equal(timedOutRun.status, "FAILED");
    assert.ok(timedOutRun.completedAt);
    assert.equal(timedOutAttempt.success, false);
    assert.equal(timedOutAttempt.errorClass, "TIMEOUT");
    assert.ok(timedOutAttempt.completedAt);

    const attemptCountBeforeRetry = await prisma.aiAttempt.count({
      where: {
        runId: timedOutRunHandle.run.id
      }
    });
    const evalCountBefore = await prisma.aiEvalResult.count({
      where: {
        runId: timedOutRunHandle.run.id
      }
    });

    await assert.rejects(
      runAiEvalDefinitions({
        runId: timedOutRunHandle.run.id,
        attemptId: openAttempt.id,
        subject: {
          stale: true
        },
        assertActive: () => {
          if (!executionActive) {
            throw timeoutError;
          }
        },
        definitions: [
          {
            evalKey: "graphics.background_eligibility",
            evaluate: async () => ({
              passed: true,
              score: 1,
              reasonKey: null,
              detailsJson: null
            })
          }
        ]
      }),
      /CLAIMED_GENERATION_EXECUTION_TIMEOUT/
    );

    assert.equal(
      await prisma.aiEvalResult.count({
        where: {
          runId: timedOutRunHandle.run.id
        }
      }),
      evalCountBefore
    );

    await assert.rejects(
      traceAiProviderCall({
        run: timedOutRunHandle.run,
        route,
        promptVersion: "test_v1",
        requestBody: {
          prompt: "retry_after_timeout"
        },
        assertActive: () => {
          if (!executionActive) {
            throw timeoutError;
          }
        },
        call: async () => {
          throw new Error("retry should not execute after timeout settlement");
        }
      }),
      /CLAIMED_GENERATION_EXECUTION_TIMEOUT/
    );

    assert.equal(
      await prisma.aiAttempt.count({
        where: {
          runId: timedOutRunHandle.run.id
        }
      }),
      attemptCountBeforeRetry
    );

    const successfulRunHandle = await createGraphicsBackgroundAiRun({
      projectId: "project_success",
      generationId: "generation_success",
      round: 1
    });

    const successfulTrace = await traceAiProviderCall({
      run: successfulRunHandle.run,
      route,
      promptVersion: "test_v1",
      requestBody: {
        prompt: "success"
      },
      assertActive: () => {},
      call: async () => ({
        output: { ok: true },
        providerRequestId: "req_success",
        outputJson: { ok: true }
      })
    });

    assert.equal(successfulTrace.attempt.success, true);
    assert.equal(successfulTrace.attempt.errorClass, null);

    const successfulEvalResults = await runAiEvalDefinitions({
      runId: successfulRunHandle.run.id,
      attemptId: successfulTrace.attempt.id,
      subject: {
        success: true
      },
      assertActive: () => {},
      definitions: [
        {
          evalKey: "test.success_eval",
          evaluate: async () => ({
            passed: true,
            score: 1,
            reasonKey: null,
            detailsJson: {
              ok: true
            }
          })
        }
      ]
    });

    assert.equal(successfulEvalResults.length, 1);

    const completedRun = await finalizeGraphicsBackgroundAiRun({
      runHandle: successfulRunHandle,
      status: "COMPLETED",
      providerConfigVersion: route.providerConfigVersion,
      metadataJson: {
        verification: "success_path"
      }
    });

    assert.equal(completedRun.status, "COMPLETED");
    assert.equal(
      await prisma.aiAttempt.count({
        where: {
          runId: successfulRunHandle.run.id,
          success: true
        }
      }),
      1
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
