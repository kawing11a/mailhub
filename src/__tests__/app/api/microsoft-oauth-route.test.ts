import { POST as postMicrosoftOAuth } from '@/app/api/accounts/oauth/microsoft/route';

describe('legacy Microsoft OAuth POST route', () => {
  it('returns gone and directs callers to the canonical callback flow', async () => {
    const response = await postMicrosoftOAuth();

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      error: 'This endpoint is disabled. Use the canonical Microsoft OAuth /init and /callback flow.',
    });
  });
});
