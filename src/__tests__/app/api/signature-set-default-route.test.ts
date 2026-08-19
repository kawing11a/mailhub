jest.mock('@/lib/auth/middleware', () => ({
  authenticate: jest.fn(),
  apiResponse: (data: unknown, status = 200) =>
    Response.json(data, { status }),
  apiError: (message: string, status = 400) =>
    Response.json({ error: message }, { status }),
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    signature: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import type { NextRequest } from 'next/server';
import { POST } from '@/app/api/signatures/[id]/set-default/route';
import { authenticate } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';

const mockAuthenticate = authenticate as jest.Mock;
const mockSignatureFindFirst = prisma.signature.findFirst as jest.Mock;
const mockSignatureFindUnique = prisma.signature.findUnique as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

const memberAccessWhere = {
  organizationId: 'org-1',
  OR: [
    { ownerUserId: 'member-1' },
    { memberAccess: { some: { userId: 'member-1' } } },
  ],
};

function createRequest(): NextRequest {
  return new Request('http://localhost/api/signatures/sig-1/set-default', {
    method: 'POST',
  }) as NextRequest;
}

describe('POST /api/signatures/[id]/set-default', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lets an admin set a same-organization signature as default via accountAccessWhere(auth)', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'admin-1',
      organizationId: 'org-1',
      role: 'admin',
    });
    mockSignatureFindFirst.mockResolvedValue({
      id: 'sig-1',
      accountId: 'account-1',
    });

    const updatedSignature = {
      id: 'sig-1',
      accountId: 'account-1',
      isDefault: true,
    };
    const tx = {
      signature: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue(updatedSignature),
      },
    };
    mockTransaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx)
    );

    const response = await POST(createRequest(), {
      params: Promise.resolve({ id: 'sig-1' }),
    });

    expect(response.status).toBe(200);
    expect(mockSignatureFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'sig-1',
          account: { organizationId: 'org-1' },
        },
      })
    );
    expect(tx.signature.updateMany).toHaveBeenCalledWith({
      where: { accountId: 'account-1' },
      data: { isDefault: false },
    });
    expect(tx.signature.update).toHaveBeenCalledWith({
      where: { id: 'sig-1' },
      data: { isDefault: true },
    });
  });

  it('hides an inaccessible same-organization signature behind a 404', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });
    mockSignatureFindFirst.mockResolvedValue(null);
    mockSignatureFindUnique.mockResolvedValue({
      account: { organizationId: 'org-1' },
    });

    const response = await POST(createRequest(), {
      params: Promise.resolve({ id: 'sig-1' }),
    });

    expect(response.status).toBe(404);
    expect(mockSignatureFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'sig-1',
          account: memberAccessWhere,
        },
      })
    );
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('preserves the existing 403 contract for a cross-organization signature', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });
    mockSignatureFindFirst.mockResolvedValue(null);
    mockSignatureFindUnique.mockResolvedValue({
      account: { organizationId: 'org-2' },
    });

    const response = await POST(createRequest(), {
      params: Promise.resolve({ id: 'sig-2' }),
    });

    expect(response.status).toBe(403);
    expect(mockSignatureFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'sig-2',
          account: memberAccessWhere,
        },
      })
    );
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
