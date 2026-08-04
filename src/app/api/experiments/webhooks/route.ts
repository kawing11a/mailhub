import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const webhooks = await prisma.notificationWebhook.findMany({
    where: { organizationId: auth.organizationId },
    orderBy: { createdAt: 'desc' },
  });

  return apiResponse(webhooks);
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json();
    const { name, type, config } = body;

    if (!name || !type || !config) {
      return apiError('Name, type, and config are required.', 400);
    }

    if (!['TELEGRAM', 'WECOM', 'GENERIC'].includes(type)) {
      return apiError('Invalid webhook type. Supported: TELEGRAM, WECOM, GENERIC', 400);
    }

    const webhook = await prisma.notificationWebhook.create({
      data: {
        organizationId: auth.organizationId,
        name: name.trim(),
        type,
        config,
        isActive: true,
      },
    });

    return apiResponse(webhook, 201);
  } catch (err: any) {
    return apiError(err.message || 'Failed to create notification webhook', 500);
  }
}
