import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    if (auth instanceof NextResponse) return auth;
    const { organizationId } = auth;

    const webpush = require('web-push');
    
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:support@mailhub.local',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string
    );

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { organizationId },
    });

    if (subscriptions.length === 0) {
      return NextResponse.json({ error: 'No active push subscriptions found' }, { status: 404 });
    }

    const pushPayload = JSON.stringify({
      title: 'MailHub Test Notification',
      body: 'If you see this, background notifications are working correctly!',
      url: '/inbox',
    });

    const results = await Promise.allSettled(
      subscriptions.map((sub: any) => 
        webpush.sendNotification({
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          }
        }, pushPayload).catch(async (err: any) => {
          if (err.statusCode === 404 || err.statusCode === 410) {
            console.log('Push subscription expired or removed, deleting from DB');
            await prisma.pushSubscription.delete({ where: { id: sub.id } });
          } else {
            console.error('Push notification failed:', err);
          }
          throw err;
        })
      )
    );

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    
    return NextResponse.json({ 
      success: true, 
      message: `Sent to ${successCount} out of ${subscriptions.length} devices` 
    });
  } catch (error: any) {
    console.error('Failed to send test notification:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
