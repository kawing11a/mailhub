import { NextRequest } from 'next/server';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { sendEmailSchema } from '@/lib/validation';
import { sendEmail } from '@/lib/smtp/sender';
import { logActivity } from '@/lib/activity/log';
import { prisma } from '@/lib/db/prisma';
import { createEmailSnippet } from '@/lib/email/snippet';

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: accountId } = await params;

  // Verify account access
  const account = await prisma.emailAccount.findFirst({
    where: { id: accountId, organizationId: auth.organizationId },
    select: { id: true, emailAddress: true },
  });

  if (!account) return apiError('Account not found', 404);

  const body = await req.json();
  const parsed = sendEmailSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message, 422);

  try {
    const { messageId } = await sendEmail(accountId, parsed.data);
    const sentAt = new Date();
    const snippet = createEmailSnippet({
      bodyText: parsed.data.bodyText,
      bodyHtml: parsed.data.bodyHtml,
    });

    const hasAttachments = !!(parsed.data.attachments && parsed.data.attachments.length > 0);

    // Save sent email record
    const email = await prisma.email.create({
      data: {
        accountId,
        messageId,
        threadId: parsed.data.inReplyTo || messageId, // Basic fallback
        folder: 'SENT',
        subject: parsed.data.subject,
        snippet,
        fromAddress: account.emailAddress,
        toAddresses: parsed.data.to.map((address) => ({ address, name: '' })),
        ccAddresses: parsed.data.cc?.map((address) => ({ address, name: '' })) || [],
        bccAddresses: parsed.data.bcc?.map((address) => ({ address, name: '' })) || [],
        inReplyTo: parsed.data.inReplyTo,
        referencesHeader: parsed.data.references,
        isRead: true, // Sent emails are read
        hasAttachments,
        sentAt,
        receivedAt: sentAt,
        body: {
          create: {
            bodyHtml: parsed.data.bodyHtml,
            bodyText: parsed.data.bodyText,
          },
        },
      },
    });

    if (hasAttachments && parsed.data.attachments) {
      const storageDir = path.join(process.cwd(), '.storage', 'attachments');
      await fs.mkdir(storageDir, { recursive: true });

      for (const att of parsed.data.attachments) {
        const attachmentId = randomUUID();
        const storagePath = path.join(storageDir, attachmentId);
        const buffer = Buffer.from(att.content, 'base64');
        await fs.writeFile(storagePath, buffer);

        await prisma.attachment.create({
          data: {
            id: attachmentId,
            emailId: email.id,
            filename: att.filename,
            contentType: att.contentType,
            sizeBytes: att.sizeBytes || buffer.length,
            storagePath,
          },
        });
      }
    }

    await logActivity({
      organizationId: auth.organizationId,
      userId: auth.userId,
      accountId,
      emailId: email.id,
      action: 'EMAIL_SENT',
      metadata: { to: parsed.data.to, subject: parsed.data.subject },
    });

    if (parsed.data.draftId) {
      await prisma.email.deleteMany({
        where: { id: parsed.data.draftId, accountId },
      });
      // (Optional: Also delete from IMAP Drafts if possible, but local is the main priority)
    }

    return apiResponse({ success: true, messageId, sentAt });
  } catch (error) {
    console.error('Send email error:', error);
    return apiError('Failed to send email', 500);
  }
}
