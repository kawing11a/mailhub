import { buildAttachmentReference } from '@/lib/email/attachment-references';

describe('buildAttachmentReference', () => {
  it('creates an ordinal-only reference for a received attachment without a provider part', () => {
    expect(buildAttachmentReference({ ordinal: 2 })).toEqual({
      ordinal: 2,
      imapPart: null,
      gmailAttachmentId: null,
    });
  });
});
