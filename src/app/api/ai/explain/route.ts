import { NextResponse } from 'next/server';
import { callLlmApi } from '@/lib/ai/llm-client';
import { extractCleanEmailText } from '@/lib/email/clean-text';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { subject, bodyText } = body;

    if (!bodyText && !subject) {
      return NextResponse.json({ error: 'Email content is required for explanation' }, { status: 400 });
    }

    const cleanedBody = extractCleanEmailText(bodyText, { maxLength: 6000 });

    const systemInstruction = `You are an AI Email Assistant. Analyze the provided email and provide a structured JSON explanation.
Your output MUST be a valid JSON object with the following fields:
{
  "summary": "Plain English summary (2-3 sentences explaining what this email is actually about in simple terms)",
  "takeaways": ["Key point 1", "Key point 2"],
  "actionItems": ["Action required 1 (or 'None' if purely informational)"],
  "sentiment": "Urgent | Action Required | Informational | Friendly | Formal",
  "jargon": [{ "term": "Technical/Legal/Abbreviation term", "definition": "Clear plain language definition" }]
}`;

    const userPrompt = `Subject: ${subject || '(No Subject)'}\n\nEmail Body:\n"""\n${cleanedBody}\n"""`;

    const rawResult = await callLlmApi({
      systemInstruction,
      userPrompt,
      responseFormatJson: true,
    });

    let explanation;
    try {
      explanation = JSON.parse(rawResult);
    } catch {
      explanation = {
        summary: rawResult,
        takeaways: [],
        actionItems: [],
        sentiment: 'Informational',
        jargon: [],
      };
    }

    return NextResponse.json({ explanation, status: 'success' });
  } catch (err: any) {
    console.error('AI Explain Route Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to explain email' }, { status: 500 });
  }
}
