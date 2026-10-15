jest.mock('@/lib/runtime-config', () => ({
  runtimeConfig: { imapRequestIntervalMs: 100 },
}));

import { retryImapRequest, withImapRequestRateLimit } from '@/lib/imap/rate-limit';

describe('IMAP request protection', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries transient IMAP failures with backoff', async () => {
    const operation = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(Object.assign(new Error('socket timeout'), { code: 'ETIMEDOUT' }))
      .mockRejectedValueOnce(Object.assign(new Error('server busy'), { code: 'NO' }))
      .mockResolvedValue('ok');

    const resultPromise = retryImapRequest('account-1', operation, {
      maxRetries: 2,
      baseDelayMs: 100,
    });
    await jest.runAllTimersAsync();

    await expect(resultPromise).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('spaces requests for the same account', async () => {
    const startedAt: number[] = [];
    const first = withImapRequestRateLimit('account-2', async () => {
      startedAt.push(Date.now());
    });
    await first;

    const second = withImapRequestRateLimit('account-2', async () => {
      startedAt.push(Date.now());
    });
    await jest.runAllTimersAsync();
    await second;

    expect(startedAt).toHaveLength(2);
    expect(startedAt[1] - startedAt[0]).toBeGreaterThanOrEqual(100);
  });
});
