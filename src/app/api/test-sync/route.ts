import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { getValidAccessToken, fetchMessagesList, fetchMessageRaw } from '@/lib/gmail/api';
import { decrypt } from '@/lib/crypto';
import { ImapFlow } from 'imapflow';
import { parseEmail } from '@/lib/imap/email-parser';
import { accountAccessWhere } from '@/lib/accounts/access';
import { resolveSafeOutboundHost } from '@/lib/network/outbound-host';

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { accountId } = await req.json();
  if (!accountId) return apiError('Account ID is required');

  const account = await prisma.emailAccount.findFirst({
    where: accountAccessWhere(auth, accountId),
  });

  if (!account) return apiError('Account not found', 404);

  try {
    if (account.provider.toUpperCase() === 'GMAIL') {
      const accessToken = await getValidAccessToken(account.id);
      const result = await fetchMessagesList(accessToken, { maxResults: 1 });
      
      let parsedSubject = 'No Subject';
      let parsedFrom = 'Unknown';
      let parsedDate = null;
      let rawSnippet = '';
      
      if (result.messages && result.messages.length > 0) {
        const messageId = result.messages[0].id;
        const rawBuffer = await fetchMessageRaw(accessToken, messageId);
        const parsed = await parseEmail(rawBuffer);
        
        parsedSubject = parsed.subject || 'No Subject';
        parsedFrom = parsed.fromAddress || 'Unknown';
        parsedDate = parsed.receivedAt;
        rawSnippet = parsed.snippet || '';
      }
      
      return apiResponse({
        success: true,
        provider: 'GMAIL',
        message: 'Successfully connected to Gmail API and fetched emails.',
        totalMessagesInQuery: result.resultSizeEstimate,
        sampleEmail: result.messages?.length ? {
          subject: parsedSubject,
          from: parsedFrom,
          date: parsedDate,
          snippet: rawSnippet
        } : null
      });
    } else {
      const password = account.passwordEncrypted ? decrypt(account.passwordEncrypted) : null;
      const accessToken = account.oauthAccessToken ? decrypt(account.oauthAccessToken) : null;

      const authOptions: any = { user: account.username || account.emailAddress };
      if (accessToken) {
        authOptions.accessToken = accessToken;
      } else if (password) {
        authOptions.pass = password;
      }

      if (!account.imapHost) {
        return apiError('Connection failed: IMAP host is not configured', 500);
      }
      const destination = await resolveSafeOutboundHost(account.imapHost);
      const client = new ImapFlow({
        host: destination.address,
        port: account.imapPort || 993,
        secure: account.imapSecure ?? true,
        ...(destination.servername ? { servername: destination.servername } : {}),
        auth: authOptions,
        logger: false,
      });

      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      
      let msgCount = 0;
      let sampleSubject = '';
      let sampleFrom = '';
      
      try {
        const mailbox = client.mailbox;
        msgCount = mailbox ? mailbox.exists : 0;
        
        if (msgCount > 0) {
          const message = await client.fetchOne('*', { envelope: true });
          if (message) {
            sampleSubject = message.envelope?.subject || 'No Subject';
            const fromArr = message.envelope?.from;
            if (fromArr && fromArr.length > 0) {
               sampleFrom = fromArr[0].address || '';
            }
          }
        }
      } finally {
        lock.release();
        await client.logout();
      }

      return apiResponse({
        success: true,
        provider: account.provider,
        message: 'Successfully connected to IMAP.',
        mailboxSize: msgCount,
        sampleEmail: msgCount > 0 ? {
          subject: sampleSubject,
          from: sampleFrom
        } : null
      });
    }
  } catch (err: any) {
    console.error('Test connection error:', err);
    return apiError(`Connection failed: ${err.message}`, 500);
  }
}
