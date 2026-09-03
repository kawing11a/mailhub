jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailAccount: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/gmail/api', () => ({
  getValidAccessToken: jest.fn(),
  fetchMessagesList: jest.fn(),
  fetchMessageFull: jest.fn(),
  fetchMessageRaw: jest.fn(),
}));

jest.mock('@/lib/runtime-config', () => ({
  runtimeConfig: {
    emailPersistConcurrency: 2,
    gmailPollIntervalMs: 60_000,
  },
}));

jest.mock('@/lib/queue/client', () => ({
  searchQueue: { add: jest.fn() },
}));

jest.mock('@/lib/redis', () => ({
  redis: { publish: jest.fn() },
}));

jest.mock('@/lib/ai/spam-checker', () => ({
  checkIsHighRisk: jest.fn(),
}));

jest.mock('@/lib/rules/engine', () => ({
  processRulesForNewEmail: jest.fn(),
}));

import { prisma } from '@/lib/db/prisma';
import { fetchMessagesList, getValidAccessToken } from '@/lib/gmail/api';
import { GmailSyncManager } from '@/lib/gmail/sync-manager';
import { IncompleteSyncError } from '@/lib/sync-result';

const activeAccount = {
  id: 'account-1',
  organizationId: 'org-1',
  isActive: true,
  lastSyncedAt: new Date('2026-08-26T00:00:00.000Z'),
};

describe('Gmail polling concurrency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.emailAccount.findUnique as jest.Mock).mockResolvedValue(activeAccount);
    (getValidAccessToken as jest.Mock).mockResolvedValue('access-token');
  });

  it('does not start a second provider fetch while the account poll is still running', async () => {
    const manager = new GmailSyncManager();
    let resolveFirstFetch: ((value: { messages: []; resultSizeEstimate: number }) => void) | undefined;
    let firstFetchStarted: (() => void) | undefined;
    const firstFetchHasStarted = new Promise<void>((resolve) => {
      firstFetchStarted = resolve;
    });

    const pendingFetch = new Promise<{ messages: []; resultSizeEstimate: number }>((resolve) => {
      resolveFirstFetch = resolve;
    });
    (fetchMessagesList as jest.Mock).mockImplementation(() => {
      firstFetchStarted?.();
      return pendingFetch;
    });

    const firstPoll = (manager as any).pollNewEmails('account-1', 'org-1');
    await firstFetchHasStarted;

    const secondPoll = (manager as any).pollNewEmails('account-1', 'org-1');
    await new Promise((resolve) => setImmediate(resolve));

    try {
      expect(fetchMessagesList).toHaveBeenCalledTimes(1);
    } finally {
      resolveFirstFetch?.({ messages: [], resultSizeEstimate: 0 });
      await Promise.all([firstPoll, secondPoll]);
    }
  });

  it('persists every polling page before advancing the watermark', async () => {
    const manager = new GmailSyncManager();
    const firstPage = Array.from({ length: 50 }, (_, index) => ({ id: `message-${index + 1}` }));
    const secondPage = [{ id: 'message-51' }];
    (fetchMessagesList as jest.Mock)
      .mockResolvedValueOnce({
        messages: firstPage,
        nextPageToken: 'page-2',
        resultSizeEstimate: 51,
      })
      .mockResolvedValueOnce({
        messages: secondPage,
        resultSizeEstimate: 51,
      });
    jest.spyOn(manager as any, 'fetchAndPersist').mockResolvedValue(true);

    await expect((manager as any).pollNewEmails('account-1', 'org-1')).resolves.toEqual({
      processed: 51,
      failed: 0,
    });

    expect(fetchMessagesList).toHaveBeenNthCalledWith(2, 'access-token', {
      labelIds: ['INBOX'],
      maxResults: 50,
      q: 'after:1787702400',
      pageToken: 'page-2',
    });
    expect(prisma.emailAccount.update).toHaveBeenCalledTimes(1);
  });

  it('leaves the polling watermark unchanged when a later page cannot be persisted', async () => {
    const manager = new GmailSyncManager();
    (fetchMessagesList as jest.Mock)
      .mockResolvedValueOnce({
        messages: [{ id: 'message-1' }],
        nextPageToken: 'page-2',
        resultSizeEstimate: 2,
      })
      .mockResolvedValueOnce({
        messages: [{ id: 'message-2' }],
        resultSizeEstimate: 2,
      });
    jest
      .spyOn(manager as any, 'fetchAndPersist')
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect((manager as any).pollNewEmails('account-1', 'org-1')).rejects.toBeInstanceOf(
      IncompleteSyncError
    );

    expect(prisma.emailAccount.update).not.toHaveBeenCalled();
  });

  it('limits historical email persistence to the configured concurrency', async () => {
    const manager = new GmailSyncManager();
    (fetchMessagesList as jest.Mock).mockImplementation(
      (_accessToken: string, params: { labelIds: string[] }) =>
        Promise.resolve({
          messages:
            params.labelIds[0] === 'INBOX'
              ? [
                  { id: 'message-1', threadId: 'thread-1' },
                  { id: 'message-2', threadId: 'thread-2' },
                  { id: 'message-3', threadId: 'thread-3' },
                  { id: 'message-4', threadId: 'thread-4' },
                ]
              : [],
          resultSizeEstimate: 0,
        })
    );

    let activePersistences = 0;
    let maxConcurrentPersistences = 0;
    jest.spyOn(manager as any, 'fetchAndPersist').mockImplementation(async () => {
      activePersistences += 1;
      maxConcurrentPersistences = Math.max(maxConcurrentPersistences, activePersistences);
      await new Promise((resolve) => setImmediate(resolve));
      activePersistences -= 1;
      return true;
    });

    await expect(manager.syncHistoricalEmails('account-1')).resolves.toEqual({
      processed: 4,
      failed: 0,
    });

    expect(maxConcurrentPersistences).toBe(2);
  });
});
