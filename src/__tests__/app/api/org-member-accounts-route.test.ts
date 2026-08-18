jest.mock('@/lib/auth/middleware', () => ({
  authenticate: jest.fn(),
  apiResponse: (data: unknown, status = 200) =>
    Response.json(data, { status }),
  apiError: (message: string, status = 400) =>
    Response.json({ error: message }, { status }),
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    organizationMember: {
      findUnique: jest.fn(),
    },
    emailAccount: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import type { NextRequest } from 'next/server';
import { PUT } from '@/app/api/org/members/[userId]/accounts/route';
import { authenticate } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';

const mockAuthenticate = authenticate as jest.Mock;
const mockFindMember = prisma.organizationMember.findUnique as jest.Mock;
const mockFindAccounts = prisma.emailAccount.findMany as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

function createRequest(body: Record<string, unknown>): NextRequest {
  return new Request('http://localhost/api/org/members/member-1/accounts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as NextRequest;
}

function createTransactionClient() {
  return {
    memberEmailAccountAccess: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe('PUT /api/org/members/[userId]/accounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticate.mockResolvedValue({
      userId: 'admin-1',
      organizationId: 'org-1',
      role: 'admin',
    });
    mockFindMember.mockResolvedValue({ userId: 'member-1' });
  });

  it('allows an account owner to grant access for accounts they own', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'owner-1',
      organizationId: 'org-1',
      role: 'member',
    });

    const ownedAccountId = '11111111-1111-4111-8111-111111111111';
    mockFindAccounts
      .mockResolvedValueOnce([
        { id: ownedAccountId, organizationId: 'org-1', ownerUserId: 'owner-1' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const tx = createTransactionClient();
    mockTransaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx)
    );

    const response = await PUT(
      createRequest({ accountIds: [ownedAccountId] }),
      { params: Promise.resolve({ userId: 'member-2' }) }
    );

    expect(response.status).toBe(200);
    expect(tx.memberEmailAccountAccess.deleteMany).not.toHaveBeenCalled();
    expect(tx.memberEmailAccountAccess.createMany).toHaveBeenCalledWith({
      data: [
        {
          organizationId: 'org-1',
          userId: 'member-2',
          accountId: ownedAccountId,
        },
      ],
    });

    const body = await response.json();
    expect(body).toEqual({
      success: true,
      accountIds: [ownedAccountId],
    });
  });

  it('allows an account owner to revoke managed grants without disclosing preserved unmanaged grants', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'owner-1',
      organizationId: 'org-1',
      role: 'member',
    });

    const ownedAccountId = '11111111-1111-4111-8111-111111111111';
    const unmanagedAccountId = '22222222-2222-4222-8222-222222222222';

    mockFindAccounts
      .mockResolvedValueOnce([
        { id: ownedAccountId, organizationId: 'org-1', ownerUserId: 'owner-1' },
        { id: unmanagedAccountId, organizationId: 'org-1', ownerUserId: 'someone-else' },
      ])
      .mockResolvedValueOnce([]);

    const tx = createTransactionClient();
    mockTransaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx)
    );

    const response = await PUT(
      createRequest({ accountIds: [] }),
      { params: Promise.resolve({ userId: 'member-2' }) }
    );

    expect(response.status).toBe(200);
    expect(tx.memberEmailAccountAccess.deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        userId: 'member-2',
        accountId: { in: [ownedAccountId] },
      },
    });
    expect(tx.memberEmailAccountAccess.createMany).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body).toEqual({
      success: true,
      accountIds: [],
    });
  });

  it('filters unmanaged current and owned accounts from a non-admin update response', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'owner-1',
      organizationId: 'org-1',
      role: 'member',
    });

    const managedAccountId = '11111111-1111-4111-8111-111111111111';
    const unmanagedAccountId = '22222222-2222-4222-8222-222222222222';
    const targetOwnedAccountId = '33333333-3333-4333-8333-333333333333';

    mockFindAccounts
      .mockResolvedValueOnce([
        { id: managedAccountId, organizationId: 'org-1', ownerUserId: 'owner-1' },
      ])
      .mockResolvedValueOnce([
        {
          id: unmanagedAccountId,
          organizationId: 'org-1',
          ownerUserId: 'someone-else',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: targetOwnedAccountId,
          organizationId: 'org-1',
          ownerUserId: 'member-2',
        },
      ]);

    const tx = createTransactionClient();
    mockTransaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx)
    );

    const response = await PUT(
      createRequest({ accountIds: [managedAccountId] }),
      { params: Promise.resolve({ userId: 'member-2' }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      success: true,
      accountIds: [managedAccountId],
    });
  });

  it('allows an owner revoke when the target owns an unrelated inaccessible account', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'owner-1',
      organizationId: 'org-1',
      role: 'member',
    });

    const managedAccountId = '11111111-1111-4111-8111-111111111111';
    const targetOwnedAccountId = '22222222-2222-4222-8222-222222222222';

    mockFindAccounts
      .mockResolvedValueOnce([
        { id: managedAccountId, organizationId: 'org-1', ownerUserId: 'owner-1' },
      ])
      .mockResolvedValueOnce([
        {
          id: targetOwnedAccountId,
          organizationId: 'org-1',
          ownerUserId: 'member-2',
        },
      ]);

    const tx = createTransactionClient();
    mockTransaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx)
    );

    const response = await PUT(
      createRequest({ accountIds: [] }),
      { params: Promise.resolve({ userId: 'member-2' }) }
    );

    expect(response.status).toBe(200);
    expect(tx.memberEmailAccountAccess.deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        userId: 'member-2',
        accountId: { in: [managedAccountId] },
      },
    });
    const body = await response.json();
    expect(body).toEqual({
      success: true,
      accountIds: [],
    });
  });

  it('rejects a non-owner member who tries to manage another member access', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'member-3',
      organizationId: 'org-1',
      role: 'member',
    });

    mockFindAccounts.mockResolvedValueOnce([
      {
        id: '11111111-1111-4111-8111-111111111111',
        organizationId: 'org-1',
        ownerUserId: 'owner-1',
      },
    ]);

    const response = await PUT(
      createRequest({ accountIds: ['11111111-1111-4111-8111-111111111111'] }),
      { params: Promise.resolve({ userId: 'member-2' }) }
    );

    expect(response.status).toBe(403);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects cross-organization account access management even for an owner id match', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'owner-1',
      organizationId: 'org-1',
      role: 'member',
    });

    mockFindAccounts.mockResolvedValueOnce([
      {
        id: '33333333-3333-4333-8333-333333333333',
        organizationId: 'org-2',
        ownerUserId: 'owner-1',
      },
    ]);

    const response = await PUT(
      createRequest({ accountIds: ['33333333-3333-4333-8333-333333333333'] }),
      { params: Promise.resolve({ userId: 'member-2' }) }
    );

    expect(response.status).toBe(403);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects an empty access update when the target keeps inaccessible current grants', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'member-3',
      organizationId: 'org-1',
      role: 'member',
    });

    mockFindAccounts
      .mockResolvedValueOnce([
        {
          id: '11111111-1111-4111-8111-111111111111',
          organizationId: 'org-1',
          ownerUserId: 'owner-1',
        },
      ])
      .mockResolvedValueOnce([]);

    const response = await PUT(
      createRequest({ accountIds: [] }),
      { params: Promise.resolve({ userId: 'member-2' }) }
    );

    expect(response.status).toBe(403);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects an empty access update when the target only owns an inaccessible account', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'member-3',
      organizationId: 'org-1',
      role: 'member',
    });

    mockFindAccounts
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: '22222222-2222-4222-8222-222222222222',
          organizationId: 'org-1',
          ownerUserId: 'member-2',
        },
      ]);

    const response = await PUT(
      createRequest({ accountIds: [] }),
      { params: Promise.resolve({ userId: 'member-2' }) }
    );

    expect(response.status).toBe(403);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects access management for a target outside the actor organization', async () => {
    mockFindMember.mockResolvedValueOnce(null);

    const response = await PUT(
      createRequest({ accountIds: [] }),
      { params: Promise.resolve({ userId: 'outside-user' }) }
    );

    expect(response.status).toBe(403);
    expect(mockFindMember).toHaveBeenCalledWith({
      where: {
        organizationId_userId: {
          organizationId: 'org-1',
          userId: 'outside-user',
        },
      },
      select: { userId: true },
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('allows an admin to revoke a mutable account grant', async () => {
    const sharedAccountId = '11111111-1111-4111-8111-111111111111';
    mockFindAccounts
      .mockResolvedValueOnce([
        { id: sharedAccountId, organizationId: 'org-1', ownerUserId: 'owner-1' },
      ])
      .mockResolvedValueOnce([]);

    const tx = createTransactionClient();
    mockTransaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx)
    );

    const response = await PUT(
      createRequest({ accountIds: [] }),
      { params: Promise.resolve({ userId: 'member-1' }) }
    );

    expect(response.status).toBe(200);
    expect(tx.memberEmailAccountAccess.deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        userId: 'member-1',
        accountId: { in: [sharedAccountId] },
      },
    });
    expect(tx.memberEmailAccountAccess.createMany).not.toHaveBeenCalled();
  });

  it('allows an admin to grant access without deleting mandatory owner access', async () => {
    const sharedAccountId = '11111111-1111-4111-8111-111111111111';
    const ownedAccountId = '22222222-2222-4222-8222-222222222222';

    mockFindAccounts
      .mockResolvedValueOnce([
        { id: sharedAccountId, organizationId: 'org-1', ownerUserId: 'admin-1' },
      ])
      .mockResolvedValueOnce([
        { id: sharedAccountId, organizationId: 'org-1', ownerUserId: 'admin-1' },
        { id: ownedAccountId, organizationId: 'org-1', ownerUserId: 'member-1' },
      ])
      .mockResolvedValueOnce([
        { id: ownedAccountId, organizationId: 'org-1', ownerUserId: 'member-1' },
      ]);

    const tx = createTransactionClient();
    mockTransaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx)
    );

    const response = await PUT(
      createRequest({ accountIds: [sharedAccountId] }),
      { params: Promise.resolve({ userId: 'member-1' }) }
    );

    expect(response.status).toBe(200);
    expect(tx.memberEmailAccountAccess.deleteMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        userId: 'member-1',
        accountId: { in: [sharedAccountId] },
      },
    });
    expect(tx.memberEmailAccountAccess.createMany).toHaveBeenCalledWith({
      data: [
        {
          organizationId: 'org-1',
          userId: 'member-1',
          accountId: sharedAccountId,
        },
      ],
    });

    const body = await response.json();
    expect(body).toEqual({
      success: true,
      accountIds: [sharedAccountId, ownedAccountId],
    });
  });
});
