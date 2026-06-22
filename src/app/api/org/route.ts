import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  authenticate,
  requireAdmin,
  apiResponse,
  apiError,
} from '@/lib/auth/middleware';
import { updateOrgSchema } from '@/lib/validation';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const org = await prisma.organization.findUnique({
    where: { id: auth.organizationId },
    include: {
      _count: { select: { members: true, emailAccounts: true } },
    },
  });

  if (!org) return apiError('Organization not found', 404);

  return apiResponse({
    id: org.id,
    name: org.name,
    slug: org.slug,
    memberCount: org._count.members,
    accountCount: org._count.emailAccounts,
    createdAt: org.createdAt,
  });
}

export async function PUT(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const body = await req.json();
  const parsed = updateOrgSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.errors[0].message, 422);

  const org = await prisma.organization.update({
    where: { id: auth.organizationId },
    data: parsed.data,
  });

  return apiResponse(org);
}
