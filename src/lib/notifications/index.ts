import { sendTelegramNotification } from './telegram-adapter';
import { sendWeComNotification } from './wecom-adapter';
import { sendGenericWebhookNotification } from './generic-adapter';
import {
  WebhookDispatchOptions,
  WebhookDispatchResult,
  TelegramConfig,
  WeComConfig,
  GenericWebhookConfig,
} from './types';

export * from './types';
export { sendTelegramNotification, sendWeComNotification, sendGenericWebhookNotification };

export async function dispatchWebhookNotification(
  options: WebhookDispatchOptions
): Promise<WebhookDispatchResult> {
  const { type, config, labelName, summaryText, emailCount } = options;

  switch (type) {
    case 'TELEGRAM':
      return sendTelegramNotification(config as TelegramConfig, labelName, summaryText);
    case 'WECOM':
      return sendWeComNotification(config as WeComConfig, labelName, summaryText);
    case 'GENERIC':
      return sendGenericWebhookNotification(config as GenericWebhookConfig, labelName, summaryText, emailCount);
    default:
      return {
        success: false,
        type,
        error: `Unsupported webhook type: ${type}`,
        deliveredAt: new Date().toISOString(),
      };
  }
}
