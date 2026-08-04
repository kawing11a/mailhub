import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  let settings = await prisma.experimentSetting.findUnique({
    where: { organizationId: auth.organizationId },
  });

  if (!settings) {
    settings = await prisma.experimentSetting.create({
      data: {
        organizationId: auth.organizationId,
        isAiEnabled: true,
        aiProvider: 'openai',
        aiModelName: 'gpt-4o-mini',
      },
    });
  }

  // Mask API key for security when returning settings to client
  const maskedApiKey = settings.aiApiKey
    ? `${settings.aiApiKey.slice(0, 4)}...${settings.aiApiKey.slice(-4)}`
    : '';

  return apiResponse({
    ...settings,
    aiApiKeyMasked: maskedApiKey,
    hasApiKey: Boolean(settings.aiApiKey),
  });
}

export async function PUT(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json();
    const { isAiEnabled, aiProvider, aiApiKey, aiBaseUrl, aiModelName, aiCustomPrompt } = body;

    const dataToUpdate: any = {
      isAiEnabled: isAiEnabled !== undefined ? Boolean(isAiEnabled) : true,
      aiProvider: aiProvider || 'openai',
      aiBaseUrl: aiBaseUrl || null,
      aiModelName: aiModelName || 'gpt-4o-mini',
      aiCustomPrompt: aiCustomPrompt || null,
    };

    // Only update API key if explicitly provided (not undefined and not masked)
    if (aiApiKey !== undefined && !aiApiKey.includes('...')) {
      dataToUpdate.aiApiKey = aiApiKey ? aiApiKey.trim() : null;
    }

    const settings = await prisma.experimentSetting.upsert({
      where: { organizationId: auth.organizationId },
      update: dataToUpdate,
      create: {
        organizationId: auth.organizationId,
        ...dataToUpdate,
      },
    });

    const maskedApiKey = settings.aiApiKey
      ? `${settings.aiApiKey.slice(0, 4)}...${settings.aiApiKey.slice(-4)}`
      : '';

    return apiResponse({
      ...settings,
      aiApiKeyMasked: maskedApiKey,
      hasApiKey: Boolean(settings.aiApiKey),
    });
  } catch (err: any) {
    return apiError(err.message || 'Failed to update experiment settings', 500);
  }
}
