import { sendEmail } from '@/lib/smtp/sender';
import { getDecryptedAccount } from '@/lib/accounts/service';
import { getValidOAuthAccessToken } from '@/lib/accounts/tokens';
import nodemailer from 'nodemailer';

jest.mock('@/lib/accounts/service');
jest.mock('@/lib/accounts/tokens');
jest.mock('nodemailer');

describe('sendEmail sender', () => {
  const mockGetDecryptedAccount = getDecryptedAccount as jest.Mock;
  const mockGetValidOAuthAccessToken = getValidOAuthAccessToken as jest.Mock;
  const mockCreateTransport = nodemailer.createTransport as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends email using OAuth2 transport for Outlook accounts', async () => {
    const mockSendMail = jest.fn().mockResolvedValue({ messageId: '<outlook-msg-123>' });
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
    mockGetValidOAuthAccessToken.mockResolvedValue('mock_outlook_access_token');

    mockGetDecryptedAccount.mockResolvedValue({
      id: 'acc-outlook-1',
      label: 'Outlook Account',
      emailAddress: 'user@outlook.com',
      provider: 'outlook',
      oauthProvider: 'microsoft',
      smtpHost: 'smtp-mail.outlook.com',
      smtpPort: 587,
      smtpSecure: false,
      decryptedPassword: null,
    });

    const result = await sendEmail('acc-outlook-1', {
      to: ['recipient@example.com'],
      subject: 'Test Outlook Email',
      bodyText: 'Hello from Outlook',
    });

    expect(mockGetValidOAuthAccessToken).toHaveBeenCalledWith('acc-outlook-1');
    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: 'smtp-mail.outlook.com',
      port: 587,
      secure: false,
      auth: {
        type: 'OAuth2',
        user: 'user@outlook.com',
        accessToken: 'mock_outlook_access_token',
      },
    });
    expect(mockSendMail).toHaveBeenCalled();
    expect(result).toEqual({ messageId: '<outlook-msg-123>' });
  });

  it('sends email using standard password SMTP for IMAP accounts', async () => {
    const mockSendMail = jest.fn().mockResolvedValue({ messageId: '<smtp-msg-456>' });
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });

    mockGetDecryptedAccount.mockResolvedValue({
      id: 'acc-imap-1',
      label: 'Custom IMAP Account',
      emailAddress: 'user@custom.com',
      provider: 'imap',
      smtpHost: 'mail.custom.com',
      smtpPort: 465,
      smtpSecure: true,
      decryptedPassword: 'secretpassword',
    });

    const result = await sendEmail('acc-imap-1', {
      to: ['recipient@example.com'],
      subject: 'Test Custom Email',
      bodyText: 'Hello from Custom IMAP',
    });

    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: 'mail.custom.com',
      port: 465,
      secure: true,
      auth: {
        user: 'user@custom.com',
        pass: 'secretpassword',
      },
    });
    expect(mockSendMail).toHaveBeenCalled();
    expect(result).toEqual({ messageId: '<smtp-msg-456>' });
  });

  it('throws an error if SMTP credentials are missing for non-OAuth account', async () => {
    mockGetDecryptedAccount.mockResolvedValue({
      id: 'acc-broken-1',
      label: 'Broken Account',
      emailAddress: 'user@broken.com',
      provider: 'imap',
      smtpHost: null,
      decryptedPassword: null,
    });

    await expect(
      sendEmail('acc-broken-1', {
        to: ['recipient@example.com'],
        subject: 'Fail Test',
        bodyText: 'Should fail',
      })
    ).rejects.toThrow('SMTP credentials not configured for this account');
  });
});
