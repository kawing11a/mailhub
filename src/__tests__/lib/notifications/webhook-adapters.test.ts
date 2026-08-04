import {
  sendTelegramNotification,
  sendWeComNotification,
  sendGenericWebhookNotification,
  dispatchWebhookNotification,
} from '../../../lib/notifications';

describe('Webhook Notification Adapters', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('sendTelegramNotification formats payload and dispatches successfully', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });

    const result = await sendTelegramNotification(
      { botToken: 'test-token', chatId: '123456' },
      'Invoices',
      'Summary of 5 invoices'
    );

    expect(result.success).toBe(true);
    expect(result.type).toBe('TELEGRAM');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/bottest-token/sendMessage',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  test('sendWeComNotification formats markdown payload and dispatches successfully', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const result = await sendWeComNotification(
      { webhookUrl: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=123' },
      'Support',
      'Summary of support tickets'
    );

    expect(result.success).toBe(true);
    expect(result.type).toBe('WECOM');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=123',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('### 📧 MailHub AI Summary: Support'),
      })
    );
  });

  test('sendGenericWebhookNotification posts standard JSON payload', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const result = await sendGenericWebhookNotification(
      { url: 'https://example.com/webhook', secret: 'my-secret' },
      'Urgent',
      'Summary text',
      3
    );

    expect(result.success).toBe(true);
    expect(result.type).toBe('GENERIC');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Webhook-Secret': 'my-secret',
        }),
      })
    );
  });

  test('dispatchWebhookNotification dispatches via generic interface', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
    });

    const result = await dispatchWebhookNotification({
      type: 'TELEGRAM',
      config: { botToken: 'token', chatId: '999' },
      labelName: 'Updates',
      summaryText: 'Some summary',
      emailCount: 2,
    });

    expect(result.success).toBe(true);
  });
});
