import "server-only";

const RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_INPUTS_PER_MINUTE = 5;
const DEFAULT_MAX_CONCURRENT = 1;
const DEFAULT_429_RETRY_DELAY_MS = 15_000;
const DEFAULT_429_MAX_RETRIES = 2;

export type GptImageDebugMeta = {
  rateLimitWaitMs?: number;
};

type BudgetContext = {
  debug?: GptImageDebugMeta;
} | null | undefined;

const recentCallTimestamps: number[] = [];
const pendingConcurrencyResolvers: Array<() => void> = [];

let activeConcurrency = 0;
let budgetLock: Promise<void> = Promise.resolve();

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

function gptImageInputsPerMinute(): number {
  return parsePositiveInteger(process.env.OPENAI_GPT_IMAGE_INPUTS_PER_MINUTE, DEFAULT_INPUTS_PER_MINUTE);
}

function gptImageMaxConcurrent(): number {
  return parsePositiveInteger(process.env.OPENAI_GPT_IMAGE_MAX_CONCURRENT, DEFAULT_MAX_CONCURRENT);
}

function applyWaitToDebugMeta(context: BudgetContext, waitedMs: number): void {
  if (waitedMs <= 0 || !context?.debug) {
    return;
  }
  context.debug.rateLimitWaitMs = (context.debug.rateLimitWaitMs ?? 0) + waitedMs;
}

function sleep(ms: number): Promise<void> {
  if (!Number.isFinite(ms) || ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function jitterMs(): number {
  return 50 + Math.floor(Math.random() * 100);
}

function pruneExpiredTimestamps(now: number): void {
  while (recentCallTimestamps.length > 0 && now - recentCallTimestamps[0] >= RATE_LIMIT_WINDOW_MS) {
    recentCallTimestamps.shift();
  }
}

async function withBudgetLock<T>(fn: () => Promise<T>): Promise<T> {
  const previousLock = budgetLock;
  let releaseLock: () => void = () => undefined;
  budgetLock = new Promise<void>((resolve) => {
    releaseLock = () => resolve();
  });

  await previousLock;
  try {
    return await fn();
  } finally {
    releaseLock();
  }
}

async function waitForRateLimitBudget(context?: BudgetContext): Promise<void> {
  let waitedMs = 0;

  await withBudgetLock(async () => {
    const limit = gptImageInputsPerMinute();
    const now = Date.now();
    pruneExpiredTimestamps(now);

    if (recentCallTimestamps.length >= limit) {
      const oldestTimestamp = recentCallTimestamps[0];
      const minNextWindow = oldestTimestamp + RATE_LIMIT_WINDOW_MS;
      const sleepDuration = Math.max(0, minNextWindow - now + jitterMs());
      if (sleepDuration > 0) {
        waitedMs = sleepDuration;
        await sleep(sleepDuration);
      }
      pruneExpiredTimestamps(Date.now());
    }

    recentCallTimestamps.push(Date.now());
  });

  applyWaitToDebugMeta(context, waitedMs);
}

async function acquireConcurrencySlot(): Promise<void> {
  const maxConcurrent = gptImageMaxConcurrent();
  if (activeConcurrency < maxConcurrent) {
    activeConcurrency += 1;
    return;
  }

  await new Promise<void>((resolve) => {
    pendingConcurrencyResolvers.push(resolve);
  });
  activeConcurrency += 1;
}

function releaseConcurrencySlot(): void {
  activeConcurrency = Math.max(0, activeConcurrency - 1);
  const next = pendingConcurrencyResolvers.shift();
  if (next) {
    next();
  }
}

function readErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) {
    return null;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function readRetryAfterHeader(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("headers" in error)) {
    return null;
  }
  const headers = (error as { headers?: unknown }).headers;
  if (!headers) {
    return null;
  }
  if (headers instanceof Headers) {
    return headers.get("retry-after");
  }
  if (typeof headers === "object" && !Array.isArray(headers)) {
    const record = headers as Record<string, unknown>;
    const value = record["retry-after"] ?? record["Retry-After"];
    return typeof value === "string" ? value : null;
  }
  return null;
}

function parseRetryAfterMs(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.max(0, Math.round(Number.parseFloat(trimmed) * 1000));
  }
  const parsedDate = Date.parse(trimmed);
  if (!Number.isFinite(parsedDate)) {
    return null;
  }
  return Math.max(0, parsedDate - Date.now());
}

function parseRetryDelayFromMessage(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return null;
  }
  const message = (error as { message?: unknown }).message;
  if (typeof message !== "string") {
    return null;
  }

  const match = message.match(/please try again in\s+(\d+(?:\.\d+)?)s/i);
  if (!match) {
    return null;
  }
  return Math.max(0, Math.round(Number.parseFloat(match[1]) * 1000));
}

export function isOpenAiRateLimitError(error: unknown): boolean {
  return readErrorStatus(error) === 429;
}

export function readOpenAiRateLimitRetryDelayMs(error: unknown): number {
  const retryAfterHeader = readRetryAfterHeader(error);
  if (retryAfterHeader) {
    const fromHeader = parseRetryAfterMs(retryAfterHeader);
    if (fromHeader !== null) {
      return fromHeader;
    }
  }

  const fromMessage = parseRetryDelayFromMessage(error);
  if (fromMessage !== null) {
    return fromMessage;
  }

  return DEFAULT_429_RETRY_DELAY_MS;
}

export async function runWithGptImage429Retry<T>(
  fn: () => Promise<T>,
  context?: BudgetContext,
  maxRetries = DEFAULT_429_MAX_RETRIES
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (!isOpenAiRateLimitError(error) || attempt >= maxRetries) {
        throw error;
      }
      const retryDelayMs = readOpenAiRateLimitRetryDelayMs(error);
      applyWaitToDebugMeta(context, retryDelayMs);
      await sleep(retryDelayMs);
      attempt += 1;
    }
  }
}

export async function runWithGptImageBudget<T>(fn: () => Promise<T>, context?: BudgetContext): Promise<T> {
  await acquireConcurrencySlot();
  try {
    await waitForRateLimitBudget(context);
    return await fn();
  } finally {
    releaseConcurrencySlot();
  }
}
