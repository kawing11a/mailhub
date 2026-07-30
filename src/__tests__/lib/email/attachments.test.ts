import { sendEmailSchema } from '@/lib/validation/schemas';
import { isEmptyDraft, type DraftSnapshot } from '@/lib/email/draft-autosave';

describe('Attachment validation and autosave', () => {
  it('validates email input with attachments', () => {
    const input = {
      to: ['test@example.com'],
      subject: 'Test subject',
      bodyText: 'Hello world',
      attachments: [
        {
          filename: 'test.pdf',
          contentType: 'application/pdf',
          content: 'SGVsbG8gV29ybGQ=',
          sizeBytes: 11,
        },
      ],
    };

    const parsed = sendEmailSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.attachments).toHaveLength(1);
      expect(parsed.data.attachments?.[0].filename).toBe('test.pdf');
    }
  });

  it('considers a draft non-empty when attachments are present even without body text', () => {
    const snapshot: DraftSnapshot = {
      accountId: 'account-1',
      to: '',
      cc: '',
      bcc: '',
      subject: '',
      bodyHtml: '',
      bodyText: '',
      attachments: [
        {
          filename: 'image.png',
          contentType: 'image/png',
          content: 'base64data',
          sizeBytes: 100,
        },
      ],
    };

    expect(isEmptyDraft(snapshot)).toBe(false);
  });
});
