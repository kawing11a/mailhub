import { refreshTokenClient, setupGlobalFetchInterceptor, resetFetchInterceptor } from '@/lib/api-client';

describe('Frontend API Client & Token Refresh Interceptor', () => {
  beforeEach(() => {
    resetFetchInterceptor();
    delete (global as any).window;
    const mockFetch = jest.fn();
    (global as any).window = {
      location: { href: '', pathname: '/inbox', search: '' },
      fetch: mockFetch,
    };
    global.fetch = mockFetch;
  });

  afterEach(() => {
    resetFetchInterceptor();
    jest.resetAllMocks();
  });

  test('refreshTokenClient calls /api/auth/refresh and returns true when status is 200', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    const result = await refreshTokenClient();
    expect(result).toBe(true);
  });

  test('refreshTokenClient returns false when /api/auth/refresh returns 401', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Expired' }),
    });

    const result = await refreshTokenClient();
    expect(result).toBe(false);
  });

  test('setupGlobalFetchInterceptor intercepts 401, refreshes token, and retries request', async () => {
    let callCount = 0;
    const fetchMock = jest.fn((input: any) => {
      const url = typeof input === 'string' ? input : input?.url || String(input);
      if (url.includes('/api/auth/refresh')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true }) });
      }
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: false, status: 401 });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: 'success' }) });
    });

    window.fetch = fetchMock as any;
    global.fetch = fetchMock as any;
    setupGlobalFetchInterceptor();

    const response = await window.fetch('/api/emails');
    expect(response.status).toBe(200);
  });
});
