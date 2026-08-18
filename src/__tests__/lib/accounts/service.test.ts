jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailAccount: {
      count: jest.fn(),
      findFirst: jest.fn(),
    },
    email: {
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/crypto', () => ({
  encrypt: jest.fn((value: string) => `encrypted:${value}`),
  decrypt: jest.fn(),
}));

jest.mock('@/lib/network/outbound-host', () => ({
  resolveSafeOutboundHost: jest.fn(),
}));

import { prisma } from '@/lib/db/prisma';
import {
  createAccount,
  createOwnedAccount,
  getAccountStats,
  sanitizeAccount,
} from '@/lib/accounts/service';
import { resolveSafeOutboundHost } from '@/lib/network/outbound-host';

const mockCount = prisma.emailAccount.count as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;
const mockResolveHost = resolveSafeOutboundHost as jest.Mock;

describe('account service ownership creation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveHost.mockResolvedValue({
      address: '93.184.216.34',
      family: 4,
      servername: 'mail.example.com',
    });
  });

  it('persists declared OAuth fields when creating an owned OAuth account', async () => {
    const expiry = new Date('2026-08-18T09:30:00.000Z');
    const createdAccount = {
      id: 'account-oauth-1',
      organizationId: 'org-1',
      ownerUserId: 'user-1',
      label: 'Support Inbox',
      emailAddress: 'support@example.com',
      provider: 'gmail',
      color: '#10B981',
      avatarInitials: 'SI',
      isActive: true,
      lastSyncedAt: null,
      initialSyncCompletedAt: null,
      workerPartition: 'worker-1',
      imapHost: 'imap.gmail.com',
      imapPort: 993,
      imapSecure: true,
      smtpHost: 'smtp.gmail.com',
      smtpPort: 465,
      smtpSecure: true,
      username: null,
      passwordEncrypted: null,
      oauthProvider: 'google',
      oauthAccessToken: 'encrypted:access-token',
      oauthRefreshToken: 'encrypted:refresh-token',
      oauthTokenExpiry: expiry,
      createdAt: new Date('2026-08-18T09:00:00.000Z'),
      updatedAt: new Date('2026-08-18T09:00:00.000Z'),
      authError: null,
    };

    const tx = {
      emailAccount: {
        create: jest.fn().mockResolvedValue(createdAccount),
      },
      memberEmailAccountAccess: {
        create: jest.fn().mockResolvedValue({
          organizationId: 'org-1',
          userId: 'user-1',
          accountId: 'account-oauth-1',
        }),
      },
    };

    mockTransaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx)
    );

    const result = await createOwnedAccount('org-1', 'user-1', {
      label: 'Support Inbox',
      emailAddress: 'support@example.com',
      provider: 'gmail',
      color: '#10B981',
      avatarInitials: 'SI',
      imapHost: 'imap.gmail.com',
      imapPort: 993,
      smtpHost: 'smtp.gmail.com',
      smtpPort: 465,
      passwordEncrypted: null,
      workerPartition: 'worker-1',
      oauthProvider: 'google',
      oauthAccessToken: 'encrypted:access-token',
      oauthRefreshToken: 'encrypted:refresh-token',
      oauthTokenExpiry: expiry,
    });

    expect(tx.emailAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        ownerUserId: 'user-1',
        label: 'Support Inbox',
        emailAddress: 'support@example.com',
        provider: 'gmail',
        color: '#10B981',
        avatarInitials: 'SI',
        oauthProvider: 'google',
        oauthAccessToken: 'encrypted:access-token',
        oauthRefreshToken: 'encrypted:refresh-token',
        oauthTokenExpiry: expiry,
        passwordEncrypted: null,
        workerPartition: 'worker-1',
      }),
    });

    expect(tx.memberEmailAccountAccess.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        userId: 'user-1',
        accountId: 'account-oauth-1',
      },
    });

    expect(result).toBe(createdAccount);
  });

  it('creates the owned account and mandatory owner access in one transaction', async () => {
    mockCount.mockResolvedValue(0);

    const createdAccount = {
      id: 'account-1',
      organizationId: 'org-1',
      ownerUserId: 'user-1',
      label: 'Support Team',
      emailAddress: 'support@example.com',
      provider: 'imap',
      color: '#10B981',
      avatarInitials: 'ST',
      isActive: true,
      lastSyncedAt: null,
      initialSyncCompletedAt: null,
      workerPartition: 'worker-1',
      imapHost: 'imap.example.com',
      imapPort: 993,
      imapSecure: true,
      smtpHost: 'smtp.example.com',
      smtpPort: 465,
      smtpSecure: true,
      username: 'support@example.com',
      passwordEncrypted: 'encrypted:secret',
      oauthProvider: null,
      oauthAccessToken: null,
      oauthRefreshToken: null,
      oauthTokenExpiry: null,
      createdAt: new Date('2026-08-18T09:00:00.000Z'),
      updatedAt: new Date('2026-08-18T09:00:00.000Z'),
      authError: null,
    };

    const tx = {
      emailAccount: {
        create: jest.fn().mockResolvedValue(createdAccount),
      },
      memberEmailAccountAccess: {
        create: jest.fn().mockResolvedValue({
          organizationId: 'org-1',
          userId: 'user-1',
          accountId: 'account-1',
        }),
      },
    };

    mockTransaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx)
    );

    const result = await createAccount('org-1', 'user-1', {
      label: 'Support Team',
      emailAddress: 'support@example.com',
      provider: 'imap',
      imapHost: 'imap.example.com',
      imapPort: 993,
      imapSecure: true,
      smtpHost: 'smtp.example.com',
      smtpPort: 465,
      smtpSecure: true,
      username: 'support@example.com',
      password: 'secret',
    });

    expect(tx.emailAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        ownerUserId: 'user-1',
        color: '#10B981',
        avatarInitials: 'ST',
        workerPartition: 'worker-1',
        passwordEncrypted: 'encrypted:secret',
      }),
    });

    expect(tx.memberEmailAccountAccess.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        userId: 'user-1',
        accountId: 'account-1',
      },
    });

    expect(result).toBe(createdAccount);
  });

  it('rejects an unsafe custom account before database reads or persistence', async () => {
    mockResolveHost.mockRejectedValue(
      new Error('imap.internal resolves to a non-public address')
    );

    await expect(
      createAccount('org-1', 'user-1', {
        label: 'Unsafe',
        emailAddress: 'unsafe@example.com',
        provider: 'imap',
        imapHost: 'imap.internal',
        imapPort: 993,
        smtpHost: 'smtp.internal',
        smtpPort: 465,
        username: 'unsafe@example.com',
        password: 'secret',
      })
    ).rejects.toThrow('resolves to a non-public address');

    expect(mockCount).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('removes ownerUserId and encrypted credentials from sanitized account responses', () => {
    const sanitized = sanitizeAccount({
      id: 'account-1',
      organizationId: 'org-1',
      ownerUserId: 'user-1',
      label: 'Support Team',
      emailAddress: 'support@example.com',
      provider: 'imap',
      color: '#10B981',
      avatarInitials: 'ST',
      isActive: true,
      lastSyncedAt: null,
      initialSyncCompletedAt: null,
      workerPartition: 'worker-1',
      imapHost: 'imap.example.com',
      imapPort: 993,
      imapSecure: true,
      smtpHost: 'smtp.example.com',
      smtpPort: 465,
      smtpSecure: true,
      username: 'support@example.com',
      passwordEncrypted: 'encrypted:secret',
      oauthProvider: 'google',
      oauthAccessToken: 'encrypted:access-token',
      oauthRefreshToken: 'encrypted:refresh-token',
      oauthTokenExpiry: new Date('2026-08-18T09:00:00.000Z'),
      createdAt: new Date('2026-08-18T09:00:00.000Z'),
      updatedAt: new Date('2026-08-18T09:00:00.000Z'),
      authError: null,
    });

    expect(sanitized).not.toHaveProperty('ownerUserId');
    expect(sanitized).not.toHaveProperty('passwordEncrypted');
    expect(sanitized).not.toHaveProperty('oauthAccessToken');
    expect(sanitized).not.toHaveProperty('oauthRefreshToken');
  });

  it('scopes unified account statistics to the member accessible accounts', async () => {
    (prisma.email.count as jest.Mock)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(5);
    (prisma.emailAccount.findFirst as jest.Mock).mockResolvedValue({
      lastSyncedAt: new Date('2026-08-18T12:00:00.000Z'),
    });

    const stats = await getAccountStats('all', {
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });

    const accessibleAccount = {
      organizationId: 'org-1',
      OR: [
        { ownerUserId: 'member-1' },
        { memberAccess: { some: { userId: 'member-1' } } },
      ],
    };
    expect(prisma.email.count).toHaveBeenNthCalledWith(1, {
      where: { account: accessibleAccount, folder: 'INBOX', isRead: false },
    });
    expect(prisma.email.count).toHaveBeenNthCalledWith(2, {
      where: { account: accessibleAccount },
    });
    expect(prisma.emailAccount.findFirst).toHaveBeenCalledWith({
      where: accessibleAccount,
      orderBy: { lastSyncedAt: 'desc' },
      select: { lastSyncedAt: true },
    });
    expect(stats).toEqual({
      unreadCount: 2,
      totalCount: 5,
      lastSyncedAt: new Date('2026-08-18T12:00:00.000Z'),
    });
  });
});
