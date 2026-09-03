jest.mock('dotenv', () => ({ config: jest.fn() }));

jest.mock('@/lib/imap/connection-manager', () => ({
  imapManager: { shutdown: jest.fn() },
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailAccount: { findMany: jest.fn() },
    $disconnect: jest.fn(),
  },
}));

jest.mock('@/lib/redis', () => ({ redis: { set: jest.fn() } }));
jest.mock('@/lib/search/meilisearch', () => ({ initMeilisearch: jest.fn() }));
jest.mock('@/lib/queue/workers/sync', () => ({
  syncWorker: { close: jest.fn() },
  legacySyncWorker: { close: jest.fn() },
  ensureSyncWorkersForPartitions: jest.fn(),
  closeSyncWorkers: jest.fn(),
}));
jest.mock('@/lib/queue/workers/search', () => ({ searchWorker: { close: jest.fn() } }));
jest.mock('@/lib/queue/workers/summary', () => ({ summaryWorker: { close: jest.fn() } }));
jest.mock('@/lib/gmail/sync-manager', () => ({ gmailSyncManager: { shutdown: jest.fn() } }));
jest.mock('@/lib/queue/client', () => ({ enqueueInitialSync: jest.fn() }));

import { prisma } from '@/lib/db/prisma';
import { initMeilisearch } from '@/lib/search/meilisearch';
import { enqueueInitialSync } from '@/lib/queue/client';
import { ensureSyncWorkersForPartitions } from '@/lib/queue/workers/sync';

describe('worker bootstrap partition routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    process.env.WORKER_PARTITION = 'worker-1';
    (prisma.emailAccount.findMany as jest.Mock).mockResolvedValue([
      { id: 'account-1', workerPartition: 'worker-1' },
    ]);
    (initMeilisearch as jest.Mock).mockResolvedValue(undefined);
    (enqueueInitialSync as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.WORKER_PARTITION;
  });

  it('keeps worker-1 accounts on their stored partition queue during bootstrap', async () => {
    await import('@/worker');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(prisma.emailAccount.findMany).toHaveBeenCalledWith({
      where: { isActive: true, workerPartition: 'worker-1' },
    });
    expect(enqueueInitialSync).toHaveBeenCalledWith({
      id: 'account-1',
      workerPartition: 'worker-1',
    });
  });

  it('starts consumers for every stored partition in default worker mode', async () => {
    delete process.env.WORKER_PARTITION;
    (prisma.emailAccount.findMany as jest.Mock).mockResolvedValue([
      { id: 'account-1', workerPartition: 'worker-1' },
      { id: 'account-2', workerPartition: 'worker-2' },
    ]);

    await jest.isolateModulesAsync(async () => {
      await import('@/worker');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(ensureSyncWorkersForPartitions).toHaveBeenCalledWith(['worker-1', 'worker-2']);
  });
});
