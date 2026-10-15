import { callLlmApi } from '@/lib/ai/llm-client';

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
  organizationId: string;
  provider?: 'openai' | 'claude' | 'ollama' | 'custom' | string;
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

export function generateFallbackEmailBatchDigest({
  labelName,
  emails,
}: Pick<AiSummarizeOptions, 'labelName' | 'emails'>): string {
  const heading = `## Basic summary (AI unavailable)\n\nLabel: ${cleanTextBody(labelName) || 'Selected Label'}`;
  if (emails.length === 0) {
    return `${heading}\n\nNo emails found under this label.`;
  }

  const entries = emails.map((email, index) => {
    const subject = cleanTextBody(email.subject) || '(No Subject)';
    const senderName = cleanTextBody(email.fromName);
    const senderAddress = cleanTextBody(email.fromAddress);
    const sender = senderName && senderAddress
      ? `${senderName} <${senderAddress}>`
      : senderName || senderAddress || 'Unknown';
    const timestamp = email.receivedAt ? new Date(email.receivedAt) : null;
    const date = timestamp && !Number.isNaN(timestamp.getTime())
      ? timestamp.toISOString()
      : 'Unknown';
    const snippet = cleanTextBody(email.snippet, 500) || '(No snippet)';

    return `### ${index + 1}. ${subject}\n- From: ${sender}\n- Date: ${date}\n- Snippet: ${snippet}`;
  });

  return `${heading}\n\n${entries.join('\n\n')}`;
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
    organizationId,
    provider,
    apiKey,
    baseUrl,
    modelName,
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
        organizationId,
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
      organizationId,
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
    organizationId,
    provider,
    apiKey,
    baseUrl,
    modelName,
    systemInstruction,
    userPrompt,
  });
}
