jest.mock('@/lib/auth/middleware', () => ({ authenticate: jest.fn() }));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    label: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import type { NextRequest } from 'next/server';
import { PUT, DELETE } from '@/app/api/labels/[id]/route';
import { authenticate } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';

const memberEditableWhere = {
  id: 'label-1',
  organizationId: 'org-1',
  OR: [
    { accountLabels: { none: {} } },
    {
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
  ],
};

function updateRequest(): NextRequest {
  return new Request('http://localhost/api/labels/label-1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ color: '#10B981' }),
  }) as NextRequest;
}

function deleteRequest(): NextRequest {
  return new Request('http://localhost/api/labels/label-1', {
    method: 'DELETE',
  }) as NextRequest;
}

describe('member editable label predicate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authenticate as jest.Mock).mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });
  });

  it('does not let a member update a hidden-only label', async () => {
    (prisma.label.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await PUT(updateRequest(), {
      params: Promise.resolve({ id: 'label-1' }),
    });

    expect(response.status).toBe(404);
    expect(prisma.label.findFirst).toHaveBeenCalledWith({
      where: memberEditableWhere,
    });
    expect(prisma.label.update).not.toHaveBeenCalled();
  });

  it('lets a member update an unassigned or accessible label', async () => {
    (prisma.label.findFirst as jest.Mock).mockResolvedValue({
      id: 'label-1',
      organizationId: 'org-1',
      name: 'Inbox',
    });
    (prisma.label.update as jest.Mock).mockResolvedValue({
      id: 'label-1',
      name: 'Inbox',
      color: '#10B981',
    });

    const response = await PUT(updateRequest(), {
      params: Promise.resolve({ id: 'label-1' }),
    });

    expect(response.status).toBe(200);
    expect(prisma.label.update).toHaveBeenCalledWith({
      where: { id: 'label-1' },
      data: { color: '#10B981' },
    });
  });

  it('does not let a member delete a hidden-only label', async () => {
    (prisma.label.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await DELETE(deleteRequest(), {
      params: Promise.resolve({ id: 'label-1' }),
    });

    expect(response.status).toBe(404);
    expect(prisma.label.findFirst).toHaveBeenCalledWith({
      where: memberEditableWhere,
    });
    expect(prisma.label.delete).not.toHaveBeenCalled();
  });

  it('lets a member delete an unassigned or accessible label', async () => {
    (prisma.label.findFirst as jest.Mock).mockResolvedValue({
      id: 'label-1',
      organizationId: 'org-1',
      name: 'Inbox',
    });
    (prisma.label.delete as jest.Mock).mockResolvedValue({ id: 'label-1' });

    const response = await DELETE(deleteRequest(), {
      params: Promise.resolve({ id: 'label-1' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(prisma.label.delete).toHaveBeenCalledWith({ where: { id: 'label-1' } });
  });

  it('keeps admin update and delete lookup organization-wide', async () => {
    (authenticate as jest.Mock).mockResolvedValue({
      userId: 'admin-1',
      organizationId: 'org-1',
      role: 'admin',
    });
    (prisma.label.findFirst as jest.Mock).mockResolvedValue({
      id: 'label-1',
      organizationId: 'org-1',
      name: 'Hidden',
    });
    (prisma.label.update as jest.Mock).mockResolvedValue({ id: 'label-1' });
    (prisma.label.delete as jest.Mock).mockResolvedValue({ id: 'label-1' });

    expect(
      (await PUT(updateRequest(), { params: Promise.resolve({ id: 'label-1' }) })).status
    ).toBe(200);
    expect(
      (await DELETE(deleteRequest(), { params: Promise.resolve({ id: 'label-1' }) })).status
    ).toBe(200);
    expect(prisma.label.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.label.findFirst).toHaveBeenCalledWith({
      where: { id: 'label-1', organizationId: 'org-1' },
    });
  });
});
