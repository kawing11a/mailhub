import { callLlmApi } from './llm-client';
import { classifySpam } from './spam-classifier';

export async function checkIsHighRisk(
  subject: string,
  snippet: string,
  fromAddress: string,
  organizationId: string
): Promise<{ isHighRisk: boolean; reason?: string; score?: number }> {
  const localResult = classifySpam(subject, snippet, fromAddress);
  const localDecision = {
    isHighRisk: localResult.isSpam,
    reason: localResult.reason,
    score: localResult.score,
  };

  // Confident local results need no provider request.
  if (localResult.score >= 0.70 || localResult.score <= 0.30) {
    return localDecision;
  }

  try {
    const content = await callLlmApi({
      organizationId,
      systemInstruction: `You are an AI spam and phishing detector.
Analyze the email metadata and determine if it represents a high risk of being spam or phishing.
Respond in strictly valid JSON format with no markdown formatting or extra text.
{
  "isHighRisk": true | false,
  "reason": "Brief explanation of why it is or is not high risk"
}`,
      userPrompt: `From: ${fromAddress}\nSubject: ${subject || 'No Subject'}\nSnippet: ${snippet || 'No Snippet'}`,
      responseFormatJson: true,
    });

    const result: unknown = JSON.parse(content);
    if (!result || typeof result !== 'object' || typeof (result as { isHighRisk?: unknown }).isHighRisk !== 'boolean') {
      return localDecision;
    }

    const classification = result as { isHighRisk: boolean; reason?: unknown };
    return {
      isHighRisk: classification.isHighRisk,
      reason: typeof classification.reason === 'string' && classification.reason.trim()
        ? classification.reason
        : localResult.reason,
      score: localResult.score,
    };
  } catch (error) {
    console.warn('AI spam check unavailable; using local classification:', error);
    return localDecision;
  }
}
