import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  authenticate,
  requireAdmin,
  apiResponse,
  apiError,
} from '@/lib/auth/middleware';
import { accountAccessWhere } from '@/lib/accounts/access';
import { updateAccountSchema } from '@/lib/validation';
import { sanitizeAccount, updateAccount, deleteAccount } from '@/lib/accounts/service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;

  const account = await prisma.emailAccount.findFirst({
    where: accountAccessWhere(auth, id),
  });

  if (!account) return apiError('Account not found', 404);
  return apiResponse(sanitizeAccount(account));
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const { id } = await params;

  const body = await req.json();
  const parsed = updateAccountSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message, 422);

  try {
    const account = await updateAccount(id, auth.organizationId, parsed.data);
    return apiResponse(sanitizeAccount(account));
  } catch {
    return apiError('Account not found', 404);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const { id } = await params;

  try {
    await deleteAccount(id, auth.organizationId);
    return apiResponse({ success: true });
  } catch {
    return apiError('Account not found', 404);
  }
}
