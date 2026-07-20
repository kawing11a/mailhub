import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  // 1. Fetch accessible accounts
  const accounts = await prisma.emailAccount.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(auth.role !== 'admin'
        ? {
            memberAccess: {
              some: {
                userId: auth.userId,
              },
            },
          }
        : {}),
    },
    select: { id: true, initialSyncCompletedAt: true },
  });

  const readyAccounts = accounts.filter(acc => acc.initialSyncCompletedAt !== null);

  if (readyAccounts.length === 0) {
    return apiResponse({ emails: [], pagination: { total: 0, page: 1, limit: 50, totalPages: 0 } });
  }

  const orConditions = readyAccounts.map(acc => ({
    accountId: acc.id,
    isRead: false,
    folder: { notIn: ['SPAM', 'TRASH'] },
    isHighRisk: false,
    receivedAt: { gt: acc.initialSyncCompletedAt! },
  }));

  // 3. Fetch emails
  const emails = await prisma.email.findMany({
    where: { OR: orConditions },
    orderBy: { receivedAt: 'desc' },
    include: {
      account: { select: { emailAddress: true, label: true, color: true } },
      emailLabels: { include: { label: true } },
      body: { select: { bodyHtml: true, bodyText: false } }
    },
    take: 50,
  });

  return apiResponse({ emails, pagination: { total: emails.length, page: 1, limit: 50, totalPages: 1 } });
}
