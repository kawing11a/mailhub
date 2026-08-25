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
    attachment: {
      create: jest.fn(),
    },
  },
}));

jest.mock('@/lib/smtp/sender', () => ({
  sendEmail: jest.fn(),
}));

jest.mock('@/lib/activity/log', () => ({
  logActivity: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
}));

jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'attachment-1'),
}));

import type { NextRequest } from 'next/server';
import * as fs from 'fs/promises';
import { POST } from '@/app/api/accounts/[id]/emails/send/route';
import { authenticate } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';
import { sendEmail } from '@/lib/smtp/sender';
import { logActivity } from '@/lib/activity/log';

const mockAuthenticate = authenticate as jest.Mock;
const mockFindAccount = prisma.emailAccount.findFirst as jest.Mock;
const mockCreateEmail = prisma.email.create as jest.Mock;
const mockCreateAttachment = prisma.attachment.create as jest.Mock;
const mockDeleteDraft = prisma.email.deleteMany as jest.Mock;
const mockSendEmail = sendEmail as jest.Mock;
const mockLogActivity = logActivity as jest.Mock;
const mockMkdir = fs.mkdir as jest.Mock;
const mockWriteFile = fs.writeFile as jest.Mock;

function createRequest(
  overrides: Partial<{
    bodyText: string | undefined;
    bodyHtml: string | undefined;
    attachments:
      | Array<{
          filename: string;
          contentType: string;
          content: string;
          sizeBytes?: number;
        }>
      | undefined;
  }> = {}
): NextRequest {
  return new Request('http://localhost/api/accounts/account-1/emails/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: ['recipient@example.com'],
      subject: 'Timestamp test',
      bodyText: 'Hello',
      attachments: undefined,
      ...overrides,
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
    mockCreateAttachment.mockResolvedValue({ id: 'attachment-1' });
    mockDeleteDraft.mockResolvedValue({ count: 0 });
    mockLogActivity.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
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
    expect(data.snippet).toBe('Hello');

    const body = await response.json();
    expect(body.sentAt).toBe(data.sentAt.toISOString());
  });

  it('stores a readable snippet for an HTML-only message', async () => {
    mockSendEmail.mockResolvedValue({ messageId: '<html@example.com>' });

    const response = await POST(createRequest({
      bodyText: undefined,
      bodyHtml: '<p>Hello&nbsp;<strong>from HTML</strong></p>',
    }), {
      params: Promise.resolve({ id: 'account-1' }),
    });

    expect(response.status).toBe(200);
    expect(mockCreateEmail.mock.calls[0][0].data.snippet).toBe('Hello from HTML');
  });

  it('limits snippets to 300 characters and accepts an empty body', async () => {
    mockSendEmail.mockResolvedValue({ messageId: '<long@example.com>' });

    await POST(createRequest({ bodyText: 'a'.repeat(350) }), {
      params: Promise.resolve({ id: 'account-1' }),
    });
    expect(mockCreateEmail.mock.calls[0][0].data.snippet).toHaveLength(300);

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
    mockSendEmail.mockResolvedValue({ messageId: '<empty@example.com>' });
    mockCreateEmail.mockResolvedValue({ id: 'email-2' });
    mockLogActivity.mockResolvedValue(undefined);

    const response = await POST(createRequest({ bodyText: undefined }), {
      params: Promise.resolve({ id: 'account-1' }),
    });
    expect(response.status).toBe(200);
    expect(mockCreateEmail.mock.calls[0][0].data.snippet).toBe('');
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

  it('stores sent attachments on local storage paths and keeps provider reference fields unset', async () => {
    mockSendEmail.mockResolvedValue({ messageId: '<attachment@example.com>' });

    const response = await POST(
      createRequest({
        attachments: [
          {
            filename: 'report.pdf',
            contentType: 'application/pdf',
            content: Buffer.from('pdf').toString('base64'),
          },
        ],
      }),
      {
        params: Promise.resolve({ id: 'account-1' }),
      }
    );

    expect(response.status).toBe(200);
    expect(mockMkdir).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('.storage'),
      Buffer.from('pdf')
    );
    expect(mockCreateAttachment).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'attachment-1',
        emailId: 'email-1',
        filename: 'report.pdf',
        contentType: 'application/pdf',
        sizeBytes: 3,
        storagePath: expect.stringContaining('.storage'),
      }),
    });
    expect(mockCreateAttachment.mock.calls[0][0].data).toEqual(
      expect.not.objectContaining({
        ordinal: expect.anything(),
        imapPart: expect.anything(),
        gmailAttachmentId: expect.anything(),
      })
    );
  });

  it('blocks a member without account access before sending or saving content', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });
    mockFindAccount.mockResolvedValue(null);

    const response = await POST(createRequest(), {
      params: Promise.resolve({ id: 'hidden-account' }),
    });

    expect(response.status).toBe(404);
    expect(mockFindAccount).toHaveBeenCalledWith({
      where: {
        id: 'hidden-account',
        organizationId: 'org-1',
        OR: [
          { ownerUserId: 'member-1' },
          { memberAccess: { some: { userId: 'member-1' } } },
        ],
      },
      select: { id: true, emailAddress: true },
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockCreateEmail).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });
});
