import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  authenticate,
  requireAdmin,
  apiResponse,
  apiError,
} from '@/lib/auth/middleware';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  const { id } = await params;

  try {
    const webhook = await prisma.notificationWebhook.findUnique({
      where: { id },
    });

    if (!webhook || webhook.organizationId !== auth.organizationId) {
      return apiError('Webhook channel not found', 404);
    }

    await prisma.notificationWebhook.delete({
      where: { id },
    });

    return apiResponse({ message: 'Webhook deleted successfully' });
  } catch (err: any) {
    return apiError(err.message || 'Failed to delete webhook', 500);
  }
}
