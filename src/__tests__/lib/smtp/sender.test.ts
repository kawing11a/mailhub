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

  it('sends email using Microsoft Graph API for Outlook accounts', async () => {
    mockGetValidOAuthAccessToken.mockResolvedValue('mock.outlook.jwt_access_token');
    mockGetDecryptedAccount.mockResolvedValue({
      id: 'acc-outlook-1',
      label: 'Outlook Account',
      emailAddress: 'user@outlook.com',
      provider: 'outlook',
      oauthProvider: 'microsoft',
      smtpHost: 'smtp.office365.com',
      smtpPort: 587,
      smtpSecure: false,
      decryptedPassword: null,
      decryptedRefreshToken: 'mock_refresh_token',
    });

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({}),
      text: jest.fn().mockResolvedValue(''),
    });
    global.fetch = fetchMock;

    const result = await sendEmail('acc-outlook-1', {
      to: ['recipient@example.com'],
      subject: 'Test Outlook Email',
      bodyText: 'Hello from Outlook Graph API',
    });

    expect(mockGetValidOAuthAccessToken).toHaveBeenCalledWith('acc-outlook-1', 'https://graph.microsoft.com/.default offline_access');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me/sendMail',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer mock.outlook.jwt_access_token',
          'Content-Type': 'application/json',
        },
      })
    );
    expect(result.messageId).toContain('graph-');
  });

  it('throws an error if Microsoft Graph API fails for Outlook accounts', async () => {
    mockGetValidOAuthAccessToken.mockResolvedValue('mock.outlook.jwt_access_token');

    mockGetDecryptedAccount.mockResolvedValue({
      id: 'acc-outlook-1',
      label: 'Outlook Account',
      emailAddress: 'user@outlook.com',
      provider: 'outlook',
      oauthProvider: 'microsoft',
      smtpHost: 'smtp.office365.com',
      smtpPort: 587,
      smtpSecure: false,
      decryptedPassword: null,
      decryptedRefreshToken: 'mock_refresh_token',
    });

    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: jest.fn().mockResolvedValue('Graph error details'),
    });
    global.fetch = fetchMock;

    await expect(
      sendEmail('acc-outlook-1', {
        to: ['recipient@example.com'],
        subject: 'Test Outlook Email',
        bodyText: 'Hello from Outlook',
      })
    ).rejects.toThrow('Graph API Error (400): Graph error details');
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
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['recipient@example.com'],
        bcc: undefined,
      })
    );
    expect(result).toEqual({ messageId: '<smtp-msg-456>' });
  });

  it('passes bcc recipients correctly to SMTP transporter when specified', async () => {
    const mockSendMail = jest.fn().mockResolvedValue({ messageId: '<smtp-bcc-789>' });
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
      bcc: ['bcc1@example.com', 'bcc2@example.com'],
      subject: 'Test BCC Email',
      bodyText: 'Hello with BCC',
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['recipient@example.com'],
        bcc: ['bcc1@example.com', 'bcc2@example.com'],
      })
    );
    expect(result).toEqual({ messageId: '<smtp-bcc-789>' });
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
