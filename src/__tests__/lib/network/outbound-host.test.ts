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

describe('outbound host allowlists', () => {
  const initialHostAllowlist = process.env.OUTBOUND_HOST_ALLOWLIST;

  afterEach(() => {
    if (initialHostAllowlist === undefined) {
      delete process.env.OUTBOUND_HOST_ALLOWLIST;
    } else {
      process.env.OUTBOUND_HOST_ALLOWLIST = initialHostAllowlist;
    }
  });

  it('allows an explicitly allowlisted private hostname', async () => {
    process.env.OUTBOUND_HOST_ALLOWLIST = 'mail.example.com=192.0.2.10/32';
    const lookup: OutboundHostLookup = jest.fn(async () => [
      { address: '192.0.2.10', family: 4 },
    ]);

    await expect(resolveSafeOutboundHost('mail.example.com', lookup)).resolves.toEqual({
      address: '192.0.2.10',
      family: 4,
      servername: 'mail.example.com',
    });
  });

  it('normalizes the allowlist hostname and the requested hostname', async () => {
    process.env.OUTBOUND_HOST_ALLOWLIST = 'Mail.Example.COM.=192.0.2.10/32';
    const lookup: OutboundHostLookup = jest.fn(async () => [
      { address: '192.0.2.10', family: 4 },
    ]);

    await expect(
      resolveSafeOutboundHost('mail.example.com.', lookup)
    ).resolves.toMatchObject({ address: '192.0.2.10' });
  });

  it('rejects an allowlisted private hostname that resolves outside its CIDR', async () => {
    process.env.OUTBOUND_HOST_ALLOWLIST = 'mail.example.com=192.0.2.10/32';
    const lookup: OutboundHostLookup = jest.fn(async () => [
      { address: '192.0.2.11', family: 4 },
    ]);

    await expect(
      resolveSafeOutboundHost('mail.example.com', lookup)
    ).rejects.toThrow('resolves to a non-public address');
  });

  it('merges repeated entries for the same host', async () => {
    process.env.OUTBOUND_HOST_ALLOWLIST =
      'mail.example.com=192.0.2.10/32,mail.example.com=192.0.2.11/32';
    const lookup: OutboundHostLookup = jest.fn(async () => [
      { address: '192.0.2.10', family: 4 },
      { address: '192.0.2.11', family: 4 },
    ]);

    await expect(resolveSafeOutboundHost('mail.example.com', lookup)).resolves.toMatchObject({
      address: '192.0.2.10',
    });
  });

  it('rejects if any resolved address is outside the private-host allowlist', async () => {
    process.env.OUTBOUND_HOST_ALLOWLIST = 'mail.example.com=192.0.2.10/32';
    const lookup: OutboundHostLookup = jest.fn(async () => [
      { address: '192.0.2.10', family: 4 },
      { address: '192.0.2.11', family: 4 },
    ]);

    await expect(
      resolveSafeOutboundHost('mail.example.com', lookup)
    ).rejects.toThrow('resolves to a non-public address');
  });

  it('does not allowlist a private literal address', async () => {
    process.env.OUTBOUND_HOST_ALLOWLIST = 'mail.example.com=192.0.2.10/32';

    await expect(
      resolveSafeOutboundHost('192.0.2.10', unusedLookup)
    ).rejects.toBeInstanceOf(UnsafeOutboundHostError);
  });

  it('ignores a non-reserved CIDR in the allowlist', async () => {
    process.env.OUTBOUND_HOST_ALLOWLIST = 'mail.example.com=0.0.0.0/0';
    const lookup: OutboundHostLookup = jest.fn(async () => [
      { address: '192.0.2.10', family: 4 },
    ]);

    await expect(
      resolveSafeOutboundHost('mail.example.com', lookup)
    ).rejects.toThrow('resolves to a non-public address');
  });

  it('allows a hostname explicitly allowlisted for a fake-IP range', async () => {
    process.env.OUTBOUND_HOST_ALLOWLIST = 'imap.example.com=198.18.0.0/15';
    const lookup: OutboundHostLookup = jest.fn(async () => [
      { address: '198.18.17.120', family: 4 },
    ]);

    await expect(resolveSafeOutboundHost('imap.example.com', lookup)).resolves.toEqual({
      address: '198.18.17.120',
      family: 4,
      servername: 'imap.example.com',
    });
  });

  it('rejects a different hostname in the same fake-IP range', async () => {
    process.env.OUTBOUND_HOST_ALLOWLIST = 'imap.example.com=198.18.0.0/15';
    const lookup: OutboundHostLookup = jest.fn(async () => [
      { address: '198.18.17.120', family: 4 },
    ]);

    await expect(
      resolveSafeOutboundHost('smtp.example.com', lookup)
    ).rejects.toThrow('resolves to a non-public address');
  });

  it('rejects a fake-IP hostname outside the allowlisted range', async () => {
    process.env.OUTBOUND_HOST_ALLOWLIST = 'imap.example.com=198.18.0.0/15';
    const lookup: OutboundHostLookup = jest.fn(async () => [
      { address: '192.0.2.10', family: 4 },
    ]);

    await expect(
      resolveSafeOutboundHost('imap.example.com', lookup)
    ).rejects.toThrow('resolves to a non-public address');
  });

  it('does not allow a literal fake-IP address', async () => {
    process.env.OUTBOUND_HOST_ALLOWLIST = 'imap.example.com=198.18.0.0/15';

    await expect(
      resolveSafeOutboundHost('198.18.17.120', unusedLookup)
    ).rejects.toBeInstanceOf(UnsafeOutboundHostError);
  });

  it('does not allow a fake-IP hostname without an allowlist entry', async () => {
    const lookup: OutboundHostLookup = jest.fn(async () => [
      { address: '198.18.17.120', family: 4 },
    ]);

    await expect(
      resolveSafeOutboundHost('imap.example.com', lookup)
    ).rejects.toThrow('resolves to a non-public address');
  });

  it('supports IPv6 private-host allowlists', async () => {
    process.env.OUTBOUND_HOST_ALLOWLIST = 'mail.example.com=2001:db8::/32';
    const lookup: OutboundHostLookup = jest.fn(async () => [
      { address: '2001:db8::10', family: 6 },
    ]);

    await expect(resolveSafeOutboundHost('mail.example.com', lookup)).resolves.toEqual({
      address: '2001:db8::10',
      family: 6,
      servername: 'mail.example.com',
    });
  });

  it('rejects IPv6 addresses outside the private-host allowlist', async () => {
    process.env.OUTBOUND_HOST_ALLOWLIST = 'mail.example.com=2001:db8::/32';
    const lookup: OutboundHostLookup = jest.fn(async () => [
      { address: 'fc00::1', family: 6 },
    ]);

    await expect(
      resolveSafeOutboundHost('mail.example.com', lookup)
    ).rejects.toThrow('resolves to a non-public address');
  });

  it('supports IPv6 fake-IP ranges via host allowlist', async () => {
    process.env.OUTBOUND_HOST_ALLOWLIST = 'imap.example.com=fc00::/7';
    const lookup: OutboundHostLookup = jest.fn(async () => [
      { address: 'fc00::1', family: 6 },
    ]);

    await expect(resolveSafeOutboundHost('imap.example.com', lookup)).resolves.toMatchObject({
      address: 'fc00::1',
      family: 6,
    });
  });
});
