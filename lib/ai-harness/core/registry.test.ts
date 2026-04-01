import assert from "node:assert/strict";
import test from "node:test";
import { resolveOperationRoute } from "@/lib/ai-harness/core/registry";

test("background generation still resolves the default OpenAI image route", () => {
  const previousEnv = {
    OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL,
    OPENAI_IMAGE_PROVIDER_ENABLED: process.env.OPENAI_IMAGE_PROVIDER_ENABLED,
    OPENAI_IMAGE_MODEL_ENABLED: process.env.OPENAI_IMAGE_MODEL_ENABLED
  };

  delete process.env.OPENAI_IMAGE_MODEL;
  delete process.env.OPENAI_IMAGE_PROVIDER_ENABLED;
  delete process.env.OPENAI_IMAGE_MODEL_ENABLED;

  try {
    const route = resolveOperationRoute({
      operationKey: "generate_background_image"
    });

    assert.equal(route.provider.key, "openai_image");
    assert.equal(route.model.key, "openai_image_default");
    assert.equal(route.model.providerModel, "gpt-4.1-mini");
    assert.equal(route.providerConfigVersion, "openai_image:openai_image_default:gpt-4.1-mini");
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (typeof value === "string") {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  }
});
