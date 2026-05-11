import "server-only";

import { fal } from "@fal-ai/client";
import { withTimeout, ProviderTimeoutError } from "./with-timeout";
import { ROUND1_V2_CONFIG } from "../config";

// Narrow, isolated wrapper for Imagen 4 — used only by the experimental
// modern_abstract path. Text-to-image only, 16:9 only, no reference inputs.

const ASPECT_RATIO = "16:9" as const;
const RESOLUTION = "2K" as const;
const OUTPUT_FORMAT = "png" as const;

export type Imagen4ErrorKind =
  | "RATE_LIMIT"
  | "CONTENT_POLICY"
  | "MODEL_UNAVAILABLE"
  | "TIMEOUT"
  | "UNKNOWN";

export class Imagen4ProviderError extends Error {
  constructor(
    public readonly kind: Imagen4ErrorKind,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "Imagen4ProviderError";
  }
}

export interface Imagen4Request {
  prompt: string;
}

export interface Imagen4Result {
  imageBytes: Buffer;
  latencyMs: number;
  providerModel: string;
  providerMetadata: {
    aspectRatio: typeof ASPECT_RATIO;
    resolution: typeof RESOLUTION;
    outputFormat: typeof OUTPUT_FORMAT;
    description?: string;
  };
}

export interface Imagen4Provider {
  readonly id: string;
  generate(req: Imagen4Request): Promise<Imagen4Result>;
}

type FalImagen4Output = {
  images: Array<{ url: string }>;
  description?: string;
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

// Mirrors fal-flux-schnell.classifyFalError for consistent error semantics.
function classifyFalError(err: unknown): Imagen4ProviderError {
  if (err instanceof ProviderTimeoutError)
    return new Imagen4ProviderError("TIMEOUT", err.message, err);
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("too many"))
    return new Imagen4ProviderError("RATE_LIMIT", msg, err);
  if (lower.includes("content") || lower.includes("policy") || lower.includes("safety"))
    return new Imagen4ProviderError("CONTENT_POLICY", msg, err);
  if (lower.includes("503") || lower.includes("unavailable") || lower.includes("model"))
    return new Imagen4ProviderError("MODEL_UNAVAILABLE", msg, err);
  if (lower.includes("timeout") || lower.includes("timed out"))
    return new Imagen4ProviderError("TIMEOUT", msg, err);
  return new Imagen4ProviderError("UNKNOWN", msg, err);
}

export const falImagen4Provider: Imagen4Provider = {
  id: "fal.imagen4-preview",

  async generate(req: Imagen4Request): Promise<Imagen4Result> {
    const apiKey = process.env.FAL_API_KEY?.trim();
    if (!apiKey) throw new Error("FAL_API_KEY is not configured");
    fal.config({ credentials: apiKey });

    const modelId = ROUND1_V2_CONFIG.imagen4ModernAbstractProvider;
    const started = Date.now();
    let raw: unknown;
    try {
      raw = await withTimeout(
        fal.subscribe(modelId, {
          input: {
            prompt: req.prompt,
            aspect_ratio: ASPECT_RATIO,
            resolution: RESOLUTION,
            num_images: 1,
            output_format: OUTPUT_FORMAT,
          },
        }),
        ROUND1_V2_CONFIG.imagen4ModernAbstractTimeoutMs,
        "fal-imagen4-preview"
      );
    } catch (err) {
      throw classifyFalError(err);
    }

    const latencyMs = Date.now() - started;
    const output = (raw as { data: FalImagen4Output }).data;
    const imageUrl = output?.images?.[0]?.url;
    if (!imageUrl)
      throw new Imagen4ProviderError("UNKNOWN", "Imagen 4 returned no image URL");

    let imageBytes: Buffer;
    try {
      imageBytes = await fetchImageBytes(imageUrl);
    } catch (err) {
      throw new Imagen4ProviderError(
        "UNKNOWN",
        `Failed to fetch Imagen 4 image: ${String(err)}`,
        err
      );
    }

    return {
      imageBytes,
      latencyMs,
      providerModel: modelId,
      providerMetadata: {
        aspectRatio: ASPECT_RATIO,
        resolution: RESOLUTION,
        outputFormat: OUTPUT_FORMAT,
        description: output.description,
      },
    };
  },
};
