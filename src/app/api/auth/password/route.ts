import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { changePasswordSchema } from '@/lib/validation';
import { compare, hash } from 'bcryptjs';

export async function PUT(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json();
    const parsed = changePasswordSchema.safeParse(body);

    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message, 422);
    }

    const { currentPassword, newPassword } = parsed.data;

    // Fetch user with their current password hash
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
    });

    if (!user) {
      return apiError('User not found', 404);
    }

    // Verify current password
    const isPasswordValid = await compare(currentPassword, user.passwordHash);
    if (!isPasswordValid) {
      return apiError('Incorrect current password', 400);
    }

    // Hash and save new password
    const newPasswordHash = await hash(newPassword, 12);
    
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    return apiResponse({ success: true });
  } catch (error) {
    console.error('Password change error:', error);
    return apiError('Failed to change password', 500);
  }
}
