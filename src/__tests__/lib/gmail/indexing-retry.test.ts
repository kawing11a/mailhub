jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    email: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/gmail/api', () => ({
  getValidAccessToken: jest.fn(),
  fetchMessagesList: jest.fn(),
  fetchMessageFull: jest.fn(),
  fetchMessageRaw: jest.fn(),
  extractGmailAttachmentParts: jest.fn(() => []),
}));

jest.mock('@/lib/imap/email-parser', () => ({ parseEmail: jest.fn() }));
jest.mock('@/lib/imap/threading', () => ({ resolveThreadId: jest.fn() }));
jest.mock('@/lib/email/attachment-storage', () => ({
  buildReceivedAttachmentMetadata: jest.fn(() => []),
}));
jest.mock('@/lib/queue/client', () => ({ searchQueue: { add: jest.fn() } }));
jest.mock('@/lib/redis', () => ({ redis: { publish: jest.fn() } }));
jest.mock('@/lib/ai/spam-checker', () => ({ checkIsHighRisk: jest.fn() }));
jest.mock('@/lib/rules/engine', () => ({ processRulesForNewEmail: jest.fn() }));
jest.mock('@/lib/retry', () => ({ retryAsync: (operation: () => unknown) => operation() }));
jest.mock('@/lib/runtime-config', () => ({
  runtimeConfig: { emailPersistConcurrency: 1, gmailPollIntervalMs: 60_000 },
}));

import { prisma } from '@/lib/db/prisma';
import { fetchMessageFull, fetchMessageRaw } from '@/lib/gmail/api';
import { parseEmail } from '@/lib/imap/email-parser';
import { resolveThreadId } from '@/lib/imap/threading';
import { searchQueue } from '@/lib/queue/client';
import { GmailSyncManager } from '@/lib/gmail/sync-manager';

describe('Gmail indexing retry', () => {
  it('re-attempts indexing when a retry upserts an email persisted before a queue failure', async () => {
    const newlyPersistedEmail = {
      id: 'email-1',
      createdAt: new Date(),
    };
    const previouslyPersistedEmail = {
      id: 'email-1',
      createdAt: new Date('2020-01-01T00:00:00.000Z'),
    };
    const transactionClient = {
      email: {
        upsert: jest
          .fn()
          .mockResolvedValueOnce(newlyPersistedEmail)
          .mockResolvedValueOnce(previouslyPersistedEmail),
      },
      emailBody: { upsert: jest.fn() },
      attachment: { update: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
    };
    (prisma.email.findUnique as jest.Mock).mockResolvedValue({ attachments: [] });
    (prisma.$transaction as jest.Mock).mockImplementation((operation) => operation(transactionClient));
    (fetchMessageFull as jest.Mock).mockResolvedValue({ payload: {} });
    (fetchMessageRaw as jest.Mock).mockResolvedValue(Buffer.from('raw'));
    (parseEmail as jest.Mock).mockResolvedValue({
      messageId: '<message-1@example.test>',
      inReplyTo: null,
      referencesHeader: null,
      attachments: [],
      subject: 'Subject',
      snippet: 'Snippet',
      fromAddress: 'sender@example.test',
      fromName: 'Sender',
      toAddresses: [],
      ccAddresses: [],
      bccAddresses: [],
      replyTo: null,
      hasAttachments: false,
      receivedAt: new Date('2026-08-26T00:00:00.000Z'),
      sentAt: new Date('2026-08-26T00:00:00.000Z'),
      rawHeaders: {},
      bodyHtml: null,
      bodyText: 'Body',
    });
    (resolveThreadId as jest.Mock).mockResolvedValue(null);
    (searchQueue.add as jest.Mock).mockRejectedValueOnce(new Error('search queue unavailable'));

    const manager = new GmailSyncManager();

    await expect(
      (manager as any).fetchAndPersist('access-token', 'account-1', 'org-1', 'message-1', 'INBOX', true)
    ).resolves.toBe(false);
    await expect(
      (manager as any).fetchAndPersist('access-token', 'account-1', 'org-1', 'message-1', 'INBOX', true)
    ).resolves.toBe(true);

    expect(searchQueue.add).toHaveBeenCalledTimes(2);
    expect(searchQueue.add).toHaveBeenLastCalledWith('index-email', { emailId: 'email-1' });
  });
});
