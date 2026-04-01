import type { AiEvalDefinition } from "@/lib/ai-harness/evals/types";
import type { GraphicsBackgroundEvalSubject } from "@/lib/graphics-evals/background-eligibility";

export const GRAPHICS_BACKGROUND_PRODUCTION_VALID_EVAL_KEY = "graphics.production_valid_background";

export function createBackgroundProductionValidEvalDefinition(): AiEvalDefinition<GraphicsBackgroundEvalSubject> {
  return {
    evalKey: GRAPHICS_BACKGROUND_PRODUCTION_VALID_EVAL_KEY,
    evaluate: async ({ subject }) => ({
      passed: subject.invalidReasons.length === 0,
      score: subject.invalidReasons.length === 0 ? 1 : 0,
      reasonKey: subject.invalidReasons[0] ?? null,
      detailsJson: {
        invalidReasons: subject.invalidReasons,
        evidence: subject.evidence,
        metadata: subject.metadata ?? null
      }
    })
  };
}
