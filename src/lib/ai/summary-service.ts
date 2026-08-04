export interface EmailForSummary {
  id: string;
  subject?: string | null;
  fromName?: string | null;
  fromAddress?: string | null;
  snippet?: string | null;
  receivedAt?: Date | string | null;
}

export interface AiSummarizeOptions {
  provider: 'openai' | 'claude' | 'ollama' | 'custom' | string;
  apiKey?: string | null;
  baseUrl?: string | null;
  modelName?: string | null;
  customPrompt?: string | null;
  labelName: string;
  emails: EmailForSummary[];
}

export async function generateEmailBatchSummary(
  options: AiSummarizeOptions
): Promise<string> {
  const {
    provider = 'openai',
    apiKey,
    baseUrl,
    modelName = 'gpt-4o-mini',
    customPrompt,
    labelName,
    emails,
  } = options;

  if (!emails || emails.length === 0) {
    return `No emails found under label **${labelName}** to summarize.`;
  }

  const formattedEmails = emails
    .map((e, idx) => {
      const from = e.fromName ? `${e.fromName} <${e.fromAddress || ''}>` : e.fromAddress || 'Unknown';
      const dateStr = e.receivedAt ? new Date(e.receivedAt).toLocaleString() : 'N/A';
      return `Email #${idx + 1}:
- Subject: ${e.subject || '(No Subject)'}
- From: ${from}
- Date: ${dateStr}
- Content Snippet: ${e.snippet || '(No Content)'}`;
    })
    .join('\n\n---\n\n');

  const systemInstruction = customPrompt || 
    `You are an executive email assistant. Summarize the provided batch of emails for the label "${labelName}". Provide a concise overview, key highlights, and action items in clean Markdown format with bullet points.`;

  const userPrompt = `Please summarize the following ${emails.length} email(s) under the label "${labelName}":\n\n${formattedEmails}`;

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
        max_tokens: 1000,
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
    return textContent || 'No summary response text generated from Claude.';
  }

  // Default: OpenAI, Ollama, or Custom OpenAI-compatible chat endpoint
  const targetBaseUrl = (baseUrl || (provider === 'ollama' ? 'http://localhost:11434/v1' : 'https://api.openai.com/v1')).replace(/\/$/, '');
  const endpoint = `${targetBaseUrl}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelName || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM API request failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const choiceText = data.choices?.[0]?.message?.content;
  return choiceText || 'No summary response text generated.';
}
