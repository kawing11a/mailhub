import { NextRequest } from 'next/server';
import { authenticate, apiResponse } from '@/lib/auth/middleware';
import { accountAccessWhere } from '@/lib/accounts/access';
import { prisma } from '@/lib/db/prisma';
import { syncQueue, searchQueue } from '@/lib/queue/client';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { organizationId, role } = auth;
  const scope = req.nextUrl.searchParams.get('scope') === 'system' ? 'system' : 'user';

  if (scope === 'system' && role !== 'admin') {
    return apiResponse({ error: 'Forbidden' }, 403);
  }

  const accountFilter = scope === 'system'
    ? { organizationId }
    : accountAccessWhere(auth);

  const activityFilter = scope === 'system'
    ? { organizationId }
    : { organizationId, account: accountFilter };

  try {
    const [
      totalAccounts,
      totalEmails,
      unreadEmails,
      sentEmails,
      recentActivity,
      accounts,
      recentEmails,
      syncQueueStats,
      searchQueueStats
    ] = await Promise.all([
      prisma.emailAccount.count({ where: accountFilter }),
      prisma.email.count({ where: { account: accountFilter } }),
      prisma.email.count({ where: { account: accountFilter, isRead: false, folder: 'INBOX' } }),
      prisma.email.count({ where: { account: accountFilter, folder: 'SENT' } }),
      prisma.emailActivityLog.findMany({
        where: activityFilter,
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
      }),
      prisma.emailAccount.findMany({
        where: accountFilter,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          label: true,
          emailAddress: true,
          color: true,
          lastSyncedAt: true,
          authError: true,
        },
      }),
      prisma.email.findMany({
        where: { account: accountFilter, folder: 'INBOX' },
        orderBy: { receivedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          subject: true,
          fromName: true,
          fromAddress: true,
          receivedAt: true,
          account: { select: { emailAddress: true } },
        }
      }),
      scope === 'system' ? syncQueue.getJobCounts() : Promise.resolve(null),
      scope === 'system' ? searchQueue.getJobCounts() : Promise.resolve(null),
    ]);

    return apiResponse({
      scope,
      canViewSystem: role === 'admin',
      stats: {
        totalAccounts,
        totalEmails,
        unreadEmails,
        sentEmails,
      },
      recentActivity,
      accounts,
      recentEmails,
      systemHealth: scope === 'system' ? {
        sync: syncQueueStats,
        search: searchQueueStats,
      } : null,
    });
  } catch (error) {
    console.error('Failed to fetch dashboard data', error);
    return apiResponse({ error: 'Failed to fetch dashboard data' }, 500);
  }
}
