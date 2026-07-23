/** Split a user-typed recipient string ("a@x.com, b@y.com; c@z.com") into addresses. */
export function parseAddresses(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Lightweight email check for client-side validation before sending. */
export function isValidEmail(address: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
}

interface StoredAddress {
  address?: string | null;
}

interface ReplyAllInput {
  replyTo?: string | null;
  fromAddress?: string | null;
  toAddresses?: unknown;
  ccAddresses?: unknown;
  currentAccountAddress?: string | null;
}

function storedAddresses(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (typeof entry === 'string') {
      const address = entry.trim();
      return isValidEmail(address) ? [address] : [];
    }

    if (!entry || typeof entry !== 'object') return [];
    const address = (entry as StoredAddress).address?.trim();
    return address && isValidEmail(address) ? [address] : [];
  });
}

function normalizedAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function buildReplyAllRecipients({
  replyTo,
  fromAddress,
  toAddresses,
  ccAddresses,
  currentAccountAddress,
}: ReplyAllInput): { to: string[]; cc: string[] } {
  const ownAddress = currentAccountAddress
    ? normalizedAddress(currentAccountAddress)
    : null;
  const to: string[] = [];
  const cc: string[] = [];
  const seenTo = new Set<string>();
  const seenCc = new Set<string>();

  const addTo = (candidate: string | null | undefined) => {
    const address = candidate?.trim();
    if (!address || !isValidEmail(address)) return;

    const normalized = normalizedAddress(address);
    if (normalized === ownAddress || seenTo.has(normalized)) return;
    seenTo.add(normalized);
    to.push(address);
  };

  const addCc = (candidate: string) => {
    const normalized = normalizedAddress(candidate);
    if (
      normalized === ownAddress
      || seenTo.has(normalized)
      || seenCc.has(normalized)
    ) {
      return;
    }

    seenCc.add(normalized);
    cc.push(candidate);
  };

  addTo(replyTo);
  if (to.length === 0) addTo(fromAddress);
  storedAddresses(toAddresses).forEach(addTo);
  storedAddresses(ccAddresses).forEach(addCc);

  if (to.length === 0 && cc.length > 0) {
    const promoted = cc.shift();
    if (promoted) to.push(promoted);
  }

  return { to, cc };
}
