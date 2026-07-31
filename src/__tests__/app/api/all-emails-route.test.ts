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
    favouriteAccount: {
      findMany: jest.fn(),
    },
    email: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

import type { NextRequest } from 'next/server';
import { GET } from '@/app/api/accounts/[id]/emails/route';
import { authenticate } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';

const mockAuthenticate = authenticate as jest.Mock;
const mockFindEmails = prisma.email.findMany as jest.Mock;
const mockCountEmails = prisma.email.count as jest.Mock;
const mockFindFavourites = prisma.favouriteAccount.findMany as jest.Mock;

describe('GET /api/accounts/all/emails', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticate.mockResolvedValue({
      userId: 'user-123',
      organizationId: 'org-456',
      role: 'member',
    });
    mockFindEmails.mockResolvedValue([
      {
        id: 'email-1',
        accountId: 'acc-1',
        subject: 'Test email',
        isRead: false,
        account: { id: 'acc-1', label: 'Work', emailAddress: 'work@example.com', color: '#3B82F6' },
      },
    ]);
    mockCountEmails.mockResolvedValue(1);
    mockFindFavourites.mockResolvedValue([{ accountId: 'acc-1' }]);
  });

  it('fetches emails across accounts with filter=all', async () => {
    const req = new Request('http://localhost/api/accounts/all/emails?filter=all') as NextRequest;
    const response = await GET(req, { params: Promise.resolve({ id: 'all' }) });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.emails).toHaveLength(1);
    expect(data.emails[0].account.label).toBe('Work');
  });

  it('passes unread filter correctly', async () => {
    const req = new Request('http://localhost/api/accounts/all/emails?filter=unread') as NextRequest;
    const response = await GET(req, { params: Promise.resolve({ id: 'all' }) });
    expect(response.status).toBe(200);
    expect(mockFindEmails).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isRead: false }),
      })
    );
  });

  it('supports mixing readStatus, accountScope, and favouriteEmailsOnly filters together', async () => {
    const req = new Request(
      'http://localhost/api/accounts/all/emails?readStatus=unread&accountScope=favourite-accounts&favouriteEmailsOnly=true'
    ) as NextRequest;
    const response = await GET(req, { params: Promise.resolve({ id: 'all' }) });
    expect(response.status).toBe(200);
    expect(mockFindEmails).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isRead: false,
          isStarred: true,
          accountId: { in: ['acc-1'] },
        }),
      })
    );
  });

  it('ignores filters (readStatus, accountScope, favouriteEmailsOnly) when accountId is a specific email account', async () => {
    (prisma.emailAccount.findFirst as jest.Mock).mockResolvedValue({ id: 'specific-acc-1' });

    const req = new Request(
      'http://localhost/api/accounts/specific-acc-1/emails?readStatus=unread&accountScope=favourite-accounts&favouriteEmailsOnly=true'
    ) as NextRequest;
    const response = await GET(req, { params: Promise.resolve({ id: 'specific-acc-1' }) });
    expect(response.status).toBe(200);
    expect(mockFindEmails).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          accountId: 'specific-acc-1',
        }),
      })
    );
    // Verify filters are not present in where clause
    const lastCallWhere = mockFindEmails.mock.calls[0][0].where;
    expect(lastCallWhere.isRead).toBeUndefined();
    expect(lastCallWhere.isStarred).toBeUndefined();
  });
});
