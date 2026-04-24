// Phase 1: wide aspect only.

export interface ScoutRequest {
  prompt: string;
  negativePrompt?: string;
  widthPx: number;
  heightPx: number;
  seed: number;
  maxLatencyMs?: number;
}

export interface ScoutResult {
  imageBytes: Buffer;
  latencyMs: number;
  providerModel: string;
  seed: number;
}

export type ScoutProviderErrorKind =
  | "RATE_LIMIT"
  | "CONTENT_POLICY"
  | "MODEL_UNAVAILABLE"
  | "TIMEOUT"
  | "UNKNOWN";

export class ScoutProviderError extends Error {
  constructor(
    public readonly kind: ScoutProviderErrorKind,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ScoutProviderError";
  }
}

export interface ScoutProvider {
  readonly id: string;
  generate(req: ScoutRequest): Promise<ScoutResult>;
}

// Wide scout dimensions: 768×448 (both multiples of 64, ~16:9 for composition validity).
export const SCOUT_WIDE_WIDTH_PX = 768;
export const SCOUT_WIDE_HEIGHT_PX = 448;
