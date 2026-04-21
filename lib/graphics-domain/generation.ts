import "server-only";

import { abandonAiRuns, completeAiRun, createAiRun } from "@/lib/ai-harness/storage/attempts";
import { logBenchmarkRun } from "@/lib/ai-harness/storage/benchmark-runs";
import { generateImageWithOpenAiHarness, type OpenAiImageReference } from "@/lib/ai-harness/providers";
import type {
  AiBenchmarkCaseDefinition,
  AiInputJsonValue,
  AiRunRecord,
  AiRunStatus
} from "@/lib/ai-harness/core/types";
import { readAiErrorClass, readAiProviderErrorMetadata } from "@/lib/ai-harness/core/errors";
import { generateFalImage } from "@/lib/fal-image";
import { buildFluxBackgroundPrompt } from "@/lib/graphics-domain/flux-prompt";
import { resolveGraphicsBackgroundImageSize, type GraphicsPreviewShape } from "@/lib/graphics-domain/assets";
import {
  GRAPHICS_BACKGROUND_FEATURE_KEY,
  GRAPHICS_BACKGROUND_PROMPT_VERSION,
  GRAPHICS_PRODUCT_KEY
} from "@/lib/graphics-domain/prompts";
import type { GptImageDebugMeta } from "@/lib/gptImageRateLimit";

export type GraphicsBackgroundAiRunHandle = {
  run: AiRunRecord;
};

export type GraphicsBackgroundAiAttemptTrace = {
  runId: string;
  attemptId: string | null;
  providerKey: string;
  modelKey: string;
  providerModel: string;
  providerConfigVersion: string;
  operationKey: string;
  promptVersion: string;
  providerRequestId: string | null;
};

function readCodeVersion(): string | null {
  return process.env.VERCEL_GIT_COMMIT_SHA?.trim() || process.env.GIT_COMMIT_SHA?.trim() || null;
}

export async function createGraphicsBackgroundAiRun(params: {
  projectId: string;
  generationId: string;
  round: number;
  laneKey?: string | null;
  benchmarkCaseKey?: string | null;
  metadataJson?: AiInputJsonValue | null;
  assertActive?: () => Promise<void> | void;
  onRunCreated?: (run: AiRunRecord) => Promise<void> | void;
}): Promise<GraphicsBackgroundAiRunHandle> {
  await params.assertActive?.();
  const run = await createAiRun({
    productKey: GRAPHICS_PRODUCT_KEY,
    featureKey: GRAPHICS_BACKGROUND_FEATURE_KEY,
    projectId: params.projectId,
    generationId: params.generationId,
    round: params.round,
    laneKey: params.laneKey ?? null,
    benchmarkCaseKey: params.benchmarkCaseKey ?? null,
    metadataJson: params.metadataJson ?? null
  });
  await params.onRunCreated?.(run);
  try {
    await params.assertActive?.();
  } catch (error) {
    await abandonAiRuns({
      runIds: [run.id],
      errorClass: "TIMEOUT",
      message: `Background AI run created after generation ${params.generationId} was no longer active.`,
      attemptOutputJson: {
        generationId: params.generationId,
        abandonedReason: "CLAIM_INACTIVE_AFTER_RUN_CREATE"
      },
      runMetadataJson: {
        generationId: params.generationId,
        terminalizationReason: "CLAIM_INACTIVE_AFTER_RUN_CREATE"
      }
    });
    throw error;
  }

  return {
    run
  };
}

export async function finalizeGraphicsBackgroundAiRun(params: {
  runHandle: GraphicsBackgroundAiRunHandle;
  status: Exclude<AiRunStatus, "RUNNING">;
  metadataJson?: AiInputJsonValue | null;
  benchmarkCase?: AiBenchmarkCaseDefinition | null;
  providerConfigVersion?: string | null;
  error?: unknown;
}): Promise<AiRunRecord> {
  if (params.runHandle.run.status !== "RUNNING") {
    return params.runHandle.run;
  }

  const errorClass = params.error ? readAiErrorClass(params.error) : null;
  const providerErrorMetadata = params.error ? readAiProviderErrorMetadata(params.error) : null;
  const errorMetadataJson =
    errorClass || providerErrorMetadata
      ? ({
          ...(errorClass
            ? {
                errorClass
              }
            : {}),
          ...(providerErrorMetadata
            ? {
                errorProviderKey: providerErrorMetadata.providerKey,
                errorModelKey: providerErrorMetadata.modelKey,
                errorProviderModel: providerErrorMetadata.providerModel,
                errorProviderConfigVersion: providerErrorMetadata.providerConfigVersion,
                errorOperationKey: providerErrorMetadata.operationKey,
                errorStatusCode: providerErrorMetadata.statusCode,
                errorProviderErrorCode: providerErrorMetadata.providerErrorCode,
                errorProviderRequestId: providerErrorMetadata.providerRequestId,
                errorRawErrorType: providerErrorMetadata.rawErrorType
              }
            : {})
        } satisfies Record<string, string | number | null>)
      : null;
  const metadataJson =
    params.metadataJson && typeof params.metadataJson === "object" && !Array.isArray(params.metadataJson)
      ? {
          ...params.metadataJson,
          ...(errorMetadataJson ?? {})
        }
      : params.metadataJson ?? errorMetadataJson ?? null;
  const completedRun = await completeAiRun({
    id: params.runHandle.run.id,
    status: params.status,
    metadataJson
  });
  params.runHandle.run = completedRun;

  if (completedRun.benchmarkCaseKey) {
    await logBenchmarkRun({
      run: completedRun,
      benchmarkCase: params.benchmarkCase ?? null,
      codeVersion: readCodeVersion(),
      providerConfigVersion: params.providerConfigVersion ?? null,
      summaryJson: metadataJson ?? null
    });
  }

  return completedRun;
}

