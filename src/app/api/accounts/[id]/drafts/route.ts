import { NextRequest } from 'next/server';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { parseAddresses } from '@/lib/email/addresses';

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

const saveDraftSchema = z.object({
  draftId: z.string().optional(),
  to: z.string().optional(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  subject: z.string().optional(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
  attachments: z
    .array(
      z.object({
        id: z.string().optional(),
        filename: z.string(),
        contentType: z.string(),
        content: z.string(),
        sizeBytes: z.number().optional(),
      })
    )
    .optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: accountId } = await params;

  // Verify account access
  const account = await prisma.emailAccount.findFirst({
    where: {
      id: accountId,
      organizationId: auth.organizationId,
      ...(auth.role !== 'admin'
        ? { memberAccess: { some: { userId: auth.userId } } }
        : {}),
    },
    select: { id: true, emailAddress: true },
  });

  if (!account) return apiError('Account not found', 404);

  const body = await req.json();
  const parsed = saveDraftSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message, 422);

  const data = parsed.data;

  try {
    let emailId = data.draftId;
    const toAddresses = parseAddresses(data.to || '').map((address) => ({ address, name: '' }));
    const ccAddresses = parseAddresses(data.cc || '').map((address) => ({ address, name: '' }));
    const bccAddresses = parseAddresses(data.bcc || '').map((address) => ({ address, name: '' }));
    const hasAttachments = !!(data.attachments && data.attachments.length > 0);

    if (emailId) {
      const existingDraft = await prisma.email.findFirst({
        where: {
          id: emailId,
          isDraft: true,
          account: {
            organizationId: auth.organizationId,
            ...(auth.role !== 'admin'
              ? { memberAccess: { some: { userId: auth.userId } } }
              : {}),
          },
        },
        select: { id: true },
      });

      if (!existingDraft) return apiError('Draft not found', 404);

      // Updating accountId moves the local draft when the user changes From.
      await prisma.email.update({
        where: { id: emailId },
        data: {
          accountId,
          fromAddress: account.emailAddress,
          subject: data.subject || '',
          toAddresses,
          ccAddresses,
          bccAddresses,
          hasAttachments,
          body: {
            upsert: {
              create: {
                bodyHtml: data.bodyHtml || '',
                bodyText: data.bodyText || '',
              },
              update: {
                bodyHtml: data.bodyHtml || '',
                bodyText: data.bodyText || '',
              },
            },
          },
        },
      });
    } else {
      // Create new draft
      const newDraft = await prisma.email.create({
        data: {
          accountId,
          messageId: `<${uuidv4()}@draft.local>`,
          folder: 'Drafts',
          subject: data.subject || '',
          fromAddress: account.emailAddress,
          toAddresses,
          ccAddresses,
          bccAddresses,
          isRead: true,
          isDraft: true,
          hasAttachments,
          body: {
            create: {
              bodyHtml: data.bodyHtml || '',
              bodyText: data.bodyText || '',
            },
          },
        },
      });
      emailId = newDraft.id;
    }

    if (data.attachments && data.attachments.length > 0) {
      const storageDir = path.join(process.cwd(), '.storage', 'attachments');
      await fs.mkdir(storageDir, { recursive: true });

      // Delete existing attachments if any to synchronize draft attachments
      await prisma.attachment.deleteMany({ where: { emailId } });

      for (const att of data.attachments) {
        const attachmentId = att.id || randomUUID();
        const storagePath = path.join(storageDir, attachmentId);
        const buffer = Buffer.from(att.content, 'base64');
        await fs.writeFile(storagePath, buffer);

        await prisma.attachment.create({
          data: {
            id: attachmentId,
            emailId,
            filename: att.filename,
            contentType: att.contentType,
            sizeBytes: att.sizeBytes || buffer.length,
            storagePath,
          },
        });
      }
    }

    return apiResponse({ success: true, draftId: emailId, accountId });
  } catch (error) {
    console.error('Save draft error:', error);
    return apiError('Failed to save draft', 500);
  }
}
