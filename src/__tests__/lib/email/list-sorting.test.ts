import { sortEmailsWithStarredFirst } from '@/lib/email/list-sorting';

describe('email list sorting', () => {
  it('keeps starred emails above unstarred emails, then sorts each group newest-first', () => {
    const emails = [
      { id: 'old-starred', isStarred: true, receivedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'new-unstarred', isStarred: false, receivedAt: '2026-03-01T00:00:00.000Z' },
      { id: 'new-starred', isStarred: true, receivedAt: '2026-04-01T00:00:00.000Z' },
    ];

    expect(sortEmailsWithStarredFirst(emails).map((email) => email.id)).toEqual([
      'new-starred',
      'old-starred',
      'new-unstarred',
    ]);
  });
});
