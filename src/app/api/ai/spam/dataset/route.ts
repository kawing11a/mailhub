import { NextResponse } from 'next/server';
import { exportGenericSpamDataset, importGenericSpamDataset } from '@/lib/ai/spam-classifier';

/**
 * GET: Export full generic portable JSON dataset
 */
export async function GET() {
  try {
    const dataset = exportGenericSpamDataset();
    return NextResponse.json({ success: true, dataset });
  } catch (err: any) {
    console.error('Export Spam Dataset Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to export spam dataset' }, { status: 500 });
  }
}

/**
 * POST: Import generic portable JSON dataset from another environment
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { dataset, mode = 'replace' } = body;

    if (!dataset || typeof dataset !== 'object') {
      return NextResponse.json({ error: 'Valid generic JSON dataset is required' }, { status: 400 });
    }

    const result = importGenericSpamDataset(dataset, mode);
    return NextResponse.json({
      success: true,
      message: `Successfully imported dataset (${mode === 'replace' ? 'replaced' : 'merged'} model state)`,
      stats: result.stats,
    });
  } catch (err: any) {
    console.error('Import Spam Dataset Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to import spam dataset' }, { status: 500 });
  }
}
