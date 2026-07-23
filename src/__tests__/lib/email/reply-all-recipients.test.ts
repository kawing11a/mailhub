import { buildReplyAllRecipients } from '@/lib/email/addresses';

describe('buildReplyAllRecipients', () => {
  it('keeps the original sender and removes the receiving account', () => {
    expect(buildReplyAllRecipients({
      fromAddress: 'sender@example.com',
      toAddresses: [
        { address: 'me@example.com' },
        { address: 'other@example.com' },
      ],
      ccAddresses: [{ address: 'copy@example.com' }],
      currentAccountAddress: 'ME@example.com',
    })).toEqual({
      to: ['sender@example.com', 'other@example.com'],
      cc: ['copy@example.com'],
    });
  });

  it('handles a sent message without adding the sender account', () => {
    expect(buildReplyAllRecipients({
      fromAddress: 'me@example.com',
      toAddresses: [
        { address: 'first@example.com' },
        { address: 'second@example.com' },
      ],
      ccAddresses: [{ address: 'copy@example.com' }],
      currentAccountAddress: 'me@example.com',
    })).toEqual({
      to: ['first@example.com', 'second@example.com'],
      cc: ['copy@example.com'],
    });
  });

  it('prefers Reply-To and deduplicates addresses case-insensitively', () => {
    expect(buildReplyAllRecipients({
      replyTo: 'replies@example.com',
      fromAddress: 'sender@example.com',
      toAddresses: [
        { address: 'REPLIES@example.com' },
        { address: 'direct@example.com' },
      ],
      ccAddresses: [
        { address: 'Direct@example.com' },
        { address: 'copy@example.com' },
        { address: 'COPY@example.com' },
      ],
      currentAccountAddress: 'me@example.com',
    })).toEqual({
      to: ['replies@example.com', 'direct@example.com'],
      cc: ['copy@example.com'],
    });
  });

  it('falls back to From when Reply-To is unusable', () => {
    expect(buildReplyAllRecipients({
      replyTo: 'invalid',
      fromAddress: 'sender@example.com',
      toAddresses: [{ address: 'me@example.com' }],
      currentAccountAddress: 'me@example.com',
    })).toEqual({
      to: ['sender@example.com'],
      cc: [],
    });
  });

  it('promotes the first Cc recipient when To would be empty', () => {
    expect(buildReplyAllRecipients({
      fromAddress: 'me@example.com',
      toAddresses: [{ address: 'ME@example.com' }],
      ccAddresses: [
        { address: 'first@example.com' },
        { address: 'second@example.com' },
      ],
      currentAccountAddress: 'me@example.com',
    })).toEqual({
      to: ['first@example.com'],
      cc: ['second@example.com'],
    });
  });

  it('ignores empty and malformed stored entries', () => {
    expect(buildReplyAllRecipients({
      fromAddress: 'sender@example.com',
      toAddresses: [null, {}, { address: '' }, { address: 'invalid' }],
      ccAddresses: 'not-an-array',
      currentAccountAddress: 'me@example.com',
    })).toEqual({
      to: ['sender@example.com'],
      cc: [],
    });
  });
});
