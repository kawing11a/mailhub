import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { reorderFavouritesSchema } from '@/lib/validation';

// Persists a new favourite ordering. sortOrder is the array index; only the user's
// own active (non-soft-deleted) favourites are touched.
export async function PATCH(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const body = await req.json();
  const parsed = reorderFavouritesSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message, 422);

  const { orderedAccountIds } = parsed.data;

  await prisma.$transaction(
    orderedAccountIds.map((accountId, index) =>
      prisma.favouriteAccount.updateMany({
        where: { userId: auth.userId, accountId, deletedAt: null },
        data: { sortOrder: index },
      })
    )
  );

  return apiResponse({ success: true });
}
