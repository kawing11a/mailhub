jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailAccount: { findMany: jest.fn() },
  },
}));

import {
  formatAccessibleSseMessage,
  loadAccessibleRealtimeAccountIds,
} from '@/lib/realtime/access';
import { prisma } from '@/lib/db/prisma';

describe('realtime account audience', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads only member-accessible account ids through the shared predicate', async () => {
    (prisma.emailAccount.findMany as jest.Mock).mockResolvedValue([
      { id: 'owned-account' },
      { id: 'shared-account' },
    ]);

    const ids = await loadAccessibleRealtimeAccountIds({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });

    expect(ids).toEqual(new Set(['owned-account', 'shared-account']));
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

  it('keeps the admin audience organization-wide', async () => {
    (prisma.emailAccount.findMany as jest.Mock).mockResolvedValue([
      { id: 'account-1' },
      { id: 'account-2' },
    ]);

    await loadAccessibleRealtimeAccountIds({
      userId: 'admin-1',
      organizationId: 'org-1',
      role: 'admin',
    });

    expect(prisma.emailAccount.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      select: { id: true },
    });
  });

  it('drops inaccessible account ids, subjects, and senders as one message', () => {
    const message = JSON.stringify({
      event: 'new_email',
      accountId: 'hidden-account',
      subject: 'Confidential acquisition',
      from: 'ceo@example.com',
    });

    expect(
      formatAccessibleSseMessage(message, new Set(['visible-account']))
    ).toBeNull();
  });

  it('preserves the named SSE event contract for an accessible account', () => {
    const message = JSON.stringify({
      event: 'new_email',
      accountId: 'visible-account',
      subject: 'Hello',
      from: 'sender@example.com',
    });

    expect(
      formatAccessibleSseMessage(message, new Set(['visible-account']))
    ).toBe(`event: new_email\ndata: ${message}\n\n`);
  });

  it('drops malformed or unscoped messages instead of forwarding unknown content', () => {
    expect(formatAccessibleSseMessage('not-json', new Set(['account-1']))).toBeNull();
    expect(
      formatAccessibleSseMessage(
        JSON.stringify({ event: 'new_email', subject: 'No account context' }),
        new Set(['account-1'])
      )
    ).toBeNull();
  });
});
