// Experimental: Imagen 4 modern_abstract lane runner.
//
// Generates the wide direction-preview background plate for a single
// modern_abstract lane via Imagen 4 using the proven prism/refraction prompt,
// then runs the existing background acceptance logic. Returns a result shape
// that mirrors lane-backfill's accepted/exhausted semantics so the caller
// can settle the lane using the existing AI-rebuild settlement code path.
//
// NOTE on evaluator limitations:
//   The existing scout evaluator (image-stats + text-artifact detection)
//   cannot detect "corporate wallpaper" or "generic worship gradient" —
//   those are subjective failure families surfaced by the geometric-keyart
//   benchmark. We deliberately do NOT invent a fake scorer for them here.
//   If acceptance gates that the existing evaluator can detect (text,
//   scaffold, tone) pass, we proceed; subjective design-quality failures
//   must be caught by humans or by future evaluator work.

import type { Buffer as BufferType } from "buffer";
import type { TonalVariant } from "../grammars";
import type { ScoutEvalResult } from "../eval/evaluate-scout";
import type { ScoutSlot } from "./build-scout-plan";
import type {
  ProductionBackgroundValidationEvidence,
} from "@/lib/production-valid-option";
import type { Imagen4Provider, Imagen4Result } from "../providers/fal-imagen4";
import { Imagen4ProviderError } from "../providers/fal-imagen4";
import {
  buildImagen4ModernAbstractPrompt,
  IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY,
} from "./build-imagen4-modern-abstract-prompt";

export interface Imagen4LaneDebug {
  enabled: true;
  attempted: boolean;
  provider: string;
  promptFamily: typeof IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY;
  accepted: boolean;
  rejectionReason?: string;
  providerMetadata?: Imagen4Result["providerMetadata"];
  latencyMs?: number;
  providerErrorKind?: string;
}

export type Imagen4LaneResult =
  | {
      status: "accepted";
      imageBytes: BufferType;
      backgroundEvidence: ProductionBackgroundValidationEvidence;
      providerId: string;
      providerModel: string;
      debug: Imagen4LaneDebug;
      prompt: string;
    }
  | {
      status: "rejected";
      failureReason: string;
      backgroundEvidence?: ProductionBackgroundValidationEvidence;
      debug: Imagen4LaneDebug;
      prompt: string;
    };

/** Build a synthetic ScoutSlot solely so the existing evaluator can run. */
function buildSyntheticSlotForEval(tone: TonalVariant): ScoutSlot {
  return {
    grammarKey: "imagen4_modern_abstract" as unknown as ScoutSlot["grammarKey"],
    diversityFamily: "imagen4_modern_abstract",
    tone,
    motifBinding: [],
    seed: 0,
    promptSpec: {
      template: "",
      motifBinding: [],
      tone,
      negativeHints: [],
    },
  };
}

/** Mirrors lane-backfill.buildBackgroundEvidence so semantics stay aligned. */
function evidenceFromEval(ev: ScoutEvalResult): ProductionBackgroundValidationEvidence {
  return {
    source: "generated",
    sourceGenerationId: null,
    textFree: !ev.rejectReasons.includes("text_artifact_detected"),
    scaffoldFree: !ev.rejectReasons.includes("scaffold_collapse"),
    motifPresent: !ev.rejectReasons.includes("design_presence_absent"),
    toneFit: !ev.rejectReasons.includes("tone_implausible"),
    referenceFit: null,
  };
}

export interface RunImagen4ModernAbstractLaneInput {
  tone: TonalVariant;
  provider: Imagen4Provider;
  evalFn: (input: { slot: ScoutSlot; imageBytes: BufferType }) => Promise<ScoutEvalResult>;
  acceptanceFn: (params: {
    evidence: ProductionBackgroundValidationEvidence;
  }) => { accepted: boolean; invalidReasons: string[] };
}

export async function runImagen4ModernAbstractLane(
  input: RunImagen4ModernAbstractLaneInput
): Promise<Imagen4LaneResult> {
  const prompt = buildImagen4ModernAbstractPrompt();
  const baseDebug: Imagen4LaneDebug = {
    enabled: true,
    attempted: true,
    provider: input.provider.id,
    promptFamily: IMAGEN4_MODERN_ABSTRACT_PROMPT_FAMILY,
    accepted: false,
  };

  let genResult: Imagen4Result;
  try {
    genResult = await input.provider.generate({ prompt });
  } catch (err) {
    const kind = err instanceof Imagen4ProviderError ? err.kind : "UNKNOWN";
    const reason = `imagen4_provider_error:${kind.toLowerCase()}`;
    return {
      status: "rejected",
      failureReason: reason,
      debug: { ...baseDebug, rejectionReason: reason, providerErrorKind: kind },
      prompt,
    };
  }

  const slot = buildSyntheticSlotForEval(input.tone);
  const evalRes = await input.evalFn({ slot, imageBytes: genResult.imageBytes });
  const evidence = evidenceFromEval(evalRes);
  const acceptance = input.acceptanceFn({ evidence });

  if (!acceptance.accepted) {
    const reason = acceptance.invalidReasons[0] ?? "imagen4_acceptance_failed";
    return {
      status: "rejected",
      failureReason: reason,
      backgroundEvidence: evidence,
      debug: {
        ...baseDebug,
        rejectionReason: reason,
        providerMetadata: genResult.providerMetadata,
        latencyMs: genResult.latencyMs,
      },
      prompt,
    };
  }

  return {
    status: "accepted",
    imageBytes: genResult.imageBytes,
    backgroundEvidence: evidence,
    providerId: input.provider.id,
    providerModel: genResult.providerModel,
    debug: {
      ...baseDebug,
      accepted: true,
      providerMetadata: genResult.providerMetadata,
      latencyMs: genResult.latencyMs,
    },
    prompt,
  };
}
