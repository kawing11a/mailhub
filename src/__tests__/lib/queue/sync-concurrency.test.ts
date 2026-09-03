jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    on: jest.fn(),
  }))
);

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
  })),
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    close: jest.fn(),
  })),
}));

jest.mock('@/lib/runtime-config', () => ({
  runtimeConfig: { syncWorkerConcurrency: 2 },
}));

jest.mock('@/lib/redis', () => ({
  redis: { publish: jest.fn() },
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: { emailAccount: { findUnique: jest.fn(), update: jest.fn() } },
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

import { Worker } from 'bullmq';
import '@/lib/queue/workers/sync';

describe('sync worker concurrency', () => {
  it('passes the configured concurrency to BullMQ', () => {
    expect((Worker as unknown as jest.Mock).mock.calls[0][2]).toEqual(
      expect.objectContaining({ concurrency: 2 })
    );
  });
});
