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
      updateMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/accounts/service', () => ({
  getAccountStats: jest.fn(),
  getDecryptedAccount: jest.fn(),
}));

jest.mock('@/lib/queue/client', () => ({
  searchQueue: { addBulk: jest.fn() },
}));

jest.mock('@/lib/gmail/api', () => ({
  getValidAccessToken: jest.fn(),
  fetchMessagesList: jest.fn(),
  fetchMessageRaw: jest.fn(),
  syncDraftRaw: jest.fn(),
}));

jest.mock('imapflow', () => ({ ImapFlow: jest.fn() }));
jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
jest.mock('uuid', () => ({ v4: jest.fn(() => 'draft-message-id') }));

import type { NextRequest } from 'next/server';
import { PUT as saveDraft } from '@/app/api/accounts/[id]/drafts/route';
import { POST as syncDraft } from '@/app/api/accounts/[id]/drafts/sync/route';
import { POST as markRead } from '@/app/api/accounts/[id]/read-all/route';
import { POST as reindex } from '@/app/api/accounts/[id]/reindex/route';
import { GET as getStats } from '@/app/api/accounts/[id]/stats/route';
import { POST as testAccount } from '@/app/api/accounts/[id]/test/route';
import { POST as testSync } from '@/app/api/test-sync/route';
import { authenticate, requireAdmin } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';
import { getAccountStats, getDecryptedAccount } from '@/lib/accounts/service';
import { searchQueue } from '@/lib/queue/client';
import { ImapFlow } from 'imapflow';
import { createTransport } from 'nodemailer';

const memberWhere = {
  organizationId: 'org-1',
  id: 'hidden-account',
  OR: [
    { ownerUserId: 'member-1' },
    { memberAccess: { some: { userId: 'member-1' } } },
  ],
};

describe('related mail route account access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticate as jest.Mock).mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });
    (requireAdmin as jest.Mock).mockReturnValue(null);
  });

  it.each([
    ['save draft', saveDraft, 'PUT', { subject: 'secret' }],
    ['sync draft', syncDraft, 'POST', { draftId: 'draft-1' }],
  ])('blocks %s before reading or mutating draft content', async (_name, handler, method, body) => {
    (prisma.emailAccount.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await handler(
      new Request('http://localhost/api/accounts/hidden-account/drafts', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }) as NextRequest,
      { params: Promise.resolve({ id: 'hidden-account' }) }
    );

    expect(response.status).toBe(404);
    expect(prisma.emailAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: memberWhere })
    );
    expect(prisma.email.findFirst).not.toHaveBeenCalled();
  });

  it('blocks specific-account mark-all-read before email mutation', async () => {
    (prisma.emailAccount.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await markRead(
      new Request('http://localhost/api/accounts/hidden-account/read-all', {
        method: 'POST',
      }) as NextRequest,
      { params: Promise.resolve({ id: 'hidden-account' }) }
    );

    expect(response.status).toBe(404);
    expect(prisma.emailAccount.findFirst).toHaveBeenCalledWith({
      where: memberWhere,
      select: { id: true },
    });
    expect(prisma.email.updateMany).not.toHaveBeenCalled();
  });

  it('limits unified mark-all-read to the member accessible account set', async () => {
    (prisma.emailAccount.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.email.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    const response = await markRead(
      new Request('http://localhost/api/accounts/all/read-all', { method: 'POST' }) as NextRequest,
      { params: Promise.resolve({ id: 'all' }) }
    );

    expect(response.status).toBe(200);
    expect(prisma.emailAccount.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        OR: [
          { ownerUserId: 'member-1' },
          { memberAccess: { some: { userId: 'member-1' } } },
        ],
      },
      select: { id: true },
    });
  });

  it('blocks inaccessible reindex requests before reading email ids or queueing', async () => {
    (prisma.emailAccount.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await reindex(
      new Request('http://localhost/api/accounts/hidden-account/reindex', {
        method: 'POST',
      }) as NextRequest,
      { params: Promise.resolve({ id: 'hidden-account' }) }
    );

    expect(response.status).toBe(404);
    expect(prisma.emailAccount.findFirst).toHaveBeenCalledWith({ where: memberWhere });
    expect(prisma.email.findMany).not.toHaveBeenCalled();
    expect(searchQueue.addBulk).not.toHaveBeenCalled();
  });

  it('blocks inaccessible account stats before aggregate reads', async () => {
    (prisma.emailAccount.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await getStats(
      new Request('http://localhost/api/accounts/hidden-account/stats') as NextRequest,
      { params: Promise.resolve({ id: 'hidden-account' }) }
    );

    expect(response.status).toBe(404);
    expect(prisma.emailAccount.findFirst).toHaveBeenCalledWith({
      where: memberWhere,
      select: { id: true },
    });
    expect(getAccountStats).not.toHaveBeenCalled();
  });

  it('blocks test-sync before credentials or provider calls', async () => {
    (prisma.emailAccount.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await testSync(
      new Request('http://localhost/api/test-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: 'hidden-account' }),
      }) as NextRequest
    );

    expect(response.status).toBe(404);
    expect(prisma.emailAccount.findFirst).toHaveBeenCalledWith({ where: memberWhere });
    expect(ImapFlow).not.toHaveBeenCalled();
  });

  it('keeps admin account testing same-organization before decrypting credentials', async () => {
    (authenticate as jest.Mock).mockResolvedValue({
      userId: 'admin-1',
      organizationId: 'org-1',
      role: 'admin',
    });
    (prisma.emailAccount.findFirst as jest.Mock).mockResolvedValue(null);
    (getDecryptedAccount as jest.Mock).mockResolvedValue({
      id: 'cross-org-account',
      imapHost: '127.0.0.1',
      decryptedPassword: 'secret',
      emailAddress: 'hidden@example.com',
    });

    const response = await testAccount(
      new Request('http://localhost/api/accounts/cross-org-account/test', {
        method: 'POST',
      }) as NextRequest,
      { params: Promise.resolve({ id: 'cross-org-account' }) }
    );

    expect(response.status).toBe(404);
    expect(prisma.emailAccount.findFirst).toHaveBeenCalledWith({
      where: { id: 'cross-org-account', organizationId: 'org-1' },
      select: { id: true },
    });
    expect(getDecryptedAccount).not.toHaveBeenCalled();
    expect(ImapFlow).not.toHaveBeenCalled();
    expect(createTransport).not.toHaveBeenCalled();
  });
});
