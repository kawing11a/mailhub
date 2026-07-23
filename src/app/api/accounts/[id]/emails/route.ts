import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { emailListQuerySchema } from '@/lib/validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: accountId } = await params;

  // Build where clause
  const where: Record<string, unknown> = {};

  if (accountId !== 'all') {
    // Verify account belongs to user's org and member has access
    const account = await prisma.emailAccount.findFirst({
      where: { 
        id: accountId, 
        organizationId: auth.organizationId,
        ...(auth.role !== 'admin' ? {
          memberAccess: { some: { userId: auth.userId } }
        } : {})
      },
      select: { id: true },
    });
    if (!account) return apiError('Account not found', 404);
    where.accountId = accountId;
  } else {
    // Unified inbox logic: query emails from all accounts within the org
    where.account = {
      organizationId: auth.organizationId,
      ...(auth.role !== 'admin' ? {
        memberAccess: { some: { userId: auth.userId } }
      } : {})
    };
  }

  // Parse query params
  const { searchParams } = req.nextUrl;
  const query = emailListQuerySchema.safeParse(
    Object.fromEntries(searchParams.entries())
  );
  if (!query.success) return apiError(query.error.issues[0].message, 422);

  const { folder, page, limit, unreadOnly, labelId } = query.data;
  const skip = (page - 1) * limit;

  if (folder) where.folder = folder;
  if (unreadOnly) where.isRead = false;
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
      orderBy: { receivedAt: 'desc' },
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
        hasAttachments: true,
        receivedAt: true,
        sentAt: true,
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
