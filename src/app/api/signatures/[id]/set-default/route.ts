import { NextRequest } from 'next/server';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { accountAccessWhere, type AccountAuth } from '@/lib/accounts/access';
import { prisma } from '@/lib/db/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function resolveAccessibleSignature(
  auth: AccountAuth,
  signatureId: string
) {
  const signature = await prisma.signature.findFirst({
    where: {
      id: signatureId,
      account: accountAccessWhere(auth),
    },
    select: {
      id: true,
      accountId: true,
    },
  });

  if (signature) {
    return signature;
  }

  const hiddenSignature = await prisma.signature.findUnique({
    where: { id: signatureId },
    select: {
      account: {
        select: {
          organizationId: true,
        },
      },
    },
  });

  if (!hiddenSignature) {
    return apiError('Signature not found', 404);
  }

  if (hiddenSignature.account.organizationId !== auth.organizationId) {
    return apiError('Forbidden', 403);
  }

  return apiError('Signature not found', 404);
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: signatureId } = await params;

  const existingSignature = await resolveAccessibleSignature(auth, signatureId);
  if (existingSignature instanceof Response) return existingSignature;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.signature.updateMany({
      where: { accountId: existingSignature.accountId },
      data: { isDefault: false },
    });

    return tx.signature.update({
      where: { id: signatureId },
      data: { isDefault: true },
    });
  });

  return apiResponse({ signature: updated });
}
