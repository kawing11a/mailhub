import type { Prisma } from '@prisma/client';
import type { JWTPayload } from '@/lib/auth/types';

export type AccountAuth = Pick<JWTPayload, 'userId' | 'organizationId' | 'role'>;

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

export function canManageAccountAccess(
  auth: AccountAuth,
  account: { organizationId: string; ownerUserId: string }
): boolean {
  if (auth.organizationId !== account.organizationId) {
    return false;
  }

  return auth.role === 'admin' || auth.userId === account.ownerUserId;
}
