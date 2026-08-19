import { NextRequest, NextResponse } from 'next/server';
import { meilisearch } from '@/lib/search/meilisearch';
import { authenticate } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';
import { accountAccessWhere } from '@/lib/accounts/access';

function filterEquals(field: string, value: string) {
  return `${field} = ${JSON.stringify(value)}`;
}

function emptySearchResult(query: string, limit: number, offset: number) {
  return {
    hits: [],
    estimatedTotalHits: 0,
    offset,
    limit,
    processingTimeMs: 0,
    query,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    if (auth instanceof Response) return auth;
    const { organizationId } = auth;

    const query = req.nextUrl.searchParams.get('q') || '';
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');
    const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0');
    const accountId = req.nextUrl.searchParams.get('accountId');
    const folder = req.nextUrl.searchParams.get('folder');

    const filter: Array<string | string[]> = [filterEquals('organizationId', organizationId)];

    if (auth.role !== 'admin') {
      const accessibleAccounts = await prisma.emailAccount.findMany({
        where: accountAccessWhere(auth, accountId || undefined),
        select: { id: true },
      });

      if (accountId && accessibleAccounts.length === 0) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      if (accessibleAccounts.length === 0) {
        return NextResponse.json(emptySearchResult(query, limit, offset));
      }

      const accessibleAccountFilters = accessibleAccounts.map(({ id }) =>
        filterEquals('accountId', id)
      );
      filter.push(
        accessibleAccountFilters.length === 1
          ? accessibleAccountFilters[0]
          : accessibleAccountFilters
      );
    } else if (accountId) {
      filter.push(filterEquals('accountId', accountId));
    }

    if (folder) {
      filter.push(filterEquals('folder', folder));
    }

    const searchParams: any = {
      limit,
      offset,
      filter,
      hybrid: {
        semanticRatio: 0.5,
        embedder: 'default',
      }
    };

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
