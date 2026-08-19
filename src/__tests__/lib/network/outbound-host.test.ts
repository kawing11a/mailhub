import {
  resolveSafeOutboundHost,
  UnsafeOutboundHostError,
  type OutboundHostLookup,
} from '@/lib/network/outbound-host';

const unusedLookup: OutboundHostLookup = jest.fn(async () => {
  throw new Error('DNS lookup should not run for an IP literal');
});

describe('outbound mail host validation', () => {
  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '192.0.2.1',
    '198.18.0.1',
    '224.0.0.1',
    '240.0.0.1',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    'ff00::1',
    '2001:db8::1',
  ])('rejects non-public literal destination %s', async (address) => {
    await expect(resolveSafeOutboundHost(address, unusedLookup)).rejects.toBeInstanceOf(
      UnsafeOutboundHostError
    );
  });

  it('rejects a hostname if any resolved address is private or reserved', async () => {
    const lookup: OutboundHostLookup = jest.fn(async () => [
      { address: '203.0.113.10', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ]);

    await expect(
      resolveSafeOutboundHost('metadata.example.com', lookup)
    ).rejects.toThrow('resolves to a non-public address');
  });

  it('pins a safe external hostname to a validated public address and preserves TLS identity', async () => {
    const lookup: OutboundHostLookup = jest.fn(async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
    ]);

    await expect(
      resolveSafeOutboundHost('Mail.Example.COM.', lookup)
    ).resolves.toEqual({
      address: '93.184.216.34',
      family: 4,
      servername: 'mail.example.com',
    });
    expect(lookup).toHaveBeenCalledWith('mail.example.com', {
      all: true,
      verbatim: false,
    });
  });

  it('accepts a public IP literal without DNS and without an SNI hostname', async () => {
    await expect(resolveSafeOutboundHost('8.8.8.8', unusedLookup)).resolves.toEqual({
      address: '8.8.8.8',
      family: 4,
      servername: undefined,
    });
  });
});
