import { NextRequest, NextResponse } from 'next/server';
import { AiAccessError, AiUnavailableError, callLlmApi } from '@/lib/ai/llm-client';
import { classifySpam } from '@/lib/ai/spam-classifier';
import { extractCleanEmailText } from '@/lib/email/clean-text';
import { authenticate } from '@/lib/auth/middleware';
import { assertAccountContextAccess } from '@/lib/accounts/access';

export async function POST(req: Request) {
  const auth = await authenticate(req as NextRequest);
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json();
    const { accountId, emailId, tool, text, targetLanguage = 'English' } = body;

    if (!text || !tool) {
      return NextResponse.json({ error: 'Tool type and text are required' }, { status: 400 });
    }

    const account = await assertAccountContextAccess(auth, { accountId, emailId });
    if (account instanceof Response) return account;

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

    let result: string;
    try {
      result = await callLlmApi({
        organizationId: auth.organizationId,
        userId: auth.userId,
        systemInstruction,
        userPrompt,
      });
    } catch (err) {
      if (tool !== 'spam_check' || !(err instanceof AiUnavailableError)) throw err;
      const localResult = classifySpam('', cleanedText, '');
      return NextResponse.json({
        tool,
        result: `Spam risk decision: ${localResult.isSpam ? 'Spam' : 'Not spam'}\nScore: ${localResult.score.toFixed(2)}\nReason: ${localResult.reason}`,
        status: 'success',
      });
    }

    return NextResponse.json({ tool, result, status: 'success' });
  } catch (err: any) {
    if (err instanceof AiUnavailableError) {
      return NextResponse.json({ error: err.message, reason: err.reason }, { status: 503 });
    }
    if (err instanceof AiAccessError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('AI Toolbox Route Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to execute AI tool' }, { status: 500 });
  }
}
