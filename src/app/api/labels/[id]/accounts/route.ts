import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { accountAccessWhere } from '@/lib/accounts/access';
import { updateLabelAccountsSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activity/log';

type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: labelId } = await params;

  const label = await prisma.label.findFirst({
    where: { id: labelId, organizationId: auth.organizationId },
    select: { id: true, name: true },
  });
  if (!label) return apiError('Label not found', 404);

  const body = await req.json().catch(() => null);
  const parsed = updateLabelAccountsSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('Invalid request body', 400);
  }

  const requestedAccountIds = [...new Set(parsed.data.accountIds)];

  const validAccounts =
    requestedAccountIds.length > 0
      ? await prisma.emailAccount.findMany({
          where: {
            ...accountAccessWhere(auth),
            id: { in: requestedAccountIds },
          },
          select: { id: true },
        })
      : [];

  if (validAccounts.length !== requestedAccountIds.length) {
    return apiError('Forbidden', 403);
  }

  await prisma.$transaction(async (tx) => {
    await tx.accountLabel.deleteMany({
      where:
        auth.role === 'admin'
          ? { labelId }
          : {
              labelId,
              account: accountAccessWhere(auth),
            },
    });

    if (requestedAccountIds.length > 0) {
      await tx.accountLabel.createMany({
        data: requestedAccountIds.map((accountId) => ({ accountId, labelId })),
      });
    }
  });

  await logActivity({
    organizationId: auth.organizationId,
    userId: auth.userId,
    action: 'label_accounts_updated',
    metadata: { labelId, labelName: label.name, accountIds: requestedAccountIds },
  });

  return apiResponse({ success: true, accountIds: requestedAccountIds });
}
