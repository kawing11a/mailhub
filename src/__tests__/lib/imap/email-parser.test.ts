import { parseEmail, resolveImapReceivedAt } from '@/lib/imap/email-parser';

function rawEmail(subject: string): Buffer {
  return Buffer.from(
    [
      'From: sender@example.com',
      'To: inbox@example.com',
      `Subject: ${subject}`,
      'Date: Wed, 20 Aug 2026 12:00:00 +0000',
      '',
      'Message body',
    ].join('\r\n')
  );
}

describe('email parser message identifiers', () => {
  it('generates distinct identifiers for different messages without Message-ID headers', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000);

    const [first, second] = await Promise.all([
      parseEmail(rawEmail('First message')),
      parseEmail(rawEmail('Second message')),
    ]);

    expect(first.messageId).not.toBe(second.messageId);
  });

  it('prefers the IMAP internal date over the RFC Date header for received time', () => {
    const headerDate = new Date('2026-08-20T12:00:00.000Z');
    const internalDate = new Date('2026-08-20T12:10:00.000Z');

    expect(resolveImapReceivedAt(internalDate, headerDate)).toEqual(internalDate);
  });

  it('falls back to the parsed header date when IMAP has no internal date', () => {
    const headerDate = new Date('2026-08-20T12:00:00.000Z');

    expect(resolveImapReceivedAt(undefined, headerDate)).toEqual(headerDate);
  });
});
