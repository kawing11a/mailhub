import { NextRequest } from 'next/server';
import { authenticate, apiError, apiResponse } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';
import { getSystemPreferences } from '@/lib/settings/system-preferences';

const preferenceSelect = {
  personalAiEnabled: true,
  semanticSearchEnabled: true,
} as const;

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const [systemPreferences, preferences] = await Promise.all([
    getSystemPreferences(),
    prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: auth.organizationId,
          userId: auth.userId,
        },
      },
      select: preferenceSelect,
    }),
  ]);

  if (!preferences) return apiError('Organization membership not found', 404);
  return apiResponse({
    ...preferences,
    systemAiEnabled: systemPreferences.isAiEnabled,
    systemSemanticSearchEnabled: systemPreferences.semanticSearchEnabled,
  });
}

export async function PUT(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return apiError('A preference object is required', 400);
  }

  const fields = Object.keys(body);
  if (
    fields.length === 0 ||
    fields.some((field) => field !== 'personalAiEnabled' && field !== 'semanticSearchEnabled')
  ) {
    return apiError('Only personalAiEnabled and semanticSearchEnabled may be updated', 400);
  }

  const input = body as Record<string, unknown>;
  const data: { personalAiEnabled?: boolean; semanticSearchEnabled?: boolean } = {};
  if ('personalAiEnabled' in input) {
    if (typeof input.personalAiEnabled !== 'boolean') {
      return apiError('personalAiEnabled must be a boolean', 400);
    }
    data.personalAiEnabled = input.personalAiEnabled;
  }
  if ('semanticSearchEnabled' in input) {
    if (typeof input.semanticSearchEnabled !== 'boolean') {
      return apiError('semanticSearchEnabled must be a boolean', 400);
    }
    data.semanticSearchEnabled = input.semanticSearchEnabled;
  }

  const where = {
    organizationId_userId: {
      organizationId: auth.organizationId,
      userId: auth.userId,
    },
  };
  const membership = await prisma.organizationMember.findUnique({ where, select: preferenceSelect });
  if (!membership) return apiError('Organization membership not found', 404);

  const preferences = await prisma.organizationMember.update({
    where,
    data,
    select: preferenceSelect,
  });
  const systemPreferences = await getSystemPreferences();
  return apiResponse({
    ...preferences,
    systemAiEnabled: systemPreferences.isAiEnabled,
    systemSemanticSearchEnabled: systemPreferences.semanticSearchEnabled,
  });
}
