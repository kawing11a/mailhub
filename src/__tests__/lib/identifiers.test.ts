import { createOrganizationSlug, createUniqueId } from '@/lib/identifiers';

describe('identifier helpers', () => {
  it('creates distinct IDs when called in the same millisecond', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    try {
      const first = createUniqueId('sample');
      const second = createUniqueId('sample');

      expect(first).not.toBe(second);
      expect(first).toMatch(/^sample-[0-9a-f-]{36}$/);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('creates distinct organization slugs when called in the same millisecond', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    try {
      const first = createOrganizationSlug('Acme, Inc.');
      const second = createOrganizationSlug('Acme, Inc.');

      expect(first).not.toBe(second);
      expect(first).toMatch(/^acme-inc-[0-9a-f]{12}$/);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
