import { NextRequest } from 'next/server';
import {
  authenticate,
  requireAdmin,
  apiResponse,
  apiError,
} from '@/lib/auth/middleware';
import { dispatchWebhookNotification } from '@/lib/notifications';

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  try {
    const body = await req.json();
    const { type, config } = body;

    if (!type || !config) {
      return apiError('Type and config are required for test dispatch', 400);
    }

    const testSummaryText = `🎉 *MailHub Notification Webhook Test*\n\nThis is a test notification payload sent from MailHub Experimental Features. Your ${type} webhook integration is working successfully!`;

    const result = await dispatchWebhookNotification({
      type,
      config,
      labelName: 'Test Channel',
      summaryText: testSummaryText,
      emailCount: 1,
    });

    if (!result.success) {
      return apiError(result.error || 'Failed to dispatch test notification', 400);
    }

    return apiResponse({ message: 'Test message sent successfully!', result });
  } catch (err: any) {
    return apiError(err.message || 'Failed to send test webhook notification', 500);
  }
}
