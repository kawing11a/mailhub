export type BulkEmailAction = 'read' | 'unread' | 'delete';

export interface BulkEmailTarget {
  id: string;
  accountId: string;
}

export interface BulkEmailActionResult {
  succeeded: string[];
  failed: string[];
  serverUnsynced: number;
}

type Requester = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

/**
 * Execute mailbox actions one at a time. Besides making partial failures
 * visible to the caller, serial requests avoid opening a connection burst
 * when a user selects many messages from different accounts.
 */
export async function executeBulkEmailAction(
  targets: BulkEmailTarget[],
  action: BulkEmailAction,
  request: Requester = fetch
): Promise<BulkEmailActionResult> {
  const result: BulkEmailActionResult = {
    succeeded: [],
    failed: [],
    serverUnsynced: 0,
  };

  for (const target of targets) {
    try {
      const response = await request(
        `/api/accounts/${target.accountId}/emails/${target.id}`,
        action === 'delete'
          ? { method: 'DELETE' }
          : {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ isRead: action === 'read' }),
            }
      );

      if (!response.ok) throw new Error(`Bulk ${action} failed for ${target.id}`);

      if (action === 'delete') {
        const body = await response.json().catch(() => null);
        if (body?.serverSynced === false) result.serverUnsynced += 1;
      }
      result.succeeded.push(target.id);
    } catch {
      result.failed.push(target.id);
    }
  }

  return result;
}
