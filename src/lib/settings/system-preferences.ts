import { prisma } from '@/lib/db/prisma';

export const SYSTEM_PREFERENCE_ID = 'global';

export const systemPreferenceSelect = {
  isAiEnabled: true,
  semanticSearchEnabled: true,
} as const;

export type SystemPreferences = {
  isAiEnabled: boolean;
  semanticSearchEnabled: boolean;
};

/** Read the global AI settings, creating the default singleton on first use. */
export async function getSystemPreferences(): Promise<SystemPreferences> {
  return prisma.systemPreference.upsert({
    where: { id: SYSTEM_PREFERENCE_ID },
    create: { id: SYSTEM_PREFERENCE_ID },
    update: {},
    select: systemPreferenceSelect,
  });
}

/** Update a validated subset of the global AI settings. */
export async function updateSystemPreferences(
  data: Partial<SystemPreferences>
): Promise<SystemPreferences> {
  return prisma.systemPreference.upsert({
    where: { id: SYSTEM_PREFERENCE_ID },
    create: { id: SYSTEM_PREFERENCE_ID, ...data },
    update: data,
    select: systemPreferenceSelect,
  });
}
