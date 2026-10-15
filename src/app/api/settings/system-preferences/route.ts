import { NextRequest } from 'next/server';
import { apiError, apiResponse, authenticate } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';
import {
  getSystemPreferences,
  SYSTEM_PREFERENCE_ID,
  systemPreferenceSelect,
  type SystemPreferences,
} from '@/lib/settings/system-preferences';
import { configureEmailEmbedder } from '@/lib/search/meilisearch';

export const maxDuration = 300;

async function authorizeOrganizationAdmin(
  organizationId: string,
  userId: string
): Promise<boolean> {
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId, userId },
    },
    select: { role: true },
  });

  return membership?.role === 'admin';
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  if (!(await authorizeOrganizationAdmin(auth.organizationId, auth.userId))) {
    return apiError('Organization admin access required', 403);
  }

  return apiResponse(await getSystemPreferences());
}

export async function PUT(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  if (!(await authorizeOrganizationAdmin(auth.organizationId, auth.userId))) {
    return apiError('Organization admin access required', 403);
  }

  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return apiError('A preference object is required', 400);
  }

  const fields = Object.keys(body);
  if (
    fields.length === 0 ||
    fields.some((field) => field !== 'isAiEnabled' && field !== 'semanticSearchEnabled')
  ) {
    return apiError('Only isAiEnabled and semanticSearchEnabled may be updated', 400);
  }

  const input = body as Record<string, unknown>;
  const data: Partial<SystemPreferences> = {};
  if ('isAiEnabled' in input) {
    if (typeof input.isAiEnabled !== 'boolean') {
      return apiError('isAiEnabled must be a boolean', 400);
    }
    data.isAiEnabled = input.isAiEnabled;
  }
  if ('semanticSearchEnabled' in input) {
    if (typeof input.semanticSearchEnabled !== 'boolean') {
      return apiError('semanticSearchEnabled must be a boolean', 400);
    }
    data.semanticSearchEnabled = input.semanticSearchEnabled;
  }

  let changedEmbedder = false;
  let meilisearchFailed = false;
  try {
    const updatedPreferences = await prisma.$transaction(async (tx) => {
      // Ensure the singleton exists before locking it. The lock serializes all
      // system-preference writes across application instances.
      await tx.systemPreference.upsert({
        where: { id: SYSTEM_PREFERENCE_ID },
        create: { id: SYSTEM_PREFERENCE_ID },
        update: {},
      });
      await tx.$queryRaw`
        SELECT id
        FROM system_preferences
        WHERE id = ${SYSTEM_PREFERENCE_ID}
        FOR UPDATE
      `;

      const currentPreferences = await tx.systemPreference.findUniqueOrThrow({
        where: { id: SYSTEM_PREFERENCE_ID },
        select: systemPreferenceSelect,
      });
      const semanticSearchChanged =
        data.semanticSearchEnabled !== undefined &&
        data.semanticSearchEnabled !== currentPreferences.semanticSearchEnabled;

      if (semanticSearchChanged) {
        // The request may reach Meilisearch even if its response times out, so
        // mark it for compensation before making the external call.
        changedEmbedder = true;
        try {
          await configureEmailEmbedder(data.semanticSearchEnabled!);
        } catch (error) {
          meilisearchFailed = true;
          try {
            await configureEmailEmbedder(currentPreferences.semanticSearchEnabled);
            changedEmbedder = false;
          } catch (restoreError) {
            console.error(
              'Failed to restore persisted Meilisearch embedder state after update failure:',
              restoreError
            );
          }
          throw error;
        }
      }

      try {
        return await tx.systemPreference.update({
          where: { id: SYSTEM_PREFERENCE_ID },
          data,
          select: systemPreferenceSelect,
        });
      } catch (error) {
        // Restore while still holding the row lock if the row update fails.
        if (semanticSearchChanged && changedEmbedder) {
          try {
            await configureEmailEmbedder(currentPreferences.semanticSearchEnabled);
            changedEmbedder = false;
          } catch (restoreError) {
            console.error('Failed to restore previous Meilisearch embedder state:', restoreError);
          }
        }
        throw error;
      }
    }, { maxWait: 10_000, timeout: 270_000 });

    return apiResponse(updatedPreferences);
  } catch (error) {
    if (meilisearchFailed) {
      console.error('Failed to update Meilisearch email embedder:', error);
    } else {
      console.error('Failed to save system preferences:', error);
    }

    if (changedEmbedder) {
      try {
        // Re-read under the same lock after an ambiguous Meilisearch failure
        // or transaction commit failure so a newer update cannot be undone.
        await prisma.$transaction(async (tx) => {
          await tx.systemPreference.upsert({
            where: { id: SYSTEM_PREFERENCE_ID },
            create: { id: SYSTEM_PREFERENCE_ID },
            update: {},
          });
          await tx.$queryRaw`
            SELECT id
            FROM system_preferences
            WHERE id = ${SYSTEM_PREFERENCE_ID}
            FOR UPDATE
          `;
          const persistedPreferences = await tx.systemPreference.findUniqueOrThrow({
            where: { id: SYSTEM_PREFERENCE_ID },
            select: systemPreferenceSelect,
          });
          await configureEmailEmbedder(persistedPreferences.semanticSearchEnabled);
        }, { maxWait: 10_000, timeout: 270_000 });
      } catch (restoreError) {
        console.error('Failed to reconcile Meilisearch embedder after preference update failure:', restoreError);
      }
    }

    if (meilisearchFailed) {
      return apiError('Could not update semantic search in Meilisearch', 503);
    }

    return apiError('Could not save system preferences', 500);
  }
}
