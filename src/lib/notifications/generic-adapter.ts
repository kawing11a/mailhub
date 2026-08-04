import { GenericWebhookConfig, WebhookDispatchResult } from './types';

export async function sendGenericWebhookNotification(
  config: GenericWebhookConfig,
  labelName: string,
  summaryText: string,
  emailCount: number
): Promise<WebhookDispatchResult> {
  const deliveredAt = new Date().toISOString();

  if (!config.url) {
    return {
      success: false,
      type: 'GENERIC',
      error: 'Missing Generic Webhook URL',
      deliveredAt,
    };
  }

  const payload = {
    event: 'email.summary',
    label: labelName,
    emailCount,
    summary: summaryText,
    timestamp: deliveredAt,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(config.headers || {}),
  };

  if (config.secret) {
    headers['X-Webhook-Secret'] = config.secret;
  }

  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return {
        success: false,
        type: 'GENERIC',
        statusCode: res.status,
        error: `Generic Webhook error (${res.status}): ${errorText}`,
        deliveredAt,
      };
    }

    return {
      success: true,
      type: 'GENERIC',
      statusCode: res.status,
      deliveredAt,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      type: 'GENERIC',
      error: errorMsg,
      deliveredAt,
    };
  }
}
