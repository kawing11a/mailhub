import { NextRequest } from 'next/server';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { getAccountStats } from '@/lib/accounts/service';
import { prisma } from '@/lib/db/prisma';
import { accountAccessWhere } from '@/lib/accounts/access';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;

  if (id !== 'all') {
    // Verify account belongs to user's org
    const account = await prisma.emailAccount.findFirst({
      where: accountAccessWhere(auth, id),
      select: { id: true },
    });

    if (!account) return apiError('Account not found', 404);
  }

  const stats = await getAccountStats(id, auth);
  return apiResponse(stats);
}
