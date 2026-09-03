jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailAccount: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/crypto', () => ({
  decrypt: jest.fn(() => 'secret'),
  encrypt: jest.fn(),
}));

jest.mock('imapflow', () => ({ ImapFlow: jest.fn() }));
jest.mock('@/lib/redis', () => ({ redis: { publish: jest.fn() } }));
jest.mock('@/lib/queue/client', () => ({ searchQueue: { add: jest.fn() } }));
jest.mock('@/lib/ai/spam-checker', () => ({ checkIsHighRisk: jest.fn() }));
jest.mock('@/lib/rules/engine', () => ({ processRulesForNewEmail: jest.fn() }));

import { IMAPConnectionManager } from '@/lib/imap/connection-manager';
import { IncompleteSyncError } from '@/lib/sync-result';

describe('IMAP historical sync failure aggregation', () => {
  it('does not start an EXISTS fetch while historical sync holds a mailbox selection', async () => {
    const manager = new IMAPConnectionManager();
    let resolveSearch: ((uids: number[]) => void) | undefined;
    let searchStarted: (() => void) | undefined;
    const historicalMailboxSelected = new Promise<void>((resolve) => {
      searchStarted = resolve;
    });
    const client = {
      mailbox: { exists: 1 },
      list: jest.fn().mockResolvedValue([{ path: 'INBOX' }]),
      getMailboxLock: jest.fn().mockResolvedValue({ release: jest.fn() }),
      search: jest.fn(
        () =>
          new Promise<number[]>((resolve) => {
            searchStarted?.();
            resolveSearch = resolve;
          })
      ),
      fetch: jest.fn(async function* () {
        yield { uid: 1 };
      }),
    };

    (manager as any).connections.set('account-1', {
      accountId: 'account-1',
      organizationId: 'org-1',
      client,
      isConnected: true,
      reconnectAttempts: 0,
    });
    jest.spyOn(manager as any, 'startIDLE').mockResolvedValue(undefined);
    jest.spyOn(manager as any, 'persistEmail').mockResolvedValue(true);

    const historicalSync = manager.syncHistoricalEmails('account-1');
    await historicalMailboxSelected;
    const existsFetch = (manager as any).fetchNewEmails('account-1', 1, 1);
    await new Promise((resolve) => setImmediate(resolve));

    try {
      expect(client.fetch).not.toHaveBeenCalled();
    } finally {
      resolveSearch?.([]);
      await Promise.all([historicalSync, existsFetch]);
    }

    expect(client.fetch).toHaveBeenCalledTimes(1);
  });

  it('continues remaining chunks and mailboxes before reporting an incomplete sync', async () => {
    const manager = new IMAPConnectionManager();
    const release = jest.fn();
    const client = {
      mailbox: { exists: 1 },
      list: jest.fn().mockResolvedValue([
        { path: 'INBOX' },
        { path: 'Sent' },
      ]),
      getMailboxLock: jest.fn().mockResolvedValue({ release }),
      search: jest
        .fn()
        .mockResolvedValueOnce(Array.from({ length: 51 }, (_, index) => index + 1))
        .mockResolvedValueOnce([101]),
      on: jest.fn(),
    };

    (manager as any).connections.set('account-1', {
      accountId: 'account-1',
      organizationId: 'org-1',
      client,
      isConnected: true,
      reconnectAttempts: 0,
    });

    const fetchNewEmails = jest
      .spyOn(manager as any, 'fetchNewEmailsForAccount')
      .mockRejectedValueOnce(
        new IncompleteSyncError('account-1', { processed: 49, failed: 1 })
      )
      .mockResolvedValueOnce({ processed: 1, failed: 0 })
      .mockResolvedValueOnce({ processed: 1, failed: 0 });

    await expect(manager.syncHistoricalEmails('account-1')).rejects.toMatchObject({
      name: 'IncompleteSyncError',
      accountId: 'account-1',
      result: { processed: 51, failed: 1 },
    });

    expect(fetchNewEmails).toHaveBeenCalledTimes(3);
  });
});
