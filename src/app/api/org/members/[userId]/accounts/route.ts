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

  await prisma.$transaction(async (tx) => {
    // Remove all current access for this user
    await tx.memberEmailAccountAccess.deleteMany({
      where: {
        organizationId: auth.organizationId,
        userId: resolvedParams.userId,
      },
    });

    // Insert new access records
    if (validAccountIds.length > 0) {
      await tx.memberEmailAccountAccess.createMany({
        data: validAccountIds.map(accountId => ({
          organizationId: auth.organizationId,
          userId: resolvedParams.userId,
          accountId,
        })),
      });
    }
  });

  return apiResponse({ success: true, accountIds: validAccountIds });
}
