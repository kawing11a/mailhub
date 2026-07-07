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
  
  // Distribute accounts between worker-1 and worker-2
  const workerPartition = accountCount % 2 === 0 ? 'worker-1' : 'worker-2';

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
      workerPartition,
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
    ...safe
  } = account;
  return safe;
}

export async function updateAccount(
  accountId: string,
  organizationId: string,
  input: UpdateAccountInput
): Promise<EmailAccount> {
  const data: any = { ...input };
  if (input.password) {
    data.passwordEncrypted = encrypt(input.password);
    delete data.password;
  }
  
  // If we are updating connection settings, re-activate the account to trigger a sync
  if (input.imapHost || input.smtpHost || input.password || input.username) {
    data.isActive = true;
  }

  const account = await prisma.emailAccount.update({
    where: { id: accountId, organizationId },
    data,
  });

  // If connection settings changed, queue a sync
  if (data.isActive) {
    const { syncQueue } = await import('@/lib/queue/client');
    await syncQueue.add('initial-sync', { accountId: account.id, folder: 'ALL' });
  }

  return account;
}

export async function deleteAccount(
  accountId: string,
  organizationId: string
): Promise<void> {
  await prisma.emailAccount.delete({
    where: { id: accountId, organizationId },
  });
}

export async function getAccountStats(accountId: string, organizationId?: string) {
  const where = accountId === 'all' && organizationId
    ? { account: { organizationId } }
    : { accountId };

  const [unreadCount, totalCount, lastSynced] = await Promise.all([
    prisma.email.count({
      where: { ...where, folder: 'INBOX', isRead: false },
    }),
    prisma.email.count({ where }),
    accountId === 'all' && organizationId
      ? prisma.emailAccount.findFirst({
          where: { organizationId },
          orderBy: { lastSyncedAt: 'desc' },
          select: { lastSyncedAt: true },
        })
      : prisma.emailAccount.findUnique({
          where: { id: accountId }, // Valid UUID when accountId is not 'all'
          select: { lastSyncedAt: true },
        }),
  ]);

  return {
    unreadCount,
    totalCount,
    lastSyncedAt: lastSynced?.lastSyncedAt,
  };
}
