import { NextRequest } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import {
  authenticate,
  requireAdmin,
  apiResponse,
  apiError,
} from '@/lib/auth/middleware';
import { createUserSchema } from '@/lib/validation';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const members = await prisma.organizationMember.findMany({
    where: { organizationId: auth.organizationId },
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
    orderBy: { joinedAt: 'asc' },
  });

  return apiResponse(
    members.map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      joinedAt: m.joinedAt,
    }))
  );
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const body = await req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message, 422);

  const { email, role, name, password } = parsed.data;

  // Find or create user
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const passwordHash = await hash(password, 12);
    user = await prisma.user.create({
      data: { email, name, passwordHash },
    });
  }

  // Check if already a member
  const existing = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: auth.organizationId,
        userId: user.id,
      },
    },
  });
  if (existing) return apiError('User is already a member', 409);

  await prisma.organizationMember.create({
    data: {
      organizationId: auth.organizationId,
      userId: user.id,
      role,
    },
  });

  return apiResponse(
    { userId: user.id, email: user.email, name: user.name, role },
    201
  );
}
