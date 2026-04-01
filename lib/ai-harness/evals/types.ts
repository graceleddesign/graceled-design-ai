import type { AiInputJsonValue } from "@/lib/ai-harness/core/types";

export type AiEvalExecutionContext<TSubject> = {
  runId: string;
  attemptId: string | null;
  subject: TSubject;
};

export type AiEvalOutcome = {
  passed: boolean;
  score?: number | null;
  reasonKey?: string | null;
  detailsJson?: AiInputJsonValue | null;
};

export type AiEvalDefinition<TSubject> = {
  evalKey: string;
  evaluate: (context: AiEvalExecutionContext<TSubject>) => Promise<AiEvalOutcome> | AiEvalOutcome;
};