export async function runGraphicsBackgroundImageGeneration(params: {
  runHandle: GraphicsBackgroundAiRunHandle;
  prompt: string;
  shape: GraphicsPreviewShape;
  promptVersion?: string;
  references?: OpenAiImageReference[];
  disable429Retry?: boolean;
  assertActive?: () => Promise<void> | void;
  meta?: {
    debug?: GptImageDebugMeta;
  };
  // Optional fields used by the Flux prompt builder (ignored by OpenAI path).
  brief?: { title: string; seriesDescription?: string; scripture?: string | null };
  bibleCreativeBrief?: { themes: string[]; motifs: string[]; markIdeas: string[] } | null;
  motifFocus?: string[];
  styleFamily?: { name: string };
  tone?: string;
  directionSpec?: { lanePrompt?: string };
}): Promise<{ imagePng: Buffer; aiTrace: GraphicsBackgroundAiAttemptTrace }> {
  if (process.env.FAL_API_KEY?.trim()) {
    const sizeStr = resolveGraphicsBackgroundImageSize(params.shape);
    const [widthStr, heightStr] = sizeStr.split("x");
    const width = parseInt(widthStr, 10);
    const height = parseInt(heightStr, 10);
    const falPrompt = buildFluxBackgroundPrompt({
      seriesTitle: params.brief?.title ?? "",
      seriesDescription: params.brief?.seriesDescription,
      scripturePassages: params.brief?.scripture ?? undefined,
      bibleCreativeBrief: params.bibleCreativeBrief,
      motifFocus: params.motifFocus,
      styleFamily: params.styleFamily?.name,
      tone: params.tone,
      lanePrompt: params.directionSpec?.lanePrompt,
      generationId: params.runHandle?.run?.id ?? "unknown",
    });
    console.log("[FLUX PROMPT]", falPrompt);
    let b64: string;
    try {
      b64 = await generateFalImage(falPrompt, width, height);
    } catch (falErr) {
      console.error("[FAL ERROR]", String(falErr));
      throw falErr;
    }
    const imagePng = Buffer.from(b64, "base64");
    return {
      imagePng,
      aiTrace: {
        runId: params.runHandle.run.id,
        attemptId: null,
        providerKey: "fal",
        modelKey: "flux-dev",
        providerModel: "fal-ai/flux/dev",
        providerConfigVersion: "1",
        operationKey: "generate_background_image",
        promptVersion: params.promptVersion ?? GRAPHICS_BACKGROUND_PROMPT_VERSION,
        providerRequestId: null
      }
    };
  }

  const trace = await generateImageWithOpenAiHarness({
    run: params.runHandle.run,
    operationKey: "generate_background_image",
    promptVersion: params.promptVersion ?? GRAPHICS_BACKGROUND_PROMPT_VERSION,
    prompt: params.prompt,
    size: resolveGraphicsBackgroundImageSize(params.shape),
    references: params.references,
    disable429Retry: params.disable429Retry,
    assertActive: params.assertActive,
    meta: params.meta
  });

  return {
    imagePng: trace.output.imagePng,
    aiTrace: {
      runId: trace.run.id,
      attemptId: trace.attempt.id,
      providerKey: trace.route.provider.key,
      modelKey: trace.route.model.key,
      providerModel: trace.route.model.providerModel,
      providerConfigVersion: trace.route.providerConfigVersion,
      operationKey: trace.route.operation.key,
      promptVersion: params.promptVersion ?? GRAPHICS_BACKGROUND_PROMPT_VERSION,
      providerRequestId: trace.output.providerRequestId
    }
  };
}

export async function abandonGraphicsBackgroundAiRuns(params: {
  runIds: readonly string[];
  generationId: string;
  timeoutMs: number;
}): Promise<{ runIds: string[]; attemptIds: string[] }> {
  return abandonAiRuns({
    runIds: params.runIds,
    errorClass: "TIMEOUT",
    message: `Claimed generation execution timed out for ${params.generationId} after ${params.timeoutMs}ms.`,
    attemptOutputJson: {
      generationId: params.generationId,
      timeoutMs: params.timeoutMs,
      abandonedReason: "CLAIM_TIMEOUT"
    },
    runMetadataJson: {
      generationId: params.generationId,
      timeoutMs: params.timeoutMs,
      terminalizationReason: "CLAIM_TIMEOUT"
    }
  });
}
