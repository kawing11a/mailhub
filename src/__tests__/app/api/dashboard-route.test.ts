jest.mock('@/lib/auth/middleware', () => ({
  authenticate: jest.fn(),
  apiResponse: (data: unknown, status = 200) =>
    Response.json(data, { status }),
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailAccount: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    email: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    emailActivityLog: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/queue/client', () => ({
  syncQueue: {
    getJobCounts: jest.fn(),
  },
  searchQueue: {
    getJobCounts: jest.fn(),
  },
}));

import type { NextRequest } from 'next/server';
import { GET } from '@/app/api/dashboard/route';
import { authenticate } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';
import { searchQueue, syncQueue } from '@/lib/queue/client';

const mockAuthenticate = authenticate as jest.Mock;
const mockEmailAccountCount = prisma.emailAccount.count as jest.Mock;
const mockEmailCount = prisma.email.count as jest.Mock;
const mockActivityFindMany = prisma.emailActivityLog.findMany as jest.Mock;
const mockAccountFindMany = prisma.emailAccount.findMany as jest.Mock;
const mockRecentEmailFindMany = prisma.email.findMany as jest.Mock;
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

  it('rejects a member requesting system scope before running organization-wide queries', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });

    const response = await GET(createDashboardRequest('http://localhost/api/dashboard?scope=system'));

    expect(response.status).toBe(403);
    expect(mockEmailAccountCount).not.toHaveBeenCalled();
    expect(mockEmailCount).not.toHaveBeenCalled();
    expect(mockActivityFindMany).not.toHaveBeenCalled();
    expect(mockAccountFindMany).not.toHaveBeenCalled();
    expect(mockRecentEmailFindMany).not.toHaveBeenCalled();
    expect(mockSyncQueueCounts).not.toHaveBeenCalled();
    expect(mockSearchQueueCounts).not.toHaveBeenCalled();
  });

  it('uses accountAccessWhere-style filters for every member user-scope query', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });

    mockEmailAccountCount.mockResolvedValue(2);
    mockEmailCount
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4);
    mockActivityFindMany.mockResolvedValue([
      {
        id: 'activity-1',
        action: 'SYNC',
        metadata: null,
        createdAt: new Date('2026-08-18T12:00:00.000Z'),
        user: { name: 'Member' },
        account: { emailAddress: 'shared@example.com' },
      },
    ]);
    mockAccountFindMany.mockResolvedValue([
      {
        id: 'account-1',
        label: 'Shared',
        emailAddress: 'shared@example.com',
        color: '#3B82F6',
        lastSyncedAt: null,
        authError: null,
      },
    ]);
    mockRecentEmailFindMany.mockResolvedValue([
      {
        id: 'email-1',
        subject: 'Hello',
        fromName: 'Sender',
        fromAddress: 'sender@example.com',
        receivedAt: new Date('2026-08-18T12:00:00.000Z'),
        account: { emailAddress: 'shared@example.com' },
      },
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

    expect(mockEmailAccountCount).toHaveBeenCalledWith({
      where: accountAccessWhere,
    });
    expect(mockEmailCount).toHaveBeenNthCalledWith(1, {
      where: { account: accountAccessWhere },
    });
    expect(mockEmailCount).toHaveBeenNthCalledWith(2, {
      where: { account: accountAccessWhere, isRead: false, folder: 'INBOX' },
    });
    expect(mockEmailCount).toHaveBeenNthCalledWith(3, {
      where: { account: accountAccessWhere, folder: 'SENT' },
    });
    expect(mockActivityFindMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        account: accountAccessWhere,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        action: true,
        metadata: true,
        createdAt: true,
        user: { select: { name: true } },
        account: { select: { emailAddress: true } },
      },
    });
    expect(mockAccountFindMany).toHaveBeenCalledWith({
      where: accountAccessWhere,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        label: true,
        emailAddress: true,
        color: true,
        lastSyncedAt: true,
        authError: true,
      },
    });
    expect(mockRecentEmailFindMany).toHaveBeenCalledWith({
      where: { account: accountAccessWhere, folder: 'INBOX' },
      orderBy: { receivedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        subject: true,
        fromName: true,
        fromAddress: true,
        receivedAt: true,
        account: { select: { emailAddress: true } },
      },
    });
    expect(mockSyncQueueCounts).not.toHaveBeenCalled();
    expect(mockSearchQueueCounts).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body).toEqual({
      scope: 'user',
      canViewSystem: false,
      stats: {
        totalAccounts: 2,
        totalEmails: 10,
        unreadEmails: 3,
        sentEmails: 4,
      },
      recentActivity: [
        expect.objectContaining({
          id: 'activity-1',
        }),
      ],
      accounts: [
        expect.objectContaining({
          id: 'account-1',
        }),
      ],
      recentEmails: [
        expect.objectContaining({
          id: 'email-1',
        }),
      ],
      systemHealth: null,
    });
  });

  it('keeps admin system scope organization-wide and includes queue stats', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'admin-1',
      organizationId: 'org-1',
      role: 'admin',
    });

    mockEmailAccountCount.mockResolvedValue(4);
    mockEmailCount
      .mockResolvedValueOnce(40)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(12);
    mockActivityFindMany.mockResolvedValue([]);
    mockAccountFindMany.mockResolvedValue([]);
    mockRecentEmailFindMany.mockResolvedValue([]);
    mockSyncQueueCounts.mockResolvedValue({ active: 1 });
    mockSearchQueueCounts.mockResolvedValue({ waiting: 2 });

    const response = await GET(createDashboardRequest('http://localhost/api/dashboard?scope=system'));

    expect(response.status).toBe(200);
    expect(mockEmailAccountCount).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
    });
    expect(mockEmailCount).toHaveBeenNthCalledWith(1, {
      where: { account: { organizationId: 'org-1' } },
    });
    expect(mockActivityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1' },
      })
    );
    expect(mockSyncQueueCounts).toHaveBeenCalled();
    expect(mockSearchQueueCounts).toHaveBeenCalled();
  });
});
