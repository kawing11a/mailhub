const positiveIntegerFromEnvironment = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);

  return Number.isInteger(value) && value > 0 ? value : fallback;
};

export const runtimeConfig = {
  dbPoolMax: positiveIntegerFromEnvironment('DB_POOL_MAX', 5),
  dbConnectionTimeoutMs: positiveIntegerFromEnvironment('DB_CONNECTION_TIMEOUT_MS', 10000),
  syncWorkerConcurrency: positiveIntegerFromEnvironment('SYNC_WORKER_CONCURRENCY', 1),
  emailPersistConcurrency: positiveIntegerFromEnvironment('EMAIL_PERSIST_CONCURRENCY', 3),
  gmailPollIntervalMs: positiveIntegerFromEnvironment('GMAIL_POLL_INTERVAL_MS', 60000),
  imapReconcileIntervalMs: positiveIntegerFromEnvironment('IMAP_RECONCILE_INTERVAL_MS', 300000),
};
