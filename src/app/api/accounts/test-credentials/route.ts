import { NextRequest } from 'next/server';
import { ImapFlow } from 'imapflow';
import { createTransport } from 'nodemailer';
import {
  authenticate,
  apiResponse,
  apiError,
} from '@/lib/auth/middleware';
import { createAccountSchema } from '@/lib/validation/schemas';
import { resolveSafeOutboundHost } from '@/lib/network/outbound-host';

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json();
    const parseResult = createAccountSchema.safeParse(body);
    if (!parseResult.success) {
      return apiError(parseResult.error.issues[0]?.message || 'Invalid account parameters', 400);
    }

    const {
      imapHost,
      imapPort,
      imapSecure,
      smtpHost,
      smtpPort,
      smtpSecure,
      username,
      password,
      emailAddress,
    } = parseResult.data;

    const results = { imap: false, smtp: false, imapError: '', smtpError: '' };

    // Test IMAP connection
    if (imapHost && password) {
      try {
        const destination = await resolveSafeOutboundHost(imapHost);
        const client = new ImapFlow({
          host: destination.address,
          port: imapPort || 993,
          secure: imapSecure ?? true,
          ...(destination.servername ? { servername: destination.servername } : {}),
          auth: {
            user: username || emailAddress,
            pass: password,
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

    // Test SMTP connection
    if (smtpHost && password) {
      try {
        const destination = await resolveSafeOutboundHost(smtpHost);
        const transporter = createTransport({
          host: destination.address,
          port: smtpPort || 465,
          secure: smtpSecure ?? true,
          ...(destination.servername
            ? { tls: { servername: destination.servername } }
            : {}),
          auth: {
            user: username || emailAddress,
            pass: password,
          },
        });
        await transporter.verify();
        results.smtp = true;
      } catch (e: unknown) {
        results.smtpError = e instanceof Error ? e.message : 'SMTP connection failed';
      }
    }

    const ok = results.imap && results.smtp;
    return apiResponse({ ok, ...results });
  } catch (error: any) {
    console.error('Test credentials error:', error);
    return apiError(error.message || 'Failed to test credentials', 500);
  }
}
