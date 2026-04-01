import "server-only";

import { runAiEvalDefinitions } from "@/lib/ai-harness/evals/runner";
import type { AiEvalDefinition } from "@/lib/ai-harness/evals/types";
import type { ProductionBackgroundValidationEvidence } from "@/lib/production-valid-option";
import { createBackgroundProductionValidEvalDefinition } from "@/lib/graphics-evals/production-valid";

export const GRAPHICS_BACKGROUND_ELIGIBILITY_EVAL_KEY = "graphics.background_eligibility";

export type GraphicsBackgroundEvalSubject = {
  evidence: ProductionBackgroundValidationEvidence;
  invalidReasons: string[];
  textArtifactDetected: boolean;
  checks: {
    textFree: boolean;
    tonePass: boolean;
    designPresencePass: boolean;
    meaningfulStructurePass: boolean;
    focalMotifPresent: boolean;
    frameScaffoldTriggered: boolean;
    hardFailScaffold: boolean;
    hardFailBlankDesign: boolean;
  };
  stats: {
    titleSafeScore: number | null;
    midtoneRangeScore: number | null;
    meaningfulStructureScore: number | null;
  };
  metadata?: {
    generationId?: string;
    optionIndex?: number;
    stage?: string;
    attemptNumber?: number;
    styleFamily?: string | null;
    providerKey?: string | null;
    modelKey?: string | null;
  };
};

function resolveEligibilityReason(subject: GraphicsBackgroundEvalSubject): string | null {
  if (subject.invalidReasons.length > 0) {
    return subject.invalidReasons[0];
  }
  if (subject.evidence.textFree !== true) {
    return "background_text_detected";
  }
  if (subject.evidence.scaffoldFree !== true) {
    return "background_scaffold_like";
  }
  if (subject.evidence.motifPresent !== true) {
    return "background_blank_or_motif_weak";
  }
  if (subject.evidence.toneFit === false) {
    return "background_tone_fit_failed";
  }

  return null;
}

export function createBackgroundEligibilityEvalDefinition(): AiEvalDefinition<GraphicsBackgroundEvalSubject> {
  return {
    evalKey: GRAPHICS_BACKGROUND_ELIGIBILITY_EVAL_KEY,
    evaluate: async ({ subject }) => {
      const checks = [
        subject.evidence.textFree === true,
        subject.evidence.scaffoldFree === true,
        subject.evidence.motifPresent === true,
        subject.evidence.toneFit !== false
      ];
      const passingChecks = checks.filter(Boolean).length;

      return {
        passed:
          subject.evidence.textFree === true &&
          subject.evidence.scaffoldFree === true &&
          subject.evidence.motifPresent === true &&
          subject.evidence.toneFit !== false,
        score: Number((passingChecks / checks.length).toFixed(4)),
        reasonKey: resolveEligibilityReason(subject),
        detailsJson: {
          evidence: subject.evidence,
          invalidReasons: subject.invalidReasons,
          textArtifactDetected: subject.textArtifactDetected,
          checks: subject.checks,
          stats: subject.stats,
          metadata: subject.metadata ?? null
        }
      };
    }
  };
}

export async function persistGraphicsBackgroundEvalResults(params: {
  runId: string;
  attemptId?: string | null;
  subject: GraphicsBackgroundEvalSubject;
  assertActive?: () => Promise<void> | void;
}) {
  const definitions: readonly AiEvalDefinition<GraphicsBackgroundEvalSubject>[] = [
    createBackgroundEligibilityEvalDefinition(),
    createBackgroundProductionValidEvalDefinition()
  ];

  return runAiEvalDefinitions({
    runId: params.runId,
    attemptId: params.attemptId ?? null,
    subject: params.subject,
    definitions,
    assertActive: params.assertActive
  });
}
