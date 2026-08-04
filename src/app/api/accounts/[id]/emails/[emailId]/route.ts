import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { updateEmailSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activity/log';
import { deleteOnServer, moveToTrashOnServer } from '@/lib/email/server-sync';

interface RouteParams {
  params: Promise<{ id: string; emailId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: accountId, emailId } = await params;

  let where: Record<string, unknown> = { id: emailId };

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

  const email = await prisma.email.findFirst({
    where,
    include: {
      account: {
        select: {
          id: true,
          emailAddress: true,
        },
      },
      body: true,
      attachments: {
        select: {
          id: true,
          filename: true,
          contentType: true,
          sizeBytes: true,
          cid: true,
        },
      },
      emailLabels: {
        include: { label: { select: { id: true, name: true, color: true } } },
      },
    },
  });

  if (!email) return apiError('Email not found', 404);

  // Mark as read if not already
  if (!email.isRead) {
    await prisma.email.update({
      where: { id: emailId },
      data: { isRead: true },
    });
  }

  return apiResponse(email);
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: accountId, emailId } = await params;

  const body = await req.json();
  const parsed = updateEmailSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message, 422);

  let where: Record<string, unknown> = { id: emailId };

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

  try {
    // Note: Prisma update doesn't support complex relation wheres easily in `where`, 
    // so we verify existence first
    const emailToUpdate = await prisma.email.findFirst({ where });
    if (!emailToUpdate) return apiError('Email not found', 404);

    const data =
      parsed.data.isRead === false && emailToUpdate.folder !== 'INBOX'
        ? { ...parsed.data, isRead: true }
        : parsed.data;

    const updated = await prisma.email.update({
      where: { id: emailId },
      data,
    });
    return apiResponse(updated);
  } catch {
    return apiError('Email not found', 404);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: accountId, emailId } = await params;

  let where: Record<string, unknown> = { id: emailId };

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

  const email = await prisma.email.findFirst({ where });
  if (!email) return apiError('Email not found', 404);

  const account = await prisma.emailAccount.findUnique({
    where: { id: email.accountId },
    select: { id: true, provider: true },
  });
  if (!account) return apiError('Account not found', 404);

  const permanent = email.folder === 'TRASH';

  // Propagate to the server first. For a permanent delete this is what stops the
  // next sync from re-inserting the row via the accountId+messageId upsert.
  const sync = permanent
    ? await deleteOnServer(account, email)
    : await moveToTrashOnServer(account, email);

  if (permanent) {
    await prisma.email.delete({ where: { id: emailId } });
  } else {
    await prisma.email.update({
      where: { id: emailId },
      data: {
        folder: 'TRASH',
        // An IMAP MOVE reassigns the UID; keeping the old one would make a later
        // permanent delete target a different message in the trash mailbox.
        ...(sync.uidChanged ? { uid: sync.newUid ?? null } : {}),
      },
    });
  }

  await logActivity({
    organizationId: auth.organizationId,
    userId: auth.userId,
    // Not the route param, which may be the 'all' / 'new-emails' pseudo-account
    accountId: email.accountId,
    // The row is gone on a permanent delete, so referencing it would violate the FK
    emailId: permanent ? undefined : emailId,
    action: 'deleted',
    metadata: { subject: email.subject, fromTrash: permanent },
  });

  return apiResponse({
    success: true,
    permanent,
    // False only when there was a server copy we failed to update — a local-only
    // email (never uploaded) reports true, since nothing needed syncing.
    serverSynced: sync.ok,
  });
}
