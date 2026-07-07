import { NextRequest } from 'next/server';
import { authenticate, apiResponse } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { organizationId, role, userId } = auth;

  const accountFilter = role !== 'admin' ? {
    organizationId,
    memberAccess: { some: { userId } }
  } : { organizationId };

  try {
    const [
      totalAccounts,
      totalEmails,
      unreadEmails,
      sentEmails,
      recentActivity,
      accounts
    ] = await Promise.all([
      prisma.emailAccount.count({ where: accountFilter }),
      prisma.email.count({ where: { account: accountFilter } }),
      prisma.email.count({ where: { account: accountFilter, isRead: false, folder: 'INBOX' } }),
      prisma.email.count({ where: { account: accountFilter, folder: 'SENT' } }),
      prisma.emailActivityLog.findMany({
        where: role !== 'admin' ? { organizationId, account: accountFilter } : { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { user: true, account: true }
      }),
      prisma.emailAccount.findMany({
        where: accountFilter,
        orderBy: { createdAt: 'asc' }
      })
    ]);

    return apiResponse({
      stats: {
        totalAccounts,
        totalEmails,
        unreadEmails,
        sentEmails,
      },
      recentActivity,
      accounts,
    });
  } catch (error) {
    console.error('Failed to fetch dashboard data', error);
    return apiResponse({ error: 'Failed to fetch dashboard data' }, 500);
  }
}
