import {
  formatStoredAddress,
  formatStoredAddresses,
  normalizeStoredAddresses,
} from '@/lib/email/display-addresses';

describe('email address display helpers', () => {
  it('formats names and addresses consistently', () => {
    expect(formatStoredAddress({ name: 'Alice', address: 'alice@example.com' }))
      .toBe('Alice <alice@example.com>');
    expect(formatStoredAddress({ address: 'bob@example.com' }))
      .toBe('bob@example.com');
  });

  it('normalizes string and object entries while dropping malformed values', () => {
    expect(normalizeStoredAddresses([
      ' first@example.com ',
      { name: ' Second ', address: ' second@example.com ' },
      null,
      {},
      { name: 'Missing address' },
    ])).toEqual([
      { address: 'first@example.com' },
      { name: 'Second', address: 'second@example.com' },
    ]);
  });

  it('returns a comma-separated list and handles non-arrays', () => {
    expect(formatStoredAddresses([
      { name: 'Alice', address: 'alice@example.com' },
      { address: 'bob@example.com' },
    ])).toBe('Alice <alice@example.com>, bob@example.com');
    expect(formatStoredAddresses(null)).toBe('');
  });
});
