jest.mock('@/lib/auth/middleware', () => ({
  authenticate: jest.fn(),
  requireAdmin: jest.fn(),
  apiResponse: (data: unknown, status = 200) =>
    Response.json(data, { status }),
  apiError: (message: string, status = 400) =>
    Response.json({ error: message }, { status }),
}));

jest.mock('imapflow', () => ({
  ImapFlow: jest.fn(),
}));

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

import type { NextRequest } from 'next/server';
import { POST } from '@/app/api/accounts/test-credentials/route';
import { authenticate, requireAdmin } from '@/lib/auth/middleware';
import { ImapFlow } from 'imapflow';
import { createTransport } from 'nodemailer';

const mockAuthenticate = authenticate as jest.Mock;
const mockRequireAdmin = requireAdmin as jest.Mock;
const mockImapFlow = ImapFlow as jest.MockedClass<typeof ImapFlow>;
const mockCreateTransport = createTransport as jest.Mock;

function createRequest(body: Record<string, unknown>): NextRequest {
  return new Request('http://localhost/api/accounts/test-credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe('POST /api/accounts/test-credentials', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticate.mockResolvedValue({
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'admin',
    });
    mockRequireAdmin.mockReturnValue(null);
  });

  it('returns 401 if unauthenticated', async () => {
    mockAuthenticate.mockResolvedValue(
      Response.json({ error: 'Unauthorized' }, { status: 401 })
    );

    const res = await POST(createRequest({}));
    expect(res.status).toBe(401);
  });

  it('returns test results with ok: true when both IMAP and SMTP pass', async () => {
    const mockConnect = jest.fn().mockResolvedValue(undefined);
    const mockLogout = jest.fn().mockResolvedValue(undefined);
    mockImapFlow.mockImplementation(() => ({
      connect: mockConnect,
      logout: mockLogout,
    }) as any);

    const mockVerify = jest.fn().mockResolvedValue(true);
    mockCreateTransport.mockReturnValue({
      verify: mockVerify,
    });

    const res = await POST(
      createRequest({
        label: 'Test IMAP',
        provider: 'imap',
        color: '#3B82F6',
        emailAddress: 'test@example.com',
        username: 'test@example.com',
        password: 'password123',
        imapHost: 'imap.example.com',
        imapPort: 993,
        imapSecure: true,
        smtpHost: 'smtp.example.com',
        smtpPort: 465,
        smtpSecure: true,
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.imap).toBe(true);
    expect(body.smtp).toBe(true);
    expect(mockConnect).toHaveBeenCalled();
    expect(mockVerify).toHaveBeenCalled();
  });

  it('returns imapError and ok: false when IMAP fails', async () => {
    mockImapFlow.mockImplementation(() => ({
      connect: jest.fn().mockRejectedValue(new Error('Invalid IMAP credentials')),
      logout: jest.fn(),
    }) as any);

    mockCreateTransport.mockReturnValue({
      verify: jest.fn().mockResolvedValue(true),
    });

    const res = await POST(
      createRequest({
        label: 'Test IMAP',
        provider: 'imap',
        color: '#3B82F6',
        emailAddress: 'test@example.com',
        username: 'test@example.com',
        password: 'wrongpassword',
        imapHost: 'imap.example.com',
        imapPort: 993,
        imapSecure: true,
        smtpHost: 'smtp.example.com',
        smtpPort: 465,
        smtpSecure: true,
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.imap).toBe(false);
    expect(body.smtp).toBe(true);
    expect(body.imapError).toBe('Invalid IMAP credentials');
  });
});
