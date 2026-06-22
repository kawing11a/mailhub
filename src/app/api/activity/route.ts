import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  authenticate,
  requireAdmin,
  apiResponse,
  apiError,
} from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
  const accountId = searchParams.get('accountId');
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {
    organizationId: auth.organizationId,
  };
  if (accountId) where.accountId = accountId;

  const [logs, total] = await Promise.all([
    prisma.emailActivityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        user: { select: { id: true, email: true, name: true } },
        account: { select: { id: true, label: true, emailAddress: true, color: true } },
      },
    }),
    prisma.emailActivityLog.count({ where }),
  ]);

  return apiResponse({
    logs,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
