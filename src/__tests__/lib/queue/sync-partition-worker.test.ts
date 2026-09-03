jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    on: jest.fn(),
  }))
);

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
  })),
}));

jest.mock('@/lib/redis', () => ({
  redis: { publish: jest.fn() },
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailAccount: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/queue/client', () => ({
  enqueueInitialSync: jest.fn(),
  getSyncQueueName: jest.fn((partition: string) => `imap-sync-${partition}`),
}));

jest.mock('@/lib/imap/connection-manager', () => ({
  imapManager: {
    getStatus: jest.fn(),
    initializeAccount: jest.fn(),
    syncHistoricalEmails: jest.fn(),
  },
}));

jest.mock('@/lib/gmail/sync-manager', () => ({
  gmailSyncManager: {
    initializeAccount: jest.fn(),
    syncHistoricalEmails: jest.fn(),
  },
}));

jest.mock('@/lib/runtime-config', () => ({
  runtimeConfig: { syncWorkerConcurrency: 1 },
}));

import { Worker } from 'bullmq';
import { prisma } from '@/lib/db/prisma';
import { enqueueInitialSync } from '@/lib/queue/client';
import { gmailSyncManager } from '@/lib/gmail/sync-manager';
import { imapManager } from '@/lib/imap/connection-manager';

describe('legacy shared sync queue forwarding', () => {
  const account = {
    id: 'account-2',
    organizationId: 'org-1',
    provider: 'gmail',
    workerPartition: 'worker-2',
    initialSyncCompletedAt: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WORKER_PARTITION = 'worker-1';
    (prisma.emailAccount.findUnique as jest.Mock).mockResolvedValue(account);
  });

  afterAll(() => {
    delete process.env.WORKER_PARTITION;
  });

  it('forwards a legacy job assigned to another partition without syncing it locally', async () => {
    await import('@/lib/queue/workers/sync');
    const legacyProcessor = (Worker as unknown as jest.Mock).mock.calls.find(
      ([queueName]) => queueName === 'imap-sync'
    )?.[1] as (job: unknown) => Promise<void>;

    await expect(
      legacyProcessor({
        name: 'initial-sync',
        data: { accountId: 'account-2', folder: 'ALL' },
      })
    ).resolves.toBeUndefined();

    expect(enqueueInitialSync).toHaveBeenCalledWith(account);
    expect(gmailSyncManager.syncHistoricalEmails).not.toHaveBeenCalled();
    expect(imapManager.initializeAccount).not.toHaveBeenCalled();
  });
});
