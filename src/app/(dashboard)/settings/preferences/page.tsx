'use client';

import { useState } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Palette, Maximize, Check, Layout, Clock, UserCircle, Bot } from 'lucide-react';
import clsx from 'clsx';

interface AiPreferences {
  personalAiEnabled: boolean;
  semanticSearchEnabled: boolean;
  systemAiEnabled: boolean;
  systemSemanticSearchEnabled: boolean;
}

const THEMES = [
  { id: 'theme-blue', name: 'Blue (Default)', color: 'bg-blue-500' },
  { id: 'theme-purple', name: 'Purple', color: 'bg-purple-500' },
  { id: 'theme-emerald', name: 'Emerald', color: 'bg-emerald-500' },
  { id: 'theme-rose', name: 'Rose', color: 'bg-rose-500' },
];

const DENSITIES = [
  { id: 'density-comfortable', name: 'Comfortable', description: 'Standard spacing for easy reading.' },
  { id: 'density-compact', name: 'Compact', description: 'Tighter spacing to fit more content on screen.' },
];

const READING_PANES = [
  { id: 'right', name: 'Right of list', description: 'Show email content on the right.' },
  { id: 'bottom', name: 'Below list', description: 'Show email content below the list.' },
  { id: 'off', name: 'Off', description: 'Only show email list.' },
];

const TIME_FORMATS = [
  { id: '12h', name: '12-hour', description: 'e.g. 2:30 PM' },
  { id: '24h', name: '24-hour', description: 'e.g. 14:30' },
];

