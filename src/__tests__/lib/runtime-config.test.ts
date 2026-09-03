const runtimeEnvironmentKeys = [
  'DB_POOL_MAX',
  'DB_CONNECTION_TIMEOUT_MS',
  'SYNC_WORKER_CONCURRENCY',
  'EMAIL_PERSIST_CONCURRENCY',
  'GMAIL_POLL_INTERVAL_MS',
  'IMAP_RECONCILE_INTERVAL_MS',
] as const;

const originalEnvironment = Object.fromEntries(
  runtimeEnvironmentKeys.map((key) => [key, process.env[key]])
);

afterEach(() => {
  jest.resetModules();

  for (const key of runtimeEnvironmentKeys) {
    const originalValue = originalEnvironment[key];
    if (originalValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalValue;
    }
  }
});

describe('runtimeConfig', () => {
  it('uses safe defaults when runtime environment variables are unset', async () => {
    for (const key of runtimeEnvironmentKeys) delete process.env[key];

    const { runtimeConfig } = await import('@/lib/runtime-config');

    expect(runtimeConfig).toEqual({
      dbPoolMax: 5,
      dbConnectionTimeoutMs: 10000,
      syncWorkerConcurrency: 1,
      emailPersistConcurrency: 3,
      gmailPollIntervalMs: 60000,
      imapReconcileIntervalMs: 300000,
    });
  });

  it('uses positive integer environment overrides', async () => {
    process.env.DB_POOL_MAX = '7';
    process.env.DB_CONNECTION_TIMEOUT_MS = '15000';
    process.env.SYNC_WORKER_CONCURRENCY = '2';
    process.env.EMAIL_PERSIST_CONCURRENCY = '4';
    process.env.GMAIL_POLL_INTERVAL_MS = '120000';
    process.env.IMAP_RECONCILE_INTERVAL_MS = '600000';

    const { runtimeConfig } = await import('@/lib/runtime-config');

    expect(runtimeConfig).toEqual({
      dbPoolMax: 7,
      dbConnectionTimeoutMs: 15000,
      syncWorkerConcurrency: 2,
      emailPersistConcurrency: 4,
      gmailPollIntervalMs: 120000,
      imapReconcileIntervalMs: 600000,
    });
  });

  it.each(['', '0', '-1', 'not-a-number', '1.5'])(
    'falls back to defaults for invalid environment value %j',
    async (invalidValue) => {
      for (const key of runtimeEnvironmentKeys) process.env[key] = invalidValue;

      const { runtimeConfig } = await import('@/lib/runtime-config');

      expect(runtimeConfig).toEqual({
        dbPoolMax: 5,
        dbConnectionTimeoutMs: 10000,
        syncWorkerConcurrency: 1,
        emailPersistConcurrency: 3,
        gmailPollIntervalMs: 60000,
        imapReconcileIntervalMs: 300000,
      });
    }
  );
});
