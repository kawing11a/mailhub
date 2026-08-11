import { NextResponse } from 'next/server';
import { callLlmApi } from '@/lib/ai/llm-client';
import { extractCleanEmailText } from '@/lib/email/clean-text';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tool, text, targetLanguage = 'English' } = body;

    if (!text || !tool) {
      return NextResponse.json({ error: 'Tool type and text are required' }, { status: 400 });
    }

    const cleanedText = extractCleanEmailText(text, { maxLength: 6000 });

    let systemInstruction = 'You are an AI Email Toolbox assistant.';
    let userPrompt = '';

    switch (tool) {
      case 'extract_tasks':
        systemInstruction += ' Extract clear, actionable tasks or action items from the email as bullet points.';
        userPrompt = `Extract action items from:\n"""\n${cleanedText}\n"""`;
        break;
      case 'tone_check':
        systemInstruction += ' Analyze the tone and sentiment of the email. Return a short summary of emotional tone, professionalism level, and any potential communication risks.';
        userPrompt = `Analyze tone of:\n"""\n${cleanedText}\n"""`;
        break;
      case 'translate':
        systemInstruction += ` Translate the provided email text accurately into ${targetLanguage}. Maintain original formatting and paragraphing.`;
        userPrompt = `Translate to ${targetLanguage}:\n"""\n${cleanedText}\n"""`;
        break;
      case 'spam_check':
        systemInstruction += ' Analyze the email text for spam, phishing, social engineering, suspicious links, or urgent fraud signals. Rate risk as Low, Medium, or High and list reasoning.';
        userPrompt = `Perform security analysis on:\n"""\n${cleanedText}\n"""`;
        break;
      default:
        return NextResponse.json({ error: `Unsupported tool: ${tool}` }, { status: 400 });
    }

    const result = await callLlmApi({
      systemInstruction,
      userPrompt,
    });

    return NextResponse.json({ tool, result, status: 'success' });
  } catch (err: any) {
    console.error('AI Toolbox Route Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to execute AI tool' }, { status: 500 });
  }
}
