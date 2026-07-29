import { getEmailDisplayTimestamp } from '@/lib/email/timestamps';

describe('getEmailDisplayTimestamp', () => {
  const receivedAt = '2026-07-23T14:00:00.000Z';
  const sentAt = '2026-07-23T15:00:00.000Z';
  const createdAt = '2026-07-23T16:00:00.000Z';

  it('prefers sentAt for sent email', () => {
    expect(getEmailDisplayTimestamp({
      folder: 'SENT',
      sentAt,
      receivedAt,
      createdAt,
    })?.toISOString()).toBe(sentAt);
  });

  it('falls back through receivedAt and createdAt for sent email', () => {
    expect(getEmailDisplayTimestamp({
      folder: 'SENT',
      receivedAt,
      createdAt,
    })?.toISOString()).toBe(receivedAt);

    expect(getEmailDisplayTimestamp({
      folder: 'SENT',
      createdAt,
    })?.toISOString()).toBe(createdAt);
  });

  it('prefers receivedAt for non-sent email', () => {
    expect(getEmailDisplayTimestamp({
      folder: 'INBOX',
      sentAt,
      receivedAt,
    })?.toISOString()).toBe(receivedAt);
  });

  it('skips invalid values and returns null when no timestamp is usable', () => {
    expect(getEmailDisplayTimestamp({
      folder: 'SENT',
      sentAt: 'not-a-date',
      receivedAt,
    })?.toISOString()).toBe(receivedAt);
    expect(getEmailDisplayTimestamp({ folder: 'INBOX' })).toBeNull();
  });
});
