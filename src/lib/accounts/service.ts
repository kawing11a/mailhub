import { prisma } from '@/lib/db/prisma';
import { encrypt, decrypt } from '@/lib/crypto';
import type { CreateAccountInput, UpdateAccountInput } from '@/lib/validation';
import type { EmailAccount } from '@prisma/client';

// Color palette for auto-assigning account colors
const ACCOUNT_COLORS = [
  '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B',
  '#EF4444', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

function getInitials(label: string): string {
  return label
    .split(/[\s-]+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3);
}

export async function createAccount(
  organizationId: string,
  input: CreateAccountInput
): Promise<EmailAccount> {
  // Auto-assign color if not provided
  const accountCount = await prisma.emailAccount.count({
    where: { organizationId },
  });
  const color = input.color || ACCOUNT_COLORS[accountCount % ACCOUNT_COLORS.length];
  const avatarInitials = input.avatarInitials || getInitials(input.label);

  return prisma.emailAccount.create({
    data: {
      organizationId,
      label: input.label,
      emailAddress: input.emailAddress,
      provider: input.provider,
      color,
      avatarInitials,
      imapHost: input.imapHost,
      imapPort: input.imapPort,
      imapSecure: input.imapSecure,
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpSecure: input.smtpSecure,
      username: input.username,
      passwordEncrypted: input.password ? encrypt(input.password) : null,
    },
  });
}

export async function getDecryptedAccount(accountId: string): Promise<
  EmailAccount & { decryptedPassword: string | null }
> {
  const account = await prisma.emailAccount.findUnique({
    where: { id: accountId },
  });
  if (!account) throw new Error('Account not found');

  return {
    ...account,
    decryptedPassword: account.passwordEncrypted
      ? decrypt(account.passwordEncrypted)
      : null,
  };
}

export function sanitizeAccount(account: EmailAccount) {
  // Strip sensitive fields before returning to client
  const {
    passwordEncrypted,
    oauthAccessToken,
    oauthRefreshToken,
    username,
    ...safe
  } = account;
  return safe;
}

export async function updateAccount(
  accountId: string,
  organizationId: string,
  input: UpdateAccountInput
): Promise<EmailAccount> {
  return prisma.emailAccount.update({
    where: { id: accountId, organizationId },
    data: input,
  });
}

export async function deleteAccount(
  accountId: string,
  organizationId: string
): Promise<void> {
  await prisma.emailAccount.delete({
    where: { id: accountId, organizationId },
  });
}

export async function getAccountStats(accountId: string) {
  const [unreadCount, totalCount, lastSynced] = await Promise.all([
    prisma.email.count({
      where: { accountId, folder: 'INBOX', isRead: false },
    }),
    prisma.email.count({ where: { accountId } }),
    prisma.emailAccount.findUnique({
      where: { id: accountId },
      select: { lastSyncedAt: true },
    }),
  ]);

  return {
    unreadCount,
    totalCount,
    lastSyncedAt: lastSynced?.lastSyncedAt,
  };
}
