import { NextRequest } from 'next/server';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';
import { z } from 'zod';
import { ImapFlow } from 'imapflow';
import { decrypt } from '@/lib/crypto';
import { getValidAccessToken, syncDraftRaw } from '@/lib/gmail/api';

const syncDraftSchema = z.object({
  draftId: z.string(),
});

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
  });

  if (!account) return apiError('Account not found', 404);

  const body = await req.json();
  const parsed = syncDraftSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message, 422);

  const { draftId } = parsed.data;

  const draft = await prisma.email.findFirst({
    where: { id: draftId, accountId },
    include: { body: true },
  });

  if (!draft || !draft.isDraft) {
    return apiError('Draft not found', 404);
  }

  try {
    const MailComposer = require('nodemailer/lib/mail-composer');
    const joinAddresses = (json: unknown): string | undefined => {
      if (!Array.isArray(json)) return undefined;
      const addrs = json
        .map((a) => (a as { address?: string })?.address)
        .filter((a): a is string => !!a);
      return addrs.length ? addrs.join(', ') : undefined;
    };

    const composer = new MailComposer({
      from: `"${account.label}" <${account.emailAddress}>`,
      to: joinAddresses(draft.toAddresses),
      cc: joinAddresses(draft.ccAddresses),
      bcc: joinAddresses(draft.bccAddresses),
      subject: draft.subject,
      html: draft.body?.bodyHtml,
      text: draft.body?.bodyText,
    });
    const rawBuffer = await composer.compile().build();

    if (account.provider === 'gmail') {
      const accessToken = await getValidAccessToken(account.id);
      try {
        await syncDraftRaw(accessToken, rawBuffer);
      } catch (e: any) {
        console.error('Failed to sync draft to Gmail:', e.message);
      }
    } else {
      if (account.imapHost && account.passwordEncrypted) {
        const client = new ImapFlow({
          host: account.imapHost,
          port: account.imapPort || 993,
          secure: account.imapSecure ?? true,
          auth: {
            user: account.username || account.emailAddress,
            pass: decrypt(account.passwordEncrypted),
          },
          logger: false,
        });

        await client.connect();
        await client.append('Drafts', rawBuffer, ['\\Draft']);
        await client.logout();
      }
    }

    return apiResponse({ success: true });
  } catch (error) {
    console.error('IMAP sync draft error:', error);
    // Don't fail the API call if IMAP sync fails, as local save succeeded
    return apiResponse({ success: true, warning: 'Failed to sync to IMAP' });
  }
}
