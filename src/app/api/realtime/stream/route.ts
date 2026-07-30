import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth/middleware';
import Redis from 'ioredis';

// We must create a new Redis connection specifically for subscribing,
// since a Redis connection in subscriber mode cannot run regular commands.
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export async function GET(req: NextRequest) {
  try {
    // Authenticate the user to ensure they belong to an organization
    const auth = await authenticate(req);
    if (auth instanceof NextResponse) return auth;
    const { organizationId } = auth;

    // Create a readable stream
    const stream = new ReadableStream({
      start(controller) {
        // Create a new subscriber connection
        const subscriber = new Redis(REDIS_URL);
        
        // The channel specific to this user's organization
        const channel = `new_email:${organizationId}`;
        
        subscriber.subscribe(channel, (err) => {
          if (err) {
            console.error('Failed to subscribe to channel %s', channel, err);
            controller.error(err);
            return;
          }
        });

        // Listen for messages on the channel
        subscriber.on('message', (chan, message) => {
          if (chan === channel) {
            let eventName: string | null = null;
            try {
              const parsed = JSON.parse(message);
              if (parsed.event) {
                eventName = parsed.event;
              }
            } catch (e) {
              // Ignore parse errors
            }

            // SSE spec: event: and data: must be part of the same block
            // (separated by \n, terminated by \n\n) for named events to fire.
            if (eventName) {
              controller.enqueue(`event: ${eventName}\ndata: ${message}\n\n`);
            } else {
              controller.enqueue(`data: ${message}\n\n`);
            }
          }
        });

        // Keep connection alive with heartbeat comments
        const heartbeat = setInterval(() => {
          controller.enqueue(': heartbeat\n\n');
        }, 15000);

        // Clean up on client disconnect
        req.signal.addEventListener('abort', () => {
          clearInterval(heartbeat);
          subscriber.quit();
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return new Response('Unauthorized', { status: 401 });
    }
    console.error('SSE setup error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
