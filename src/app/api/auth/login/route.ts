import { NextRequest } from 'next/server';
import { compare } from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import { createToken, createRefreshToken, ACCESS_TOKEN_MAX_AGE, REFRESH_TOKEN_MAX_AGE } from '@/lib/auth/jwt';
import { loginSchema } from '@/lib/validation';
import { apiError, apiResponse } from '@/lib/auth/middleware';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message, 422);
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: { organization: true },
          take: 1, // Default to first org
        },
      },
    });

    if (!user || !(await compare(password, user.passwordHash))) {
      return apiError('Invalid email or password', 401);
    }

    const membership = user.memberships[0];
    if (!membership) {
      return apiError('No organization found for this user', 403);
    }

    const payload = {
      userId: user.id,
      organizationId: membership.organizationId,
      role: membership.role as 'admin' | 'member',
    };

    // 7 days Access Token
    const token = await createToken(payload);
    // 30 days (1 month) Refresh Token
    const refreshToken = await createRefreshToken(payload);

    const response = apiResponse({
      user: { id: user.id, email: user.email, name: user.name },
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        slug: membership.organization.slug,
      },
      role: membership.role,
    });

    // Access Token Cookie (7 Days)
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: ACCESS_TOKEN_MAX_AGE,
      path: '/',
    });

    // Refresh Token Cookie (30 Days / 1 Month)
    response.cookies.set('refresh-token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: REFRESH_TOKEN_MAX_AGE,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return apiError('Internal server error', 500);
  }
}
