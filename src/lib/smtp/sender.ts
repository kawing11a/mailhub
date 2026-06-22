import { createTransport, Transporter } from 'nodemailer';
import { getDecryptedAccount } from '@/lib/accounts/service';
import type { SendEmailInput } from '@/lib/validation';

export async function sendEmail(
  accountId: string,
  input: SendEmailInput
): Promise<{ messageId: string }> {
  const account = await getDecryptedAccount(accountId);

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

  const info = await transporter.sendMail(mailOptions);
  return { messageId: info.messageId };
}
