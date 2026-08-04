export type WebhookType = 'TELEGRAM' | 'WECOM' | 'GENERIC';

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface WeComConfig {
  webhookUrl: string;
}

export interface GenericWebhookConfig {
  url: string;
  headers?: Record<string, string>;
  secret?: string;
}

export interface WebhookDispatchOptions {
  type: WebhookType;
  config: TelegramConfig | WeComConfig | GenericWebhookConfig | unknown;
  labelName: string;
  summaryText: string;
  emailCount: number;
}

export interface WebhookDispatchResult {
  success: boolean;
  type: WebhookType;
  statusCode?: number;
  error?: string;
  deliveredAt: string;
}
