import { createHash } from 'node:crypto';
import { runtimeConfig } from '@/lib/runtime-config';

type QueueState = {
  tail: Promise<void>;
  nextAvailableAt: number;
};

const requestQueues = new Map<string, QueueState>();

const getRequestIntervalMs = (): number => {
  const value = Number(process.env.GMAIL_REQUEST_INTERVAL_MS);
  return Number.isInteger(value) && value > 0
    ? value
    : (runtimeConfig.gmailRequestIntervalMs ?? 1000);
};

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export function getGmailRequestKey(options?: RequestInit): string {
  const authorization = new Headers(options?.headers).get('authorization') ?? 'anonymous';
  return createHash('sha256').update(authorization).digest('hex');
}

/**
 * Serializes requests for one Gmail identity and spaces them apart locally.
 * The key is a hash of the authorization header, so access tokens are never
 * retained in the limiter state or written to logs.
 */
export async function withGmailRateLimit<T>(
  key: string,
  operation: () => Promise<T>
): Promise<T> {
  const previousState = requestQueues.get(key);
  const previous = previousState?.tail ?? Promise.resolve();

  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  const state: QueueState = {
    tail: current,
    nextAvailableAt: previousState?.nextAvailableAt ?? 0,
  };
  requestQueues.set(key, state);

  await previous;

  try {
    const waitMs = Math.max(
      0,
      (previousState?.nextAvailableAt ?? 0) - Date.now()
    );
    if (waitMs > 0) await delay(waitMs);
    return await operation();
  } finally {
    state.nextAvailableAt = Date.now() + getRequestIntervalMs();
    release();
  }
}
