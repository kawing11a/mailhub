import { NextRequest } from 'next/server';
import { ImapFlow } from 'imapflow';
import { createTransport } from 'nodemailer';
import {
  authenticate,
  requireAdmin,
  apiResponse,
  apiError,
} from '@/lib/auth/middleware';
import { getDecryptedAccount } from '@/lib/accounts/service';
import { prisma } from '@/lib/db/prisma';
import { accountAccessWhere } from '@/lib/accounts/access';
import { resolveSafeOutboundHost } from '@/lib/network/outbound-host';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const { id } = await params;

  const accessibleAccount = await prisma.emailAccount.findFirst({
    where: accountAccessWhere(auth, id),
    select: { id: true },
  });
  if (!accessibleAccount) return apiError('Account not found', 404);

  const results = { imap: false, smtp: false, imapError: '', smtpError: '' };

  try {
    const account = await getDecryptedAccount(id);

    // Test IMAP
    if (account.imapHost && account.decryptedPassword) {
      try {
        const destination = await resolveSafeOutboundHost(account.imapHost);
        const client = new ImapFlow({
          host: destination.address,
          port: account.imapPort || 993,
          secure: account.imapSecure ?? true,
          ...(destination.servername ? { servername: destination.servername } : {}),
          auth: {
            user: account.username || account.emailAddress,
            pass: account.decryptedPassword,
          },
          logger: false,
        });
        await client.connect();
        await client.logout();
        results.imap = true;
      } catch (e: unknown) {
        results.imapError = e instanceof Error ? e.message : 'IMAP connection failed';
      }
    }

    // Test SMTP
    if (account.smtpHost && account.decryptedPassword) {
      try {
        const destination = await resolveSafeOutboundHost(account.smtpHost);
        const transporter = createTransport({
          host: destination.address,
          port: account.smtpPort || 587,
          secure: account.smtpSecure ?? false,
          ...(destination.servername
            ? { tls: { servername: destination.servername } }
            : {}),
          auth: {
            user: account.username || account.emailAddress,
            pass: account.decryptedPassword,
          },
        });
        await transporter.verify();
        results.smtp = true;
      } catch (e: unknown) {
        results.smtpError = e instanceof Error ? e.message : 'SMTP connection failed';
      }
    }

    return apiResponse(results);
  } catch (error) {
    console.error('Test account error:', error);
    return apiError('Account not found', 404);
  }
}
