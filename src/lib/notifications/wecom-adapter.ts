import { WeComConfig, WebhookDispatchResult } from './types';

export async function sendWeComNotification(
  config: WeComConfig,
  labelName: string,
  summaryText: string
): Promise<WebhookDispatchResult> {
  const deliveredAt = new Date().toISOString();
  
  if (!config.webhookUrl) {
    return {
      success: false,
      type: 'WECOM',
      error: 'Missing WeCom webhookUrl',
      deliveredAt,
    };
  }

  const markdownContent = `### 📧 MailHub AI Summary: ${labelName}\n\n${summaryText}`;

  try {
    const res = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: {
          content: markdownContent,
        },
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return {
        success: false,
        type: 'WECOM',
        statusCode: res.status,
        error: `WeCom Webhook error (${res.status}): ${errorText}`,
        deliveredAt,
      };
    }

    return {
      success: true,
      type: 'WECOM',
      statusCode: res.status,
      deliveredAt,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      type: 'WECOM',
      error: errorMsg,
      deliveredAt,
    };
  }
}
