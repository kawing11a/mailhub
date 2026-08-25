import { extractImapAttachmentReferences } from '@/lib/imap/email-parser';

describe('extractImapAttachmentReferences', () => {
  it('returns nested IMAP attachment MIME parts in message order', () => {
    expect(
      extractImapAttachmentReferences({
        type: 'multipart',
        childNodes: [
          { part: '1', type: 'text', disposition: 'inline' },
          {
            part: '2',
            type: 'multipart',
            childNodes: [
              {
                part: '2.1',
                type: 'application',
                disposition: 'attachment',
                dispositionParameters: { filename: 'a.pdf' },
              },
              { part: '2.2', type: 'image', disposition: 'inline', id: '<cid-1>' },
            ],
          },
        ],
      })
    ).toEqual([
      { ordinal: 0, imapPart: '2.1' },
      { ordinal: 1, imapPart: '2.2' },
    ]);
  });
});
