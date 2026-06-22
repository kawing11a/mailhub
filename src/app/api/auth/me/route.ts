import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { id: true, email: true, name: true },
    });

    if (!user) return apiError('User not found', 404);

    const org = await prisma.organization.findUnique({
      where: { id: auth.organizationId },
      select: { id: true, name: true, slug: true },
    });

    return apiResponse({
      user,
      organization: org,
      role: auth.role,
    });
  } catch (error) {
    console.error('Get user error:', error);
    return apiError('Internal server error', 500);
  }
}
