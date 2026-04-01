import { createHash } from "crypto";
import {
  createAiAttempt,
  completeAiAttemptFailure,
  completeAiAttemptSuccess
} from "@/lib/ai-harness/storage/attempts";
import { normalizeProviderError } from "@/lib/ai-harness/core/errors";
import type {
  AiAttemptTrace,
  AiInputJsonValue,
  AiOperationRoute,
  AiRunRecord
} from "@/lib/ai-harness/core/types";

const CLAIM_TIMEOUT_ATTEMPT_MESSAGE = "Attempt abandoned after claimed generation execution timed out.";

class AiHarnessStaleExecutionError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("AI_HARNESS_STALE_EXECUTION");
    this.name = "AiHarnessStaleExecutionError";
    this.cause = cause;
  }
}

function normalizeForStableHash(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForStableHash(entry));
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const normalized = normalizeForStableHash((value as Record<string, unknown>)[key]);
        if (normalized !== undefined) {
          result[key] = normalized;
        }
        return result;
      }, {});
  }

  return String(value);
}

export function computeAiRequestHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(normalizeForStableHash(value)))
    .digest("hex");
}

export async function traceAiProviderCall<TOutput>(params: {
  run: AiRunRecord;
  route: AiOperationRoute;
  promptVersion: string;
  requestBody: unknown;
  assertActive?: () => Promise<void> | void;
  call: () => Promise<{
    output: TOutput;
    providerRequestId?: string | null;
    outputJson?: AiInputJsonValue | null;
  }>;
}): Promise<AiAttemptTrace<TOutput>> {
  const assertActive = async () => {
    if (!params.assertActive) {
      return;
    }

    try {
      await params.assertActive();
    } catch (error) {
      throw new AiHarnessStaleExecutionError(error);
    }
  };

  const rethrowStaleCause = (error: unknown): never => {
    if (error instanceof AiHarnessStaleExecutionError) {
      throw error.cause;
    }

    throw error;
  };

  const completeAttemptAsTimedOut = async (attemptId: string, providerRequestId?: string | null) => {
    await completeAiAttemptFailure({
      id: attemptId,
      errorClass: "TIMEOUT",
      providerRequestId,
      outputJson: {
        errorClass: "TIMEOUT",
        message: CLAIM_TIMEOUT_ATTEMPT_MESSAGE,
        staleWork: true,
        abandonedReason: "CLAIM_TIMEOUT"
      }
    });
  };

  try {
    await assertActive();
  } catch (error) {
    rethrowStaleCause(error);
  }
  const attempt = await createAiAttempt({
    runId: params.run.id,
    providerKey: params.route.provider.key,
    modelKey: params.route.model.key,
    operationKey: params.route.operation.key,
    promptVersion: params.promptVersion,
    requestHash: computeAiRequestHash(params.requestBody)
  });

  try {
    try {
      await assertActive();
    } catch (error) {
      await completeAttemptAsTimedOut(attempt.id);
      rethrowStaleCause(error);
    }

    const result = await params.call();

    try {
      await assertActive();
    } catch (error) {
      await completeAttemptAsTimedOut(attempt.id, result.providerRequestId ?? null);
      rethrowStaleCause(error);
    }

    const completedAttempt = await completeAiAttemptSuccess({
      id: attempt.id,
      providerRequestId: result.providerRequestId ?? null,
      outputJson: result.outputJson ?? null
    });

    if (!completedAttempt.success) {
      await completeAttemptAsTimedOut(attempt.id, result.providerRequestId ?? null);
      throw new AiHarnessStaleExecutionError(new Error(`AI_ATTEMPT_ALREADY_TERMINAL:${attempt.id}`));
    }

    return {
      run: params.run,
      attempt: completedAttempt,
      route: params.route,
      output: result.output
    };
  } catch (error) {
    if (error instanceof AiHarnessStaleExecutionError) {
      rethrowStaleCause(error);
    }

    const normalizedError = normalizeProviderError(error, {
      providerKey: params.route.provider.key,
      modelKey: params.route.model.key,
      operationKey: params.route.operation.key,
      providerModel: params.route.model.providerModel,
      providerConfigVersion: params.route.providerConfigVersion
    });
    await completeAiAttemptFailure({
      id: attempt.id,
      errorClass: normalizedError.errorClass,
      providerStatusCode: normalizedError.statusCode,
      providerRequestId: normalizedError.providerRequestId,
      outputJson: {
        errorClass: normalizedError.errorClass,
        message: normalizedError.message,
        providerKey: normalizedError.providerKey,
        modelKey: normalizedError.modelKey,
        providerModel: normalizedError.providerModel,
        providerConfigVersion: normalizedError.providerConfigVersion,
        operationKey: normalizedError.operationKey,
        statusCode: normalizedError.statusCode,
        providerErrorCode: normalizedError.providerErrorCode,
        providerRequestId: normalizedError.providerRequestId,
        rawErrorType: normalizedError.rawErrorType
      }
    });
    throw normalizedError;
  }
}
