jest.mock('@/lib/auth/middleware', () => ({
  authenticate: jest.fn(),
  apiResponse: (data: unknown, status = 200) =>
    Response.json(data, { status }),
  apiError: (message: string, status = 400) =>
    Response.json({ error: message }, { status }),
  requireAdmin: jest.fn((auth: { role: string }) =>
    auth.role !== 'admin'
      ? Response.json({ error: 'Admin access required' }, { status: 403 })
      : null
  ),
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    label: {
      findFirst: jest.fn(),
    },
    emailAccount: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/activity/log', () => ({
  logActivity: jest.fn(),
}));

import type { NextRequest } from 'next/server';
import { PUT } from '@/app/api/labels/[id]/accounts/route';
import { authenticate } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';
import { logActivity } from '@/lib/activity/log';

const mockAuthenticate = authenticate as jest.Mock;
const mockFindLabel = prisma.label.findFirst as jest.Mock;
const mockFindAccounts = prisma.emailAccount.findMany as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;
const mockLogActivity = logActivity as jest.Mock;

function createRequest(accountIds: string[]): NextRequest {
  return new Request('http://localhost/api/labels/label-1/accounts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountIds }),
  }) as NextRequest;
}

function createTransactionClient(
  initialAccountIds: string[] = [],
  accessibleAccountIds: string[] = initialAccountIds
) {
  const assignments = new Set(initialAccountIds);

  return {
    assignments,
    accountLabel: {
      deleteMany: jest.fn().mockImplementation(
        async ({ where }: { where: { account?: unknown } }) => {
          const accountIdsToDelete = where.account
            ? accessibleAccountIds
            : [...assignments];

          accountIdsToDelete.forEach((accountId) => assignments.delete(accountId));
          return { count: accountIdsToDelete.length };
        }
      ),
      createMany: jest.fn().mockImplementation(
        async ({ data }: { data: Array<{ accountId: string }> }) => {
          data.forEach(({ accountId }) => assignments.add(accountId));
          return { count: data.length };
        }
      ),
    },
  };
}

describe('PUT /api/labels/[id]/accounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindLabel.mockResolvedValue({ id: 'label-1', name: 'Shared' });
  });

  it('allows a member to assign a label to accounts they can access', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });
    mockFindAccounts.mockResolvedValue([
      { id: '11111111-1111-4111-8111-111111111111' },
      { id: '22222222-2222-4222-8222-222222222222' },
    ]);

    const tx = createTransactionClient();
    mockTransaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx)
    );

    const response = await PUT(createRequest([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]), { params: Promise.resolve({ id: 'label-1' }) });

    expect(response.status).toBe(200);
    expect(mockFindAccounts).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        id: {
          in: [
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222',
          ],
        },
        OR: [
          { ownerUserId: 'member-1' },
          { memberAccess: { some: { userId: 'member-1' } } },
        ],
      },
      select: { id: true },
    });
    expect(tx.accountLabel.deleteMany).toHaveBeenCalledWith({
      where: {
        labelId: 'label-1',
        account: {
          organizationId: 'org-1',
          OR: [
            { ownerUserId: 'member-1' },
            { memberAccess: { some: { userId: 'member-1' } } },
          ],
        },
      },
    });
    expect(tx.accountLabel.createMany).toHaveBeenCalledWith({
      data: [
        {
          accountId: '11111111-1111-4111-8111-111111111111',
          labelId: 'label-1',
        },
        {
          accountId: '22222222-2222-4222-8222-222222222222',
          labelId: 'label-1',
        },
      ],
    });
    expect(mockLogActivity).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'member-1',
      action: 'label_accounts_updated',
      metadata: {
        labelId: 'label-1',
        labelName: 'Shared',
        accountIds: [
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
        ],
      },
    });
  });

  it('rejects a member request that includes an inaccessible account id', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });
    mockFindAccounts.mockResolvedValue([
      { id: '11111111-1111-4111-8111-111111111111' },
    ]);

    const response = await PUT(createRequest([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]), { params: Promise.resolve({ id: 'label-1' }) });

    expect(response.status).toBe(403);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('preserves hidden label assignments when a member replaces visible assignments', async () => {
    const previousVisibleAccountId = '11111111-1111-4111-8111-111111111111';
    const nextVisibleAccountId = '22222222-2222-4222-8222-222222222222';
    const hiddenAccountId = '33333333-3333-4333-8333-333333333333';

    mockAuthenticate.mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });
    mockFindAccounts.mockResolvedValue([{ id: nextVisibleAccountId }]);

    const tx = createTransactionClient(
      [previousVisibleAccountId, hiddenAccountId],
      [previousVisibleAccountId, nextVisibleAccountId]
    );
    mockTransaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx)
    );

    const response = await PUT(createRequest([nextVisibleAccountId]), {
      params: Promise.resolve({ id: 'label-1' }),
    });

    expect(response.status).toBe(200);
    expect([...tx.assignments].sort()).toEqual(
      [nextVisibleAccountId, hiddenAccountId].sort()
    );
  });

  it('rejects a cross-organization account id even for an admin', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'admin-1',
      organizationId: 'org-1',
      role: 'admin',
    });
    mockFindAccounts.mockResolvedValue([
      { id: '11111111-1111-4111-8111-111111111111' },
    ]);

    const response = await PUT(createRequest([
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
    ]), { params: Promise.resolve({ id: 'label-1' }) });

    expect(response.status).toBe(403);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('keeps admin assignment organization-wide for in-org accounts', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'admin-1',
      organizationId: 'org-1',
      role: 'admin',
    });
    mockFindAccounts.mockResolvedValue([
      { id: '11111111-1111-4111-8111-111111111111' },
      { id: '22222222-2222-4222-8222-222222222222' },
    ]);

    const tx = createTransactionClient();
    mockTransaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx)
    );

    const response = await PUT(createRequest([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ]), { params: Promise.resolve({ id: 'label-1' }) });

    expect(response.status).toBe(200);
    expect(mockFindAccounts).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        id: {
          in: [
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222',
          ],
        },
      },
      select: { id: true },
    });
    expect(tx.accountLabel.deleteMany).toHaveBeenCalledWith({
      where: { labelId: 'label-1' },
    });
  });
});
