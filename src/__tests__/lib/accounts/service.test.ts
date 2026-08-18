jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailAccount: {
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/crypto', () => ({
  encrypt: jest.fn((value: string) => `encrypted:${value}`),
  decrypt: jest.fn(),
}));

import { prisma } from '@/lib/db/prisma';
import { createAccount, createOwnedAccount } from '@/lib/accounts/service';

const mockCount = prisma.emailAccount.count as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

describe('account service ownership creation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
