jest.mock('@/lib/auth/middleware', () => ({ authenticate: jest.fn() }));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    pushSubscription: { upsert: jest.fn() },
  },
}));

import type { NextRequest } from 'next/server';
import { POST } from '@/app/api/notifications/subscribe/route';
import { authenticate } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';

describe('POST /api/notifications/subscribe', () => {
  it('binds a push endpoint to the authenticated user', async () => {
    (authenticate as jest.Mock).mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });
    (prisma.pushSubscription.upsert as jest.Mock).mockResolvedValue({ id: 'sub-1' });

    const response = await POST(
      new Request('http://localhost/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: {
            endpoint: 'https://push.example/subscription',
            keys: { p256dh: 'key', auth: 'auth' },
          },
        }),
      }) as NextRequest
    );

    expect(response.status).toBe(200);
    expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
      where: { endpoint: 'https://push.example/subscription' },
      update: {
        p256dh: 'key',
        auth: 'auth',
        organizationId: 'org-1',
        userId: 'member-1',
      },
      create: {
        endpoint: 'https://push.example/subscription',
        p256dh: 'key',
        auth: 'auth',
        organizationId: 'org-1',
        userId: 'member-1',
      },
    });
  });
});
