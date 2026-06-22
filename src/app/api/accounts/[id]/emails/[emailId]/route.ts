import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { updateEmailSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activity/log';

interface RouteParams {
  params: Promise<{ id: string; emailId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: accountId, emailId } = await params;

  // Verify account belongs to user's org
  const account = await prisma.emailAccount.findFirst({
    where: { id: accountId, organizationId: auth.organizationId },
    select: { id: true },
  });
  if (!account) return apiError('Account not found', 404);

  const email = await prisma.email.findFirst({
    where: { id: emailId, accountId },
    include: {
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
  if (!parsed.success) return apiError(parsed.error.errors[0].message, 422);

  // Verify ownership chain
  const account = await prisma.emailAccount.findFirst({
    where: { id: accountId, organizationId: auth.organizationId },
    select: { id: true },
  });
  if (!account) return apiError('Account not found', 404);

  try {
    const updated = await prisma.email.update({
      where: { id: emailId, accountId },
      data: parsed.data,
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

  const account = await prisma.emailAccount.findFirst({
    where: { id: accountId, organizationId: auth.organizationId },
    select: { id: true },
  });
  if (!account) return apiError('Account not found', 404);

  const email = await prisma.email.findFirst({
    where: { id: emailId, accountId },
  });
  if (!email) return apiError('Email not found', 404);

  if (email.folder === 'TRASH') {
    // Permanent delete
    await prisma.email.delete({ where: { id: emailId } });
  } else {
    // Move to trash
    await prisma.email.update({
      where: { id: emailId },
      data: { folder: 'TRASH' },
    });
  }

  await logActivity({
    organizationId: auth.organizationId,
    userId: auth.userId,
    accountId,
    emailId,
    action: 'deleted',
    metadata: { subject: email.subject, fromTrash: email.folder === 'TRASH' },
  });

  return apiResponse({ success: true });
}
