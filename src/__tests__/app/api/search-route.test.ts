jest.mock('@/lib/auth/middleware', () => ({
  authenticate: jest.fn(),
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailAccount: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/search/meilisearch', () => ({
  meilisearch: {
    index: jest.fn(),
  },
}));

import type { NextRequest } from 'next/server';
import { GET } from '@/app/api/emails/search/route';
import { authenticate } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';
import { meilisearch } from '@/lib/search/meilisearch';

const mockAuthenticate = authenticate as jest.Mock;
const mockFindAccounts = prisma.emailAccount.findMany as jest.Mock;
const mockIndex = meilisearch.index as jest.Mock;

function createSearchRequest(url: string): NextRequest {
  return {
    url,
    nextUrl: new URL(url),
  } as NextRequest;
}

describe('GET /api/emails/search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns an empty result for a member with zero accessible accounts without querying Meilisearch', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });
    mockFindAccounts.mockResolvedValue([]);

    const response = await GET(createSearchRequest('http://localhost/api/emails/search?q=hello'));

    expect(response.status).toBe(200);
    expect(mockIndex).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({
      hits: [],
      estimatedTotalHits: 0,
      offset: 0,
      limit: 50,
      processingTimeMs: 0,
      query: 'hello',
    });
  });

  it('rejects an inaccessible explicit accountId for a member before querying Meilisearch', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });
    mockFindAccounts.mockResolvedValue([]);

    const response = await GET(
      createSearchRequest(
        'http://localhost/api/emails/search?q=hello&accountId=11111111-1111-4111-8111-111111111111'
      )
    );

    expect(response.status).toBe(403);
    expect(mockIndex).not.toHaveBeenCalled();
  });

  it('limits member search to accessible accounts and safely escapes filter values', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });
    mockFindAccounts.mockResolvedValue([
      { id: 'account-1' },
      { id: 'account-2' },
    ]);

    const mockSearch = jest.fn().mockResolvedValue({
      hits: [{ id: 'email-1' }],
      estimatedTotalHits: 1,
      offset: 5,
      limit: 10,
      processingTimeMs: 3,
      query: 'invoice',
    });
    mockIndex.mockReturnValue({ search: mockSearch });

    const unsafeFolder = encodeURIComponent('INBOX" OR accountId = "forbidden');
    const response = await GET(
      createSearchRequest(
        `http://localhost/api/emails/search?q=invoice&limit=10&offset=5&folder=${unsafeFolder}`
      )
    );

    expect(response.status).toBe(200);
    expect(mockFindAccounts).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        OR: [
          { ownerUserId: 'member-1' },
          { memberAccess: { some: { userId: 'member-1' } } },
        ],
      },
      select: { id: true },
    });
    expect(mockIndex).toHaveBeenCalledWith('emails');
    expect(mockSearch).toHaveBeenCalledWith('invoice', {
      limit: 10,
      offset: 5,
      filter: [
        'organizationId = "org-1"',
        ['accountId = "account-1"', 'accountId = "account-2"'],
        'folder = "INBOX\\" OR accountId = \\"forbidden"',
      ],
      hybrid: {
        semanticRatio: 0.5,
        embedder: 'default',
      },
    });
  });

  it('keeps admin search organization-wide and preserves explicit account and folder filters', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'admin-1',
      organizationId: 'org-1',
      role: 'admin',
    });

    const mockSearch = jest.fn().mockResolvedValue({
      hits: [],
      estimatedTotalHits: 0,
      offset: 0,
      limit: 50,
      processingTimeMs: 1,
      query: 'hello',
    });
    mockIndex.mockReturnValue({ search: mockSearch });

    const response = await GET(
      createSearchRequest(
        'http://localhost/api/emails/search?q=hello&accountId=account-9&folder=SENT'
      )
    );

    expect(response.status).toBe(200);
    expect(mockFindAccounts).not.toHaveBeenCalled();
    expect(mockSearch).toHaveBeenCalledWith('hello', {
      limit: 50,
      offset: 0,
      filter: [
        'organizationId = "org-1"',
        'accountId = "account-9"',
        'folder = "SENT"',
      ],
      hybrid: {
        semanticRatio: 0.5,
        embedder: 'default',
      },
    });
  });
});
