jest.mock('@/lib/auth/middleware', () => ({
  authenticate: jest.fn(),
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    label: {
      findMany: jest.fn(),
    },
  },
}));

import type { NextRequest } from 'next/server';
import { GET } from '@/app/api/labels/route';
import { authenticate } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';

const mockAuthenticate = authenticate as jest.Mock;
const mockFindMany = prisma.label.findMany as jest.Mock;

describe('GET /api/labels', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns only member-visible labels and only the visible account ids', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });
    mockFindMany.mockResolvedValue([
      {
        id: 'label-1',
        organizationId: 'org-1',
        name: 'Shared',
        color: '#3B82F6',
        description: null,
        icon: null,
        createdAt: new Date('2026-08-18T12:00:00.000Z'),
        accountLabels: [
          { accountId: '11111111-1111-4111-8111-111111111111' },
        ],
      },
    ]);

    const response = await GET(
      new Request('http://localhost/api/labels') as NextRequest
    );

    expect(response.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        accountLabels: {
          some: {
            account: {
              organizationId: 'org-1',
              OR: [
                { ownerUserId: 'member-1' },
                { memberAccess: { some: { userId: 'member-1' } } },
              ],
            },
          },
        },
      },
      orderBy: { name: 'asc' },
      include: {
        accountLabels: {
          where: {
            account: {
              organizationId: 'org-1',
              OR: [
                { ownerUserId: 'member-1' },
                { memberAccess: { some: { userId: 'member-1' } } },
              ],
            },
          },
          select: { accountId: true },
        },
      },
    });

    expect(await response.json()).toEqual({
      labels: [
        expect.objectContaining({
          id: 'label-1',
          name: 'Shared',
          accountIds: ['11111111-1111-4111-8111-111111111111'],
        }),
      ],
    });
  });

  it('keeps admin label visibility organization-wide while still excluding unassigned labels', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'admin-1',
      organizationId: 'org-1',
      role: 'admin',
    });
    mockFindMany.mockResolvedValue([
      {
        id: 'label-1',
        organizationId: 'org-1',
        name: 'Ops',
        color: '#10B981',
        description: null,
        icon: null,
        createdAt: new Date('2026-08-18T12:00:00.000Z'),
        accountLabels: [
          { accountId: '11111111-1111-4111-8111-111111111111' },
          { accountId: '22222222-2222-4222-8222-222222222222' },
        ],
      },
    ]);

    const response = await GET(
      new Request('http://localhost/api/labels') as NextRequest
    );

    expect(response.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        accountLabels: {
          some: {
            account: {
              organizationId: 'org-1',
            },
          },
        },
      },
      orderBy: { name: 'asc' },
      include: {
        accountLabels: {
          where: {
            account: {
              organizationId: 'org-1',
            },
          },
          select: { accountId: true },
        },
      },
    });

    expect(await response.json()).toEqual({
      labels: [
        expect.objectContaining({
          id: 'label-1',
          accountIds: [
            '11111111-1111-4111-8111-111111111111',
            '22222222-2222-4222-8222-222222222222',
          ],
        }),
      ],
    });
  });
});
