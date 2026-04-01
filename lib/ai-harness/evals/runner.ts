import "server-only";

import { persistAiEvalResult } from "@/lib/ai-harness/storage/eval-results";
import type { AiEvalResultRecord } from "@/lib/ai-harness/core/types";
import type { AiEvalDefinition } from "@/lib/ai-harness/evals/types";

export async function runAiEvalDefinitions<TSubject>(params: {
  runId: string;
  attemptId?: string | null;
  subject: TSubject;
  definitions: readonly AiEvalDefinition<TSubject>[];
}): Promise<AiEvalResultRecord[]> {
  const results: AiEvalResultRecord[] = [];

  for (const definition of params.definitions) {
    const outcome = await definition.evaluate({
      runId: params.runId,
      attemptId: params.attemptId ?? null,
      subject: params.subject
    });
    results.push(
      await persistAiEvalResult({
        runId: params.runId,
        attemptId: params.attemptId ?? null,
        evalKey: definition.evalKey,
        passed: outcome.passed,
        score: outcome.score ?? null,
        reasonKey: outcome.reasonKey ?? null,
        detailsJson: outcome.detailsJson ?? null
      })
    );
  }

  return results;
}
