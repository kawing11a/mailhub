let isRefreshing = false;
let isIntercepted = false;
let refreshSubscribers: ((success: boolean) => void)[] = [];

function subscribeTokenRefresh(cb: (success: boolean) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(success: boolean) {
  refreshSubscribers.forEach((cb) => cb(success));
  refreshSubscribers = [];
}

export async function refreshTokenClient(): Promise<boolean> {
  if (isRefreshing) {
    return new Promise((resolve) => {
      subscribeTokenRefresh((success) => resolve(success));
    });
  }

  isRefreshing = true;

  try {
    const fetchFn = typeof window !== 'undefined' ? window.fetch : fetch;
    const res = await fetchFn('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const success = res.ok;
    onRefreshed(success);
    return success;
  } catch (err) {
    onRefreshed(false);
    return false;
  } finally {
    isRefreshing = false;
  }
}

export function setupGlobalFetchInterceptor() {
  if (typeof window === 'undefined') return;
  if (isIntercepted) return;

  const originalFetch = window.fetch;
  isIntercepted = true;

  const interceptedFetch: typeof window.fetch = async (input, init) => {
    const urlStr =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

    const response = await originalFetch.call(window, input, init);

    // Intercept 401 Unauthorized errors on app API routes (excluding auth endpoints)
    if (
      response.status === 401 &&
      urlStr.startsWith('/api/') &&
      !urlStr.includes('/api/auth/')
    ) {
      const refreshed = await refreshTokenClient();
      if (refreshed) {
        // Retry original request with fresh auth-token cookie
        return originalFetch.call(window, input, init);
      } else {
        // Both access token (7d) and refresh token (30d) expired -> redirect to relogin
        if (!window.location.pathname.startsWith('/login')) {
          const callbackUrl = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.href = `/login?callbackUrl=${callbackUrl}`;
        }
      }
    }

    return response;
  };

  (interceptedFetch as any).__originalFetch = originalFetch;
  window.fetch = interceptedFetch;
  if (typeof global !== 'undefined' && global.fetch) {
    global.fetch = interceptedFetch;
  }
}

export function resetFetchInterceptor() {
  if (typeof window === 'undefined') return;
  if ((window.fetch as any)?.__originalFetch) {
    const orig = (window.fetch as any).__originalFetch;
    window.fetch = orig;
    if (typeof global !== 'undefined') {
      global.fetch = orig;
    }
  }
  isIntercepted = false;
}
