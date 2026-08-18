import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { logActivity } from '@/lib/activity/log';
import { restoreOnServer } from '@/lib/email/server-sync';
import { accountAccessWhere } from '@/lib/accounts/access';

interface RouteParams {
  params: Promise<{ id: string; emailId: string }>;
}

/**
 * Recover an email from TRASH back to the folder it most likely came from.
 *
 * The original folder isn't recorded anywhere, so it is inferred from the
 * sender: mail from the account's own address was sent by us, anything else was
 * received. This cannot distinguish INBOX from an archive or a user folder.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: accountId, emailId } = await params;

  let where: Record<string, unknown> = { id: emailId };

  if (accountId !== 'all' && accountId !== 'new-emails') {
    const account = await prisma.emailAccount.findFirst({
      where: accountAccessWhere(auth, accountId),
      select: { id: true },
    });
    if (!account) return apiError('Account not found', 404);
    where.accountId = accountId;
  } else {
    where.account = accountAccessWhere(auth);
  }

  const email = await prisma.email.findFirst({ where });
  if (!email) return apiError('Email not found', 404);

  if (email.folder !== 'TRASH') {
    return apiError('Only emails in the trash can be restored', 400);
  }

  const account = await prisma.emailAccount.findUnique({
    where: { id: email.accountId },
    select: { id: true, provider: true, emailAddress: true },
  });
  if (!account) return apiError('Account not found', 404);

  const sentByAccount =
    !!email.fromAddress &&
    email.fromAddress.trim().toLowerCase() === account.emailAddress.trim().toLowerCase();
  const destination = sentByAccount ? 'SENT' : 'INBOX';

  const sync = await restoreOnServer(account, email, destination);

  await prisma.email.update({
    where: { id: emailId },
    data: {
      folder: destination,
      // An IMAP MOVE reassigns the UID in the destination mailbox.
      ...(sync.uidChanged ? { uid: sync.newUid ?? null } : {}),
    },
  });

  await logActivity({
    organizationId: auth.organizationId,
    userId: auth.userId,
    // Not the route param, which may be the 'all' / 'new-emails' pseudo-account
    accountId: email.accountId,
    emailId,
    action: 'restored',
    metadata: { subject: email.subject, destination },
  });

  return apiResponse({
    success: true,
    folder: destination,
    serverSynced: sync.ok,
  });
}
