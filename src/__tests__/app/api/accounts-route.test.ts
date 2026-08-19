jest.mock('@/lib/auth/middleware', () => ({
  authenticate: jest.fn(),
  apiResponse: (data: unknown, status = 200) =>
    Response.json(data, { status }),
  apiError: (message: string, status = 400) =>
    Response.json({ error: message }, { status }),
  requireAdmin: jest.fn(),
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailAccount: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

import type { NextRequest } from 'next/server';
import { GET as getAccounts } from '@/app/api/accounts/route';
import { GET as getAccountById } from '@/app/api/accounts/[id]/route';
import { authenticate } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';

const mockAuthenticate = authenticate as jest.Mock;
const mockFindMany = prisma.emailAccount.findMany as jest.Mock;
const mockFindFirst = prisma.emailAccount.findFirst as jest.Mock;

describe('accounts routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticate.mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });
  });

  it('filters the account list by member visibility and returns access metadata without credentials', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'account-1',
        label: 'Owned',
        emailAddress: 'owned@example.com',
        provider: 'imap',
        color: '#10B981',
        avatarInitials: 'OW',
        isActive: true,
        authError: null,
        lastSyncedAt: null,
        createdAt: new Date('2026-08-18T10:00:00.000Z'),
        owner: { userId: 'member-1' },
        favouritedBy: [{ sortOrder: 0 }],
      },
      {
        id: 'account-2',
        label: 'Shared',
        emailAddress: 'shared@example.com',
        provider: 'imap',
        color: '#3B82F6',
        avatarInitials: 'SH',
        isActive: true,
        authError: null,
        lastSyncedAt: null,
        createdAt: new Date('2026-08-18T10:05:00.000Z'),
        owner: { userId: 'admin-1' },
        favouritedBy: [],
      },
    ]);

    const response = await getAccounts(
      new Request('http://localhost/api/accounts') as NextRequest
    );

    expect(response.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-1',
          OR: [
            { ownerUserId: 'member-1' },
            { memberAccess: { some: { userId: 'member-1' } } },
          ],
        },
        select: expect.objectContaining({
          owner: { select: { userId: true } },
        }),
      })
    );

    const body = await response.json();
    expect(body).toEqual([
      expect.objectContaining({
        id: 'account-1',
        canManageAccess: true,
        isFavourite: true,
        sortOrder: 0,
      }),
      expect.objectContaining({
        id: 'account-2',
        canManageAccess: false,
        isFavourite: false,
        sortOrder: null,
      }),
    ]);
    expect(body[0]).not.toHaveProperty('passwordEncrypted');
    expect(body[0]).not.toHaveProperty('oauthAccessToken');
    expect(body[0]).not.toHaveProperty('oauthRefreshToken');
    for (const account of body) {
      expect(account).not.toHaveProperty('ownerUserId');
      expect(account).not.toHaveProperty('owner');
    }
  });

  it('returns 404 for an inaccessible account using the same visibility predicate', async () => {
    mockFindFirst.mockResolvedValue(null);

    const response = await getAccountById(
      new Request('http://localhost/api/accounts/account-2') as NextRequest,
      { params: Promise.resolve({ id: 'account-2' }) }
    );

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'account-2',
        organizationId: 'org-1',
        OR: [
          { ownerUserId: 'member-1' },
          { memberAccess: { some: { userId: 'member-1' } } },
        ],
      },
    });
    expect(response.status).toBe(404);
  });

  it('sanitizes the account detail response and does not expose ownerUserId', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'account-1',
      organizationId: 'org-1',
      ownerUserId: 'member-1',
      label: 'Owned',
      emailAddress: 'owned@example.com',
      provider: 'imap',
      color: '#10B981',
      avatarInitials: 'OW',
      isActive: true,
      authError: null,
      lastSyncedAt: null,
      initialSyncCompletedAt: null,
      workerPartition: 'worker-1',
      imapHost: 'imap.example.com',
      imapPort: 993,
      imapSecure: true,
      smtpHost: 'smtp.example.com',
      smtpPort: 465,
      smtpSecure: true,
      username: 'owned@example.com',
      passwordEncrypted: 'encrypted:secret',
      oauthProvider: 'google',
      oauthAccessToken: 'encrypted:access-token',
      oauthRefreshToken: 'encrypted:refresh-token',
      oauthTokenExpiry: new Date('2026-08-18T10:00:00.000Z'),
      createdAt: new Date('2026-08-18T10:00:00.000Z'),
      updatedAt: new Date('2026-08-18T10:00:00.000Z'),
    });

    const response = await getAccountById(
      new Request('http://localhost/api/accounts/account-1') as NextRequest,
      { params: Promise.resolve({ id: 'account-1' }) }
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).not.toHaveProperty('ownerUserId');
    expect(body).not.toHaveProperty('passwordEncrypted');
    expect(body).not.toHaveProperty('oauthAccessToken');
    expect(body).not.toHaveProperty('oauthRefreshToken');
  });
});
