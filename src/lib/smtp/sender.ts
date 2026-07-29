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

  const mailOptions = {
    from: `"${account.label}" <${account.emailAddress}>`,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    text: input.bodyText,
    html: input.bodyHtml,
    inReplyTo: input.inReplyTo,
    references: input.references,
  };

  if (account.provider === 'gmail') {
    // For Gmail accounts, construct raw email and use the REST API
    const MailComposer = require('nodemailer/lib/mail-composer');
    const composer = new MailComposer(mailOptions);
    const rawBuffer = await composer.compile().build();

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
    return { messageId: info.messageId };
  }
}
