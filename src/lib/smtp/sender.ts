import { createTransport, Transporter } from 'nodemailer';
import { getDecryptedAccount } from '@/lib/accounts/service';
import type { SendEmailInput } from '@/lib/validation';
import { getValidAccessToken, sendMessageRaw } from '@/lib/gmail/api';

export async function sendGraphEmail(
  accessToken: string,
  input: SendEmailInput
): Promise<{ messageId: string }> {
  const url = 'https://graph.microsoft.com/v1.0/me/sendMail';

  const toRecipients = input.to.map((address) => ({
    emailAddress: { address },
  }));
  const ccRecipients = input.cc?.map((address) => ({
    emailAddress: { address },
  }));
  const bccRecipients = input.bcc?.map((address) => ({
    emailAddress: { address },
  }));

  const graphAttachments = input.attachments?.map((att) => ({
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: att.filename,
    contentType: att.contentType,
    contentBytes: att.content,
  }));

  const emailData = {
    message: {
      subject: input.subject,
      body: {
        contentType: input.bodyHtml ? 'HTML' : 'Text',
        content: input.bodyHtml || input.bodyText || '',
      },
      toRecipients,
      ...(ccRecipients && ccRecipients.length > 0 && { ccRecipients }),
      ...(bccRecipients && bccRecipients.length > 0 && { bccRecipients }),
      ...(graphAttachments && graphAttachments.length > 0 && { attachments: graphAttachments }),
    },
    saveToSentItems: 'true',
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailData),
  });

  if (!response.ok) {
    const errorDetails = await response.text();
    throw new Error(`Graph API Error (${response.status}): ${errorDetails}`);
  }

  return { messageId: `<graph-${Date.now()}@microsoft.com>` };
}

export async function sendEmail(
  accountId: string,
  input: SendEmailInput
): Promise<{ messageId: string }> {
  const account = await getDecryptedAccount(accountId);

  const nodemailerAttachments = input.attachments?.map((att) => ({
    filename: att.filename,
    content: Buffer.from(att.content, 'base64'),
    contentType: att.contentType,
  }));

  const mailOptions = {
    from: `"${account.label}" <${account.emailAddress}>`,
    to: input.to,
    cc: input.cc && input.cc.length > 0 ? input.cc : undefined,
    bcc: input.bcc && input.bcc.length > 0 ? input.bcc : undefined,
    subject: input.subject,
    text: input.bodyText,
    html: input.bodyHtml,
    inReplyTo: input.inReplyTo,
    references: input.references,
    attachments: nodemailerAttachments,
  };

  if (account.provider === 'gmail') {
    // For Gmail accounts, construct raw email with keepBcc so Gmail API parses BCC recipients
    const MailComposer = require('nodemailer/lib/mail-composer');
    const composer = new MailComposer({
      ...mailOptions,
      keepBcc: true,
    });
    const message = composer.compile();
    message.keepBcc = true;
    const rawBuffer = await message.build();

    const accessToken = await getValidAccessToken(account.id);
    const result = await sendMessageRaw(accessToken, rawBuffer);

    // Attempt to queue the email to be fully indexed immediately or just rely on the sync worker
    return { messageId: result.id || `<gmail-${Date.now()}>` };
  } else if (account.provider === 'outlook' || account.oauthProvider === 'microsoft') {
    const { getValidOAuthAccessToken } = await import('@/lib/accounts/tokens');
    const accessToken = await getValidOAuthAccessToken(account.id, 'https://graph.microsoft.com/.default offline_access');
    return await sendGraphEmail(accessToken, input);
  } else {
    // For other providers (custom IMAP/SMTP)
    if (!account.smtpHost || !account.decryptedPassword) {
      throw new Error('SMTP credentials not configured for this account');
    }

    const transporter: Transporter = createTransport({
      host: account.smtpHost,
      port: account.smtpPort || 587,
      secure: account.smtpSecure ?? false,
      auth: {
        user: account.username || account.emailAddress,
        pass: account.decryptedPassword,
      },
    });

    const info = await transporter.sendMail(mailOptions);

    // If IMAP settings are available, attempt to append sent message to IMAP Sent folder
    if (account.imapHost && account.passwordEncrypted) {
      try {
        const MailComposer = require('nodemailer/lib/mail-composer');
        const composer = new MailComposer({
          ...mailOptions,
          keepBcc: true,
        });
        const rawBuffer = await composer.compile().build();

        const { ImapFlow } = await import('imapflow');
        const { decrypt } = await import('@/lib/crypto');
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
        const list = await client.list();
        const sentMailbox =
          list.find(
            (m) =>
              (m.specialUse && m.specialUse.toLowerCase().includes('sent')) ||
              m.path.toLowerCase().includes('sent')
          )?.path || 'Sent';

        await client.append(sentMailbox, rawBuffer, ['\\Seen']);
        await client.logout();
      } catch (err) {
        console.error('Failed to append sent message to IMAP Sent folder:', err);
      }
    }

    return { messageId: info.messageId };
  }
}
