import type { Prisma } from '@prisma/client';
import type { JWTPayload } from '@/lib/auth/types';
import { prisma } from '@/lib/db/prisma';
import { apiError } from '@/lib/auth/middleware';

export type AccountAuth = Pick<JWTPayload, 'userId' | 'organizationId' | 'role'>;

export type AccessibleAccount = {
  id: string;
  organizationId: string;
  ownerUserId: string;
};

export function accountAccessWhere(
  auth: AccountAuth,
  accountId?: string
): Prisma.EmailAccountWhereInput {
  const base: Prisma.EmailAccountWhereInput = {
    organizationId: auth.organizationId,
    ...(accountId ? { id: accountId } : {}),
  };

  if (auth.role === 'admin') {
    return base;
  }

  return {
    ...base,
    OR: [
      { ownerUserId: auth.userId },
      { memberAccess: { some: { userId: auth.userId } } },
    ],
  };
}

export async function assertAccountAccess(
  auth: AccountAuth,
  accountId: string
): Promise<AccessibleAccount | Response> {
  const account = await prisma.emailAccount.findFirst({
    where: accountAccessWhere(auth, accountId),
    select: {
      id: true,
      organizationId: true,
      ownerUserId: true,
    },
  });

  if (!account) {
    return apiError('Forbidden', 403);
  }

  return account;
}

export async function assertAccountContextAccess(
  auth: AccountAuth,
  context: { accountId?: unknown; emailId?: unknown }
): Promise<AccessibleAccount | Response> {
  const emailId =
    typeof context.emailId === 'string' && context.emailId.trim()
      ? context.emailId
      : undefined;
  let accountId =
    typeof context.accountId === 'string' && context.accountId.trim()
      ? context.accountId
      : undefined;

  if (emailId) {
    const email = await prisma.email.findUnique({
      where: { id: emailId },
      select: { accountId: true },
    });

    if (!email) {
      return apiError('Forbidden', 403);
    }

    accountId = email.accountId;
  }

  if (!accountId) {
    return apiError('Account or email context is required', 400);
  }

  return assertAccountAccess(auth, accountId);
}

export function canManageAccountAccess(
  auth: AccountAuth,
  account: { organizationId: string; ownerUserId: string }
): boolean {
  if (auth.organizationId !== account.organizationId) {
    return false;
  }

  return auth.role === 'admin' || auth.userId === account.ownerUserId;
}
