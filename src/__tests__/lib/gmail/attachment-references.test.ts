jest.mock('@/lib/redis', () => ({
  redis: { publish: jest.fn() },
}));

jest.mock('@/lib/queue/client', () => ({
  searchQueue: { add: jest.fn() },
}));

import { extractGmailAttachmentReferences } from '@/lib/gmail/sync-manager';

describe('extractGmailAttachmentReferences', () => {
  it('returns Gmail attachment IDs in payload order', () => {
    expect(
      extractGmailAttachmentReferences({
        mimeType: 'multipart/mixed',
        parts: [
          {
            partId: '1',
            mimeType: 'application/pdf',
            filename: 'a.pdf',
            body: { attachmentId: 'gmail-att-1' },
          },
        ],
      })
    ).toEqual([{ ordinal: 0, gmailAttachmentId: 'gmail-att-1' }]);
  });
});
