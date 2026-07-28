import { createTransport, Transporter } from 'nodemailer';
import { getDecryptedAccount } from '@/lib/accounts/service';
import type { SendEmailInput } from '@/lib/validation';
import { getValidAccessToken, sendMessageRaw } from '@/lib/gmail/api';

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
    const accessToken = await getValidOAuthAccessToken(account.id);

    const transporter: Transporter = createTransport({
      host: account.smtpHost || 'smtp-mail.outlook.com',
      port: account.smtpPort || 587,
      secure: account.smtpSecure ?? false,
      auth: {
        type: 'OAuth2',
        user: account.emailAddress,
        accessToken,
      },
    });

    const info = await transporter.sendMail(mailOptions);
    return { messageId: info.messageId };
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
