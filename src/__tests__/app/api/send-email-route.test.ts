jest.mock('@/lib/auth/middleware', () => ({
  authenticate: jest.fn(),
  apiResponse: (data: unknown, status = 200) =>
    Response.json(data, { status }),
  apiError: (message: string, status = 400) =>
    Response.json({ error: message }, { status }),
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailAccount: {
      findFirst: jest.fn(),
    },
    email: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/smtp/sender', () => ({
  sendEmail: jest.fn(),
}));

jest.mock('@/lib/activity/log', () => ({
  logActivity: jest.fn(),
}));

import type { NextRequest } from 'next/server';
import { POST } from '@/app/api/accounts/[id]/emails/send/route';
import { authenticate } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';
import { sendEmail } from '@/lib/smtp/sender';
import { logActivity } from '@/lib/activity/log';

const mockAuthenticate = authenticate as jest.Mock;
const mockFindAccount = prisma.emailAccount.findFirst as jest.Mock;
const mockCreateEmail = prisma.email.create as jest.Mock;
const mockDeleteDraft = prisma.email.deleteMany as jest.Mock;
const mockSendEmail = sendEmail as jest.Mock;
const mockLogActivity = logActivity as jest.Mock;

function createRequest(): NextRequest {
  return new Request('http://localhost/api/accounts/account-1/emails/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: ['recipient@example.com'],
      subject: 'Timestamp test',
      bodyText: 'Hello',
    }),
  }) as NextRequest;
}

describe('POST sent email', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticate.mockResolvedValue({
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'admin',
    });
    mockFindAccount.mockResolvedValue({
      id: 'account-1',
      emailAddress: 'sender@example.com',
    });
    mockCreateEmail.mockResolvedValue({ id: 'email-1' });
    mockDeleteDraft.mockResolvedValue({ count: 0 });
    mockLogActivity.mockResolvedValue(undefined);
  });

  it('stores one provider-confirmed time as sentAt and receivedAt', async () => {
    mockSendEmail.mockResolvedValue({ messageId: '<sent@example.com>' });
    const beforeSend = Date.now();

    const response = await POST(createRequest(), {
      params: Promise.resolve({ id: 'account-1' }),
    });
    const afterSend = Date.now();

    expect(response.status).toBe(200);
    expect(mockCreateEmail).toHaveBeenCalledTimes(1);

    const data = mockCreateEmail.mock.calls[0][0].data;
    expect(data.sentAt).toBeInstanceOf(Date);
    expect(data.receivedAt).toBe(data.sentAt);
    expect(data.sentAt.getTime()).toBeGreaterThanOrEqual(beforeSend);
    expect(data.sentAt.getTime()).toBeLessThanOrEqual(afterSend);

    const body = await response.json();
    expect(body.sentAt).toBe(data.sentAt.toISOString());
  });

  it('does not create a local Sent record when provider sending fails', async () => {
    mockSendEmail.mockRejectedValue(new Error('Provider rejected message'));

    const response = await POST(createRequest(), {
      params: Promise.resolve({ id: 'account-1' }),
    });

    expect(response.status).toBe(500);
    expect(mockCreateEmail).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});
