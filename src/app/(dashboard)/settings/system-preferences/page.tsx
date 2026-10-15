'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Loader2, Shield, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { RestrictedSettingsNotice } from '@/components/settings/RestrictedSettingsNotice';

interface SystemPreferences {
  isAiEnabled: boolean;
  semanticSearchEnabled: boolean;
}

const CONTROLS: Array<{
  field: keyof SystemPreferences;
  label: string;
  description: string;
  icon: typeof Sparkles;
}> = [
  {
    field: 'isAiEnabled',
    label: 'Enable AI across organizations',
    description: 'Allow AI features such as spam classification and email summaries for every organization. When disabled, AI work uses the available local fallback.',
    icon: Sparkles,
  },
  {
    field: 'semanticSearchEnabled',
    label: 'Enable semantic search embeddings',
    description: 'Allow Meilisearch to generate and use email embeddings for semantic search across every organization.',
    icon: Shield,
  },
];

export default function SystemPreferencesPage() {
  const queryClient = useQueryClient();
  const [saveError, setSaveError] = useState<string | null>(null);
  const { data: authData, isLoading: isLoadingAuth } = useQuery({
    queryKey: ['auth-me'],
    queryFn: async () => {
      const response = await fetch('/api/auth/me');
      if (!response.ok) throw new Error('Failed to load account');
      return response.json();
    },
  });
  const isAdmin = authData?.role === 'admin';

  const {
    data: preferences,
    isLoading,
    isError,
  } = useQuery<SystemPreferences>({
    queryKey: ['system-preferences'],
    enabled: isAdmin,
    queryFn: async () => {
      const response = await fetch('/api/settings/system-preferences');
      if (!response.ok) throw new Error('Failed to load system preferences');
      return response.json();
    },
  });

  const updatePreference = useMutation({
    mutationFn: async ({ field, value }: { field: keyof SystemPreferences; value: boolean }) => {
      const response = await fetch('/api/settings/system-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || 'Could not save system preferences');
      }
      return response.json() as Promise<SystemPreferences>;
    },
    onMutate: () => setSaveError(null),
    onSuccess: (updated) => {
      queryClient.setQueryData(['system-preferences'], updated);
      queryClient.invalidateQueries({ queryKey: ['experiment-settings'] });
      queryClient.invalidateQueries({ queryKey: ['ai-preferences'] });
    },
    onError: (error: Error) => setSaveError(error.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['system-preferences'] }),
  });

  if (isLoadingAuth || (isAdmin && isLoading)) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-accent-600" /></div>;
  }

  if (!isAdmin) {
    return <RestrictedSettingsNotice sectionName="system preferences" />;
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="app-title text-2xl font-semibold">System Preferences</h1>
        <p className="mt-1 text-sm text-gray-500">
          These controls apply across every organization. Organization and personal preferences remain saved, but cannot override a system-wide disabled feature.
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="divide-y divide-gray-100">
          {CONTROLS.map(({ field, label, description, icon: Icon }) => {
            const enabled = preferences?.[field] ?? false;
            return (
              <div key={field} className="flex items-center justify-between gap-5 p-6">
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent-600" />
                  <div>
                    <div className="text-sm font-medium text-gray-900">{label}</div>
                    <p className="mt-1 max-w-2xl text-xs leading-5 text-gray-500">{description}</p>
                    <p className="mt-2 text-xs font-medium text-amber-700">Affects every organization.</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label={label}
                  aria-checked={enabled}
                  disabled={!preferences || isLoading || updatePreference.isPending}
                  onClick={() => updatePreference.mutate({ field, value: !enabled })}
                  className={clsx(
                    'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-500)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                    enabled ? 'bg-[var(--color-accent-500)]' : 'bg-gray-200'
                  )}
                >
                  <span className={clsx('inline-block h-4 w-4 transform rounded-full bg-white transition-transform', enabled ? 'translate-x-6' : 'translate-x-1')} />
                </button>
              </div>
            );
          })}
        </div>
        {updatePreference.isPending && <p className="border-t border-gray-100 px-6 py-3 text-xs text-gray-500" role="status">Saving system preference…</p>}
        {isError && <p className="border-t border-gray-100 px-6 py-3 text-sm text-red-600" role="alert">Could not load system preferences. Refresh this page to try again.</p>}
        {saveError && <p className="border-t border-gray-100 px-6 py-3 text-sm text-red-600" role="alert">{saveError}</p>}
      </section>
    </div>
  );
}
