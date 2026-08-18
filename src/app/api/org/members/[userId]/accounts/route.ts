import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { canManageAccountAccess } from '@/lib/accounts/access';
import { z } from 'zod';

const updateAccessSchema = z.object({
  accountIds: z.array(z.string().uuid()),
});

type RouteParams = { params: Promise<{ userId: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const resolvedParams = await params;

  // Members can check their own access, or admins can check any member's access.
  if (auth.role !== 'admin' && auth.userId !== resolvedParams.userId) {
    return apiError('Forbidden', 403);
  }

  const access = await prisma.memberEmailAccountAccess.findMany({
    where: {
      organizationId: auth.organizationId,
      userId: resolvedParams.userId,
    },
    select: { accountId: true },
  });

  return apiResponse(access.map(a => a.accountId));
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const resolvedParams = await params;

  const targetMember = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: auth.organizationId,
        userId: resolvedParams.userId,
      },
    },
    select: { userId: true },
  });

  if (!targetMember) {
    return apiError('Forbidden', 403);
  }

  const body = await req.json().catch(() => null);
  const parsed = updateAccessSchema.safeParse(body);
  
  if (!parsed.success) {
    return apiError('Invalid request body', 400);
  }

  const requestedAccountIds = [...new Set(parsed.data.accountIds)];

  const requestedAccounts =
    requestedAccountIds.length > 0
      ? await prisma.emailAccount.findMany({
          where: {
            id: { in: requestedAccountIds },
          },
          select: {
            id: true,
            organizationId: true,
            ownerUserId: true,
          },
        })
      : [];

  if (requestedAccounts.length !== requestedAccountIds.length) {
    return apiError('Forbidden', 403);
  }

  if (requestedAccounts.some((account) => !canManageAccountAccess(auth, account))) {
    return apiError('Forbidden', 403);
  }

  const currentAccessAccounts = await prisma.emailAccount.findMany({
    where: {
      organizationId: auth.organizationId,
      memberAccess: {
        some: {
          userId: resolvedParams.userId,
        },
      },
    },
    select: {
      id: true,
      organizationId: true,
      ownerUserId: true,
    },
  });

  const ownedAccounts = await prisma.emailAccount.findMany({
    where: {
      organizationId: auth.organizationId,
      ownerUserId: resolvedParams.userId,
    },
    select: { id: true },
  });
  const ownedAccountIds = ownedAccounts.map((account) => account.id);
  const ownedAccountIdSet = new Set(ownedAccountIds);

  const managedCurrentNonOwnerAccountIds = currentAccessAccounts
    .filter(
      (account) =>
        !ownedAccountIdSet.has(account.id) && canManageAccountAccess(auth, account)
    )
    .map((account) => account.id);

  const requestedManagedNonOwnerAccountIds = requestedAccounts
    .filter((account) => !ownedAccountIdSet.has(account.id))
    .map((account) => account.id);

  await prisma.$transaction(async (tx) => {
    if (managedCurrentNonOwnerAccountIds.length > 0) {
      await tx.memberEmailAccountAccess.deleteMany({
        where: {
          organizationId: auth.organizationId,
          userId: resolvedParams.userId,
          accountId: { in: managedCurrentNonOwnerAccountIds },
        },
      });
    }

    if (requestedManagedNonOwnerAccountIds.length > 0) {
      await tx.memberEmailAccountAccess.createMany({
        data: requestedManagedNonOwnerAccountIds.map((accountId) => ({
          organizationId: auth.organizationId,
          userId: resolvedParams.userId,
          accountId,
        })),
      });
    }
  });

  const finalAccountIds = [...requestedManagedNonOwnerAccountIds];
  for (const ownedAccountId of ownedAccountIds) {
    if (!finalAccountIds.includes(ownedAccountId)) {
      finalAccountIds.push(ownedAccountId);
    }
  }
  for (const currentAccessAccount of currentAccessAccounts) {
    if (
      !canManageAccountAccess(auth, currentAccessAccount) &&
      !finalAccountIds.includes(currentAccessAccount.id)
    ) {
      finalAccountIds.push(currentAccessAccount.id);
    }
  }

  return apiResponse({ success: true, accountIds: finalAccountIds });
}
