import { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import { authenticate, apiResponse } from '@/lib/auth/middleware';
import { accountAccessWhere } from '@/lib/accounts/access';
import { prisma } from '@/lib/db/prisma';
import { getSystemMetrics } from '@/lib/dashboard/system-metrics';
import { syncQueue, searchQueue } from '@/lib/queue/client';

const DAY_MS = 24 * 60 * 60 * 1000;
const DASHBOARD_DAYS = 7;

type DailyEmailCount = { day: Date | string; received: bigint | number; sent: bigint | number };

function utcDayString(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

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

  try {
    const accounts = await prisma.emailAccount.findMany({
      where: accountFilter,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        label: true,
        color: true,
        isActive: true,
        lastSyncedAt: true,
        initialSyncCompletedAt: true,
        authError: true,
      },
    });

    const accountIds = accounts.map((account) => account.id);
    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const firstDayUtc = new Date(todayUtc - (DASHBOARD_DAYS - 1) * DAY_MS);
    const endDayUtc = new Date(todayUtc + DAY_MS);

    const [totalEmails, inboxEmails, unreadEmails, sentEmails, unreadGroups, dailyRows] = accountIds.length
      ? await Promise.all([
        prisma.email.count({ where: { accountId: { in: accountIds } } }),
        prisma.email.count({ where: { accountId: { in: accountIds }, folder: 'INBOX' } }),
        prisma.email.count({ where: { accountId: { in: accountIds }, folder: 'INBOX', isRead: false } }),
        prisma.email.count({ where: { accountId: { in: accountIds }, folder: 'SENT' } }),
        prisma.email.groupBy({
          by: ['accountId'],
          where: { accountId: { in: accountIds }, folder: 'INBOX', isRead: false },
          _count: { _all: true },
        }),
        prisma.$queryRaw<DailyEmailCount[]>`
          WITH daily_counts AS (
            SELECT
              date_trunc(
                'day',
                (CASE WHEN folder = 'SENT' THEN sent_at ELSE received_at END) AT TIME ZONE 'UTC'
              )::date AS day,
              COUNT(*) FILTER (WHERE folder = 'INBOX') AS received,
              COUNT(*) FILTER (WHERE folder = 'SENT') AS sent
            FROM emails
            WHERE account_id IN (${Prisma.join(accountIds)})
              AND (
                (folder = 'INBOX' AND received_at >= ${firstDayUtc} AND received_at < ${endDayUtc})
                OR
                (folder = 'SENT' AND sent_at >= ${firstDayUtc} AND sent_at < ${endDayUtc})
              )
            GROUP BY day
          )
          SELECT day, received, sent FROM daily_counts ORDER BY day ASC
        `,
      ])
      : [0, 0, 0, 0, [], [] as DailyEmailCount[]];

    const countsByAccount = new Map(
      unreadGroups.map((group) => [group.accountId, group._count._all])
    );
    const dailyCountByDate = new Map(
      dailyRows.map((row) => [utcDayString(row.day), { received: Number(row.received), sent: Number(row.sent) }])
    );
    const emailTrend = Array.from({ length: DASHBOARD_DAYS }, (_, index) => {
      const date = new Date(firstDayUtc.getTime() + index * DAY_MS);
      const day = date.toISOString().slice(0, 10);
      const counts = dailyCountByDate.get(day);
      return { day, received: counts?.received ?? 0, sent: counts?.sent ?? 0 };
    });

    let systemHealth = null;
    if (scope === 'system') {
      const [sync, search, resources] = await Promise.all([
        syncQueue.getJobCounts(),
        searchQueue.getJobCounts(),
        getSystemMetrics(),
      ]);
      systemHealth = { sync, search, resources };
    }

    const activeAccounts = accounts.filter((account) => account.isActive).length;
    const attentionAccounts = accounts.filter((account) => !account.isActive || account.authError).length;

    return apiResponse({
      scope,
      canViewSystem: role === 'admin',
      refreshedAt: now.toISOString(),
      stats: {
        totalAccounts: accounts.length,
        activeAccounts,
        attentionAccounts,
        totalEmails,
        inboxEmails,
        unreadEmails,
        unreadShare: inboxEmails > 0 ? unreadEmails / inboxEmails : 0,
        sentEmails,
        emailTrend,
      },
      accounts: accounts.map((account) => ({
        id: account.id,
        label: account.label,
        color: account.color,
        isActive: account.isActive,
        lastSyncedAt: account.lastSyncedAt,
        initialSyncCompletedAt: account.initialSyncCompletedAt,
        hasAuthError: Boolean(account.authError),
        unreadEmails: countsByAccount.get(account.id) ?? 0,
      })),
      systemHealth,
    });
  } catch (error) {
    console.error('Failed to fetch dashboard data', error);
    return apiResponse({ error: 'Failed to fetch dashboard data' }, 500);
  }
}
