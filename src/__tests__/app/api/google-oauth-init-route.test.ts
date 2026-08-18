jest.mock('@/lib/auth/middleware', () => ({
  authenticate: jest.fn(),
}));

import type { NextRequest } from 'next/server';
import { GET } from '@/app/api/accounts/oauth/google/init/route';
import { authenticate } from '@/lib/auth/middleware';

const mockAuthenticate = authenticate as jest.Mock;

describe('GET /api/accounts/oauth/google/init', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = 'google-client-id';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost';
  });

  it('normalizes mixed-case mailbox state and login hints before redirecting to Google', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });

    const request = {
      url: 'http://localhost/api/accounts/oauth/google/init?emailAddress=Owner%40Example.com&label=Owner%20Inbox',
    } as NextRequest;

    const response = await GET(request);
    const redirectUrl = new URL(response.headers.get('location') ?? '');
    const state = JSON.parse(
      Buffer.from(redirectUrl.searchParams.get('state') ?? '', 'base64').toString('utf8')
    ) as { emailAddress: string; label: string; organizationId: string };

    expect(redirectUrl.origin + redirectUrl.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth'
    );
    expect(redirectUrl.searchParams.get('login_hint')).toBe('owner@example.com');
    expect(state).toEqual({
      emailAddress: 'owner@example.com',
      label: 'Owner Inbox',
      organizationId: 'org-1',
    });
  });
});
