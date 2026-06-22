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

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const { id } = await params;

  const results = { imap: false, smtp: false, imapError: '', smtpError: '' };

  try {
    const account = await getDecryptedAccount(id);

    // Test IMAP
    if (account.imapHost && account.decryptedPassword) {
      try {
        const client = new ImapFlow({
          host: account.imapHost,
          port: account.imapPort || 993,
          secure: account.imapSecure ?? true,
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
        const transporter = createTransport({
          host: account.smtpHost,
          port: account.smtpPort || 587,
          secure: account.smtpSecure ?? false,
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
