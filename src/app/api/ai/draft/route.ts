import { NextResponse } from 'next/server';
import { callLlmApi } from '@/lib/ai/llm-client';
import { extractCleanEmailText } from '@/lib/email/clean-text';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prompt, tone = 'Professional', length = 'Medium', action = 'generate', existingText, replyContext } = body;

    if (!prompt && !existingText) {
      return NextResponse.json({ error: 'Prompt or existing text is required' }, { status: 400 });
    }

    let systemInstruction = `You are an expert AI email assistant. Generate email draft content based on user requirements.
Tone: ${tone}. Target Length: ${length}.
Respond ONLY with the email subject line (if applicable) and body content. Do not include introductory conversational filler like "Here is your email:".`;

    let userPrompt = '';

    if (action === 'rewrite' || action === 'proofread' || action === 'expand' || action === 'shorten') {
      systemInstruction += `\nYour task is to ${action} the user's provided text while matching tone ${tone} and length ${length}.`;
      const cleanedExistingText = extractCleanEmailText(existingText, { maxLength: 4000 });
      userPrompt = `Text to modify:\n"""\n${cleanedExistingText}\n"""\nInstructions: ${prompt || action}`;
    } else {
      if (replyContext) {
        const cleanedReplyBody = extractCleanEmailText(replyContext.body, { maxLength: 4000 });
        userPrompt += `Replying to email subject: "${replyContext.subject || ''}"\nOriginal Email Snippet:\n"""\n${cleanedReplyBody}\n"""\n\n`;
      }
      userPrompt += `Draft an email with the following request:\n${prompt}`;
    }

    const resultText = await callLlmApi({
      systemInstruction,
      userPrompt,
    });

    return NextResponse.json({ result: resultText, status: 'success' });
  } catch (err: any) {
    console.error('AI Draft Route Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to generate AI draft' }, { status: 500 });
  }
}
