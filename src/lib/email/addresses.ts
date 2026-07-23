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
