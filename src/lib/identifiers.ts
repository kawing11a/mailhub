import { randomUUID } from 'crypto';

export function createUniqueId(prefix?: string): string {
  const id = randomUUID();
  return prefix ? `${prefix}-${id}` : id;
}

export function createOrganizationSlug(name: string): string {
  const normalizedName = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const uniqueSuffix = randomUUID().replace(/-/g, '').slice(0, 12);
  return `${normalizedName}-${uniqueSuffix}`;
}
