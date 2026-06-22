import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  authenticate,
  requireAdmin,
  apiResponse,
  apiError,
} from '@/lib/auth/middleware';
import { updateMemberRoleSchema } from '@/lib/validation';

interface RouteParams {
  params: Promise<{ userId: string }>;
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const { userId } = await params;

  const body = await req.json();
  const parsed = updateMemberRoleSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.issues[0].message, 422);

  // Prevent self-demotion
  if (userId === auth.userId && parsed.data.role !== 'admin') {
    return apiError('Cannot change your own role', 400);
  }

  try {
    await prisma.organizationMember.update({
      where: {
        organizationId_userId: {
          organizationId: auth.organizationId,
          userId,
        },
      },
      data: { role: parsed.data.role },
    });
    return apiResponse({ success: true });
  } catch {
    return apiError('Member not found', 404);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const { userId } = await params;

  // Prevent self-removal
  if (userId === auth.userId) {
    return apiError('Cannot remove yourself from the organization', 400);
  }

  try {
    await prisma.organizationMember.delete({
      where: {
        organizationId_userId: {
          organizationId: auth.organizationId,
          userId,
        },
      },
    });
    return apiResponse({ success: true });
  } catch {
    return apiError('Member not found', 404);
  }
}
