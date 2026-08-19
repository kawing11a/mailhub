import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { emailListQuerySchema } from '@/lib/validation';
import { accountAccessWhere } from '@/lib/accounts/access';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: accountId } = await params;

  // Build where clause
  const where: Record<string, unknown> = {};

  if (accountId !== 'all' && accountId !== 'new-emails') {
    // Verify account belongs to user's org and member has access
    const account = await prisma.emailAccount.findFirst({
      where: accountAccessWhere(auth, accountId),
      select: { id: true },
    });
    if (!account) return apiError('Account not found', 404);
    where.accountId = accountId;
  } else {
    // Unified inbox logic: query emails from all accounts within the org
    where.account = accountAccessWhere(auth);
  }

  // Parse query params
  const searchParams = req.nextUrl ? req.nextUrl.searchParams : new URL(req.url).searchParams;
  const query = emailListQuerySchema.safeParse(
    Object.fromEntries(searchParams.entries())
  );
  if (!query.success) return apiError(query.error.issues[0].message, 422);

  const { folder, page, limit, unreadOnly, labelId, filter, readStatus, accountScope, favouriteEmailsOnly } = query.data;
  const skip = (page - 1) * limit;

  if (folder) where.folder = folder;

  const isUnifiedInbox = accountId === 'all' || accountId === 'new-emails';

  if (isUnifiedInbox) {
    if (unreadOnly || readStatus === 'unread' || filter === 'unread') {
      where.isRead = false;
    }

    if (favouriteEmailsOnly || filter === 'favourite-emails') {
      where.isStarred = true;
    }

    if (accountScope === 'favourite-accounts' || filter === 'favourite-accounts') {
      const favourites = await prisma.favouriteAccount.findMany({
        where: { userId: auth.userId, deletedAt: null },
        select: { accountId: true },
      });
      const favIds = favourites.map((f) => f.accountId);
      where.accountId = { in: favIds };
    }
  }

  if (labelId) {
    const label = await prisma.label.findFirst({
      where: { id: labelId, organizationId: auth.organizationId },
      select: { id: true },
    });
    if (!label) return apiError('Label not found', 404);

    // Emails match the label either directly or via account assignment
    const assignedAccounts = await prisma.accountLabel.findMany({
      where: { labelId },
      select: { accountId: true },
    });
    where.OR = [
      { emailLabels: { some: { labelId } } },
      { accountId: { in: assignedAccounts.map((a) => a.accountId) } },
    ];
  }

  const [emails, total] = await Promise.all([
    prisma.email.findMany({
      where,
      orderBy: [
        { receivedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      skip,
      take: limit,
      select: {
        id: true,
        accountId: true,
        messageId: true,
        threadId: true,
        folder: true,
        subject: true,
        snippet: true,
        fromAddress: true,
        fromName: true,
        toAddresses: true,
        isRead: true,
        isStarred: true,
        isDraft: true,
        isHighRisk: true,
        riskReason: true,
        hasAttachments: true,
        receivedAt: true,
        sentAt: true,
        createdAt: true,
        account: {
          select: {
            id: true,
            label: true,
            emailAddress: true,
            color: true,
          },
        },
        emailLabels: {
          include: { label: { select: { id: true, name: true, color: true } } },
        },
      },
    }),
    prisma.email.count({ where }),
  ]);

  return apiResponse({
    emails,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
