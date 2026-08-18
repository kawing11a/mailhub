import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse } from '@/lib/auth/middleware';
import { accountAccessWhere } from '@/lib/accounts/access';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  // 1. Fetch accessible accounts
  const accounts = await prisma.emailAccount.findMany({
    where: accountAccessWhere(auth),
    select: { id: true, initialSyncCompletedAt: true },
  });

  const readyAccountIds = accounts
    .filter((acc) => acc.initialSyncCompletedAt !== null)
    .map((acc) => acc.id);

  if (readyAccountIds.length === 0) {
    return apiResponse({
      emails: [],
      countsByAccount: {},
      pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
    });
  }

  // 2. Compute unread count per account matching INBOX folder unread count
  const unreadGroups = await prisma.email.groupBy({
    by: ['accountId'],
    where: {
      accountId: { in: readyAccountIds },
      isRead: false,
      folder: 'INBOX',
    },
    _count: {
      _all: true,
    },
  });

  const countsByAccount: Record<string, number> = {};
  for (const group of unreadGroups) {
    countsByAccount[group.accountId] = group._count._all;
  }

  // 3. Fetch recent new emails
  const readyAccounts = accounts.filter((acc) => acc.initialSyncCompletedAt !== null);
  const orConditions = readyAccounts.map((acc) => ({
    accountId: acc.id,
    isRead: false,
    folder: 'INBOX',
    receivedAt: { gt: acc.initialSyncCompletedAt! },
  }));

  const emails = await prisma.email.findMany({
    where: { OR: orConditions },
    orderBy: { receivedAt: 'desc' },
    include: {
      account: { select: { emailAddress: true, label: true, color: true } },
      emailLabels: { include: { label: true } },
      body: { select: { bodyHtml: true, bodyText: false } },
    },
    take: 50,
  });

  return apiResponse({
    emails,
    countsByAccount,
    pagination: { total: emails.length, page: 1, limit: 50, totalPages: 1 },
  });
}
