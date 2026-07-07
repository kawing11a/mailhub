import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError, requireAdmin } from '@/lib/auth/middleware';
import { createAccountSchema } from '@/lib/validation';
import { createAccount, sanitizeAccount } from '@/lib/accounts/service';
import { imapManager } from '@/lib/imap/connection-manager';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const accounts = await prisma.emailAccount.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(auth.role !== 'admin'
        ? {
            memberAccess: {
              some: {
                userId: auth.userId,
              },
            },
          }
        : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      label: true,
      emailAddress: true,
      provider: true,
      color: true,
      avatarInitials: true,
      isActive: true,
      lastSyncedAt: true,
      createdAt: true,
    },
  });

  return apiResponse(accounts);
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const body = await req.json();
  const parsed = createAccountSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message, 422);

  try {
    const account = await createAccount(auth.organizationId, parsed.data);
    // After creating the account, queue initial sync
    // Connection initialization happens asynchronously inside the worker process
    const { syncQueue } = await import('@/lib/queue/client');
    await syncQueue.add('initial-sync', { accountId: account.id, folder: 'ALL' });
    return apiResponse(sanitizeAccount(account), 201);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message.includes('Unique constraint')
    ) {
      return apiError('An account with this email address already exists', 409);
    }
    console.error('Create account error:', error);
    return apiError('Internal server error', 500);
  }
}
