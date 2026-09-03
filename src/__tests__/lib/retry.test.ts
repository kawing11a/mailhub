import { retryAsync } from '@/lib/retry';

const prismaTransactionStartError = () => {
  const error = new Error('Unable to start a transaction in the given time');
  (error as Error & { code: string }).code = 'P2028';
  return error;
};

describe('retryAsync', () => {
  it('returns the result when transaction acquisition succeeds after two transient failures', async () => {
    let attempts = 0;

    const result = await retryAsync(
      async () => {
        attempts += 1;
        if (attempts < 3) throw prismaTransactionStartError();
        return 'persisted';
      },
      { baseDelayMs: 1 }
    );

    expect(result).toBe('persisted');
    expect(attempts).toBe(3);
  });

  it('retries the pg pool connection-timeout message', async () => {
    let attempts = 0;

    const result = await retryAsync(
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('timeout exceeded when trying to connect');
        return 'persisted';
      },
      { baseDelayMs: 1 }
    );

    expect(result).toBe('persisted');
    expect(attempts).toBe(2);
  });

  it('retries Prisma pool acquisition error P2024', async () => {
    let attempts = 0;

    const result = await retryAsync(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          const error = new Error('Timed out fetching a new connection from the connection pool');
          (error as Error & { code: string }).code = 'P2024';
          throw error;
        }
        return 'persisted';
      },
      { baseDelayMs: 1 }
    );

    expect(result).toBe('persisted');
    expect(attempts).toBe(2);
  });

  it('immediately rethrows a non-transient persistence error', async () => {
    let attempts = 0;
    const error = new Error('Unique constraint failed');
    (error as Error & { code: string }).code = 'P2002';

    await expect(
      retryAsync(
        async () => {
          attempts += 1;
          throw error;
        },
        { baseDelayMs: 1 }
      )
    ).rejects.toBe(error);

    expect(attempts).toBe(1);
  });

  it('rejects with the final transient error after the attempt limit', async () => {
    let attempts = 0;
    const error = prismaTransactionStartError();

    await expect(
      retryAsync(
        async () => {
          attempts += 1;
          throw error;
        },
        { attempts: 2, baseDelayMs: 1 }
      )
    ).rejects.toBe(error);

    expect(attempts).toBe(2);
  });
});
