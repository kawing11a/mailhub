import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, requireAdmin, apiResponse, apiError } from '@/lib/auth/middleware';
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

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const resolvedParams = await params;

  const body = await req.json().catch(() => null);
  const parsed = updateAccessSchema.safeParse(body);
  
  if (!parsed.success) {
    return apiError('Invalid request body', 400);
  }

  const { accountIds } = parsed.data;

  // Verify that all provided accounts belong to the organization
  const validAccounts = await prisma.emailAccount.findMany({
    where: {
      organizationId: auth.organizationId,
      id: { in: accountIds },
    },
    select: { id: true },
  });

  const validAccountIds = validAccounts.map(a => a.id);
  const ownedAccounts = await prisma.emailAccount.findMany({
    where: {
      organizationId: auth.organizationId,
      ownerUserId: resolvedParams.userId,
    },
    select: { id: true },
  });
  const ownedAccountIds = ownedAccounts.map(a => a.id);
  const ownedAccountIdSet = new Set(ownedAccountIds);
  const requestedNonOwnerAccountIds = validAccountIds.filter(
    (accountId) => !ownedAccountIdSet.has(accountId)
  );
  const finalAccountIds = [...validAccountIds];
  for (const ownedAccountId of ownedAccountIds) {
    if (!finalAccountIds.includes(ownedAccountId)) {
      finalAccountIds.push(ownedAccountId);
    }
  }

  await prisma.$transaction(async (tx) => {
    // Remove mutable non-owner grants while preserving mandatory owner access rows.
    await tx.memberEmailAccountAccess.deleteMany({
      where: {
        organizationId: auth.organizationId,
        userId: resolvedParams.userId,
        accountId: { notIn: ownedAccountIds },
      },
    });

    // Recreate the requested non-owner grants only.
    if (requestedNonOwnerAccountIds.length > 0) {
      await tx.memberEmailAccountAccess.createMany({
        data: requestedNonOwnerAccountIds.map(accountId => ({
          organizationId: auth.organizationId,
          userId: resolvedParams.userId,
          accountId,
        })),
      });
    }
  });

  return apiResponse({ success: true, accountIds: finalAccountIds });
}