export default function PreferencesPage() {
  const queryClient = useQueryClient();
  const [saveError, setSaveError] = useState<string | null>(null);
  const { data: aiPreferences, isLoading: isLoadingAiPreferences, isError: hasAiPreferencesError } = useQuery<AiPreferences>({
    queryKey: ['ai-preferences'],
    queryFn: async () => {
      const res = await fetch('/api/settings/preferences');
      if (!res.ok) throw new Error('Failed to load AI preferences');
      return res.json();
    },
  });
  const updateAiPreference = useMutation({
    mutationFn: async ({ field, value }: { field: keyof AiPreferences; value: boolean }) => {
      const res = await fetch('/api/settings/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error('Failed to save AI preference');
      return res.json() as Promise<AiPreferences>;
    },
    onMutate: async ({ field, value }) => {
      setSaveError(null);
      await queryClient.cancelQueries({ queryKey: ['ai-preferences'] });
      const previous = queryClient.getQueryData<AiPreferences>(['ai-preferences']);
      if (previous) queryClient.setQueryData(['ai-preferences'], { ...previous, [field]: value });
      return { previous };
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['ai-preferences'], updated);
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(['ai-preferences'], context.previous);
      setSaveError('Could not save your AI preference. Your previous setting has been restored.');
      toast.error('Could not save AI preference');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-preferences'] });
    },
  });
  const { 
    theme, setTheme, 
    density, setDensity,
    readingPane, setReadingPane,
    timeFormat, setTimeFormat,
    showAvatars, setShowAvatars
  } = useUIStore();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="app-title text-2xl font-semibold">Preferences</h1>
        <p className="text-sm text-gray-500 mt-1">
          Customize the look and feel of MailHub. Changes are saved automatically.
        </p>
      </div>

      <div className="space-y-6">
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center space-x-2">
            <Bot className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">AI Preferences</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {([
              { field: 'personalAiEnabled', label: 'AI features for me', description: 'Allow AI features to process email for your account.' },
              { field: 'semanticSearchEnabled', label: 'Semantic search embeddings', description: 'Create embeddings for semantic email search in your account.' },
            ] as const).map(({ field, label, description }) => (
              <div key={field} className="p-6 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-gray-900">{label}</div>
                  <div className="text-xs text-gray-500 mt-1">{description}</div>
                  {field === 'personalAiEnabled' && aiPreferences?.personalAiEnabled && !aiPreferences.systemAiEnabled && (
                    <div className="text-xs text-amber-700 mt-2" role="status">
                      This saved preference is currently overridden because AI is disabled across organizations. Your choice is preserved.
                    </div>
                  )}
                  {field === 'semanticSearchEnabled' && aiPreferences?.semanticSearchEnabled && !aiPreferences.systemSemanticSearchEnabled && (
                    <div className="text-xs text-amber-700 mt-2" role="status">
                      This saved preference is currently overridden because semantic search is disabled across organizations. Your choice is preserved.
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label={label}
                  aria-checked={aiPreferences?.[field] ?? false}
                  disabled={!aiPreferences || isLoadingAiPreferences || updateAiPreference.isPending}
                  onClick={() => updateAiPreference.mutate({ field, value: !aiPreferences![field] })}
                  className={clsx(
                    'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-500)] focus:ring-offset-2 disabled:opacity-50',
                    aiPreferences?.[field] ? 'bg-[var(--color-accent-500)]' : 'bg-gray-200'
                  )}
                >
                  <span className={clsx('inline-block h-4 w-4 transform rounded-full bg-white transition-transform', aiPreferences?.[field] ? 'translate-x-6' : 'translate-x-1')} />
                </button>
              </div>
            ))}
          </div>
          {hasAiPreferencesError && <p className="px-6 pb-4 text-sm text-red-600" role="alert">Could not load AI preferences. Refresh this page to try again.</p>}
          {saveError && <p className="px-6 pb-4 text-sm text-red-600" role="alert">{saveError}</p>}
        </section>

        {/* Accent Color Section */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center space-x-2">
            <Palette className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">Accent Color</h2>
          </div>
          <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={clsx(
                  "relative flex flex-col items-center p-4 rounded-lg border-2 transition-all",
                  theme === t.id 
                    ? "border-[var(--color-accent-500)] bg-[var(--color-accent-50)]" 
                    : "border-gray-200 hover:border-gray-300 bg-white"
                )}
              >
                <div className={`w-8 h-8 rounded-full ${t.color} mb-3 shadow-sm`} />
                <span className="text-sm font-medium text-gray-900">{t.name}</span>
                {theme === t.id && (
                  <div className="absolute top-2 right-2 text-[var(--color-accent-600)]">
                    <Check className="w-4 h-4" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Display Density Section */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center space-x-2">
            <Maximize className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">Display Density</h2>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {DENSITIES.map((d) => (
              <button
                key={d.id}
                onClick={() => setDensity(d.id)}
                className={clsx(
                  "relative flex flex-col items-start p-4 rounded-lg border-2 text-left transition-all",
                  density === d.id 
                    ? "border-[var(--color-accent-500)] bg-[var(--color-accent-50)]" 
                    : "border-gray-200 hover:border-gray-300 bg-white"
                )}
              >
                <span className="text-sm font-medium text-gray-900">{d.name}</span>
                <span className="text-xs text-gray-500 mt-1">{d.description}</span>
                {density === d.id && (
                  <div className="absolute top-4 right-4 text-[var(--color-accent-600)]">
                    <Check className="w-4 h-4" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Reading Pane Section */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center space-x-2">
            <Layout className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">Reading Pane</h2>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            {READING_PANES.map((r) => (
              <button
                key={r.id}
                onClick={() => setReadingPane(r.id)}
                className={clsx(
                  "relative flex flex-col items-start p-4 rounded-lg border-2 text-left transition-all",
                  readingPane === r.id 
                    ? "border-[var(--color-accent-500)] bg-[var(--color-accent-50)]" 
                    : "border-gray-200 hover:border-gray-300 bg-white"
                )}
              >
                <span className="text-sm font-medium text-gray-900">{r.name}</span>
                <span className="text-xs text-gray-500 mt-1">{r.description}</span>
                {readingPane === r.id && (
                  <div className="absolute top-4 right-4 text-[var(--color-accent-600)]">
                    <Check className="w-4 h-4" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Time Format Section */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center space-x-2">
            <Clock className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">Time Format</h2>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {TIME_FORMATS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTimeFormat(t.id)}
                className={clsx(
                  "relative flex flex-col items-start p-4 rounded-lg border-2 text-left transition-all",
                  timeFormat === t.id 
                    ? "border-[var(--color-accent-500)] bg-[var(--color-accent-50)]" 
                    : "border-gray-200 hover:border-gray-300 bg-white"
                )}
              >
                <span className="text-sm font-medium text-gray-900">{t.name}</span>
                <span className="text-xs text-gray-500 mt-1">{t.description}</span>
                {timeFormat === t.id && (
                  <div className="absolute top-4 right-4 text-[var(--color-accent-600)]">
                    <Check className="w-4 h-4" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Sender Avatars Section */}
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center space-x-2">
            <UserCircle className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">Sender Avatars</h2>
          </div>
          <div className="p-6 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-900">Show sender avatars in list</div>
              <div className="text-xs text-gray-500 mt-1">Display initials or profile pictures next to emails.</div>
            </div>
            <button
              onClick={() => setShowAvatars(!showAvatars)}
              className={clsx(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-500)] focus:ring-offset-2",
                showAvatars ? "bg-[var(--color-accent-500)]" : "bg-gray-200"
              )}
            >
              <span
                className={clsx(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  showAvatars ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}

