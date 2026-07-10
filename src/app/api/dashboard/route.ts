import { NextRequest } from 'next/server';
import { authenticate, apiResponse, requireAdmin } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { organizationId, role, userId } = auth;
  const scope = req.nextUrl.searchParams.get('scope') === 'system' ? 'system' : 'user';

  if (scope === 'system') {
    const adminError = requireAdmin(auth);
    if (adminError) return adminError;
  }

  const accountFilter = scope === 'system'
    ? {}
    : role !== 'admin'
      ? {
          organizationId,
          memberAccess: { some: { userId } },
        }
      : { organizationId };

  const activityFilter = scope === 'system'
    ? {}
    : role !== 'admin'
      ? { organizationId, account: accountFilter }
      : { organizationId };

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
        },
      })
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
    });
  } catch (error) {
    console.error('Failed to fetch dashboard data', error);
    return apiResponse({ error: 'Failed to fetch dashboard data' }, 500);
  }
}
