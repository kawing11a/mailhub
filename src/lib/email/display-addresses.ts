export interface StoredEmailAddress {
  name?: string | null;
  address?: string | null;
}

export function normalizeStoredAddresses(value: unknown): StoredEmailAddress[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (typeof entry === 'string') {
      const address = entry.trim();
      return address ? [{ address }] : [];
    }

    if (!entry || typeof entry !== 'object') return [];

    const candidate = entry as StoredEmailAddress;
    const address = candidate.address?.trim();
    if (!address) return [];

    const name = candidate.name?.trim();
    return [{ address, ...(name ? { name } : {}) }];
  });
}

export function formatStoredAddress(address: StoredEmailAddress): string {
  const normalizedAddress = address.address?.trim() || '';
  const name = address.name?.trim();
  return name ? `${name} <${normalizedAddress}>` : normalizedAddress;
}

export function formatStoredAddresses(value: unknown): string {
  return normalizeStoredAddresses(value).map(formatStoredAddress).join(', ');
}
