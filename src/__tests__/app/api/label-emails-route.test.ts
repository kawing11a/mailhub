jest.mock('@/lib/auth/middleware', () => ({
  authenticate: jest.fn(),
  apiResponse: (data: unknown, status = 200) =>
    Response.json(data, { status }),
  apiError: (message: string, status = 400) =>
    Response.json({ error: message }, { status }),
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    label: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    accountLabel: {
      findMany: jest.fn(),
    },
    email: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    emailLabel: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    emailActivityLog: {
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/activity/log', () => ({
  logActivity: jest.fn(),
}));

import type { NextRequest } from 'next/server';
import {
  GET,
  POST as tagEmail,
  DELETE as untagEmail,
} from '@/app/api/labels/[id]/emails/route';
import { POST as bulkLabelEmails } from '@/app/api/emails/labels/route';
import { authenticate } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';

const mockAuthenticate = authenticate as jest.Mock;
const mockFindLabel = prisma.label.findUnique as jest.Mock;
const mockFindLabels = prisma.label.findMany as jest.Mock;
const mockFindAssignedAccounts = prisma.accountLabel.findMany as jest.Mock;
const mockEmailFindMany = prisma.email.findMany as jest.Mock;
const mockEmailFindFirst = prisma.email.findFirst as jest.Mock;
const mockEmailFindUnique = prisma.email.findUnique as jest.Mock;
const mockEmailLabelUpsert = prisma.emailLabel.upsert as jest.Mock;
const mockEmailLabelDeleteMany = prisma.emailLabel.deleteMany as jest.Mock;
const mockEmailLabelCreateMany = prisma.emailLabel.createMany as jest.Mock;
const mockActivityCreateMany = prisma.emailActivityLog.createMany as jest.Mock;
const mockTransaction = prisma.$transaction as jest.Mock;

function createJsonRequest(url: string, body: Record<string, unknown>): NextRequest {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe('label email routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticate.mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });
    mockFindLabel.mockResolvedValue({
      id: 'label-1',
      organizationId: 'org-1',
      name: 'Shared',
    });
  });

  it('filters label email reads by accountAccessWhere for members', async () => {
    mockFindAssignedAccounts.mockResolvedValue([
      { accountId: '11111111-1111-4111-8111-111111111111' },
    ]);
    mockEmailFindMany.mockResolvedValue([]);

    const response = await GET(
      new Request('http://localhost/api/labels/label-1/emails?page=1&limit=20') as NextRequest,
      { params: Promise.resolve({ id: 'label-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mockEmailFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          account: {
            organizationId: 'org-1',
            OR: [
              { ownerUserId: 'member-1' },
              { memberAccess: { some: { userId: 'member-1' } } },
            ],
          },
          OR: [
            { emailLabels: { some: { labelId: 'label-1' } } },
            {
              accountId: {
                in: ['11111111-1111-4111-8111-111111111111'],
              },
            },
          ],
        },
        skip: 0,
        take: 20,
      })
    );
  });

  it('rejects tagging an inaccessible email instead of using an organization-only lookup', async () => {
    mockEmailFindFirst.mockResolvedValue(null);
    mockEmailFindUnique.mockResolvedValue({
      id: 'email-1',
      accountId: '11111111-1111-4111-8111-111111111111',
      account: { organizationId: 'org-1' },
    });

    const response = await tagEmail(
      createJsonRequest('http://localhost/api/labels/label-1/emails', {
        emailId: '11111111-1111-4111-8111-111111111111',
      }),
      { params: Promise.resolve({ id: 'label-1' }) }
    );

    expect(response.status).toBe(404);
    expect(mockEmailFindFirst).toHaveBeenCalledWith({
      where: {
        id: '11111111-1111-4111-8111-111111111111',
        account: {
          organizationId: 'org-1',
          OR: [
            { ownerUserId: 'member-1' },
            { memberAccess: { some: { userId: 'member-1' } } },
          ],
        },
      },
      select: {
        id: true,
        accountId: true,
      },
    });
    expect(mockEmailLabelUpsert).not.toHaveBeenCalled();
  });

  it('rejects untagging an inaccessible email before deleting label rows', async () => {
    mockEmailFindFirst.mockResolvedValue(null);

    const response = await untagEmail(
      new Request(
        'http://localhost/api/labels/label-1/emails?emailId=11111111-1111-4111-8111-111111111111',
        { method: 'DELETE' }
      ) as NextRequest,
      { params: Promise.resolve({ id: 'label-1' }) }
    );

    expect(response.status).toBe(404);
    expect(mockEmailFindFirst).toHaveBeenCalledWith({
      where: {
        id: '11111111-1111-4111-8111-111111111111',
        account: {
          organizationId: 'org-1',
          OR: [
            { ownerUserId: 'member-1' },
            { memberAccess: { some: { userId: 'member-1' } } },
          ],
        },
      },
      select: { id: true },
    });
    expect(mockEmailLabelDeleteMany).not.toHaveBeenCalled();
  });

  it('uses accountAccessWhere so members can bulk-label owned emails', async () => {
    mockFindLabels.mockResolvedValue([
      { id: 'label-1', name: 'Shared' },
    ]);
    mockEmailFindMany.mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        accountId: '22222222-2222-4222-8222-222222222222',
      },
    ]);

    mockTransaction.mockImplementation(async (callback: (client: typeof prisma) => unknown) =>
      callback(prisma as typeof prisma)
    );
    mockEmailLabelCreateMany.mockResolvedValue({ count: 1 });
    mockActivityCreateMany.mockResolvedValue({ count: 1 });

    const response = await bulkLabelEmails(
      createJsonRequest('http://localhost/api/emails/labels', {
        emailIds: ['11111111-1111-4111-8111-111111111111'],
        addLabelIds: ['33333333-3333-4333-8333-333333333333'],
        removeLabelIds: [],
      })
    );

    expect(response.status).toBe(200);
    expect(mockEmailFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['11111111-1111-4111-8111-111111111111'] },
        account: {
          organizationId: 'org-1',
          OR: [
            { ownerUserId: 'member-1' },
            { memberAccess: { some: { userId: 'member-1' } } },
          ],
        },
      },
      select: { id: true, accountId: true },
    });
  });
});
