const MAX_RETRY_DELAY_MS = 1000;

type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
};

type ErrorWithCode = Error & { code?: string };

const isTransientDatabaseError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;

  const { code, message } = error as ErrorWithCode;
  return (
    code === 'P2028' ||
    code === 'P2024' ||
    code === 'ETIMEDOUT' ||
    /connection timeout|timeout (?:expired|exceeded) when trying to connect/i.test(message)
  );
};

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function retryAsync<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 100);
  const shouldRetry = options.shouldRetry ?? isTransientDatabaseError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === attempts || !shouldRetry(error)) throw error;

      const retryDelayMs = Math.min(
        baseDelayMs * 2 ** (attempt - 1),
        MAX_RETRY_DELAY_MS
      );
      await delay(retryDelayMs);
    }
  }

  throw new Error('Retry operation exhausted without a result');
}
