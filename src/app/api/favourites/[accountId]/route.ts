import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse } from '@/lib/auth/middleware';

interface RouteParams {
  params: Promise<{ accountId: string }>;
}

// Un-favourite = soft delete. We keep the row (with deletedAt set) so re-favouriting
// later is a clean revive and history is preserved. Idempotent via updateMany.
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { accountId } = await params;

  await prisma.favouriteAccount.updateMany({
    where: { userId: auth.userId, accountId, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  return apiResponse({ success: true });
}
