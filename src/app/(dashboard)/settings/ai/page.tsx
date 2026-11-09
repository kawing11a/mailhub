'use client';

import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Loader2, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { RestrictedSettingsNotice } from '@/components/settings/RestrictedSettingsNotice';

interface AiSettings {
  isAiEnabled: boolean;
  systemAiEnabled: boolean;
  aiProvider: string;
  aiApiKeyMasked: string;
  hasApiKey: boolean;
  aiBaseUrl?: string | null;
  aiModelName: string;
  aiCustomPrompt?: string | null;
}

export default function AiSettingsPage() {
  const queryClient = useQueryClient();
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isAiEnabledDraft, setIsAiEnabledDraft] = useState<boolean | null>(null);
  const { data: authData, isLoading: isLoadingAuth } = useQuery({
    queryKey: ['auth-me'],
    queryFn: async () => {
      const response = await fetch('/api/auth/me');
      if (!response.ok) throw new Error('Failed to load account');
      return response.json();
    },
  });
  const isAdmin = authData?.role === 'admin';
  const { data: settings, isLoading, isError } = useQuery<AiSettings>({
    queryKey: ['experiment-settings'],
    enabled: isAdmin,
    queryFn: async () => {
      const response = await fetch('/api/experiments/settings');
      if (!response.ok) throw new Error('Failed to load AI settings');
      return response.json();
    },
  });

  const saveSettings = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const response = await fetch('/api/experiments/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || 'Could not save AI settings');
      }
      return response.json() as Promise<AiSettings>;
    },
    onSuccess: (updated) => {
      setIsAiEnabledDraft(updated.isAiEnabled);
      setApiKeyInput('');
      queryClient.setQueryData(['experiment-settings'], updated);
      toast.success('AI settings saved');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const isAiEnabled = isAiEnabledDraft ?? settings?.isAiEnabled ?? true;
    if (settings?.systemAiEnabled === false || !isAiEnabled) {
      saveSettings.mutate({ isAiEnabled });
      return;
    }

    saveSettings.mutate({
      isAiEnabled,
      aiProvider: formData.get('aiProvider'),
      aiModelName: formData.get('aiModelName'),
      aiBaseUrl: (formData.get('aiBaseUrl') as string) || null,
      aiCustomPrompt: (formData.get('aiCustomPrompt') as string) || null,
      ...(apiKeyInput ? { aiApiKey: apiKeyInput } : {}),
    });
  };

  if (isLoadingAuth || (isAdmin && isLoading)) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-accent-600" /></div>;
  }
  if (!isAdmin) return <RestrictedSettingsNotice sectionName="AI settings" />;

  const canConfigureProvider = settings?.systemAiEnabled !== false && (isAiEnabledDraft ?? settings?.isAiEnabled ?? true);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="app-title text-2xl font-semibold">AI Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Configure email AI tools and the prompt used for email summaries.</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <label htmlFor="isAiEnabled" className="text-sm font-medium text-gray-900">Enable AI for this organization</label>
            <p className="mt-1 text-xs text-gray-500">The system AI switch remains the master control for all organizations.</p>
          </div>
          <input
            type="checkbox"
            id="isAiEnabled"
            checked={isAiEnabledDraft ?? settings?.isAiEnabled ?? true}
            onChange={(event) => setIsAiEnabledDraft(event.target.checked)}
            className="h-4 w-4 cursor-pointer rounded border-gray-300 text-accent-600 focus:ring-accent-500"
          />
        </div>

        {settings?.systemAiEnabled === false && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="status">
            AI is disabled in System Preferences. The organization setting is saved, and AI calls remain unavailable until the system switch is enabled.
          </p>
        )}

        {canConfigureProvider && <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label htmlFor="aiProvider" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-700">LLM Provider</label>
              <select id="aiProvider" name="aiProvider" defaultValue={settings?.aiProvider || 'openai'} className="w-full rounded-md border border-gray-300 p-2.5 text-sm">
                <option value="ollama">Local LLM — Ollama</option>
                <option value="lmstudio">Local LLM — LM Studio</option>
                <option value="local_llm">Local LLM — Other Self-Hosted Endpoint</option>
                <option value="openai">OpenAI</option>
                <option value="claude">Anthropic Claude</option>
                <option value="custom">Custom Endpoint</option>
              </select>
            </div>
            <div>
              <label htmlFor="aiModelName" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-700">Model Name</label>
              <input id="aiModelName" name="aiModelName" defaultValue={settings?.aiModelName || 'gpt-4o-mini'} placeholder="e.g. llama3, qwen2.5, gpt-4o-mini" className="w-full rounded-md border border-gray-300 p-2.5 text-sm" />
            </div>
          </div>

          <div>
            <label htmlFor="aiApiKey" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-700">
              API Key {settings?.hasApiKey && <span className="ml-2 text-xs font-normal text-green-600">(Configured: {settings.aiApiKeyMasked})</span>}
            </label>
            <div className="relative">
              <input id="aiApiKey" type={showApiKey ? 'text' : 'password'} value={apiKeyInput} onChange={(event) => setApiKeyInput(event.target.value)} placeholder={settings?.hasApiKey ? 'Leave blank to keep the existing key' : 'Enter API key (optional for local LLMs)'} className="w-full rounded-md border border-gray-300 p-2.5 pr-10 text-sm" />
              <button type="button" aria-label={showApiKey ? 'Hide API key' : 'Show API key'} onClick={() => setShowApiKey(!showApiKey)} className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600">
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="aiBaseUrl" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-700">Local / Custom Base URL</label>
            <input id="aiBaseUrl" name="aiBaseUrl" defaultValue={settings?.aiBaseUrl || ''} placeholder="e.g. http://localhost:11434/v1" className="w-full rounded-md border border-gray-300 p-2.5 text-sm" />
          </div>

          <div>
            <label htmlFor="aiCustomPrompt" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-700">Email Summary Prompt</label>
            <textarea id="aiCustomPrompt" name="aiCustomPrompt" rows={5} defaultValue={settings?.aiCustomPrompt || ''} placeholder="Instructions the AI should follow when summarizing email batches..." className="w-full rounded-md border border-gray-300 p-2.5 text-sm" />
            <p className="mt-1 text-xs text-gray-500">This prompt guides both batch summaries and the final summary.</p>
          </div>
        </>}

        <div className="flex justify-end border-t border-gray-100 pt-4">
          <button type="submit" disabled={saveSettings.isPending || !settings} className="flex items-center gap-2 rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50">
            {saveSettings.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>Save AI Settings</span>
          </button>
        </div>
        {isError && <p className="text-sm text-red-600" role="alert">Could not load AI settings. Refresh this page to try again.</p>}
      </form>

      <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0" />
        <p>AI email analysis and summaries also follow the system wide AI setting. When it is off, AI providers are not called.</p>
      </div>
    </div>
  );
}
