import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { canManageAccountAccess } from '@/lib/accounts/access';
import { prisma } from '@/lib/db/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const updateAccountAccessSchema = z.object({
  memberIds: z.array(z.string().uuid()).default([]),
});

async function loadManagedAccount(organizationId: string, accountId: string) {
  return prisma.emailAccount.findFirst({
    where: {
      id: accountId,
      organizationId,
    },
    select: {
      id: true,
      label: true,
      emailAddress: true,
      organizationId: true,
      ownerUserId: true,
      owner: {
        select: {
          userId: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const account = await loadManagedAccount(auth.organizationId, id);

  if (!account) {
    return apiError('Account not found', 404);
  }

  if (!canManageAccountAccess(auth, account)) {
    return apiError('Forbidden', 403);
  }

  const [members, accessRows] = await Promise.all([
    prisma.organizationMember.findMany({
      where: {
        organizationId: auth.organizationId,
        role: 'member',
      },
      orderBy: {
        user: {
          name: 'asc',
        },
      },
      select: {
        userId: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    }),
    prisma.memberEmailAccountAccess.findMany({
      where: {
        accountId: id,
        organizationId: auth.organizationId,
      },
      select: {
        userId: true,
      },
    }),
  ]);

  const accessUserIds = new Set(accessRows.map((row) => row.userId));

  return apiResponse({
    account: {
      id: account.id,
      label: account.label,
      emailAddress: account.emailAddress,
      owner: {
        userId: account.owner.userId,
        name: account.owner.user.name,
        email: account.owner.user.email,
      },
    },
    members: members.map((member) => ({
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      hasAccess: member.userId === account.ownerUserId || accessUserIds.has(member.userId),
    })),
  });
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateAccountAccessSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? 'Invalid request body', 422);
  }

  const account = await loadManagedAccount(auth.organizationId, id);

  if (!account) {
    return apiError('Account not found', 404);
  }

  if (!canManageAccountAccess(auth, account)) {
    return apiError('Forbidden', 403);
  }

  const requestedMemberIds = [...new Set(parsed.data.memberIds)];

  const transactionResult = await prisma.$transaction(async (tx) => {
    const validMembers = await tx.organizationMember.findMany({
      where: {
        organizationId: auth.organizationId,
        role: 'member',
        userId: {
          in: requestedMemberIds,
        },
      },
      select: {
        userId: true,
      },
    });
    const validMemberIds = new Set(validMembers.map((member) => member.userId));
    const validatedMemberIds = requestedMemberIds.filter((userId) =>
      validMemberIds.has(userId)
    );

    if (validatedMemberIds.length !== requestedMemberIds.length) {
      return { valid: false as const };
    }

    await tx.memberEmailAccountAccess.deleteMany({
      where: {
        accountId: id,
        organizationId: auth.organizationId,
        userId: {
          not: account.ownerUserId,
        },
      },
    });

    await tx.memberEmailAccountAccess.upsert({
      where: {
        organizationId_userId_accountId: {
          organizationId: auth.organizationId,
          userId: account.ownerUserId,
          accountId: id,
        },
      },
      update: {},
      create: {
        organizationId: auth.organizationId,
        userId: account.ownerUserId,
        accountId: id,
      },
    });

    if (validatedMemberIds.length > 0) {
      await tx.memberEmailAccountAccess.createMany({
        data: validatedMemberIds.map((userId) => ({
          organizationId: auth.organizationId,
          userId,
          accountId: id,
        })),
        skipDuplicates: true,
      });
    }

    return { valid: true as const, memberIds: validatedMemberIds };
  });

  if (!transactionResult.valid) {
    return apiError('Invalid memberIds', 400);
  }

  const memberIds = [...transactionResult.memberIds];
  if (!memberIds.includes(account.ownerUserId)) {
    memberIds.push(account.ownerUserId);
  }

  return apiResponse({ success: true, memberIds });
}
