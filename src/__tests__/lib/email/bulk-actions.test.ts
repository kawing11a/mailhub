import { executeBulkEmailAction } from '@/lib/email/bulk-actions';

function response(body: unknown = { success: true }, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('bulk email actions', () => {
  it('marks every selected email as read using its owning account route', async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const request = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input, init });
      return response();
    };

    const result = await executeBulkEmailAction(
      [
        { id: 'email-1', accountId: 'account-a' },
        { id: 'email-2', accountId: 'account-b' },
      ],
      'read',
      request
    );

    expect(result).toEqual({ succeeded: ['email-1', 'email-2'], failed: [], serverUnsynced: 0 });
    expect(requests.map((item) => [item.input, item.init?.method, item.init?.body])).toEqual([
      ['/api/accounts/account-a/emails/email-1', 'PUT', JSON.stringify({ isRead: true })],
      ['/api/accounts/account-b/emails/email-2', 'PUT', JSON.stringify({ isRead: true })],
    ]);
  });

  it('continues deleting later selected emails when one delete request fails', async () => {
    const requests: string[] = [];
    const request = async (input: RequestInfo | URL) => {
      requests.push(String(input));
      return requests.length === 1
        ? response({ error: 'failed' }, 500)
        : response({ success: true, permanent: true, serverSynced: false });
    };

    const result = await executeBulkEmailAction(
      [
        { id: 'email-1', accountId: 'account-a' },
        { id: 'email-2', accountId: 'account-a' },
      ],
      'delete',
      request
    );

    expect(result).toEqual({ succeeded: ['email-2'], failed: ['email-1'], serverUnsynced: 1 });
    expect(requests).toEqual([
      '/api/accounts/account-a/emails/email-1',
      '/api/accounts/account-a/emails/email-2',
    ]);
  });
});
