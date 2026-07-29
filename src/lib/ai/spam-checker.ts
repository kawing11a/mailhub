export async function checkIsHighRisk(
  subject: string,
  snippet: string,
  fromAddress: string
): Promise<{ isHighRisk: boolean; reason?: string }> {
  try {
    // OpenAI-compatible endpoint (compatible with oMLX, LM Studio, Ollama, vLLM, etc.)
    const aiUrl = process.env.AI_API_URL || 'http://localhost:11434/v1/chat/completions';
    const aiModel = process.env.AI_MODEL || 'llama3.2'; // Change to your oMLX model

    const response = await fetch(aiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Timeout is important so we don't stall the sync pipeline forever
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
}`
          },
          {
            role: 'user',
            content: `From: ${fromAddress}\nSubject: ${subject || 'No Subject'}\nSnippet: ${snippet || 'No Snippet'}`
          }
        ],
        response_format: { type: 'json_object' },
        stream: false,
      }),
    });

    if (!response.ok) {
      console.warn('AI API returned an error:', response.statusText);
      return { isHighRisk: false }; // Fail-safe: assume not high risk if LLM is down
    }

    const data = await response.json();
    
    try {
      const content = data.choices[0].message.content;
      const result = JSON.parse(content);
      return {
        isHighRisk: !!result.isHighRisk,
        reason: result.reason,
      };
    } catch (parseError) {
      console.error('Failed to parse JSON from AI:', data);
      return { isHighRisk: false };
    }
    
  } catch (error) {
    console.error('Failed to check email for spam via local LLM:', error);
    return { isHighRisk: false }; // Fail-safe
  }
}
