export interface EmailForSummary {
  id: string;
  subject?: string | null;
  fromName?: string | null;
  fromAddress?: string | null;
  snippet?: string | null;
  bodyText?: string | null;
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
  chunkSize?: number; // Max emails per LLM prompt before Map-Reduce, default 15
}

/**
 * Sanitizes and truncates email body text for LLM consumption.
 */
export function cleanTextBody(text?: string | null, maxLen = 2000): string {
  if (!text) return '';
  const sanitized = text
    .replace(/<script\b[^<]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^<]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitized.length > maxLen ? sanitized.slice(0, maxLen) + '...' : sanitized;
}

interface LlmCallArgs {
  provider: string;
  apiKey?: string | null;
  baseUrl?: string | null;
  modelName?: string | null;
  systemInstruction: string;
  userPrompt: string;
}

async function callLlmApi(args: LlmCallArgs): Promise<string> {
  const { provider, apiKey, baseUrl, modelName, systemInstruction, userPrompt } = args;

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

  // Default: OpenAI, Ollama, or Custom OpenAI-compatible endpoint
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

function formatEmailsForPrompt(emails: EmailForSummary[]): string {
  return emails
    .map((e, idx) => {
      const from = e.fromName ? `${e.fromName} <${e.fromAddress || ''}>` : e.fromAddress || 'Unknown';
      const dateStr = e.receivedAt ? new Date(e.receivedAt).toLocaleString() : 'N/A';
      const bodyContent = e.bodyText ? cleanTextBody(e.bodyText) : e.snippet || '(No Content)';
      return `Email #${idx + 1}:
- Subject: ${e.subject || '(No Subject)'}
- From: ${from}
- Date: ${dateStr}
- Content: ${bodyContent}`;
    })
    .join('\n\n---\n\n');
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
    chunkSize = 15,
  } = options;

  if (!emails || emails.length === 0) {
    return `No emails found under label **${labelName}** to summarize.`;
  }

  const systemInstruction = customPrompt || 
    `You are an executive email assistant. Summarize the provided batch of emails for the label "${labelName}". Provide a concise overview, key highlights, and action items in clean Markdown format with bullet points.`;

  // If batch size exceeds chunkSize, execute Map-Reduce
  if (emails.length > chunkSize) {
    const chunks: EmailForSummary[][] = [];
    for (let i = 0; i < emails.length; i += chunkSize) {
      chunks.push(emails.slice(i, i + chunkSize));
    }

    // Map Phase: Generate chunk summaries
    const chunkSummaries: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const formattedChunk = formatEmailsForPrompt(chunk);
      const chunkUserPrompt = `Please generate a concise bullet-point summary for batch #${i + 1} (${chunk.length} emails) under label "${labelName}":\n\n${formattedChunk}`;
      
      const chunkSummary = await callLlmApi({
        provider,
        apiKey,
        baseUrl,
        modelName,
        systemInstruction,
        userPrompt: chunkUserPrompt,
      });
      chunkSummaries.push(`### Batch #${i + 1} Summary:\n${chunkSummary}`);
    }

    // Reduce Phase: Synthesize chunk summaries into final executive summary
    const combinedChunkSummaries = chunkSummaries.join('\n\n');
    const reduceUserPrompt = `Below are ${chunkSummaries.length} batch summaries for a total of ${emails.length} emails under label "${labelName}". Synthesize them into a single cohesive executive summary with key highlights and action items in clean Markdown format:\n\n${combinedChunkSummaries}`;

    return await callLlmApi({
      provider,
      apiKey,
      baseUrl,
      modelName,
      systemInstruction,
      userPrompt: reduceUserPrompt,
    });
  }

  // Single-Pass Summarization for small email batches
  const formattedEmails = formatEmailsForPrompt(emails);
  const userPrompt = `Please summarize the following ${emails.length} email(s) under the label "${labelName}":\n\n${formattedEmails}`;

  return await callLlmApi({
    provider,
    apiKey,
    baseUrl,
    modelName,
    systemInstruction,
    userPrompt,
  });
}
