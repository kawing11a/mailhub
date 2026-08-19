'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { SpamSettingsTab } from '@/components/settings/SpamSettingsTab';
import {
  FlaskConical,
  Bot,
  Bell,
  Plus,
  Trash2,
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  Key,
  Globe,
  MessageSquare,
  Eye,
  EyeOff,
} from 'lucide-react';
import { RestrictedSettingsNotice } from '@/components/settings/RestrictedSettingsNotice';

interface ExperimentSettings {
  isAiEnabled: boolean;
  aiProvider: string;
  aiApiKeyMasked: string;
  hasApiKey: boolean;
  aiBaseUrl?: string | null;
  aiModelName: string;
  aiCustomPrompt?: string | null;
}

interface WebhookChannel {
  id: string;
  name: string;
  type: 'TELEGRAM' | 'WECOM' | 'GENERIC';
  config: any;
  isActive: boolean;
  createdAt: string;
}

export default function ExperimentsSettingsPage() {
  const queryClient = useQueryClient();
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);

  // New webhook form state
  const [newWebhook, setNewWebhook] = useState<{
    name: string;
    type: 'TELEGRAM' | 'WECOM' | 'GENERIC';
    telegramBotToken: string;
    telegramChatId: string;
    wecomWebhookUrl: string;
    genericUrl: string;
    genericSecret: string;
  }>({
    name: '',
    type: 'TELEGRAM',
    telegramBotToken: '',
    telegramChatId: '',
    wecomWebhookUrl: '',
    genericUrl: '',
    genericSecret: '',
  });

  const { data: authData, isLoading: isLoadingAuth } = useQuery({
    queryKey: ['auth-me'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me');
      if (!res.ok) throw new Error('Failed to fetch auth info');
      return res.json();
    },
  });

  const isAdmin = authData?.role === 'admin';

  // Fetch Settings
  const { data: settings, isLoading: isLoadingSettings } = useQuery<ExperimentSettings>({
    queryKey: ['experiment-settings'],
    enabled: isAdmin,
    queryFn: async () => {
      const res = await fetch('/api/experiments/settings');
      if (!res.ok) throw new Error('Failed to load experiment settings');
      return res.json();
    },
  });

  // Fetch Webhooks
  const { data: webhooks = [], isLoading: isLoadingWebhooks } = useQuery<WebhookChannel[]>({
    queryKey: ['notification-webhooks'],
    enabled: isAdmin,
    queryFn: async () => {
      const res = await fetch('/api/experiments/webhooks');
      if (!res.ok) throw new Error('Failed to load webhooks');
      return res.json();
    },
  });

  // Update Settings Mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (updatedData: Partial<ExperimentSettings> & { aiApiKey?: string }) => {
      const res = await fetch('/api/experiments/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
      });
      if (!res.ok) throw new Error('Failed to update AI settings');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['experiment-settings'] });
      toast.success('AI Settings updated successfully');
      setApiKeyInput('');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to save settings');
    },
  });

  // Create Webhook Mutation
  const createWebhookMutation = useMutation({
    mutationFn: async () => {
      let config: any = {};
      if (newWebhook.type === 'TELEGRAM') {
        config = { botToken: newWebhook.telegramBotToken, chatId: newWebhook.telegramChatId };
      } else if (newWebhook.type === 'WECOM') {
        config = { webhookUrl: newWebhook.wecomWebhookUrl };
      } else {
        config = { url: newWebhook.genericUrl, secret: newWebhook.genericSecret };
      }

      const res = await fetch('/api/experiments/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newWebhook.name,
          type: newWebhook.type,
          config,
        }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create webhook');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-webhooks'] });
      toast.success('Webhook channel added successfully');
      setIsAddModalOpen(false);
      setNewWebhook({
        name: '',
        type: 'TELEGRAM',
        telegramBotToken: '',
        telegramChatId: '',
        wecomWebhookUrl: '',
        genericUrl: '',
        genericSecret: '',
      });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Delete Webhook Mutation
  const deleteWebhookMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/experiments/webhooks/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete webhook');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-webhooks'] });
      toast.success('Webhook channel deleted');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Test Webhook Dispatch
  const handleTestWebhook = async (webhook: WebhookChannel) => {
    setTestingWebhookId(webhook.id);
    try {
      const res = await fetch('/api/experiments/webhooks/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: webhook.type,
          config: webhook.config,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Test notification failed');
      }
      toast.success(`Test message sent to ${webhook.name}!`);
    } catch (err: any) {
      toast.error(err.message || 'Test dispatch failed');
    } finally {
      setTestingWebhookId(null);
    }
  };

  const handleSaveAiSettings = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const isAiEnabled = formData.get('isAiEnabled') === 'on';
    const aiProvider = formData.get('aiProvider') as string;
    const aiModelName = formData.get('aiModelName') as string;
    const aiBaseUrl = formData.get('aiBaseUrl') as string;
    const aiCustomPrompt = formData.get('aiCustomPrompt') as string;

    updateSettingsMutation.mutate({
      isAiEnabled,
      aiProvider,
      aiModelName,
      aiBaseUrl: aiBaseUrl || null,
      aiCustomPrompt: aiCustomPrompt || null,
      ...(apiKeyInput ? { aiApiKey: apiKeyInput } : {}),
    });
  };

  if (isLoadingAuth || (isAdmin && (isLoadingSettings || isLoadingWebhooks))) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-accent-600" />
      </div>
    );
  }

  if (authData && !isAdmin) {
    return <RestrictedSettingsNotice sectionName="experimental settings" />;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-3">
          <FlaskConical className="w-6 h-6 text-purple-600" />
          <h1 className="text-2xl font-bold text-gray-900">Experimental Features</h1>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Configure experimental AI email summarization models and API webhook notification integrations.
        </p>
      </div>

      {/* Card 1: AI Provider Settings */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Bot className="w-5 h-5 text-accent-600" />
            <div>
              <h2 className="text-base font-semibold text-gray-900">AI LLM Provider Configuration</h2>
              <p className="text-xs text-gray-500">Choose and set up your email summarization engine.</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSaveAiSettings} className="p-6 space-y-6">
          {/* AI Enable Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-900">Enable AI Features</label>
              <p className="text-xs text-gray-500">Turn on AI-powered email summarization by labels.</p>
            </div>
            <input
              type="checkbox"
              name="isAiEnabled"
              defaultChecked={settings?.isAiEnabled ?? true}
              className="h-4 w-4 text-accent-600 focus:ring-accent-500 border-gray-300 rounded cursor-pointer"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* AI Provider */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                LLM Provider
              </label>
              <select
                name="aiProvider"
                defaultValue={settings?.aiProvider || 'openai'}
                className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-accent-500 focus:ring-accent-500 p-2.5 border"
              >
                <option value="ollama">Local LLM — Ollama (Local Server)</option>
                <option value="lmstudio">Local LLM — LM Studio (Local Server)</option>
                <option value="local_llm">Local LLM — Other Self-Hosted Endpoint</option>
                <option value="openai">OpenAI (Official / Cloud)</option>
                <option value="claude">Anthropic Claude (Cloud)</option>
                <option value="custom">Custom Endpoint</option>
              </select>
            </div>

            {/* Model Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                Model Name
              </label>
              <input
                type="text"
                name="aiModelName"
                defaultValue={settings?.aiModelName || 'gpt-4o-mini'}
                placeholder="e.g. llama3, qwen2.5, deepseek-r1, gpt-4o-mini"
                className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-accent-500 focus:ring-accent-500 p-2.5 border"
              />
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
              API Key {settings?.hasApiKey && <span className="text-green-600 font-normal text-xs ml-2">(Key configured: {settings.aiApiKeyMasked})</span>}
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={settings?.hasApiKey ? 'Leave blank to keep existing API Key (Not required for Local LLMs)' : 'Enter API Key (sk-... or leave blank for Local LLM)'}
                className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-accent-500 focus:ring-accent-500 p-2.5 border pr-10"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Base URL & Presets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Local / Custom Base URL
              </label>
              <span className="text-xs text-purple-600">Local LLM Presets available below</span>
            </div>
            <input
              type="text"
              name="aiBaseUrl"
              defaultValue={settings?.aiBaseUrl || ''}
              placeholder="e.g. http://localhost:11434/v1 or http://localhost:1234/v1"
              className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-accent-500 focus:ring-accent-500 p-2.5 border"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              For Local LLMs, set Base URL to <code className="bg-gray-100 px-1 py-0.5 rounded text-purple-700">http://localhost:11434/v1</code> (Ollama) or <code className="bg-gray-100 px-1 py-0.5 rounded text-purple-700">http://localhost:1234/v1</code> (LM Studio).
            </p>
          </div>

          {/* Custom Prompt */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
              System Summary Prompt (Optional)
            </label>
            <textarea
              name="aiCustomPrompt"
              rows={3}
              defaultValue={settings?.aiCustomPrompt || ''}
              placeholder="Custom instructions for summarizing email batches..."
              className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-accent-500 focus:ring-accent-500 p-2.5 border"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={updateSettingsMutation.isPending}
              className="px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white rounded-md text-sm font-medium transition-colors flex items-center space-x-2 disabled:opacity-50"
            >
              {updateSettingsMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Save AI Settings</span>
            </button>
          </div>
        </form>
      </div>

      {/* Card 2: Notification Webhook Channels */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Bell className="w-5 h-5 text-purple-600" />
            <div>
              <h2 className="text-base font-semibold text-gray-900">Notification Webhook Channels</h2>
              <p className="text-xs text-gray-500">Configure Webhooks (Telegram, WeCom, Generic) to send AI summaries to.</p>
            </div>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-sm font-medium transition-colors flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Channel</span>
          </button>
        </div>

        <div className="p-6">
          {webhooks.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
              <Bell className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-600">No Webhook channels configured</p>
              <p className="text-xs text-gray-400 mt-1">Add Telegram Bot, WeCom Bot, or custom HTTP webhooks.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {webhooks.map((wh) => (
                <div
                  key={wh.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex items-center space-x-3">
                    <span
                      className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                        wh.type === 'TELEGRAM'
                          ? 'bg-blue-100 text-blue-700'
                          : wh.type === 'WECOM'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}
                    >
                      {wh.type}
                    </span>
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">{wh.name}</h4>
                      <p className="text-xs text-gray-500">
                        {wh.type === 'TELEGRAM' && `Chat ID: ${(wh.config as any)?.chatId || 'N/A'}`}
                        {wh.type === 'WECOM' && `URL: ${(wh.config as any)?.webhookUrl?.slice(0, 35)}...`}
                        {wh.type === 'GENERIC' && `URL: ${(wh.config as any)?.url?.slice(0, 35)}...`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleTestWebhook(wh)}
                      disabled={testingWebhookId === wh.id}
                      className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded text-xs font-medium transition-colors flex items-center space-x-1"
                    >
                      {testingWebhookId === wh.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5 text-gray-500" />
                      )}
                      <span>Test</span>
                    </button>
                    <button
                      onClick={() => deleteWebhookMutation.mutate(wh.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete Channel"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Card 3: Spam Filter & Continuous Learning */}
      <SpamSettingsTab />

      {/* Add Webhook Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Add Notification Channel</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Channel Name</label>
                <input
                  type="text"
                  value={newWebhook.name}
                  onChange={(e) => setNewWebhook({ ...newWebhook, name: e.target.value })}
                  placeholder="e.g. Ops Telegram Group"
                  className="w-full text-sm border-gray-300 rounded-md p-2 border"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Channel Type</label>
                <select
                  value={newWebhook.type}
                  onChange={(e) =>
                    setNewWebhook({ ...newWebhook, type: e.target.value as 'TELEGRAM' | 'WECOM' | 'GENERIC' })
                  }
                  className="w-full text-sm border-gray-300 rounded-md p-2 border"
                >
                  <option value="TELEGRAM">Telegram Bot</option>
                  <option value="WECOM">WeCom (Enterprise WeChat)</option>
                  <option value="GENERIC">Generic HTTP Webhook</option>
                </select>
              </div>

              {newWebhook.type === 'TELEGRAM' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Bot Token</label>
                    <input
                      type="text"
                      value={newWebhook.telegramBotToken}
                      onChange={(e) => setNewWebhook({ ...newWebhook, telegramBotToken: e.target.value })}
                      placeholder="123456789:ABCdef..."
                      className="w-full text-sm border-gray-300 rounded-md p-2 border"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Chat ID</label>
                    <input
                      type="text"
                      value={newWebhook.telegramChatId}
                      onChange={(e) => setNewWebhook({ ...newWebhook, telegramChatId: e.target.value })}
                      placeholder="-100123456789 or user chat_id"
                      className="w-full text-sm border-gray-300 rounded-md p-2 border"
                    />
                  </div>
                </>
              )}

              {newWebhook.type === 'WECOM' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">WeCom Webhook URL</label>
                  <input
                    type="text"
                    value={newWebhook.wecomWebhookUrl}
                    onChange={(e) => setNewWebhook({ ...newWebhook, wecomWebhookUrl: e.target.value })}
                    placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                    className="w-full text-sm border-gray-300 rounded-md p-2 border"
                  />
                </div>
              )}

              {newWebhook.type === 'GENERIC' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Webhook Target URL</label>
                    <input
                      type="text"
                      value={newWebhook.genericUrl}
                      onChange={(e) => setNewWebhook({ ...newWebhook, genericUrl: e.target.value })}
                      placeholder="https://your-api.com/webhooks/email-summary"
                      className="w-full text-sm border-gray-300 rounded-md p-2 border"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Secret Key (Optional)</label>
                    <input
                      type="text"
                      value={newWebhook.genericSecret}
                      onChange={(e) => setNewWebhook({ ...newWebhook, genericSecret: e.target.value })}
                      placeholder="Passed in X-Webhook-Secret header"
                      className="w-full text-sm border-gray-300 rounded-md p-2 border"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newWebhook.name || createWebhookMutation.isPending}
                onClick={() => createWebhookMutation.mutate()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 flex items-center space-x-2"
              >
                {createWebhookMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Save Channel</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
