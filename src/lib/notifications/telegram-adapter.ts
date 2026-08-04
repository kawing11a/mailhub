import { TelegramConfig, WebhookDispatchResult } from './types';

export async function sendTelegramNotification(
  config: TelegramConfig,
  labelName: string,
  summaryText: string
): Promise<WebhookDispatchResult> {
  const deliveredAt = new Date().toISOString();
  
  if (!config.botToken || !config.chatId) {
    return {
      success: false,
      type: 'TELEGRAM',
      error: 'Missing Telegram botToken or chatId',
      deliveredAt,
    };
  }

  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
  const message = `📧 *MailHub AI Summary: ${labelName}*\n\n${summaryText}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return {
        success: false,
        type: 'TELEGRAM',
        statusCode: res.status,
        error: `Telegram API error (${res.status}): ${errorText}`,
        deliveredAt,
      };
    }

    return {
      success: true,
      type: 'TELEGRAM',
      statusCode: res.status,
      deliveredAt,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      type: 'TELEGRAM',
      error: errorMsg,
      deliveredAt,
    };
  }
}
