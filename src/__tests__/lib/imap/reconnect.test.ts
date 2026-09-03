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

jest.mock('@/lib/network/outbound-host', () => ({
  resolveSafeOutboundHost: jest.fn().mockResolvedValue({ address: '127.0.0.1' }),
}));

jest.mock('imapflow', () => ({ ImapFlow: jest.fn() }));
jest.mock('@/lib/redis', () => ({ redis: { publish: jest.fn() } }));
jest.mock('@/lib/queue/client', () => ({ searchQueue: { add: jest.fn() } }));
jest.mock('@/lib/ai/spam-checker', () => ({ checkIsHighRisk: jest.fn() }));
jest.mock('@/lib/rules/engine', () => ({ processRulesForNewEmail: jest.fn() }));
jest.mock('@/lib/runtime-config', () => ({
  runtimeConfig: {
    emailPersistConcurrency: 1,
    imapReconcileIntervalMs: 60_000,
  },
}));

import { prisma } from '@/lib/db/prisma';
import { IMAPConnectionManager } from '@/lib/imap/connection-manager';
import { resolveSafeOutboundHost } from '@/lib/network/outbound-host';
import { ImapFlow } from 'imapflow';

type EventHandler = (...args: any[]) => void | Promise<void>;

function createClient() {
  const handlers = new Map<string, EventHandler[]>();

  return {
    connect: jest.fn().mockResolvedValue(undefined),
    logout: jest.fn().mockResolvedValue(undefined),
    getMailboxLock: jest.fn().mockResolvedValue({ release: jest.fn() }),
    search: jest.fn().mockResolvedValue([]),
    on: jest.fn((event: string, handler: EventHandler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    }),
    emit: async (event: string, ...args: any[]) => {
      for (const handler of handlers.get(event) ?? []) {
        await handler(...args);
      }
    },
  };
}

const account = {
  id: 'account-1',
  organizationId: 'organization-1',
  emailAddress: 'account@example.test',
  username: 'account@example.test',
  imapHost: 'imap.example.test',
  imapPort: 993,
  imapSecure: true,
  passwordEncrypted: 'encrypted-password',
  oauthAccessToken: null,
  oauthRefreshToken: null,
  oauthProvider: null,
  oauthTokenExpiry: null,
  provider: 'imap',
  isActive: true,
  initialSyncCompletedAt: new Date('2026-08-26T00:00:00.000Z'),
} as any;

