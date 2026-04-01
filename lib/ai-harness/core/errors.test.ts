import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProviderError, readAiProviderErrorMetadata } from "@/lib/ai-harness/core/errors";

const BASE_CONTEXT = {
  providerKey: "openai_image" as const,
  modelKey: "openai_image_default" as const,
  operationKey: "generate_background_image" as const,
  providerModel: "gpt-4.1-mini",
  providerConfigVersion: "openai_image:openai_image_default:gpt-4.1-mini"
};

test("normalizeProviderError classifies nested model failures and preserves harness metadata", () => {
  const normalized = normalizeProviderError(
    {
      status: 400,
      message: "Provider rejected the request",
      request_id: "req_nested_model",
      error: {
        code: "model_not_found",
        type: "invalid_request_error",
        message: "Model gpt-image-legacy was not found"
      }
    },
    BASE_CONTEXT
  );

  assert.equal(normalized.errorClass, "MODEL_UNAVAILABLE");
  assert.equal(normalized.providerRequestId, "req_nested_model");
  assert.equal(normalized.providerErrorCode, "model_not_found");
  assert.equal(normalized.providerModel, BASE_CONTEXT.providerModel);
  assert.equal(normalized.providerConfigVersion, BASE_CONTEXT.providerConfigVersion);

  assert.deepEqual(readAiProviderErrorMetadata(normalized), {
    errorClass: "MODEL_UNAVAILABLE",
    providerKey: "openai_image",
    modelKey: "openai_image_default",
    operationKey: "generate_background_image",
    providerModel: "gpt-4.1-mini",
    providerConfigVersion: "openai_image:openai_image_default:gpt-4.1-mini",
    statusCode: 400,
    providerErrorCode: "model_not_found",
    providerRequestId: "req_nested_model",
    rawErrorType: "invalid_request_error"
  });
});

test("normalizeProviderError classifies timeout-like transport failures explicitly", () => {
  const error = new Error("fetch failed with ETIMEDOUT while calling provider");
  error.name = "APIConnectionTimeoutError";

  const normalized = normalizeProviderError(error, BASE_CONTEXT);

  assert.equal(normalized.errorClass, "TIMEOUT");
});
