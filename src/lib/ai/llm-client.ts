import { prisma } from '@/lib/db/prisma';

export interface LlmCallArgs {
  provider?: string;
  apiKey?: string | null;
  baseUrl?: string | null;
  modelName?: string | null;
  systemInstruction: string;
  userPrompt: string;
  responseFormatJson?: boolean;
}

export async function getResolvedAiConfig() {
  try {
    const setting = await prisma.experimentSetting.findFirst();
    if (setting && setting.isAiEnabled) {
      return {
        provider: setting.aiProvider || 'openai',
        apiKey: setting.aiApiKey || process.env.AI_API_KEY || process.env.OPENAI_API_KEY || null,
        baseUrl: setting.aiBaseUrl || (setting.aiProvider === 'ollama' || setting.aiProvider === 'local_llm' ? 'http://localhost:11434/v1' : null),
        modelName: setting.aiModelName || 'gpt-4o-mini',
      };
    }
  } catch (err) {
    console.warn('Failed to fetch ExperimentSetting from DB, falling back to process.env', err);
  }

  return {
    provider: process.env.AI_PROVIDER || 'openai',
    apiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || null,
    baseUrl: process.env.AI_BASE_URL || (process.env.AI_PROVIDER === 'ollama' || process.env.AI_PROVIDER === 'local_llm' ? 'http://localhost:11434/v1' : null),
    modelName: process.env.AI_MODEL_NAME || 'gpt-4o-mini',
  };
}

export async function callLlmApi(args: LlmCallArgs): Promise<string> {
  const resolved = await getResolvedAiConfig();
  const provider = args.provider || resolved.provider;
  const apiKey = args.apiKey !== undefined ? args.apiKey : resolved.apiKey;
  const baseUrl = args.baseUrl !== undefined ? args.baseUrl : resolved.baseUrl;
  const modelName = args.modelName || resolved.modelName;
  const { systemInstruction, userPrompt, responseFormatJson } = args;

  if (provider === 'claude') {
    const endpoint = (baseUrl || 'https://api.anthropic.com/v1').replace(/\/$/, '') + '/messages';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    };
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelName || 'claude-3-5-sonnet-20241022',
        max_tokens: 1500,
        system: systemInstruction,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Claude API request failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const textContent = data.content?.find((c: { type: string; text?: string }) => c.type === 'text')?.text;
    return textContent || '';
  }

  // Default: OpenAI, Ollama, Local LLM, or Custom OpenAI-compatible endpoint
  const defaultBaseUrl = (provider === 'ollama' || provider === 'local_llm')
    ? 'http://localhost:11434/v1'
    : 'https://api.openai.com/v1';
  const targetBaseUrl = (baseUrl || defaultBaseUrl).replace(/\/$/, '');
  const endpoint = `${targetBaseUrl}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const payload: Record<string, any> = {
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

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM API request failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const choiceText = data.choices?.[0]?.message?.content;
  return choiceText || '';
}
