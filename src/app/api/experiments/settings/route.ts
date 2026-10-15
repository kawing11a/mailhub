import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  authenticate,
  requireAdmin,
  apiResponse,
  apiError,
} from '@/lib/auth/middleware';
import { getSystemPreferences } from '@/lib/settings/system-preferences';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

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
  const { aiApiKey, ...publicSettings } = settings;
  const maskedApiKey = aiApiKey
    ? `${aiApiKey.slice(0, 4)}...${aiApiKey.slice(-4)}`
    : '';

  const systemPreferences = await getSystemPreferences();
  return apiResponse({
    ...publicSettings,
    aiApiKeyMasked: maskedApiKey,
    hasApiKey: Boolean(aiApiKey),
    systemAiEnabled: systemPreferences.isAiEnabled,
  });
}

export async function PUT(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return apiError('A settings object is required', 400);
    }
    const input = body as Record<string, unknown>;
    const existing = await prisma.experimentSetting.findUnique({
      where: { organizationId: auth.organizationId },
    });
    const dataToUpdate: {
      isAiEnabled?: boolean;
      aiProvider?: string;
      aiApiKey?: string;
      aiBaseUrl?: string | null;
      aiModelName?: string;
      aiCustomPrompt?: string | null;
    } = {};

    if ('isAiEnabled' in input) {
      if (typeof input.isAiEnabled !== 'boolean') return apiError('isAiEnabled must be a boolean', 400);
      dataToUpdate.isAiEnabled = input.isAiEnabled;
    }
    if ('aiProvider' in input) {
      if (typeof input.aiProvider !== 'string') return apiError('aiProvider must be a string', 400);
      dataToUpdate.aiProvider = input.aiProvider;
    }
    if ('aiModelName' in input) {
      if (typeof input.aiModelName !== 'string') return apiError('aiModelName must be a string', 400);
      dataToUpdate.aiModelName = input.aiModelName;
    }
    if ('aiBaseUrl' in input) {
      if (input.aiBaseUrl !== null && typeof input.aiBaseUrl !== 'string') return apiError('aiBaseUrl must be a string or null', 400);
      dataToUpdate.aiBaseUrl = input.aiBaseUrl as string | null;
    }
    if ('aiCustomPrompt' in input) {
      if (input.aiCustomPrompt !== null && typeof input.aiCustomPrompt !== 'string') return apiError('aiCustomPrompt must be a string or null', 400);
      dataToUpdate.aiCustomPrompt = input.aiCustomPrompt as string | null;
    }
    if ('aiApiKey' in input && typeof input.aiApiKey === 'string') {
      const key = input.aiApiKey.trim();
      if (key && !key.includes('...')) dataToUpdate.aiApiKey = key;
    }

    const settings = existing
      ? await prisma.experimentSetting.update({
          where: { organizationId: auth.organizationId },
          data: dataToUpdate,
        })
      : await prisma.experimentSetting.create({
          data: {
            organizationId: auth.organizationId,
            isAiEnabled: true,
            aiProvider: 'openai',
            aiModelName: 'gpt-4o-mini',
            ...dataToUpdate,
          },
        });

    const { aiApiKey, ...publicSettings } = settings;
    const maskedApiKey = aiApiKey
      ? `${aiApiKey.slice(0, 4)}...${aiApiKey.slice(-4)}`
      : '';

    const systemPreferences = await getSystemPreferences();
    return apiResponse({
      ...publicSettings,
      aiApiKeyMasked: maskedApiKey,
      hasApiKey: Boolean(aiApiKey),
      systemAiEnabled: systemPreferences.isAiEnabled,
    });
  } catch (err: any) {
    return apiError(err.message || 'Failed to update experiment settings', 500);
  }
}
