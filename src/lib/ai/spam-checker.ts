import { classifySpam } from './spam-classifier';

export async function checkIsHighRisk(
  subject: string,
  snippet: string,
  fromAddress: string
): Promise<{ isHighRisk: boolean; reason?: string; score?: number }> {
  try {
    // 1. Fast local evaluation with learned statistical model
    const localResult = classifySpam(subject, snippet, fromAddress);

    // High confidence spam (> 0.70)
    if (localResult.score >= 0.70) {
      return {
        isHighRisk: true,
        reason: localResult.reason,
        score: localResult.score,
      };
    }

    // High confidence safe (< 0.30)
    if (localResult.score <= 0.30) {
      return {
        isHighRisk: false,
        reason: localResult.reason,
        score: localResult.score,
      };
    }

    // 2. Ambiguous / borderline cases (0.30 to 0.70): optionally consult external LLM if available
    const aiUrl = process.env.AI_API_URL;
    if (!aiUrl) {
      // If no external LLM configured, rely on local classifier decision
      return {
        isHighRisk: localResult.isSpam,
        reason: localResult.reason,
        score: localResult.score,
      };
    }

    const aiModel = process.env.AI_MODEL || 'llama3.2';

    const response = await fetch(aiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        model: aiModel,
        messages: [
          {
            role: 'system',
            content: `You are an AI spam and phishing detector.
Analyze the email metadata and determine if it represents a high risk of being spam or phishing.
Respond in strictly valid JSON format with no markdown formatting or extra text.
{
  "isHighRisk": true | false,
  "reason": "Brief explanation of why it is or is not high risk"
}`,
          },
          {
            role: 'user',
            content: `From: ${fromAddress}\nSubject: ${subject || 'No Subject'}\nSnippet: ${snippet || 'No Snippet'}`,
          },
        ],
        response_format: { type: 'json_object' },
        stream: false,
      }),
    });

    if (!response.ok) {
      return { isHighRisk: localResult.isSpam, reason: localResult.reason, score: localResult.score };
    }

    const data = await response.json();
    try {
      const content = data.choices[0].message.content;
      const result = JSON.parse(content);
      return {
        isHighRisk: !!result.isHighRisk,
        reason: result.reason || localResult.reason,
        score: localResult.score,
      };
    } catch {
      return { isHighRisk: localResult.isSpam, reason: localResult.reason, score: localResult.score };
    }
  } catch (error) {
    console.error('Spam check evaluation error:', error);
    return { isHighRisk: false };
  }
}
