import { NextRequest, NextResponse } from 'next/server';
import { meilisearch } from '@/lib/search/meilisearch';
import { authenticate } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    if (auth instanceof NextResponse) return auth;
    const { organizationId } = auth;
    
    const url = new URL(req.url);
    const query = url.searchParams.get('q') || '';
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // Filter by organizationId so you only see emails for your team
    const searchParams: any = {
      limit,
      offset,
      filter: [`organizationId = "${organizationId}"`],
    };

    // Parse additional filters
    const accountId = url.searchParams.get('accountId');
    if (accountId) searchParams.filter.push(`accountId = "${accountId}"`);
    
    const folder = url.searchParams.get('folder');
    if (folder) searchParams.filter.push(`folder = "${folder}"`);

    const results = await meilisearch.index('emails').search(query, searchParams);

    return NextResponse.json(results);
  } catch (error: any) {
    if (error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Failed to perform search' }, { status: 500 });
  }
}
