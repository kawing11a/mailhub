jest.mock('@/lib/auth/middleware', () => ({
  authenticate: jest.fn(),
  requireAdmin: jest.fn(),
  apiResponse: (data: unknown, status = 200) => Response.json(data, { status }),
  apiError: (message: string, status = 400) =>
    Response.json({ error: message }, { status }),
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailAccount: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    email: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    attachment: {
      findUnique: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    favouriteAccount: { findMany: jest.fn() },
    label: { findFirst: jest.fn() },
    accountLabel: { findMany: jest.fn() },
  },
}));

jest.mock('@/lib/activity/log', () => ({ logActivity: jest.fn() }));
jest.mock('@/lib/email/server-sync', () => ({
  deleteOnServer: jest.fn(),
  moveToTrashOnServer: jest.fn(),
  restoreOnServer: jest.fn(),
  deleteManyOnServer: jest.fn(),
}));
jest.mock('@/lib/smtp/sender', () => ({ sendEmail: jest.fn() }));

import type { NextRequest } from 'next/server';
import { GET as getEmail } from '@/app/api/accounts/[id]/emails/[emailId]/route';
import { GET as getAttachment } from '@/app/api/accounts/[id]/emails/[emailId]/attachments/[attachmentId]/route';
import { POST as restoreEmail } from '@/app/api/accounts/[id]/emails/[emailId]/restore/route';
import { POST as emptyTrash } from '@/app/api/accounts/[id]/emails/empty-trash/route';
import { GET as getNewEmails } from '@/app/api/emails/new/route';
import { GET as getThread } from '@/app/api/emails/thread/[threadId]/route';
import { authenticate } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';
import { restoreOnServer, deleteManyOnServer } from '@/lib/email/server-sync';

const memberAccountWhere = {
  organizationId: 'org-1',
  OR: [
    { ownerUserId: 'member-1' },
    { memberAccess: { some: { userId: 'member-1' } } },
  ],
};

describe('mail content account access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticate as jest.Mock).mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });
  });

  it('filters unified email detail before returning or marking content read', async () => {
    (prisma.email.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await getEmail(
      new Request('http://localhost/api/accounts/all/emails/email-hidden') as NextRequest,
      { params: Promise.resolve({ id: 'all', emailId: 'email-hidden' }) }
    );

    expect(response.status).toBe(404);
    expect(prisma.email.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'email-hidden', account: memberAccountWhere },
      })
    );
    expect(prisma.email.update).not.toHaveBeenCalled();
  });

  it('filters unified attachments before reading attachment metadata or storage', async () => {
    (prisma.email.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await getAttachment(
      new Request('http://localhost/api/accounts/all/emails/email-hidden/attachments/att-1') as NextRequest,
      {
        params: Promise.resolve({
          id: 'all',
          emailId: 'email-hidden',
          attachmentId: 'att-1',
        }),
      }
    );

    expect(response.status).toBe(404);
    expect(prisma.email.findFirst).toHaveBeenCalledWith({
      where: { id: 'email-hidden', account: memberAccountWhere },
      select: { id: true },
    });
    expect(prisma.attachment.findUnique).not.toHaveBeenCalled();
  });

  it('filters unified restore before provider or local mutation calls', async () => {
    (prisma.email.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await restoreEmail(
      new Request('http://localhost/api/accounts/new-emails/emails/email-hidden/restore', {
        method: 'POST',
      }) as NextRequest,
      { params: Promise.resolve({ id: 'new-emails', emailId: 'email-hidden' }) }
    );

    expect(response.status).toBe(404);
    expect(prisma.email.findFirst).toHaveBeenCalledWith({
      where: { id: 'email-hidden', account: memberAccountWhere },
    });
    expect(restoreOnServer).not.toHaveBeenCalled();
    expect(prisma.email.update).not.toHaveBeenCalled();
  });

  it('filters unified empty-trash reads before provider and deletion calls', async () => {
    (prisma.email.findMany as jest.Mock).mockResolvedValue([]);

    const response = await emptyTrash(
      new Request('http://localhost/api/accounts/all/emails/empty-trash', {
        method: 'POST',
      }) as NextRequest,
      { params: Promise.resolve({ id: 'all' }) }
    );

    expect(response.status).toBe(200);
    expect(prisma.email.findMany).toHaveBeenCalledWith({
      where: { folder: 'TRASH', account: memberAccountWhere },
      select: { id: true, accountId: true, uid: true, folder: true, messageId: true },
    });
    expect(deleteManyOnServer).not.toHaveBeenCalled();
    expect(prisma.email.deleteMany).not.toHaveBeenCalled();
  });

  it('loads standalone new-email data only from accessible accounts', async () => {
    (prisma.emailAccount.findMany as jest.Mock).mockResolvedValue([]);

    const response = await getNewEmails(
      new Request('http://localhost/api/emails/new') as NextRequest
    );

    expect(response.status).toBe(200);
    expect(prisma.emailAccount.findMany).toHaveBeenCalledWith({
      where: memberAccountWhere,
      select: { id: true, initialSyncCompletedAt: true },
    });
    expect(prisma.email.findMany).not.toHaveBeenCalled();
  });

  it('filters thread content across accessible accounts only', async () => {
    (prisma.email.findMany as jest.Mock).mockResolvedValue([]);

    const response = await getThread(
      new Request('http://localhost/api/emails/thread/thread-1') as NextRequest,
      { params: Promise.resolve({ threadId: 'thread-1' }) }
    );

    expect(response.status).toBe(404);
    expect(prisma.email.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { threadId: 'thread-1', account: memberAccountWhere },
      })
    );
  });
});
