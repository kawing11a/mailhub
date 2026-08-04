import { NextRequest } from 'next/server';
import { hash } from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import { createToken, createRefreshToken, ACCESS_TOKEN_MAX_AGE, REFRESH_TOKEN_MAX_AGE } from '@/lib/auth/jwt';
import { registerSchema } from '@/lib/validation';
import { apiError, apiResponse } from '@/lib/auth/middleware';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message, 422);
    }

    const { email, name, password, organizationName } = parsed.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return apiError('Email already registered', 409);
    }

    // Create user, org, and membership in a transaction
    const passwordHash = await hash(password, 12);
    const slug = slugify(organizationName) + '-' + Date.now().toString(36);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, name, passwordHash },
      });

      const org = await tx.organization.create({
        data: { name: organizationName, slug },
      });

      await tx.organizationMember.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          role: 'admin',
        },
      });

      return { user, org };
    });

    const payload = {
      userId: result.user.id,
      organizationId: result.org.id,
      role: 'admin' as const,
    };

    // 7 days Access Token
    const token = await createToken(payload);
    // 30 days Refresh Token
    const refreshToken = await createRefreshToken(payload);

    const response = apiResponse(
      {
        user: { id: result.user.id, email, name },
        organization: { id: result.org.id, name: organizationName, slug },
      },
      201
    );

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
    console.error('Registration error:', error);
    return apiError('Internal server error', 500);
  }
}
