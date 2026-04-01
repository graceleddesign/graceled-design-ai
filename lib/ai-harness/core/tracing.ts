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
  call: () => Promise<{
    output: TOutput;
    providerRequestId?: string | null;
    outputJson?: AiInputJsonValue | null;
  }>;
}): Promise<AiAttemptTrace<TOutput>> {
  const attempt = await createAiAttempt({
    runId: params.run.id,
    providerKey: params.route.provider.key,
    modelKey: params.route.model.key,
    operationKey: params.route.operation.key,
    promptVersion: params.promptVersion,
    requestHash: computeAiRequestHash(params.requestBody)
  });

  try {
    const result = await params.call();
    const completedAttempt = await completeAiAttemptSuccess({
      id: attempt.id,
      providerRequestId: result.providerRequestId ?? null,
      outputJson: result.outputJson ?? null
    });

    return {
      run: params.run,
      attempt: completedAttempt,
      route: params.route,
      output: result.output
    };
  } catch (error) {
    const normalizedError = normalizeProviderError(error, {
      providerKey: params.route.provider.key,
      modelKey: params.route.model.key,
      operationKey: params.route.operation.key
    });
    await completeAiAttemptFailure({
      id: attempt.id,
      errorClass: normalizedError.errorClass,
      providerStatusCode: normalizedError.statusCode,
      outputJson: {
        message: normalizedError.message,
        providerErrorCode: normalizedError.providerErrorCode,
        providerRequestId: normalizedError.providerRequestId,
        rawErrorType: normalizedError.rawErrorType
      }
    });
    throw normalizedError;
  }
}
