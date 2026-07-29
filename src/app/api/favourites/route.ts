import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { addFavouriteSchema } from '@/lib/validation';

// Fields returned for a favourite account — mirrors the shape of GET /api/accounts
// so the sidebar can render them the same way.
const accountSelect = {
  id: true,
  label: true,
  emailAddress: true,
  provider: true,
  color: true,
  avatarInitials: true,
  isActive: true,
  authError: true,
  lastSyncedAt: true,
  createdAt: true,
} as const;

// Restricts to accounts in the user's org that they can access. Admins see all
// org accounts; members are limited to their explicit access grants.
function accountAccessWhere(auth: { organizationId: string; userId: string; role: string }) {
  return {
    organizationId: auth.organizationId,
    ...(auth.role !== 'admin'
      ? { memberAccess: { some: { userId: auth.userId } } }
      : {}),
  };
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const favourites = await prisma.favouriteAccount.findMany({
    where: {
      userId: auth.userId,
      deletedAt: null,
      account: accountAccessWhere(auth),
    },
    orderBy: { sortOrder: 'asc' },
    include: { account: { select: accountSelect } },
  });

  // Flatten to account objects carrying their favourite ordering.
  const accounts = favourites.map((fav) => ({ ...fav.account, sortOrder: fav.sortOrder }));
  return apiResponse(accounts);
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const body = await req.json();
  const parsed = addFavouriteSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message, 422);

  const { accountId } = parsed.data;

  // Verify the account exists and the user is allowed to access it.
  const account = await prisma.emailAccount.findFirst({
    where: { id: accountId, ...accountAccessWhere(auth) },
    select: { id: true },
  });
  if (!account) return apiError('Account not found', 404);

  const existing = await prisma.favouriteAccount.findUnique({
    where: { userId_accountId: { userId: auth.userId, accountId } },
  });

  // Already an active favourite — no-op, keep existing order.
  if (existing && existing.deletedAt === null) {
    return apiResponse({ accountId, sortOrder: existing.sortOrder }, 200);
  }

  // Append at the end of the current active favourites.
  const max = await prisma.favouriteAccount.aggregate({
    where: { userId: auth.userId, deletedAt: null },
    _max: { sortOrder: true },
  });
  const sortOrder = (max._max.sortOrder ?? -1) + 1;

  const favourite = await prisma.favouriteAccount.upsert({
    where: { userId_accountId: { userId: auth.userId, accountId } },
    // Revive a previously soft-deleted favourite.
    update: { deletedAt: null, sortOrder },
    create: {
      userId: auth.userId,
      organizationId: auth.organizationId,
      accountId,
      sortOrder,
    },
  });

  return apiResponse({ accountId, sortOrder: favourite.sortOrder }, 201);
}
