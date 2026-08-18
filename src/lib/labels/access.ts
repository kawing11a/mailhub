import type { Prisma } from '@prisma/client';
import { accountAccessWhere, type AccountAuth } from '@/lib/accounts/access';

export function editableLabelWhere(
  auth: AccountAuth,
  labelId?: string
): Prisma.LabelWhereInput {
  const base: Prisma.LabelWhereInput = {
    organizationId: auth.organizationId,
    ...(labelId ? { id: labelId } : {}),
  };

  if (auth.role === 'admin') {
    return base;
  }

  return {
    ...base,
    OR: [
      { accountLabels: { none: {} } },
      {
        accountLabels: {
          some: {
            account: accountAccessWhere(auth),
          },
        },
      },
    ],
  };
}
