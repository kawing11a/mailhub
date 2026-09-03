jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailAccount: {
      findUnique: jest.fn(),
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
jest.mock('@/lib/runtime-config', () => ({
  runtimeConfig: { emailPersistConcurrency: 2 },
}));

import { IMAPConnectionManager } from '@/lib/imap/connection-manager';

describe('IMAP persistence concurrency', () => {
  it('queues overlapping fetches for one account behind the active fetch loop', async () => {
    const manager = new IMAPConnectionManager();
    const client = {
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

    let resolveFirstPersistence: (() => void) | undefined;
    let firstPersistenceStarted: (() => void) | undefined;
    const firstPersistenceHasStarted = new Promise<void>((resolve) => {
      firstPersistenceStarted = resolve;
    });
    let persistenceCalls = 0;
    jest.spyOn(manager as any, 'persistEmail').mockImplementation(() => {
      persistenceCalls += 1;
      if (persistenceCalls !== 1) return Promise.resolve(true);

      firstPersistenceStarted?.();
      return new Promise<boolean>((resolve) => {
        resolveFirstPersistence = () => resolve(true);
      });
    });

    const firstFetch = (manager as any).fetchNewEmails('account-1', 1, 1);
    await firstPersistenceHasStarted;
    const secondFetch = (manager as any).fetchNewEmails('account-1', 2, 2);
    await new Promise((resolve) => setImmediate(resolve));

    try {
      expect(client.fetch).toHaveBeenCalledTimes(1);
      expect(persistenceCalls).toBe(1);
    } finally {
      resolveFirstPersistence?.();
      await Promise.all([firstFetch, secondFetch]);
    }

    expect(client.fetch).toHaveBeenCalledTimes(2);
    expect(persistenceCalls).toBe(2);
  });

  it('limits persistence to the configured concurrency', async () => {
    const manager = new IMAPConnectionManager();
    const client = {
      fetch: async function* () {
        yield { uid: 1 };
        yield { uid: 2 };
        yield { uid: 3 };
        yield { uid: 4 };
      },
    };

    (manager as any).connections.set('account-1', {
      accountId: 'account-1',
      organizationId: 'org-1',
      client,
      isConnected: true,
      reconnectAttempts: 0,
    });

    let activePersistences = 0;
    let maxConcurrentPersistences = 0;
    jest.spyOn(manager as any, 'persistEmail').mockImplementation(async () => {
      activePersistences += 1;
      maxConcurrentPersistences = Math.max(maxConcurrentPersistences, activePersistences);
      await new Promise((resolve) => setImmediate(resolve));
      activePersistences -= 1;
      return true;
    });

    await expect((manager as any).fetchNewEmails('account-1', 1, 4)).resolves.toEqual({
      processed: 4,
      failed: 0,
    });

    expect(maxConcurrentPersistences).toBe(2);
  });
});
