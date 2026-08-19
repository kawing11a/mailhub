import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface ResolvedOutboundHost {
  address: string;
  family: 4 | 6;
  servername: string | undefined;
}

export type OutboundHostLookup = (
  hostname: string,
  options: { all: true; verbatim: false }
) => Promise<Array<{ address: string; family: number }>>;

export class UnsafeOutboundHostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeOutboundHostError';
  }
}

const IPV4_BLOCKS: Array<[number, number]> = [
  [0x00000000, 8],
  [0x0a000000, 8],
  [0x64400000, 10],
  [0x7f000000, 8],
  [0xa9fe0000, 16],
  [0xac100000, 12],
  [0xc0000000, 24],
  [0xc0000200, 24],
  [0xc0586300, 24],
  [0xc0a80000, 16],
  [0xc6120000, 15],
  [0xc6336400, 24],
  [0xcb007100, 24],
  [0xe0000000, 4],
  [0xf0000000, 4],
];

function ipv4ToNumber(address: string): number | null {
  const octets = address.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return null;
  }

  return (
    (((octets[0] << 24) >>> 0) |
      (octets[1] << 16) |
      (octets[2] << 8) |
      octets[3]) >>>
    0
  );
}

function isBlockedIpv4Number(address: number): boolean {
  return IPV4_BLOCKS.some(([base, prefix]) => {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (address & mask) >>> 0 === (base & mask) >>> 0;
  });
}

function parseIpv6(address: string): bigint | null {
  let normalized = address.toLowerCase().split('%')[0];
  const dottedTail = normalized.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (dottedTail) {
    const ipv4 = ipv4ToNumber(dottedTail);
    if (ipv4 === null) return null;
    normalized = `${normalized.slice(0, -dottedTail.length)}${(
      ipv4 >>> 16
    ).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }

  const halves = normalized.split('::');
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const omitted = halves.length === 2 ? 8 - left.length - right.length : 0;
  if (omitted < 0 || (halves.length === 1 && left.length !== 8)) return null;

  const parts = [...left, ...Array(omitted).fill('0'), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) {
    return null;
  }

  return parts.reduce(
    (value, part) => (value << BigInt(16)) | BigInt(`0x${part}`),
    BigInt(0)
  );
}

function ipv6InSubnet(address: bigint, base: bigint, prefix: number): boolean {
  const shift = BigInt(128 - prefix);
  return address >> shift === base >> shift;
}

function ipv6Base(address: string): bigint {
  const parsed = parseIpv6(address);
  if (parsed === null) throw new Error(`Invalid static IPv6 range: ${address}`);
  return parsed;
}

const IPV6_BLOCKS: Array<[bigint, number]> = [
  [ipv6Base('::'), 128],
  [ipv6Base('::1'), 128],
  [ipv6Base('64:ff9b:1::'), 48],
  [ipv6Base('100::'), 64],
  [ipv6Base('2001::'), 32],
  [ipv6Base('2001:2::'), 48],
  [ipv6Base('2001:10::'), 28],
  [ipv6Base('2001:20::'), 28],
  [ipv6Base('2001:db8::'), 32],
  [ipv6Base('2002::'), 16],
  [ipv6Base('3fff::'), 20],
  [ipv6Base('5f00::'), 16],
  [ipv6Base('fc00::'), 7],
  [ipv6Base('fe80::'), 10],
  [ipv6Base('fec0::'), 10],
  [ipv6Base('ff00::'), 8],
];

function isPublicIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const parsed = ipv4ToNumber(address);
    return parsed !== null && !isBlockedIpv4Number(parsed);
  }

  if (family !== 6) return false;
  const parsed = parseIpv6(address);
  if (parsed === null) return false;

  const prefix96 = parsed >> BigInt(32);
  if (prefix96 === BigInt(0xffff)) {
    return !isBlockedIpv4Number(Number(parsed & BigInt(0xffffffff)));
  }
  if (prefix96 === BigInt(0)) return false;

  return !IPV6_BLOCKS.some(([base, prefix]) => ipv6InSubnet(parsed, base, prefix));
}

export async function resolveSafeOutboundHost(
  host: string,
  lookup: OutboundHostLookup = dnsLookup as OutboundHostLookup
): Promise<ResolvedOutboundHost> {
  const hostname = host.trim().replace(/\.$/, '').toLowerCase();
  if (!hostname) {
    throw new UnsafeOutboundHostError('Outbound host is required');
  }

  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookup(hostname, { all: true, verbatim: false });

  if (addresses.length === 0) {
    throw new UnsafeOutboundHostError(`${hostname} did not resolve to an address`);
  }

  const unsafe = addresses.find(
    ({ address, family }) =>
      (family !== 4 && family !== 6) || !isPublicIpAddress(address)
  );
  if (unsafe) {
    throw new UnsafeOutboundHostError(
      `${hostname} resolves to a non-public address (${unsafe.address})`
    );
  }

  const selected = addresses[0] as { address: string; family: 4 | 6 };
  return {
    address: selected.address,
    family: selected.family,
    servername: literalFamily ? undefined : hostname,
  };
}
