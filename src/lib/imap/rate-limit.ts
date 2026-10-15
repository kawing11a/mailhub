import { runtimeConfig } from '@/lib/runtime-config';

const MAX_RETRY_DELAY_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1_000;

type ErrorWithCode = Error & {
  code?: string;
  responseCode?: string;
};

type RateLimitState = {
  tail: Promise<void>;
};

type RetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
};

const rateLimitStates = new Map<string, RateLimitState>();
const lastRequestAt = new Map<string, number>();

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export function isRetryableImapError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const { code, responseCode, message } = error as ErrorWithCode;
  const normalizedCode = String(code || responseCode || '').toUpperCase();

  return (
    ['BAD', 'NO', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'ENETUNREACH', 'ECONNREFUSED', 'EAI_AGAIN'].includes(
      normalizedCode
    ) || /timeout|temporar|thrott|rate.?limit|too many|server busy|connection (?:reset|closed)/i.test(message)
  );
}

/** Serialize provider requests per account and enforce a minimum spacing. */
export function withImapRequestRateLimit<T>(
  accountId: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous = rateLimitStates.get(accountId);
  const state: RateLimitState = previous ?? {
    tail: Promise.resolve(),
  };
  const task = state.tail.then(async () => {
    const intervalMs = Math.max(0, runtimeConfig.imapRequestIntervalMs ?? 0);
    const now = Date.now();
    const previousRequestAt = lastRequestAt.get(accountId) ?? 0;
    const waitMs = Math.max(
      0,
      previousRequestAt > now ? 0 : previousRequestAt + intervalMs - now
    );
    if (waitMs > 0) await delay(waitMs);

    try {
      return await operation();
    } finally {
      lastRequestAt.set(accountId, Date.now());
    }
  });
  const tail = task.then(
    () => undefined,
    () => undefined
  );

  state.tail = tail;
  rateLimitStates.set(accountId, state);
  void tail.finally(() => {
    if (rateLimitStates.get(accountId) === state && state.tail === tail) {
      rateLimitStates.delete(accountId);
    }
  });

  return task;
}

/** Retry transient IMAP protocol/network failures with exponential backoff. */
export async function retryImapRequest<T>(
  accountId: string,
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = Math.max(0, options.maxRetries ?? DEFAULT_MAX_RETRIES);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await withImapRequestRateLimit(accountId, operation);
    } catch (error) {
      if (attempt === maxRetries || !isRetryableImapError(error)) throw error;

      await delay(Math.min(baseDelayMs * 2 ** attempt, MAX_RETRY_DELAY_MS));
    }
  }

  throw new Error('IMAP retry exhausted without a result');
}
