jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailAccount: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/crypto', () => ({
  decrypt: jest.fn(),
  encrypt: jest.fn(),
}));

import { fetchGmailAttachment, GmailApiError } from '@/lib/gmail/api';

describe('fetchGmailAttachment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as typeof fetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('decodes Gmail attachment data from base64url to a Buffer', async () => {
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ data: 'Pz8_Rg' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(
      fetchGmailAttachment('token', 'message-1', 'attachment-1')
    ).resolves.toEqual(Buffer.from('??\x3fF'));
  });

  it('throws GmailApiError with the HTTP status for non-2xx responses', async () => {
    const mockFetch = global.fetch as jest.Mock;
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'nope' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(
      fetchGmailAttachment('token', 'message-1', 'attachment-1')
    ).rejects.toMatchObject({
      name: 'GmailApiError',
      status: 404,
    });
  });
});
