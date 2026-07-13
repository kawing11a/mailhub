import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, requireAdmin, apiResponse, apiError } from '@/lib/auth/middleware';
import { updateLabelAccountsSchema } from '@/lib/validation';
import { logActivity } from '@/lib/activity/log';

type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

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

  const { accountIds } = parsed.data;

  // Verify that all provided accounts belong to the organization
  const validAccounts = await prisma.emailAccount.findMany({
    where: {
      organizationId: auth.organizationId,
      id: { in: accountIds },
    },
    select: { id: true },
  });

  const validAccountIds = validAccounts.map((a) => a.id);

  await prisma.$transaction(async (tx) => {
    await tx.accountLabel.deleteMany({
      where: { labelId },
    });

    if (validAccountIds.length > 0) {
      await tx.accountLabel.createMany({
        data: validAccountIds.map((accountId) => ({ accountId, labelId })),
      });
    }
  });

  await logActivity({
    organizationId: auth.organizationId,
    userId: auth.userId,
    action: 'label_accounts_updated',
    metadata: { labelId, labelName: label.name, accountIds: validAccountIds },
  });

  return apiResponse({ success: true, accountIds: validAccountIds });
}
