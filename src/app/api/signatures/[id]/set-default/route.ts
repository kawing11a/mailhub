import { NextRequest } from 'next/server';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: signatureId } = await params;

  const existingSignature = await prisma.signature.findUnique({
    where: { id: signatureId },
    include: { account: true },
  });

  if (!existingSignature) return apiError('Signature not found', 404);

  if (existingSignature.account.organizationId !== auth.organizationId) {
    return apiError('Forbidden', 403);
  }

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
