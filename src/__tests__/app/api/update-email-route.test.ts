jest.mock('@/lib/auth/middleware', () => ({
  authenticate: jest.fn(),
  apiResponse: (data: unknown, status = 200) => Response.json(data, { status }),
  apiError: (message: string, status = 400) => Response.json({ error: message }, { status }),
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    email: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/activity/log', () => ({ logActivity: jest.fn() }));
jest.mock('@/lib/email/server-sync', () => ({
  deleteOnServer: jest.fn(),
  moveToTrashOnServer: jest.fn(),
}));

import type { NextRequest } from 'next/server';
import { PUT } from '@/app/api/accounts/[id]/emails/[emailId]/route';
import { authenticate } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';

describe('PUT /api/accounts/all/emails/:emailId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticate as jest.Mock).mockResolvedValue({
      userId: 'user-123',
      organizationId: 'org-456',
      role: 'member',
    });
    (prisma.email.update as jest.Mock).mockResolvedValue({ id: 'email-1', isRead: true });
  });

  it('keeps sent emails read when asked to mark them unread', async () => {
    (prisma.email.findFirst as jest.Mock).mockResolvedValue({
      id: 'email-1',
      folder: 'SENT',
      isRead: true,
    });

    const req = new Request('http://localhost/api/accounts/all/emails/email-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isRead: false }),
    }) as NextRequest;

    const response = await PUT(req, {
      params: Promise.resolve({ id: 'all', emailId: 'email-1' }),
    });

    expect(response.status).toBe(200);
    expect(prisma.email.update).toHaveBeenCalledWith({
      where: { id: 'email-1' },
      data: { isRead: true },
    });
    expect(prisma.email.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'email-1',
        account: {
          organizationId: 'org-456',
          OR: [
            { ownerUserId: 'user-123' },
            { memberAccess: { some: { userId: 'user-123' } } },
          ],
        },
      },
    });
  });
});
