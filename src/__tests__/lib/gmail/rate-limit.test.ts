jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailAccount: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { gmailFetch } from '@/lib/gmail/api';

describe('Gmail API rate-limit handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GMAIL_REQUEST_INTERVAL_MS = '1';
    global.fetch = jest.fn() as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.GMAIL_REQUEST_INTERVAL_MS;
  });

  it('retries quota-related 403 responses and returns the eventual success', async () => {
    const mockFetch = global.fetch as jest.Mock;
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message:
                "Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per minute per user'",
            },
          }),
          { status: 403 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { message: 'User rate limit exceeded' },
          }),
          { status: 403 }
        )
      )
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    jest
      .spyOn(global, 'setTimeout')
      .mockImplementation(((callback: TimerHandler) => {
        if (typeof callback === 'function') callback();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as unknown as typeof setTimeout);

    const response = await gmailFetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/message-1',
      { headers: { Authorization: 'Bearer test-token' } },
      2
    );

    expect(response.status).toBe(200);

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('spaces concurrent requests for the same Gmail identity', async () => {
    process.env.GMAIL_REQUEST_INTERVAL_MS = '50';
    jest.useFakeTimers();

    const mockFetch = global.fetch as jest.Mock;
    let resolveFirst!: (response: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    mockFetch
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce(new Response('second', { status: 200 }));

    const first = gmailFetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/first',
      { headers: { Authorization: 'Bearer same-token' } },
      0
    );
    await Promise.resolve();

    const second = gmailFetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/second',
      { headers: { Authorization: 'Bearer same-token' } },
      0
    );
    await Promise.resolve();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    resolveFirst(new Response('first', { status: 200 }));
    await first;
    await Promise.resolve();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(50);
    await expect(second).resolves.toHaveProperty('status', 200);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });
});
