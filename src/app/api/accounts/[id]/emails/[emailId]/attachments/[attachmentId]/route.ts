import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiError } from '@/lib/auth/middleware';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import * as path from 'path';

interface RouteParams {
  params: Promise<{ id: string; emailId: string; attachmentId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: accountId, emailId, attachmentId } = await params;

  let where: Record<string, unknown> = { id: emailId };

  // Check account access
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

  // Ensure email exists and user has access
  const email = await prisma.email.findFirst({
    where,
    select: { id: true },
  });

  if (!email) return apiError('Email not found', 404);

  // Fetch the attachment record
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId, emailId: email.id },
  });

  if (!attachment || !attachment.storagePath) {
    return apiError('Attachment not found', 404);
  }

  try {
    // Check multiple candidate paths for robustness across Docker / Windows environments
    const candidatePaths = [
      attachment.storagePath,
      path.resolve(process.cwd(), attachment.storagePath.replace(/^\/app\//, '')),
      path.resolve(process.cwd(), '.storage', 'attachments', attachment.id),
      path.resolve(process.cwd(), '.storage', 'attachments', path.basename(attachment.storagePath)),
    ];

    let foundPath: string | null = null;
    for (const cand of candidatePaths) {
      try {
        await fs.access(cand);
        foundPath = cand;
        break;
      } catch {
        // try next candidate
      }
    }

    if (!foundPath) {
      return apiError('Attachment file not found on storage', 404);
    }

    // Read the file as a buffer
    const fileBuffer = await fs.readFile(foundPath);

    // Create a response with the file buffer
    const response = new NextResponse(fileBuffer);
    
    // Set headers to force download and set correct content type
    response.headers.set('Content-Type', attachment.contentType || 'application/octet-stream');
    response.headers.set(
      'Content-Disposition', 
      `attachment; filename="${encodeURIComponent(attachment.filename || 'download')}"`
    );
    response.headers.set('Content-Length', (attachment.sizeBytes || fileBuffer.length).toString());

    return response;
  } catch (error) {
    console.error('Error serving attachment:', error);
    return apiError('Failed to read attachment file', 500);
  }
}