describe('IMAP reconnect and reconciliation lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reconnects after an IMAP error event', async () => {
    const manager = new IMAPConnectionManager();
    const client = createClient();
    (prisma.emailAccount.findUnique as jest.Mock).mockResolvedValue(null);

    await (manager as any).registerConnection(account, client, 0);
    await client.emit('error', new Error('socket reset'));

    await jest.advanceTimersByTimeAsync(1_000);

    expect(prisma.emailAccount.findUnique).toHaveBeenCalledWith({
      where: { id: 'account-1' },
    });
  });

  it('replaces an auth-failed disconnected entry when reauthorization initializes the account again', async () => {
    const manager = new IMAPConnectionManager();
    const staleClient = createClient();
    const releaseIdle = jest.fn();
    const reconnectTimer = setTimeout(() => undefined, 60_000);
    const reconciliationTimer = setInterval(() => undefined, 60_000);
    (manager as any).connections.set('account-1', {
      accountId: 'account-1',
      organizationId: 'organization-1',
      client: staleClient,
      isConnected: false,
      reconnectAttempts: 0,
      reconnectTimer,
      reconciliationTimer,
      idleLock: { release: releaseIdle },
    });

    const refreshedClient = createClient();
    (ImapFlow as unknown as jest.Mock).mockImplementation(() => refreshedClient);

    await manager.initializeAccount(account);

    expect(refreshedClient.connect).toHaveBeenCalledTimes(1);
    expect(staleClient.logout).toHaveBeenCalledTimes(1);
    expect(releaseIdle).toHaveBeenCalledTimes(1);
    expect(manager.getStatus()).toEqual([{ accountId: 'account-1', isConnected: true }]);
  });

  it('uses one reconnect attempt when error and close are both emitted', async () => {
    const manager = new IMAPConnectionManager();
    const client = createClient();
    (prisma.emailAccount.findUnique as jest.Mock).mockResolvedValue(null);

    await (manager as any).registerConnection(account, client, 0);
    await client.emit('error', new Error('socket reset'));
    await jest.advanceTimersByTimeAsync(500);
    await client.emit('close');
    await client.emit('error', new Error('socket reset again'));

    await jest.advanceTimersByTimeAsync(500);

    expect(prisma.emailAccount.findUnique).toHaveBeenCalledTimes(1);
  });

  it('ignores a reconnect timer from a replaced connection entry', async () => {
    const manager = new IMAPConnectionManager();
    const client = createClient();

    await (manager as any).registerConnection(account, client, 0);
    await client.emit('error', new Error('socket reset'));
    (manager as any).connections.set('account-1', {
      accountId: 'account-1',
      organizationId: 'organization-1',
      client: createClient(),
      isConnected: true,
      reconnectAttempts: 0,
    });

    await jest.advanceTimersByTimeAsync(1_000);

    expect(prisma.emailAccount.findUnique).not.toHaveBeenCalled();
  });

  it('clears reconnect and reconciliation timers when an account is destroyed', async () => {
    const manager = new IMAPConnectionManager();
    const client = createClient();

    await (manager as any).registerConnection(account, client, 0);
    expect(jest.getTimerCount()).toBe(1);

    await client.emit('close');
    expect(jest.getTimerCount()).toBe(2);

    await manager.destroyAccount('account-1');

    expect(jest.getTimerCount()).toBe(0);
  });

  it('starts reconciliation only after initial sync has completed', async () => {
    const manager = new IMAPConnectionManager();
    const client = createClient();
    const pendingInitialSyncAccount = { ...account, initialSyncCompletedAt: null };

    await (manager as any).registerConnection(pendingInitialSyncAccount, client, 0);
    expect(jest.getTimerCount()).toBe(0);

    manager.enableReconciliation('account-1');

    expect(jest.getTimerCount()).toBe(1);
  });

  it('reconciles the current watermark on the existing connection without overlapping runs', async () => {
    const manager = new IMAPConnectionManager();
    const client = createClient();
    const lastSyncedAt = new Date('2026-08-26T12:00:00.000Z');
    let resolveSearch: ((uids: number[]) => void) | undefined;
    const searchStarted = new Promise<void>((resolve) => {
      client.search.mockImplementationOnce(() =>
        new Promise<number[]>((searchResolve) => {
          resolveSearch = searchResolve;
          resolve();
        })
      );
    });
    (prisma.emailAccount.findUnique as jest.Mock).mockResolvedValue({ lastSyncedAt });

    await (manager as any).registerConnection(account, client, 0);
    const firstRun = (manager as any).reconcileInbox('account-1');
    await searchStarted;
    const overlappingRun = (manager as any).reconcileInbox('account-1');

    expect(client.search).toHaveBeenCalledWith(
      { since: new Date('2026-08-25T12:00:00.000Z') },
      { uid: true }
    );
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.search).toHaveBeenCalledTimes(1);

    resolveSearch?.([]);
    await Promise.all([firstRun, overlappingRun]);
  });

  it('advances the reconciliation cursor and only replays the bounded overlap', async () => {
    const manager = new IMAPConnectionManager();
    const client = createClient();
    const cutoff = new Date('2026-08-26T12:00:00.000Z');
    let storedCursor: Date | null = null;
    jest.setSystemTime(cutoff);
    client.search.mockResolvedValue([101]);
    (prisma.emailAccount.findUnique as jest.Mock).mockImplementation(async () => ({
      lastSyncedAt: storedCursor,
    }));
    (prisma.emailAccount.update as jest.Mock).mockImplementation(async ({ data }) => {
      storedCursor = data.lastSyncedAt;
      return { id: 'account-1', lastSyncedAt: storedCursor };
    });

    await (manager as any).registerConnection(account, client, 0);
    const fetch = jest
      .spyOn(manager as any, 'fetchNewEmailsForAccount')
      .mockResolvedValue({ processed: 1, failed: 0 });

    await (manager as any).reconcileInbox('account-1');
    await (manager as any).reconcileInbox('account-1');

    expect(prisma.emailAccount.update).toHaveBeenCalledWith({
      where: { id: 'account-1' },
      data: { lastSyncedAt: cutoff },
    });
    expect(client.search).toHaveBeenNthCalledWith(
      2,
      { since: new Date('2026-08-25T12:00:00.000Z') },
      { uid: true }
    );
    expect(fetch).toHaveBeenCalledWith('account-1', [101], undefined, 'INBOX', true);
  });

  it('restores a disconnected entry and schedules another retry after DNS resolution fails', async () => {
    const manager = new IMAPConnectionManager();
    const client = createClient();
    (prisma.emailAccount.findUnique as jest.Mock).mockResolvedValue(account);
    (resolveSafeOutboundHost as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('getaddrinfo EAI_AGAIN imap.example.test'), { code: 'EAI_AGAIN' })
    );

    await (manager as any).registerConnection(account, client, 0);
    await client.emit('error', new Error('socket reset'));
    await jest.advanceTimersByTimeAsync(1_000);

    expect(manager.getStatus()).toEqual([{ accountId: 'account-1', isConnected: false }]);
    expect(jest.getTimerCount()).toBe(2);
  });
});
