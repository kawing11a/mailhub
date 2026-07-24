import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: accountId } = await params;

  if (accountId !== 'all') {
    // Verify account belongs to user's org and member has access
    const account = await prisma.emailAccount.findFirst({
      where: {
        id: accountId,
        organizationId: auth.organizationId,
        ...(auth.role !== 'admin'
          ? { memberAccess: { some: { userId: auth.userId } } }
          : {}),
      },
      select: { id: true },
    });
    if (!account) return apiError('Account not found', 404);

    await prisma.email.updateMany({
      where: {
        accountId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });
  } else {
    // Unified inbox: mark all unread emails in all accessible accounts as read
    const accounts = await prisma.emailAccount.findMany({
      where: {
        organizationId: auth.organizationId,
        ...(auth.role !== 'admin'
          ? { memberAccess: { some: { userId: auth.userId } } }
          : {}),
      },
      select: { id: true },
    });

    await prisma.email.updateMany({
      where: {
        accountId: { in: accounts.map((a) => a.id) },
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });
  }

  return apiResponse({ success: true, message: 'All emails marked as read' });
}
