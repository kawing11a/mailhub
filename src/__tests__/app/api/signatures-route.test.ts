jest.mock('@/lib/auth/middleware', () => ({
  authenticate: jest.fn(),
  apiResponse: (data: unknown, status = 200) =>
    Response.json(data, { status }),
  apiError: (message: string, status = 400) =>
    Response.json({ error: message }, { status }),
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailAccount: {
      findFirst: jest.fn(),
    },
    signature: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import type { NextRequest } from 'next/server';
import { GET as getAccountSignatures, POST as createSignature } from '@/app/api/accounts/[id]/signatures/route';
import { PATCH as updateSignature, DELETE as deleteSignature } from '@/app/api/signatures/[id]/route';
import { authenticate } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';

const mockAuthenticate = authenticate as jest.Mock;
const mockAccountFindFirst = prisma.emailAccount.findFirst as jest.Mock;
const mockSignatureFindMany = prisma.signature.findMany as jest.Mock;
const mockSignatureCount = prisma.signature.count as jest.Mock;
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

function createRequest(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  body?: Record<string, unknown>
): NextRequest {
  return new Request(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as NextRequest;
}

describe('signature routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticate.mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });
  });

  it('lets a member list signatures for an owned account through accountAccessWhere(auth, id)', async () => {
    mockAccountFindFirst.mockResolvedValue({ id: 'account-1' });
    mockSignatureFindMany.mockResolvedValue([
      {
        id: 'sig-1',
        accountId: 'account-1',
        name: 'Default',
        contentHtml: '<p>Team</p>',
        isDefault: true,
      },
    ]);

    const response = await getAccountSignatures(
      createRequest('GET', 'http://localhost/api/accounts/account-1/signatures'),
      { params: Promise.resolve({ id: 'account-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mockAccountFindFirst).toHaveBeenCalledWith({
      where: {
        ...memberAccessWhere,
        id: 'account-1',
      },
      select: { id: true },
    });
    expect(mockSignatureFindMany).toHaveBeenCalledWith({
      where: { accountId: 'account-1' },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  });

  it('returns 404 without listing signatures when a member cannot access the requested account', async () => {
    mockAccountFindFirst.mockResolvedValue(null);

    const response = await getAccountSignatures(
      createRequest('GET', 'http://localhost/api/accounts/account-2/signatures'),
      { params: Promise.resolve({ id: 'account-2' }) }
    );

    expect(response.status).toBe(404);
    expect(mockSignatureFindMany).not.toHaveBeenCalled();
  });

  it('lets a member create a signature for an owned account through accountAccessWhere(auth, id)', async () => {
    mockAccountFindFirst.mockResolvedValue({ id: 'account-1' });
    mockSignatureCount.mockResolvedValue(0);

    const createdSignature = {
      id: 'sig-1',
      accountId: 'account-1',
      name: 'Default',
      contentHtml: '<p>Team</p>',
      isDefault: true,
    };
    const tx = {
      signature: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue(createdSignature),
      },
    };
    mockTransaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx)
    );

    const response = await createSignature(
      createRequest('POST', 'http://localhost/api/accounts/account-1/signatures', {
        name: 'Default',
        contentHtml: '<p>Team</p>',
        isDefault: false,
      }),
      { params: Promise.resolve({ id: 'account-1' }) }
    );

    expect(response.status).toBe(201);
    expect(mockAccountFindFirst).toHaveBeenCalledWith({
      where: {
        ...memberAccessWhere,
        id: 'account-1',
      },
      select: { id: true },
    });
    expect(tx.signature.updateMany).toHaveBeenCalledWith({
      where: { accountId: 'account-1' },
      data: { isDefault: false },
    });
    expect(tx.signature.create).toHaveBeenCalledWith({
      data: {
        accountId: 'account-1',
        name: 'Default',
        contentHtml: '<p>Team</p>',
        isDefault: true,
      },
    });
  });

  it('hides an inaccessible same-organization signature behind a 404 on update', async () => {
    mockSignatureFindFirst.mockResolvedValue(null);
    mockSignatureFindUnique.mockResolvedValue({
      account: { organizationId: 'org-1' },
    });

    const response = await updateSignature(
      createRequest('PATCH', 'http://localhost/api/signatures/sig-1', {
        name: 'Updated',
      }),
      { params: Promise.resolve({ id: 'sig-1' }) }
    );

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

  it('preserves the existing 403 contract for a cross-organization signature update', async () => {
    mockSignatureFindFirst.mockResolvedValue(null);
    mockSignatureFindUnique.mockResolvedValue({
      account: { organizationId: 'org-2' },
    });

    const response = await updateSignature(
      createRequest('PATCH', 'http://localhost/api/signatures/sig-2', {
        name: 'Updated',
      }),
      { params: Promise.resolve({ id: 'sig-2' }) }
    );

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

  it('hides an inaccessible same-organization signature behind a 404 on delete', async () => {
    mockSignatureFindFirst.mockResolvedValue(null);
    mockSignatureFindUnique.mockResolvedValue({
      account: { organizationId: 'org-1' },
    });

    const response = await deleteSignature(
      createRequest('DELETE', 'http://localhost/api/signatures/sig-3'),
      { params: Promise.resolve({ id: 'sig-3' }) }
    );

    expect(response.status).toBe(404);
    expect(mockSignatureFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'sig-3',
          account: memberAccessWhere,
        },
      })
    );
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
