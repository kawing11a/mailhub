import { NextResponse } from 'next/server';
import { getSpamModelStats, resetSpamModelToDefault } from '@/lib/ai/spam-classifier';

/**
 * GET: Retrieve current spam learning statistics and top keywords
 */
export async function GET() {
  try {
    const stats = getSpamModelStats();
    return NextResponse.json({ success: true, stats });
  } catch (err: any) {
    console.error('Spam Stats Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch spam stats' }, { status: 500 });
  }
}

/**
 * POST: Reset model state to default seeds
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.action === 'reset') {
      resetSpamModelToDefault();
      return NextResponse.json({
        success: true,
        message: 'Spam model reset to default initial seeds',
        stats: getSpamModelStats(),
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    console.error('Spam Reset Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to reset spam stats' }, { status: 500 });
  }
}
