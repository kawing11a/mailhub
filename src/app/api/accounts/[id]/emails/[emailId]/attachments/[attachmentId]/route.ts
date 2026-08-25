import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiError } from '@/lib/auth/middleware';
import { accountAccessWhere } from '@/lib/accounts/access';
import {
  AttachmentNotFoundError,
  AttachmentProviderError,
  getReceivedAttachment,
  readStoredAttachment,
} from '@/lib/email/attachment-retrieval';

interface RouteParams {
  params: Promise<{ id: string; emailId: string; attachmentId: string }>;
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: accountId, emailId, attachmentId } = await params;

  let where: Record<string, unknown> = { id: emailId };

  // Check account access
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

  // Ensure email exists and user has access
  const email = await prisma.email.findFirst({
    where,
    select: { id: true },
  });

  if (!email) return apiError('Email not found', 404);

  // Fetch the attachment record
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
  });

  if (!attachment || attachment.emailId !== email.id) {
    return apiError('Attachment not found', 404);
  }

  try {
    const retrieved = attachment.storagePath
      ? await readStoredAttachment(attachment)
      : await getReceivedAttachment(email.id, attachment.id);

    const response = new NextResponse(new Uint8Array(retrieved.content));
    response.headers.set(
      'Content-Type',
      retrieved.contentType || attachment.contentType || 'application/octet-stream'
    );
    response.headers.set(
      'Content-Disposition',
      buildContentDisposition(retrieved.filename || attachment.filename || 'download')
    );
    response.headers.set('Content-Length', retrieved.content.length.toString());

    return response;
  } catch (error) {
    console.error(error);

    if (error instanceof AttachmentNotFoundError) {
      return apiError('Attachment not found', 404);
    }

    if (error instanceof AttachmentProviderError) {
      return apiError('Failed to retrieve attachment', 502);
    }

    return apiError('Failed to download attachment', 500);
  }
}

function buildContentDisposition(filename: string): string {
  const normalized = filename.replace(/[\r\n]+/g, '').trim() || 'download';
  const asciiFallback =
    normalized.replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '_') ||
    'download';

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeRFC5987ValueChars(
    normalized
  )}`;
}

function encodeRFC5987ValueChars(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}
