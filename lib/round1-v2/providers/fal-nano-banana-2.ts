import "server-only";

import { fal } from "@fal-ai/client";
import {
  RebuildProvider,
  RebuildProviderError,
  RebuildRequest,
  RebuildResult,
} from "./rebuild-provider";

// Nano Banana 2: bounded fallback via Flux Dev.
// Used when Nano Banana Pro is rate-limited, unavailable, or times out.

const MODEL_ID = "fal-ai/flux/dev";

type FluxDevOutput = {
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

function classifyFalError(err: unknown): RebuildProviderError {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("too many"))
    return new RebuildProviderError("RATE_LIMIT", msg, err);
  if (lower.includes("content") || lower.includes("policy") || lower.includes("safety"))
    return new RebuildProviderError("CONTENT_POLICY", msg, err);
  if (lower.includes("503") || lower.includes("unavailable") || lower.includes("model"))
    return new RebuildProviderError("MODEL_UNAVAILABLE", msg, err);
  if (lower.includes("timeout") || lower.includes("timed out"))
    return new RebuildProviderError("TIMEOUT", msg, err);
  return new RebuildProviderError("UNKNOWN", msg, err);
}

export const falNanaBanana2: RebuildProvider = {
  id: "fal.nano-banana-2",

  async generate(req: RebuildRequest): Promise<RebuildResult> {
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
          num_inference_steps: 28,
          guidance_scale: 3.5,
          seed: req.seed,
          enable_safety_checker: false,
        },
      });
    } catch (err) {
      throw classifyFalError(err);
    }

    const latencyMs = Date.now() - started;
    const output = (raw as { data: FluxDevOutput }).data;
    const imageUrl = output?.images?.[0]?.url;
    if (!imageUrl) throw new RebuildProviderError("UNKNOWN", "Nano Banana 2 returned no image URL");

    let imageBytes: Buffer;
    try {
      imageBytes = await fetchImageBytes(imageUrl);
    } catch (err) {
      throw new RebuildProviderError("UNKNOWN", `Failed to fetch rebuild image: ${String(err)}`, err);
    }

    return {
      imageBytes,
      latencyMs,
      providerModel: MODEL_ID,
      seed: output.seed ?? req.seed,
    };
  },
};
