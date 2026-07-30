import { signatureSchema } from '@/lib/validation/schemas';

describe('signatureSchema', () => {
  it('validates valid signature data', () => {
    const input = { name: 'Work Signature', contentHtml: '<p>Best regards,</p>', isDefault: true };
    const result = signatureSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it('provides default value for isDefault if omitted', () => {
    const input = { name: 'Personal Signature', contentHtml: '<p>Thanks</p>' };
    const result = signatureSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isDefault).toBe(false);
    }
  });

  it('rejects empty signature name', () => {
    const input = { name: '', contentHtml: '<p>Best,</p>' };
    const result = signatureSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});
