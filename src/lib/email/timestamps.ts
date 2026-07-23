export interface EmailTimestamps {
  folder?: string | null;
  sentAt?: string | Date | null;
  receivedAt?: string | Date | null;
  createdAt?: string | Date | null;
}

function toValidDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getEmailDisplayTimestamp(email: EmailTimestamps): Date | null {
  const candidates = email.folder === 'SENT'
    ? [email.sentAt, email.receivedAt, email.createdAt]
    : [email.receivedAt, email.sentAt, email.createdAt];

  for (const candidate of candidates) {
    const date = toValidDate(candidate);
    if (date) return date;
  }

  return null;
}
