jest.mock('@/lib/auth/middleware', () => ({
  authenticate: jest.fn(),
  apiResponse: (data: unknown, status = 200) =>
    Response.json(data, { status }),
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailAccount: { findMany: jest.fn() },
    email: {
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    $queryRaw: jest.fn(),
  },
}));

jest.mock('@/lib/queue/client', () => ({
  syncQueue: { getJobCounts: jest.fn() },
  searchQueue: { getJobCounts: jest.fn() },
}));

import type { NextRequest } from 'next/server';
import { GET } from '@/app/api/dashboard/route';
import { authenticate } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';
import { searchQueue, syncQueue } from '@/lib/queue/client';

const mockAuthenticate = authenticate as jest.Mock;
const mockAccountFindMany = prisma.emailAccount.findMany as jest.Mock;
const mockEmailCount = prisma.email.count as jest.Mock;
const mockEmailGroupBy = prisma.email.groupBy as jest.Mock;
const mockDailyEmailQuery = prisma.$queryRaw as jest.Mock;
const mockSyncQueueCounts = syncQueue.getJobCounts as jest.Mock;
const mockSearchQueueCounts = searchQueue.getJobCounts as jest.Mock;

function createDashboardRequest(url: string): NextRequest {
  return {
    url,
    nextUrl: new URL(url),
  } as NextRequest;
}

describe('GET /api/dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a member requesting system scope before reading dashboard data', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });

    const response = await GET(createDashboardRequest('http://localhost/api/dashboard?scope=system'));

    expect(response.status).toBe(403);
    expect(mockAccountFindMany).not.toHaveBeenCalled();
    expect(mockEmailCount).not.toHaveBeenCalled();
    expect(mockSyncQueueCounts).not.toHaveBeenCalled();
    expect(mockSearchQueueCounts).not.toHaveBeenCalled();
  });

  it('scopes a member dashboard to the member accessible accounts', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });
    mockAccountFindMany.mockResolvedValue([
      {
        id: 'account-1',
        label: 'Shared',
        color: '#3B82F6',
        isActive: true,
        lastSyncedAt: null,
        initialSyncCompletedAt: null,
        authError: null,
      },
    ]);
    mockEmailCount
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);
    mockEmailGroupBy.mockResolvedValue([{ accountId: 'account-1', _count: { _all: 3 } }]);
    mockDailyEmailQuery.mockResolvedValue([
      { day: '2026-11-10', received: 2, sent: 1 },
    ]);

    const response = await GET(createDashboardRequest('http://localhost/api/dashboard?scope=user'));

    expect(response.status).toBe(200);
    const accountAccessWhere = {
      organizationId: 'org-1',
      OR: [
        { ownerUserId: 'member-1' },
        { memberAccess: { some: { userId: 'member-1' } } },
      ],
    };
    expect(mockAccountFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: accountAccessWhere,
      orderBy: { createdAt: 'asc' },
    }));
    expect(mockEmailCount).toHaveBeenNthCalledWith(1, {
      where: { accountId: { in: ['account-1'] } },
    });
    expect(mockEmailCount).toHaveBeenNthCalledWith(3, {
      where: { accountId: { in: ['account-1'] }, folder: 'INBOX', isRead: false },
    });
    expect(mockEmailGroupBy).toHaveBeenCalledWith({
      by: ['accountId'],
      where: { accountId: { in: ['account-1'] }, folder: 'INBOX', isRead: false },
      _count: { _all: true },
    });
    expect(mockSyncQueueCounts).not.toHaveBeenCalled();
    expect(mockSearchQueueCounts).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body.scope).toBe('user');
    expect(body.canViewSystem).toBe(false);
    expect(body.stats).toMatchObject({
      totalAccounts: 1,
      activeAccounts: 1,
      totalEmails: 10,
      inboxEmails: 8,
      unreadEmails: 3,
      unreadShare: 3 / 8,
      sentEmails: 2,
    });
    expect(body.stats.emailTrend).toHaveLength(7);
    expect(body.accounts).toEqual([
      expect.objectContaining({ id: 'account-1', unreadEmails: 3 }),
    ]);
    expect(body.systemHealth).toBeNull();
  });

  it('keeps admin system scope organization-wide and includes queue stats', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'admin-1',
      organizationId: 'org-1',
      role: 'admin',
    });
    mockAccountFindMany.mockResolvedValue([]);
    mockSyncQueueCounts.mockResolvedValue({ active: 1 });
    mockSearchQueueCounts.mockResolvedValue({ waiting: 2 });

    const response = await GET(createDashboardRequest('http://localhost/api/dashboard?scope=system'));

    expect(response.status).toBe(200);
    expect(mockAccountFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'org-1' },
    }));
    expect(mockSyncQueueCounts).toHaveBeenCalled();
    expect(mockSearchQueueCounts).toHaveBeenCalled();
    expect((await response.json()).systemHealth).toMatchObject({
      sync: { active: 1 },
      search: { waiting: 2 },
    });
  });
});
