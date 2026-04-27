/**
 * Provider timeout helper for V2 FAL calls.
 *
 * Wraps an async call with a hard deadline using Promise.race.
 * - Clears the timer after the original promise settles.
 * - Attaches a no-op catch to the original promise to suppress unhandled
 *   rejections when it eventually rejects after we've already timed out.
 *
 * Usage:
 *   const result = await withTimeout(
 *     fal.subscribe(MODEL_ID, { input }),
 *     ROUND1_V2_CONFIG.scoutProviderTimeoutMs,
 *     "fal-flux-schnell"
 *   );
 */

export class ProviderTimeoutError extends Error {
  constructor(
    public readonly label: string,
    public readonly timeoutMs: number
  ) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = "ProviderTimeoutError";
  }
}

/**
 * Race `promise` against a hard `timeoutMs` deadline.
 *
 * If `promise` resolves/rejects before the deadline, returns normally.
 * If the deadline fires first, rejects with `ProviderTimeoutError`.
 * In either case the timer is cleared to avoid leaking Node.js timer handles.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  // Suppress unhandled rejection when original promise rejects after we timed out.
  promise.catch(() => {});

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timedOut = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new ProviderTimeoutError(label, timeoutMs));
    }, timeoutMs);
  });

  return Promise.race([promise, timedOut]).finally(() => {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  });
}
