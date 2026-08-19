import { NextRequest } from 'next/server';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { accountAccessWhere, type AccountAuth } from '@/lib/accounts/access';
import { prisma } from '@/lib/db/prisma';
import { updateSignatureSchema } from '@/lib/validation/schemas';

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
      isDefault: true,
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

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: signatureId } = await params;

  const existingSignature = await resolveAccessibleSignature(auth, signatureId);
  if (existingSignature instanceof Response) return existingSignature;

  const body = await req.json();
  const parsed = updateSignatureSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0].message, 422);
  }

  const { name, contentHtml, isDefault } = parsed.data;

  const updatedSignature = await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.signature.updateMany({
        where: { accountId: existingSignature.accountId },
        data: { isDefault: false },
      });
    }

    return tx.signature.update({
      where: { id: signatureId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(contentHtml !== undefined ? { contentHtml } : {}),
        ...(isDefault !== undefined ? { isDefault } : {}),
      },
    });
  });

  return apiResponse({ signature: updatedSignature });
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: signatureId } = await params;

  const existingSignature = await resolveAccessibleSignature(auth, signatureId);
  if (existingSignature instanceof Response) return existingSignature;

  await prisma.$transaction(async (tx) => {
    await tx.signature.delete({ where: { id: signatureId } });

    // If deleted signature was default, promote another signature if available
    if (existingSignature.isDefault) {
      const firstRemaining = await tx.signature.findFirst({
        where: { accountId: existingSignature.accountId },
        orderBy: { createdAt: 'asc' },
      });
      if (firstRemaining) {
        await tx.signature.update({
          where: { id: firstRemaining.id },
          data: { isDefault: true },
        });
      }
    }
  });

  return apiResponse({ success: true });
}
