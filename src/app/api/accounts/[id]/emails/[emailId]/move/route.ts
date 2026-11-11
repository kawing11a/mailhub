import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiError, apiResponse } from '@/lib/auth/middleware';
import { accountAccessWhere } from '@/lib/accounts/access';
import { logActivity } from '@/lib/activity/log';
import { moveEmailSchema } from '@/lib/validation';
import { moveEmailOnServer } from '@/lib/email/server-sync';

interface RouteParams {
  params: Promise<{ id: string; emailId: string }>;
}

const MOVABLE_FOLDERS = new Set(['INBOX', 'TRASH', 'SPAM', 'JUNK']);

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: accountId, emailId } = await params;
  const parsed = moveEmailSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || 'Invalid destination folder', 422);

  const where: Record<string, unknown> = { id: emailId };
  if (accountId !== 'all' && accountId !== 'new-emails') {
    const accountAccess = await prisma.emailAccount.findFirst({
      where: accountAccessWhere(auth, accountId),
      select: { id: true },
    });
    if (!accountAccess) return apiError('Account not found', 404);
    where.accountId = accountId;
  } else {
    where.account = accountAccessWhere(auth);
  }

  const email = await prisma.email.findFirst({ where });
  if (!email) return apiError('Email not found', 404);
  if (email.isDraft || email.folder === 'DRAFTS' || email.folder === 'SENT') {
    return apiError('Drafts and sent messages cannot be moved', 400);
  }
  if (!MOVABLE_FOLDERS.has(email.folder)) return apiError('This message cannot be moved from its folder', 400);

  const destination = parsed.data.toFolder;
  if (email.folder === destination) return apiError('Message is already in that folder', 400);

  const account = await prisma.emailAccount.findUnique({
    where: { id: email.accountId },
    select: { id: true, provider: true },
  });
  if (!account) return apiError('Account not found', 404);

  const sync = await moveEmailOnServer(account, email, destination);
  await prisma.email.update({
    where: { id: emailId },
    data: {
      folder: destination,
      previousFolder: destination === 'TRASH' ? email.folder : null,
      ...(sync.uidChanged ? { uid: sync.newUid ?? null } : {}),
    },
  });

  await logActivity({
    organizationId: auth.organizationId,
    userId: auth.userId,
    accountId: email.accountId,
    emailId,
    action: 'moved',
    metadata: { subject: email.subject, from: email.folder, to: destination },
  });

  return apiResponse({ success: true, folder: destination, serverSynced: sync.ok });
}
