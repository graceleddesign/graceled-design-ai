// Phase 1: wide canonical background rebuilds only.

export interface RebuildRequest {
  prompt: string;
  negativePrompt?: string;
  widthPx: number;
  heightPx: number;
  seed: number;
  maxLatencyMs?: number;
}

export interface RebuildResult {
  imageBytes: Buffer;
  latencyMs: number;
  providerModel: string;
  seed: number;
}

export type RebuildProviderErrorKind =
  | "RATE_LIMIT"
  | "CONTENT_POLICY"
  | "MODEL_UNAVAILABLE"
  | "TIMEOUT"
  | "UNKNOWN";

export class RebuildProviderError extends Error {
  constructor(
    public readonly kind: RebuildProviderErrorKind,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "RebuildProviderError";
  }

  // True when a bounded fallback attempt on a secondary provider is appropriate.
  get isRetryable(): boolean {
    return (
      this.kind === "RATE_LIMIT" ||
      this.kind === "MODEL_UNAVAILABLE" ||
      this.kind === "TIMEOUT"
    );
  }
}

export interface RebuildProvider {
  readonly id: string;
  generate(req: RebuildRequest): Promise<RebuildResult>;
}

// Canonical wide rebuild dimensions (Flux landscape_16_9 native size, ~16:9).
// Can be composited into 1920×1080 downstream with no quality loss.
export const REBUILD_WIDE_WIDTH_PX = 1344;
export const REBUILD_WIDE_HEIGHT_PX = 768;
