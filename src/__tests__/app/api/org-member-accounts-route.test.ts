jest.mock('@/lib/auth/middleware', () => ({
  authenticate: jest.fn(),
  requireAdmin: jest.fn(),
  apiResponse: (data: unknown, status = 200) =>
    Response.json(data, { status }),
  apiError: (message: string, status = 400) =>
    Response.json({ error: message }, { status }),
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailAccount: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import type { NextRequest } from 'next/server';
import { PUT } from '@/app/api/org/members/[userId]/accounts/route';
import { authenticate, requireAdmin } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';

const mockAuthenticate = authenticate as jest.Mock;
const mockRequireAdmin = requireAdmin as jest.Mock;
const mockFindAccounts = prisma.emailAccount.findMany as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

function createRequest(body: Record<string, unknown>): NextRequest {
  return new Request('http://localhost/api/org/members/member-1/accounts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe('PUT /api/org/members/[userId]/accounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticate.mockResolvedValue({
      userId: 'admin-1',
      organizationId: 'org-1',
      role: 'admin',
    });
    mockRequireAdmin.mockReturnValue(null);
  });

  it('keeps mandatory owner access even when the owner account is omitted from requested accountIds', async () => {
    const sharedAccountId = '11111111-1111-4111-8111-111111111111';
    const ownedAccountId = '22222222-2222-4222-8222-222222222222';

    mockFindAccounts
      .mockResolvedValueOnce([{ id: sharedAccountId }])
      .mockResolvedValueOnce([{ id: ownedAccountId }]);

    const tx = {
      memberEmailAccountAccess: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };

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
        accountId: { notIn: [ownedAccountId] },
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
