/**
 * Propagates folder mutations (trash / permanent delete / restore) to the mail
 * server, so local state doesn't silently diverge — and so a permanently deleted
 * message isn't resurrected by the next sync.
 *
 * Every function here is best-effort: it reports failure rather than throwing,
 * because the local DB change should still stand if the server is unreachable.
 */
import {
  withImapConnection,
  moveMessageOn,
  deleteMessagesOn,
} from '@/lib/imap/connection-manager';
import {
  getValidAccessToken,
  trashMessage,
  deleteMessage as gmailDeleteMessage,
  modifyMessageLabels,
} from '@/lib/gmail/api';
import type { EmailAccount, Email } from '@prisma/client';

/**
 * Whether a message actually exists on the server.
 *
 * `local` covers mail this client created but never uploaded — most importantly
 * anything sent over SMTP, which is written straight to the DB with folder SENT
 * and no server counterpart. Deleting one of those must not look like a failure.
 */
export type ServerCopy = 'imap' | 'gmail' | 'local';

export interface ServerSyncResult {
  /** False when there was no server copy to act on. */
  attempted: boolean;
  /** True when the server was updated, or when there was nothing to update. */
  ok: boolean;
  /**
   * Set after a move: IMAP reassigns the UID in the destination mailbox, so the
   * caller must write this back. `null` means "no longer addressable" — either
   * nothing moved, or the server reported no mapping — and the stored UID should
   * be cleared so we never act on a UID that now belongs to another message.
   */
  newUid?: bigint | null;
  /** Whether the caller should write `newUid` (including null) to the row. */
  uidChanged?: boolean;
}

const LOCAL_ONLY: ServerSyncResult = { attempted: false, ok: true };

/** Gmail's own label ids for our normalized folder buckets. */
const GMAIL_LABEL_BY_FOLDER: Record<string, string> = {
  INBOX: 'INBOX',
  SENT: 'SENT',
  TRASH: 'TRASH',
  SPAM: 'SPAM',
  DRAFTS: 'DRAFT',
};

type EmailRef = Pick<Email, 'uid' | 'folder' | 'messageId'>;

/**
 * The Gmail sync stores the message id as BigInt('0x' + id), so we can recover
 * it as hex. Note this cannot restore leading zeros, which Gmail ids don't use.
 */
export function gmailMessageId(email: EmailRef): string | null {
  return email.uid === null ? null : email.uid.toString(16);
}

/**
 * Decide whether a message has a server copy, and on which provider.
 * Keyed on the account provider rather than on `uid` alone: Gmail rows carry a
 * synthesized uid, so uid presence says nothing about which API to call.
 */
export function classifyServerCopy(
  account: Pick<EmailAccount, 'provider'>,
  email: EmailRef
): ServerCopy {
  if (email.uid === null) return 'local';
  return account.provider === 'gmail' ? 'gmail' : 'imap';
}

/** Move a message to the server's trash. */
export async function moveToTrashOnServer(
  account: Pick<EmailAccount, 'id' | 'provider'>,
  email: EmailRef
): Promise<ServerSyncResult> {
  const copy = classifyServerCopy(account, email);
  if (copy === 'local') return LOCAL_ONLY;

  try {
    if (copy === 'gmail') {
      const messageId = gmailMessageId(email);
      if (!messageId) return LOCAL_ONLY;
      const token = await getValidAccessToken(account.id);
      await trashMessage(token, messageId);
      return { attempted: true, ok: true };
    }

    const result = await withImapConnection(account.id, (client) =>
      moveMessageOn(client, email.uid!, email.folder, 'TRASH', email.messageId)
    );
    if (!result) return { attempted: true, ok: false };
    // Already absent from the server is the state we wanted, not a failure.
    if (result.notFound) return { attempted: true, ok: true, newUid: null, uidChanged: true };
    return { attempted: true, ok: result.ok, newUid: result.newUid, uidChanged: result.ok };
  } catch (error) {
    console.error(`Failed to trash message on server for account ${account.id}:`, error);
    return { attempted: true, ok: false };
  }
}

