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
import type { ScoutImageStats } from "../eval/image-stats";
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

/**
 * Text-detection evidence from the background evaluator.
 *
 * IMPORTANT: detectTextArtifact uses a pixel-gradient heuristic only — it
 * counts dense high-gradient windows that resemble the spatial pattern of
 * rendered text. There is NO OCR, NO text string extraction, NO per-character
 * confidence, and NO bounding box. If `detected` is true and `imageStats`
 * looks plausible, the image likely has rendered letterforms; if imageStats
 * shows atypically high edgeDensity in a non-text context (busy geometric
 * art), this is a false positive. Inspect the raw rejected image to decide.
 */
export interface TextDetectionEvidence {
  detected: boolean;
  rejectReasons: string[];
  toneScore: number;
  structureScore: number;
  marginScore: number;
  compositeScore: number;
  imageStats: ScoutImageStats | null;
  /** The evaluator is a gradient heuristic — no OCR string, confidence, or bbox. */
  evaluatorNote: "gradient_heuristic_no_ocr";
}

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
  /** Exact prompt string sent to Imagen 4. */
  prompt?: string;
  /**
   * Eval evidence captured on rejection-after-evaluation (not on provider errors).
   * See TextDetectionEvidence for the current evaluator's limitations.
   */
  textDetectionEvidence?: TextDetectionEvidence;
  /**
   * Dev/test-only: filesystem path to the raw rejected Imagen output.
   * Never set in production. Not a canonical asset — do not treat as a preview.
   */
  rejectedRawPath?: string;
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
  /**
   * Dev/test-only callback. Called with the raw provider image bytes when the
   * lane is rejected after evaluation (not on provider errors — no bytes there).
   * The callback should save the bytes somewhere inspectable and return the
   * path, or return null if saving was skipped. Failures are swallowed — a
   * debug-save error must never affect lane settlement.
   */
  onRejectedBytes?: (bytes: BufferType) => Promise<string | null>;
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
    prompt,
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

    // Dev-only: persist raw bytes for inspection. Failure is non-fatal.
    let rejectedRawPath: string | undefined;
    if (input.onRejectedBytes) {
      try {
        const saved = await input.onRejectedBytes(genResult.imageBytes);
        if (saved) rejectedRawPath = saved;
      } catch {
        // intentionally swallowed — debug-save must not affect settlement
      }
    }

    const textDetectionEvidence: TextDetectionEvidence = {
      detected: evalRes.textDetected,
      rejectReasons: evalRes.rejectReasons,
      toneScore: evalRes.toneScore,
      structureScore: evalRes.structureScore,
      marginScore: evalRes.marginScore,
      compositeScore: evalRes.compositeScore,
      imageStats: evalRes.imageStats,
      evaluatorNote: "gradient_heuristic_no_ocr",
    };

    return {
      status: "rejected",
      failureReason: reason,
      backgroundEvidence: evidence,
      debug: {
        ...baseDebug,
        rejectionReason: reason,
        providerMetadata: genResult.providerMetadata,
        latencyMs: genResult.latencyMs,
        textDetectionEvidence,
        ...(rejectedRawPath !== undefined ? { rejectedRawPath } : {}),
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
