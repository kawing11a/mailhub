import { NextRequest } from 'next/server';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';
import { signatureSchema } from '@/lib/validation/schemas';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: accountId } = await params;

  // Verify account access
  const account = await prisma.emailAccount.findFirst({
    where: {
      id: accountId,
      organizationId: auth.organizationId,
      ...(auth.role !== 'admin'
        ? { memberAccess: { some: { userId: auth.userId } } }
        : {}),
    },
    select: { id: true },
  });

  if (!account) return apiError('Account not found', 404);

  const signatures = await prisma.signature.findMany({
    where: { accountId },
    orderBy: [
      { isDefault: 'desc' },
      { name: 'asc' },
    ],
  });

  return apiResponse({ signatures });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id: accountId } = await params;

  const account = await prisma.emailAccount.findFirst({
    where: {
      id: accountId,
      organizationId: auth.organizationId,
      ...(auth.role !== 'admin'
        ? { memberAccess: { some: { userId: auth.userId } } }
        : {}),
    },
    select: { id: true },
  });

  if (!account) return apiError('Account not found', 404);

  const body = await req.json();
  const parsed = signatureSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0].message, 422);
  }

  const { name, contentHtml, isDefault } = parsed.data;

  // If first signature for this account, make it default automatically
  const existingCount = await prisma.signature.count({ where: { accountId } });
  const shouldBeDefault = isDefault || existingCount === 0;

  const signature = await prisma.$transaction(async (tx) => {
    if (shouldBeDefault) {
      await tx.signature.updateMany({
        where: { accountId },
        data: { isDefault: false },
      });
    }

    return tx.signature.create({
      data: {
        accountId,
        name,
        contentHtml,
        isDefault: shouldBeDefault,
      },
    });
  });

  return apiResponse({ signature }, 201);
}
