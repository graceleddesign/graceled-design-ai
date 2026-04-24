import "server-only";

import { fal } from "@fal-ai/client";
import {
  ScoutProvider,
  ScoutProviderError,
  ScoutRequest,
  ScoutResult,
} from "./scout-provider";

const MODEL_ID = "fal-ai/flux/schnell";

type FluxSchnellOutput = {
  images: Array<{ url: string }>;
  seed?: number;
};

async function fetchImageBytes(url: string): Promise<Buffer> {
  let last: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      last = err instanceof Error ? err : new Error(String(err));
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw last!;
}

function classifyFalError(err: unknown): ScoutProviderError {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("too many"))
    return new ScoutProviderError("RATE_LIMIT", msg, err);
  if (lower.includes("content") || lower.includes("policy") || lower.includes("safety"))
    return new ScoutProviderError("CONTENT_POLICY", msg, err);
  if (lower.includes("503") || lower.includes("unavailable") || lower.includes("model"))
    return new ScoutProviderError("MODEL_UNAVAILABLE", msg, err);
  if (lower.includes("timeout") || lower.includes("timed out"))
    return new ScoutProviderError("TIMEOUT", msg, err);
  return new ScoutProviderError("UNKNOWN", msg, err);
}

export const falFluxSchnellProvider: ScoutProvider = {
  id: "fal.flux-schnell",

  async generate(req: ScoutRequest): Promise<ScoutResult> {
    const apiKey = process.env.FAL_API_KEY?.trim();
    if (!apiKey) throw new Error("FAL_API_KEY is not configured");

    fal.config({ credentials: apiKey });

    const started = Date.now();
    let raw: unknown;
    try {
      raw = await fal.subscribe(MODEL_ID, {
        input: {
          prompt: req.prompt,
          image_size: { width: req.widthPx, height: req.heightPx },
          num_inference_steps: 4,
          seed: req.seed,
          enable_safety_checker: false,
        },
      });
    } catch (err) {
      throw classifyFalError(err);
    }

    const latencyMs = Date.now() - started;
    const output = (raw as { data: FluxSchnellOutput }).data;
    const imageUrl = output?.images?.[0]?.url;
    if (!imageUrl) throw new ScoutProviderError("UNKNOWN", "Flux Schnell returned no image URL");

    let imageBytes: Buffer;
    try {
      imageBytes = await fetchImageBytes(imageUrl);
    } catch (err) {
      throw new ScoutProviderError("UNKNOWN", `Failed to fetch scout image: ${String(err)}`, err);
    }

    return {
      imageBytes,
      latencyMs,
      providerModel: MODEL_ID,
      seed: output.seed ?? req.seed,
    };
  },
};
