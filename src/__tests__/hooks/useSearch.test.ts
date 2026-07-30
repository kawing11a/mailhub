import { getEmailDisplayTimestamp } from '@/lib/email/timestamps';

describe('Search result sorting (time desc then similarity)', () => {
  it('sorts search hits by timestamp descending', () => {
    const hits = [
      { id: '1', subject: 'Older relevant', receivedAt: '2026-07-20T10:00:00.000Z' },
      { id: '2', subject: 'Newer relevant', receivedAt: '2026-07-25T10:00:00.000Z' },
      { id: '3', subject: 'Oldest relevant', receivedAt: '2026-07-10T10:00:00.000Z' },
    ];

    const indexed = hits.map((hit, index) => ({ hit, index }));
    indexed.sort((a, b) => {
      const dateA = getEmailDisplayTimestamp(a.hit);
      const dateB = getEmailDisplayTimestamp(b.hit);
      const timeA = dateA ? dateA.getTime() : 0;
      const timeB = dateB ? dateB.getTime() : 0;

      if (timeB !== timeA) {
        return timeB - timeA;
      }
      return a.index - b.index;
    });

    const sorted = indexed.map((item) => item.hit);

    expect(sorted.map(s => s.id)).toEqual(['2', '1', '3']);
  });

  it('uses similarity rank as tie-breaker when timestamps match', () => {
    const sameTime = '2026-07-25T10:00:00.000Z';
    const hits = [
      { id: '1', subject: 'Most similar', receivedAt: sameTime },
      { id: '2', subject: 'Second most similar', receivedAt: sameTime },
      { id: '3', subject: 'Third most similar', receivedAt: sameTime },
    ];

    const indexed = hits.map((hit, index) => ({ hit, index }));
    indexed.sort((a, b) => {
      const dateA = getEmailDisplayTimestamp(a.hit);
      const dateB = getEmailDisplayTimestamp(b.hit);
      const timeA = dateA ? dateA.getTime() : 0;
      const timeB = dateB ? dateB.getTime() : 0;

      if (timeB !== timeA) {
        return timeB - timeA;
      }
      return a.index - b.index;
    });

    const sorted = indexed.map((item) => item.hit);

    expect(sorted.map(s => s.id)).toEqual(['1', '2', '3']);
  });

  it('handles numeric timestamp values from Meilisearch', () => {
    const hits = [
      { id: '1', subject: 'Older numeric', receivedAt: 1700000000000 },
      { id: '2', subject: 'Newer numeric', receivedAt: 1800000000000 },
    ];

    const indexed = hits.map((hit, index) => ({ hit, index }));
    indexed.sort((a, b) => {
      const dateA = getEmailDisplayTimestamp(a.hit);
      const dateB = getEmailDisplayTimestamp(b.hit);
      const timeA = dateA ? dateA.getTime() : 0;
      const timeB = dateB ? dateB.getTime() : 0;

      if (timeB !== timeA) {
        return timeB - timeA;
      }
      return a.index - b.index;
    });

    const sorted = indexed.map((item) => item.hit);

    expect(sorted.map(s => s.id)).toEqual(['2', '1']);
  });
});
