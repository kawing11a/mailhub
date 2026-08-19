import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { accountAccessWhere } from '@/lib/accounts/access';

interface RouteParams {
  params: Promise<{ threadId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { threadId } = await params;

  // Fetch all emails in thread across all org accounts
  const emails = await prisma.email.findMany({
    where: {
      threadId,
      account: accountAccessWhere(auth),
    },
    orderBy: { receivedAt: 'asc' },
    include: {
      body: true,
      account: {
        select: { id: true, label: true, emailAddress: true, color: true, avatarInitials: true },
      },
      attachments: {
        select: { id: true, filename: true, contentType: true, sizeBytes: true, cid: true },
      },
    },
  });

  if (emails.length === 0) return apiError('Thread not found', 404);

  return apiResponse({
    threadId,
    messageCount: emails.length,
    accountCount: new Set(emails.map((e) => e.accountId)).size,
    emails,
  });
}
