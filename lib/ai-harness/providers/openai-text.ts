import "server-only";

import { openai } from "@/lib/openai";
import {
  createInvalidResponseError,
  createProviderConfigurationError
} from "@/lib/ai-harness/core/errors";
import { resolveOperationRoute } from "@/lib/ai-harness/core/registry";
import { traceAiProviderCall } from "@/lib/ai-harness/core/tracing";
import type {
  AiAttemptTrace,
  AiModelKey,
  AiOperationKey,
  AiRunRecord
} from "@/lib/ai-harness/core/types";

function parseResponseText(response: unknown): string {
  if (!response || typeof response !== "object") {
    return "";
  }

  const outputText = (response as { output_text?: unknown }).output_text;
  if (typeof outputText === "string" && outputText.trim()) {
    return outputText.trim();
  }

  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return "";
  }

  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const segment of content) {
      if (!segment || typeof segment !== "object") {
        continue;
      }
      const textValue = (segment as { text?: unknown }).text;
      if (typeof textValue === "string" && textValue.trim()) {
        chunks.push(textValue.trim());
      }
    }
  }

  return chunks.join("\n").trim();
}

function readProviderRequestId(response: unknown): string | null {
  if (!response || typeof response !== "object" || !("id" in response)) {
    return null;
  }

  const value = (response as { id?: unknown }).id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function generateTextWithOpenAiHarness(params: {
  run: AiRunRecord;
  operationKey: Extract<AiOperationKey, "generate_lockup_text" | "generate_copy">;
  promptVersion: string;
  input: string | Array<Record<string, unknown>>;
  modelKey?: AiModelKey | null;
}): Promise<AiAttemptTrace<{ text: string; providerRequestId: string | null }>> {
  const route = resolveOperationRoute({
    operationKey: params.operationKey,
    modelKey: params.modelKey ?? null
  });

  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw createProviderConfigurationError(
      {
        providerKey: route.provider.key,
        modelKey: route.model.key,
        operationKey: route.operation.key,
        providerModel: route.model.providerModel,
        providerConfigVersion: route.providerConfigVersion
      },
      "OPENAI_API_KEY is not configured"
    );
  }

  return traceAiProviderCall({
    run: params.run,
    route,
    promptVersion: params.promptVersion,
    requestBody: {
      input: params.input
    },
    call: async () => {
      const response = await openai.responses.create({
        model: route.model.providerModel,
        input: params.input as never
      });
      const text = parseResponseText(response);

      if (!text) {
        throw createInvalidResponseError(
          {
            providerKey: route.provider.key,
            modelKey: route.model.key,
            operationKey: route.operation.key,
            providerModel: route.model.providerModel,
            providerConfigVersion: route.providerConfigVersion
          },
          "OpenAI text response did not include text output"
        );
      }

      const providerRequestId = readProviderRequestId(response);
      return {
        output: {
          text,
          providerRequestId
        },
        providerRequestId,
        outputJson: {
          textLength: text.length
        }
      };
    }
  });
}
