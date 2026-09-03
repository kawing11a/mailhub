jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    on: jest.fn(),
  }))
);

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
}));

jest.mock('@/lib/redis', () => ({ redis: { publish: jest.fn() } }));
jest.mock('@/lib/db/prisma', () => ({
  prisma: { emailAccount: { findUnique: jest.fn(), update: jest.fn() } },
}));
jest.mock('@/lib/queue/client', () => ({
  enqueueInitialSync: jest.fn(),
  getSyncQueueName: jest.fn((partition: string) => `imap-sync-${partition}`),
}));
jest.mock('@/lib/imap/connection-manager', () => ({
  imapManager: { getStatus: jest.fn(), initializeAccount: jest.fn(), syncHistoricalEmails: jest.fn() },
}));
jest.mock('@/lib/gmail/sync-manager', () => ({
  gmailSyncManager: { initializeAccount: jest.fn(), syncHistoricalEmails: jest.fn() },
}));
jest.mock('@/lib/runtime-config', () => ({ runtimeConfig: { syncWorkerConcurrency: 1 } }));

import { Worker } from 'bullmq';
import { prisma } from '@/lib/db/prisma';
import { enqueueInitialSync } from '@/lib/queue/client';
import { gmailSyncManager } from '@/lib/gmail/sync-manager';

describe('legacy same-partition sync forwarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WORKER_PARTITION = 'worker-1';
    (prisma.emailAccount.findUnique as jest.Mock).mockResolvedValue({
      id: 'account-1',
      organizationId: 'org-1',
      provider: 'gmail',
      workerPartition: 'worker-1',
      initialSyncCompletedAt: null,
    });
  });

  afterAll(() => {
    delete process.env.WORKER_PARTITION;
  });

  it('always forwards a legacy job even when this worker owns the account partition', async () => {
    await import('@/lib/queue/workers/sync');
    const legacyProcessor = (Worker as unknown as jest.Mock).mock.calls.find(
      ([queueName]) => queueName === 'imap-sync'
    )?.[1] as (job: unknown) => Promise<void>;

    await expect(
      legacyProcessor({
        name: 'initial-sync',
        data: { accountId: 'account-1', folder: 'ALL' },
      })
    ).resolves.toBeUndefined();

    expect(enqueueInitialSync).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'account-1', workerPartition: 'worker-1' })
    );
    expect(gmailSyncManager.syncHistoricalEmails).not.toHaveBeenCalled();
  });
});
