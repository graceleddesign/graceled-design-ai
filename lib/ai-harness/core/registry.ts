import {
  createModelUnavailableError,
  createProviderConfigurationError
} from "@/lib/ai-harness/core/errors";
import type {
  AiModelDefinition,
  AiModelKey,
  AiOperationDefinition,
  AiOperationKey,
  AiOperationRoute,
  AiProviderDefinition,
  AiProviderKey
} from "@/lib/ai-harness/core/types";

const DEFAULT_OPENAI_IMAGE_MODEL = "gpt-4.1-mini";
const DEFAULT_OPENAI_TEXT_MODEL = "gpt-4.1-mini";

function readBooleanEnvFlag(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  return !["0", "false", "off", "no"].includes(normalized);
}

function readProviderEnabled(providerKey: AiProviderKey): boolean {
  if (providerKey === "openai_image") {
    return readBooleanEnvFlag(process.env.OPENAI_IMAGE_PROVIDER_ENABLED, true);
  }

  return readBooleanEnvFlag(process.env.OPENAI_TEXT_PROVIDER_ENABLED, true);
}

function resolveProviderModel(modelKey: AiModelKey): string {
  if (modelKey === "openai_image_default") {
    return process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_OPENAI_IMAGE_MODEL;
  }

  return process.env.OPENAI_MAIN_MODEL?.trim() || DEFAULT_OPENAI_TEXT_MODEL;
}

function readModelEnabled(modelKey: AiModelKey): boolean {
  if (modelKey === "openai_image_default") {
    return readBooleanEnvFlag(process.env.OPENAI_IMAGE_MODEL_ENABLED, true);
  }

  return readBooleanEnvFlag(process.env.OPENAI_TEXT_MODEL_ENABLED, true);
}

const PROVIDER_METADATA: Record<
  AiProviderKey,
  Omit<AiProviderDefinition, "enabled">
> = {
  openai_image: {
    key: "openai_image",
    name: "OpenAI Image",
    supportedOperations: ["generate_background_image"]
  },
  openai_text: {
    key: "openai_text",
    name: "OpenAI Text",
    supportedOperations: ["generate_lockup_text", "generate_copy"]
  }
};

const MODEL_METADATA: Record<
  AiModelKey,
  Omit<AiModelDefinition, "enabled" | "providerModel">
> = {
  openai_image_default: {
    key: "openai_image_default",
    providerKey: "openai_image",
    supportedOperations: ["generate_background_image"]
  },
  openai_text_default: {
    key: "openai_text_default",
    providerKey: "openai_text",
    supportedOperations: ["generate_lockup_text", "generate_copy"]
  }
};

const OPERATION_METADATA: Record<AiOperationKey, Omit<AiOperationDefinition, "enabled">> = {
  generate_background_image: {
    key: "generate_background_image",
    providerKey: "openai_image",
    defaultModelKey: "openai_image_default"
  },
  generate_lockup_text: {
    key: "generate_lockup_text",
    providerKey: "openai_text",
    defaultModelKey: "openai_text_default"
  },
  generate_copy: {
    key: "generate_copy",
    providerKey: "openai_text",
    defaultModelKey: "openai_text_default"
  }
};

export function resolveProviderDefinition(providerKey: AiProviderKey): AiProviderDefinition {
  const metadata = PROVIDER_METADATA[providerKey];
  return {
    ...metadata,
    enabled: readProviderEnabled(providerKey)
  };
}

export function resolveModelDefinition(modelKey: AiModelKey): AiModelDefinition {
  const metadata = MODEL_METADATA[modelKey];
  return {
    ...metadata,
    enabled: readModelEnabled(modelKey) && readProviderEnabled(metadata.providerKey),
    providerModel: resolveProviderModel(modelKey)
  };
}

export function resolveOperationDefinition(operationKey: AiOperationKey): AiOperationDefinition {
  const metadata = OPERATION_METADATA[operationKey];
  return {
    ...metadata,
    enabled: readProviderEnabled(metadata.providerKey)
  };
}

export function resolveOperationRoute(params: {
  operationKey: AiOperationKey;
  modelKey?: AiModelKey | null;
}): AiOperationRoute {
  const operation = resolveOperationDefinition(params.operationKey);
  const provider = resolveProviderDefinition(operation.providerKey);
  const modelKey = params.modelKey ?? operation.defaultModelKey;
  const model = resolveModelDefinition(modelKey);

  if (!provider.enabled) {
    throw createProviderConfigurationError(
      {
        providerKey: operation.providerKey,
        modelKey,
        operationKey: operation.key
      },
      `AI provider ${provider.key} is disabled`
    );
  }

  if (!operation.enabled || !model.enabled) {
    throw createModelUnavailableError(
      {
        providerKey: operation.providerKey,
        modelKey,
        operationKey: operation.key
      },
      `AI model ${modelKey} is unavailable for ${operation.key}`
    );
  }

  if (model.providerKey !== operation.providerKey || !model.supportedOperations.includes(operation.key)) {
    throw createModelUnavailableError(
      {
        providerKey: operation.providerKey,
        modelKey,
        operationKey: operation.key
      },
      `AI model ${modelKey} does not support ${operation.key}`
    );
  }

  return {
    operation,
    provider,
    model,
    providerConfigVersion: `${provider.key}:${model.key}:${model.providerModel}`
  };
}
