import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { logActivity } from '@/lib/activity/log';
import { deleteManyOnServer } from '@/lib/email/server-sync';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Permanently delete everything in TRASH, on the server as well as locally.
 * With the 'all' pseudo-account this empties trash for every account in the org.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: accountId } = await params;

  let where: Record<string, unknown> = { folder: 'TRASH' };

  if (accountId !== 'all' && accountId !== 'new-emails') {
    const account = await prisma.emailAccount.findFirst({
      where: { id: accountId, organizationId: auth.organizationId },
      select: { id: true },
    });
    if (!account) return apiError('Account not found', 404);
    where.accountId = accountId;
  } else {
    where.account = {
      organizationId: auth.organizationId,
    };
  }

  const emails = await prisma.email.findMany({
    where,
    select: { id: true, accountId: true, uid: true, folder: true, messageId: true },
  });

  if (emails.length === 0) {
    return apiResponse({ success: true, deleted: 0, serverFailed: 0 });
  }

  // Group by account so each one's server delete is a single batched round-trip.
  const byAccount = new Map<string, typeof emails>();
  for (const email of emails) {
    const group = byAccount.get(email.accountId);
    if (group) {
      group.push(email);
    } else {
      byAccount.set(email.accountId, [email]);
    }
  }

  const accounts = await prisma.emailAccount.findMany({
    where: { id: { in: [...byAccount.keys()] } },
    select: { id: true, provider: true },
  });

  let serverFailed = 0;
  for (const account of accounts) {
    const group = byAccount.get(account.id);
    if (!group) continue;
    const result = await deleteManyOnServer(account, group, 'TRASH');
    serverFailed += result.serverFailed;
  }

  // Delete locally regardless: leaving rows behind for messages we could not
  // reach would strand them in a trash the user has already emptied.
  const deleted = await prisma.email.deleteMany({
    where: { id: { in: emails.map((email) => email.id) } },
  });

  await logActivity({
    organizationId: auth.organizationId,
    userId: auth.userId,
    accountId: accountId !== 'all' && accountId !== 'new-emails' ? accountId : undefined,
    action: 'emptied_trash',
    metadata: { deleted: deleted.count, serverFailed },
  });

  return apiResponse({ success: true, deleted: deleted.count, serverFailed });
}
