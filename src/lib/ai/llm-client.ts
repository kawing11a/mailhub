import { prisma } from '@/lib/db/prisma';
import { getSystemPreferences } from '@/lib/settings/system-preferences';

export type AiUnavailableReason = 'disabled' | 'provider_unavailable';

export class AiUnavailableError extends Error {
  constructor(public readonly reason: AiUnavailableReason) {
    super(reason === 'disabled' ? 'AI is disabled for this organization or member' : 'AI provider is unavailable');
    this.name = 'AiUnavailableError';
  }
}

export class AiAccessError extends Error {
  constructor() {
    super('Organization membership not found');
    this.name = 'AiAccessError';
  }
}

export interface LlmCallArgs {
  organizationId: string;
  userId?: string;
  provider?: string;
  apiKey?: string | null;
  baseUrl?: string | null;
  modelName?: string | null;
  systemInstruction: string;
  userPrompt: string;
  responseFormatJson?: boolean;
}

const PROVIDER_TIMEOUT_MS = 20_000;

export async function getResolvedAiConfig(organizationId: string, userId?: string) {
  const [systemPreferences, setting, member] = await Promise.all([
    getSystemPreferences(),
    prisma.experimentSetting.findUnique({ where: { organizationId } }),
    userId
      ? prisma.organizationMember.findUnique({
          where: { organizationId_userId: { organizationId, userId } },
          select: { personalAiEnabled: true },
        })
      : Promise.resolve(undefined),
  ]);

  if (!systemPreferences.isAiEnabled) throw new AiUnavailableError('disabled');
  if (userId && !member) throw new AiAccessError();
  if (setting?.isAiEnabled === false || member?.personalAiEnabled === false) {
    throw new AiUnavailableError('disabled');
  }

  if (setting) {
    return {
      provider: setting.aiProvider || 'openai',
      apiKey: setting.aiApiKey || process.env.AI_API_KEY || process.env.OPENAI_API_KEY || null,
      baseUrl: setting.aiBaseUrl || (setting.aiProvider === 'ollama' || setting.aiProvider === 'local_llm' ? 'http://localhost:11434/v1' : null),
      modelName: setting.aiModelName || 'gpt-4o-mini',
    };
  }

  const provider = process.env.AI_PROVIDER || 'openai';
  return {
    provider,
    apiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || null,
    baseUrl: process.env.AI_BASE_URL || (provider === 'ollama' || provider === 'local_llm' ? 'http://localhost:11434/v1' : null),
    modelName: process.env.AI_MODEL_NAME || 'gpt-4o-mini',
  };
}

export async function callLlmApi(args: LlmCallArgs): Promise<string> {
  const resolved = await getResolvedAiConfig(args.organizationId, args.userId);
  const provider = args.provider || resolved.provider;
  const apiKey = args.apiKey || resolved.apiKey;
  const baseUrl = args.baseUrl !== undefined ? args.baseUrl : resolved.baseUrl;
  const modelName = args.modelName || resolved.modelName;
  const { systemInstruction, userPrompt, responseFormatJson } = args;

  let endpoint: string;
  let headers: Record<string, string>;
  let payload: Record<string, unknown>;

  if (provider === 'claude') {
    endpoint = (baseUrl || 'https://api.anthropic.com/v1').replace(/\/$/, '') + '/messages';
    headers = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    };
    if (apiKey) headers['x-api-key'] = apiKey;
    payload = {
      model: modelName || 'claude-3-5-sonnet-20241022',
      max_tokens: 1500,
      system: systemInstruction,
      messages: [{ role: 'user', content: userPrompt }],
    };
  } else {
    const defaultBaseUrl = (provider === 'ollama' || provider === 'local_llm')
      ? 'http://localhost:11434/v1'
      : 'https://api.openai.com/v1';
    endpoint = `${(baseUrl || defaultBaseUrl).replace(/\/$/, '')}/chat/completions`;
    headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    payload = {
      model: modelName || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
    };
    if (responseFormatJson && provider !== 'ollama' && provider !== 'local_llm') {
      payload.response_format = { type: 'json_object' };
    }
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) throw new AiUnavailableError('provider_unavailable');

    const data = await res.json();
    const content = provider === 'claude'
      ? data.content?.find((item: { type: string; text?: string }) => item.type === 'text')?.text
      : data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new AiUnavailableError('provider_unavailable');
    }
    return content;
  } catch (error) {
    if (error instanceof AiUnavailableError) throw error;
    throw new AiUnavailableError('provider_unavailable');
  }
}
