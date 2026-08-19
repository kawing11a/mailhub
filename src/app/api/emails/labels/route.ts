import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { accountAccessWhere } from '@/lib/accounts/access';
import { bulkEmailLabelsSchema } from '@/lib/validation';

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => null);
  const parsed = bulkEmailLabelsSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0].message, 400);
  }

  const { emailIds, addLabelIds, removeLabelIds } = parsed.data;

  // Verify all referenced labels belong to the caller's org
  const labelIds = [...new Set([...addLabelIds, ...removeLabelIds])];
  const labels = await prisma.label.findMany({
    where: { id: { in: labelIds }, organizationId: auth.organizationId },
    select: { id: true, name: true },
  });
  if (labels.length !== labelIds.length) {
    return apiError('Label not found', 404);
  }
  const labelNames = new Map(labels.map((l) => [l.id, l.name]));

  // Verify emails belong to org accounts the caller can access
  const emails = await prisma.email.findMany({
    where: {
      id: { in: emailIds },
      account: accountAccessWhere(auth),
    },
    select: { id: true, accountId: true },
  });
  if (emails.length !== emailIds.length) {
    return apiError('Email not found', 404);
  }
  const verifiedEmailIds = emails.map((e) => e.id);

  await prisma.$transaction(async (tx) => {
    if (addLabelIds.length > 0) {
      await tx.emailLabel.createMany({
        data: verifiedEmailIds.flatMap((emailId) =>
          addLabelIds.map((labelId) => ({ emailId, labelId }))
        ),
        skipDuplicates: true,
      });
    }
    if (removeLabelIds.length > 0) {
      await tx.emailLabel.deleteMany({
        where: {
          emailId: { in: verifiedEmailIds },
          labelId: { in: removeLabelIds },
        },
      });
    }
  });

  const isBulk = verifiedEmailIds.length > 1;
  const logRows = emails.flatMap((email) => [
    ...addLabelIds.map((labelId) => ({ labelId, action: 'label_added' })),
    ...removeLabelIds.map((labelId) => ({ labelId, action: 'label_removed' })),
  ].map(({ labelId, action }) => ({
    organizationId: auth.organizationId,
    userId: auth.userId,
    accountId: email.accountId,
    emailId: email.id,
    action,
    metadata: { labelId, labelName: labelNames.get(labelId), bulk: isBulk },
  })));

  try {
    await prisma.emailActivityLog.createMany({ data: logRows });
  } catch (error) {
    console.error('Failed to log label activity:', error);
  }

  return apiResponse({ success: true, emailIds: verifiedEmailIds });
}