/** Permanently remove a message from the server. */
export async function deleteOnServer(
  account: Pick<EmailAccount, 'id' | 'provider'>,
  email: EmailRef
): Promise<ServerSyncResult> {
  const copy = classifyServerCopy(account, email);
  if (copy === 'local') return LOCAL_ONLY;

  try {
    if (copy === 'gmail') {
      const messageId = gmailMessageId(email);
      if (!messageId) return LOCAL_ONLY;
      const token = await getValidAccessToken(account.id);
      await gmailDeleteMessage(token, messageId);
      return { attempted: true, ok: true };
    }

    const result = await withImapConnection(account.id, (client) =>
      deleteMessagesOn(client, [{ uid: email.uid!, messageId: email.messageId }], email.folder)
    );
    if (result === null) return { attempted: true, ok: false };
    // notFound means it is already absent from the server — the desired end state.
    return { attempted: true, ok: result.deleted === 1 || result.notFound === 1 };
  } catch (error) {
    console.error(`Failed to delete message on server for account ${account.id}:`, error);
    return { attempted: true, ok: false };
  }
}

/** Move a message out of trash and back into `toFolder`. */
export async function restoreOnServer(
  account: Pick<EmailAccount, 'id' | 'provider'>,
  email: EmailRef,
  toFolder: string
): Promise<ServerSyncResult> {
  const copy = classifyServerCopy(account, email);
  if (copy === 'local') return LOCAL_ONLY;

  try {
    if (copy === 'gmail') {
      const messageId = gmailMessageId(email);
      if (!messageId) return LOCAL_ONLY;
      const label = GMAIL_LABEL_BY_FOLDER[toFolder];
      if (!label) return { attempted: true, ok: false };
      const token = await getValidAccessToken(account.id);
      await modifyMessageLabels(token, messageId, [label], ['TRASH']);
      return { attempted: true, ok: true };
    }

    const result = await withImapConnection(account.id, (client) =>
      moveMessageOn(client, email.uid!, 'TRASH', toFolder, email.messageId)
    );
    if (!result) return { attempted: true, ok: false };
    if (result.notFound) return { attempted: true, ok: true, newUid: null, uidChanged: true };
    return { attempted: true, ok: result.ok, newUid: result.newUid, uidChanged: result.ok };
  } catch (error) {
    console.error(`Failed to restore message on server for account ${account.id}:`, error);
    return { attempted: true, ok: false };
  }
}

/**
 * Permanently delete many messages belonging to one account, batching the IMAP
 * work into a single mailbox lock instead of one round-trip per message.
 * Returns how many could not be removed from the server.
 */
export async function deleteManyOnServer(
  account: Pick<EmailAccount, 'id' | 'provider'>,
  emails: EmailRef[],
  folder: string
): Promise<{ serverFailed: number }> {
  const withServerCopy = emails.filter(
    (email) => classifyServerCopy(account, email) !== 'local'
  );
  if (withServerCopy.length === 0) return { serverFailed: 0 };

  if (account.provider === 'gmail') {
    let serverFailed = 0;
    let token: string;
    try {
      token = await getValidAccessToken(account.id);
    } catch (error) {
      console.error(`Failed to get Gmail token for account ${account.id}:`, error);
      return { serverFailed: withServerCopy.length };
    }

    for (const email of withServerCopy) {
      const messageId = gmailMessageId(email);
      if (!messageId) continue;
      try {
        await gmailDeleteMessage(token, messageId);
      } catch (error) {
        console.error(`Failed to delete Gmail message ${messageId}:`, error);
        serverFailed++;
      }
    }
    return { serverFailed };
  }

  const result = await withImapConnection(account.id, (client) =>
    deleteMessagesOn(
      client,
      withServerCopy.map((email) => ({ uid: email.uid!, messageId: email.messageId })),
      folder
    )
  );

  // `skipped` is what genuinely could not be removed. Entries whose stored UID
  // was stale are recovered by Message-ID inside deleteMessagesOn, and ones that
  // are simply absent from the server (notFound) already match the desired state.
  return { serverFailed: result === null ? withServerCopy.length : result.skipped };
}
