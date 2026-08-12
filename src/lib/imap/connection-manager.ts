import { ImapFlow, FetchMessageObject } from 'imapflow';
import { prisma } from '@/lib/db/prisma';
import { decrypt, encrypt } from '@/lib/crypto';
import { parseEmail } from './email-parser';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { resolveThreadId } from './threading';
import { redis } from '@/lib/redis';
import { searchQueue } from '@/lib/queue/client';
import { checkIsHighRisk } from '@/lib/ai/spam-checker';
import { processRulesForNewEmail } from '@/lib/rules/engine';
import type { EmailAccount } from '@prisma/client';

interface ConnectionEntry {
  client: ImapFlow;
  accountId: string;
  organizationId: string;
  isConnected: boolean;
  reconnectTimer?: NodeJS.Timeout;
  reconnectAttempts: number;
  idleLock?: any;
  existsHandlerAttached?: boolean;
}

const MAX_RECONNECT_DELAY_MS = 5 * 60 * 1000; // 5 minutes
const BASE_RECONNECT_DELAY_MS = 1000; // 1 second

/**
 * Decrypt an account's IMAP credentials, refreshing an expiring OAuth token
 * first. Shared by the pooled worker connections and the per-request ones the
 * API routes open, so both handle password *and* OAuth (Microsoft/Google) auth.
 */
export async function resolveImapCredentials(
  account: EmailAccount
): Promise<{ password: string | null; accessToken: string | null }> {
  const password = account.passwordEncrypted ? decrypt(account.passwordEncrypted) : null;
  let accessToken = account.oauthAccessToken ? decrypt(account.oauthAccessToken) : null;

  const expiringSoon =
    !!accessToken &&
    !!account.oauthTokenExpiry &&
    account.oauthTokenExpiry < new Date(Date.now() + 5 * 60000);

  if (expiringSoon && account.oauthRefreshToken) {
    const refreshToken = decrypt(account.oauthRefreshToken);
    const endpoint =
      account.oauthProvider === 'microsoft'
        ? 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
        : account.oauthProvider === 'google'
          ? 'https://oauth2.googleapis.com/token'
          : null;

    const clientId =
      account.oauthProvider === 'microsoft'
        ? process.env.MICROSOFT_CLIENT_ID
        : process.env.GOOGLE_CLIENT_ID;
    const clientSecret =
      account.oauthProvider === 'microsoft'
        ? process.env.MICROSOFT_CLIENT_SECRET
        : process.env.GOOGLE_CLIENT_SECRET;

    if (endpoint) {
      try {
        console.log(`Refreshing ${account.oauthProvider} OAuth token for account ${account.id}`);
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId || '',
            client_secret: clientSecret || '',
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const updateData: any = {
            oauthAccessToken: encrypt(data.access_token),
            oauthTokenExpiry: new Date(Date.now() + data.expires_in * 1000),
          };
          if (data.refresh_token) {
            updateData.oauthRefreshToken = encrypt(data.refresh_token);
          }

          await prisma.emailAccount.update({ where: { id: account.id }, data: updateData });
          accessToken = data.access_token;
          console.log(`Successfully refreshed OAuth token for account ${account.id}`);
        } else {
          console.error(
            `Failed to refresh ${account.oauthProvider} token: ${await res.text()}`
          );
        }
      } catch (error) {
        console.error(`Error refreshing OAuth token for account ${account.id}:`, error);
      }
    }
  }

  return { password, accessToken };
}

/**
 * Open a short-lived IMAP connection, run an operation, and log out.
 *
 * The pooled `imapManager` connections live in the worker process, so API routes
 * (a different process) cannot use them. This mirrors how sending mail and draft
 * sync already work: build a connection per request from stored credentials.
 *
 * Returns null if the account can't be connected, so callers can report that the
 * server wasn't updated rather than claiming success.
 */
export async function withImapConnection<T>(
  accountId: string,
  operation: (client: ImapFlow) => Promise<T>
): Promise<T | null> {
  const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
  if (!account) return null;

  const { password, accessToken } = await resolveImapCredentials(account);

  if (!account.imapHost || (!password && !accessToken)) {
    console.warn(`Account ${accountId} has no usable IMAP credentials.`);
    return null;
  }

  const auth: any = { user: account.username || account.emailAddress };
  if (accessToken) {
    auth.accessToken = accessToken;
  } else {
    auth.pass = password;
  }

  const client = new ImapFlow({
    host: account.imapHost,
    port: account.imapPort || 993,
    secure: account.imapSecure ?? true,
    auth,
    logger: false,
  });

  try {
    await client.connect();
  } catch (error) {
    console.error(`Failed to open IMAP connection for account ${accountId}:`, error);
    return null;
  }

  try {
    return await operation(client);
  } catch (error) {
    console.error(`IMAP operation failed for account ${accountId}:`, error);
    return null;
  } finally {
    try {
      await client.logout();
    } catch {
      // Connection already torn down
    }
  }
}

/** Resolve a folder bucket to a real mailbox path on an arbitrary client. */
export async function resolveMailboxPathOn(
  client: ImapFlow,
  folder: string
): Promise<string | null> {
  try {
    const mailboxes = await client.list();
    for (const mailbox of mailboxes) {
      if (mapSpecialUseToFolder(mailbox) === folder) return mailbox.path;
    }
  } catch (error) {
    console.error('Failed to list mailboxes:', error);
  }
  return null;
}

/** Confirm a UID in a mailbox really is the message we think it is. */
async function uidMatches(
  client: ImapFlow,
  mailboxPath: string,
  uid: bigint | number,
  messageId: string
): Promise<boolean> {
  const expected = normalizeMessageId(messageId);
  if (!expected) return false;

  const lock = await client.getMailboxLock(mailboxPath);
  try {
    for await (const message of client.fetch(String(uid), { uid: true, envelope: true })) {
      if (normalizeMessageId(message.envelope?.messageId || '') === expected) return true;
    }
  } catch {
    // Treat a failed lookup as "not confirmed"
  } finally {
    lock.release();
  }
  return false;
}

/**
 * Find a message anywhere on the server by Message-ID.
 *
 * Stored UIDs go stale: rows trashed before delete-sync existed still point at
 * their original mailbox, and a MOVE reassigns UIDs. Rather than refuse to act
 * (or worse, act on whatever now holds that UID), locate the real message.
 */
export async function locateMessageOn(
  client: ImapFlow,
  messageId: string
): Promise<{ path: string; uid: bigint } | null> {
  const expected = normalizeMessageId(messageId);
  if (!expected) return null;

  let mailboxes;
  try {
    mailboxes = await client.list();
  } catch (error) {
    console.error('Failed to list mailboxes:', error);
    return null;
  }

  for (const mailbox of mailboxes) {
    // Only search mailboxes we actually track, to bound the work.
    if (!mapSpecialUseToFolder(mailbox)) continue;

    let lock;
    try {
      lock = await client.getMailboxLock(mailbox.path);
    } catch {
      continue; // Unselectable (e.g. a container folder)
    }

    try {
      const uids = await client.search({ header: { 'message-id': messageId } }, { uid: true });
      if (uids && uids.length > 0) {
        return { path: mailbox.path, uid: BigInt(uids[uids.length - 1]) };
      }
    } catch {
      // Server may not support this SEARCH; fall through to the next mailbox
    } finally {
      lock.release();
    }
  }

  return null;
}

/**
 * Move a message between folders on an arbitrary client.
 * See IMAPConnectionManager.moveMessage for why the new UID matters.
 *
 * If the stored UID doesn't identify the message in the expected source folder,
 * the message is located by Message-ID and moved from wherever it actually is —
 * which self-heals rows whose folder drifted from the server's.
 */
export async function moveMessageOn(
  client: ImapFlow,
  uid: bigint | number,
  fromFolder: string,
  toFolder: string,
  messageId?: string
): Promise<{ ok: boolean; newUid: bigint | null; notFound?: boolean }> {
  const targetPath = await resolveMailboxPathOn(client, toFolder);
  if (!targetPath) {
    console.warn(`Cannot move: no ${toFolder} mailbox on server.`);
    return { ok: false, newUid: null };
  }

  let sourcePath = await resolveMailboxPathOn(client, fromFolder);
  let sourceUid: bigint | number = uid;

  // Verify the UID really points at this message before trusting it.
  if (messageId) {
    const confirmed =
      !!sourcePath && (await uidMatches(client, sourcePath, uid, messageId));

    if (!confirmed) {
      const located = await locateMessageOn(client, messageId);
      if (!located) {
        console.warn(`Message ${messageId} not found on server; nothing to move.`);
        return { ok: false, newUid: null, notFound: true };
      }
      if (located.path === targetPath) {
        console.log(`Message ${messageId} is already in ${toFolder}; nothing to move.`);
        return { ok: true, newUid: located.uid };
      }
      console.log(
        `Stale UID for ${messageId}: found in ${located.path} (uid ${located.uid}) instead of ${sourcePath ?? fromFolder}.`
      );
      sourcePath = located.path;
      sourceUid = located.uid;
    }
  }

  if (!sourcePath) {
    console.warn(`Cannot move: no ${fromFolder} mailbox on server.`);
    return { ok: false, newUid: null };
  }

  const lock = await client.getMailboxLock(sourcePath);
  try {
    const result: any = await client.messageMove(String(sourceUid), targetPath, { uid: true });
    let newUid: bigint | null = null;
    try {
      const mapped = result?.uidMap?.get?.(Number(sourceUid));
      if (mapped !== undefined && mapped !== null) newUid = BigInt(mapped);
    } catch {
      newUid = null;
    }
    return { ok: true, newUid };
  } finally {
    lock.release();
  }
}

/**
 * Permanently delete messages on an arbitrary client, verifying each UID's
 * Message-ID first so a stale UID can never destroy an unrelated message.
 */
export async function deleteMessagesOn(
  client: ImapFlow,
  messages: Array<{ uid: bigint | number; messageId: string }>,
  folder: string
): Promise<{ deleted: number; skipped: number; notFound: number }> {
  if (messages.length === 0) return { deleted: 0, skipped: 0, notFound: 0 };

  const mailboxPath = await resolveMailboxPathOn(client, folder);
  const expectedByUid = new Map<string, string>();
  for (const message of messages) {
    expectedByUid.set(String(message.uid), normalizeMessageId(message.messageId));
  }

  const confirmed: string[] = [];
  const unconfirmed = new Map<string, string>(expectedByUid); // messageId -> pending

  if (mailboxPath) {
    const lock = await client.getMailboxLock(mailboxPath);
    try {
      for await (const message of client.fetch([...expectedByUid.keys()].join(','), {
        uid: true,
        envelope: true,
      })) {
        const uid = String(message.uid);
        const expected = expectedByUid.get(uid);
        const actual = normalizeMessageId(message.envelope?.messageId || '');

        if (expected && actual && expected === actual) {
          confirmed.push(uid);
          unconfirmed.delete(uid);
        }
      }

      if (confirmed.length > 0) {
        await client.messageDelete(confirmed.join(','), { uid: true });
      }
    } finally {
      lock.release();
    }
  }

  // Anything whose stored UID didn't check out: the row's pointer is stale (it
  // was trashed locally before delete-sync existed, or a move reassigned it).
  // Find the real message by Message-ID instead of silently leaving it behind.
  let deleted = confirmed.length;
  let notFound = 0;

  for (const [, messageId] of unconfirmed) {
    const original = messages.find((m) => normalizeMessageId(m.messageId) === messageId);
    if (!original) continue;

    const located = await locateMessageOn(client, original.messageId);
    if (!located) {
      console.warn(`Message ${original.messageId} not found on server; already gone.`);
      notFound++;
      continue;
    }

    const lock = await client.getMailboxLock(located.path);
    try {
      console.log(`Stale UID for ${original.messageId}: deleting from ${located.path} (uid ${located.uid}).`);
      await client.messageDelete(String(located.uid), { uid: true });
      deleted++;
    } catch (error) {
      console.error(`Failed to delete ${original.messageId} from ${located.path}:`, error);
    } finally {
      lock.release();
    }
  }

  return { deleted, skipped: messages.length - deleted - notFound, notFound };
}

/** Message-IDs are compared with/without angle brackets and case-insensitively. */
function normalizeMessageId(messageId: string): string {
  return messageId.trim().replace(/^<|>$/g, '').toLowerCase();
}

/**
 * Map a server mailbox to one of our normalized folder buckets.
 * Returns null for mailboxes we don't track.
 */
export function mapSpecialUseToFolder(mailbox: any): string | null {
  const use = (mailbox.specialUse || '').toLowerCase();
  const path = (mailbox.path || '').toLowerCase();

  if (use.includes('\\sent') || path.includes('sent')) return 'SENT';
  if (use.includes('\\trash') || path.includes('trash') || path.includes('deleted')) return 'TRASH';
  if (use.includes('\\drafts') || path.includes('draft')) return 'DRAFTS';
  if (use.includes('\\junk') || path.includes('junk') || path.includes('spam')) return 'SPAM';
  if (path === 'inbox') return 'INBOX';

  return null;
}

export class IMAPConnectionManager {
  private connections: Map<string, ConnectionEntry> = new Map();

  /**
   * Initialize an IMAP connection for a single account.
   * Opens connection, enters IDLE on INBOX.
   */
  async initializeAccount(account: EmailAccount, reconnectAttempts: number = 0): Promise<void> {
    if (this.connections.has(account.id)) {
      console.log(`Account ${account.id} already connected, skipping`);
      return;
    }

    const password = account.passwordEncrypted
      ? decrypt(account.passwordEncrypted)
      : null;

    let accessToken = account.oauthAccessToken
      ? decrypt(account.oauthAccessToken)
      : null;

    if (account.oauthRefreshToken && (account.oauthProvider === 'microsoft' || account.provider === 'outlook')) {
      try {
        const { getValidOAuthAccessToken } = await import('@/lib/accounts/tokens');
        accessToken = await getValidOAuthAccessToken(
          account.id,
          'https://outlook.office.com/IMAP.AccessAsUser.All offline_access'
        );
      } catch (tokenErr) {
        console.error(`Failed to acquire Microsoft IMAP access token for account ${account.id}:`, tokenErr);
      }
    } else if (accessToken && account.oauthTokenExpiry) {
      const now = new Date();
      if (account.oauthTokenExpiry < new Date(now.getTime() + 5 * 60000)) {
        if (account.oauthRefreshToken) {
          const refreshToken = decrypt(account.oauthRefreshToken);
          try {
            let newAccessToken: string | null = null;
            let newExpiry: Date | null = null;
            let newRefreshToken: string | null = null;

            if (account.oauthProvider === 'google') {
              console.log(`Refreshing Google OAuth token for account ${account.id}`);
              const res = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                  client_id: process.env.GOOGLE_CLIENT_ID || '',
                  client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
                  refresh_token: refreshToken,
                  grant_type: 'refresh_token',
                }),
              });

              if (res.ok) {
                const data = await res.json();
                newAccessToken = data.access_token;
                newExpiry = new Date(Date.now() + (data.expires_in * 1000));
                if (data.refresh_token) newRefreshToken = data.refresh_token;
              } else {
                console.error(`Failed to refresh Google token: ${await res.text()}`);
              }
            }

            if (newAccessToken && newExpiry) {
              const updateData: any = {
                oauthAccessToken: encrypt(newAccessToken),
                oauthTokenExpiry: newExpiry,
              };
              if (newRefreshToken) {
                updateData.oauthRefreshToken = encrypt(newRefreshToken);
              }

              await prisma.emailAccount.update({
                where: { id: account.id },
                data: updateData
              });

              accessToken = newAccessToken;
              console.log(`Successfully refreshed OAuth token for account ${account.id}`);
            }
          } catch (error) {
            console.error(`Error refreshing OAuth token for account ${account.id}:`, error);
          }
        }
      }
    }

    if (!account.imapHost || (!password && !accessToken)) {
      console.warn(`Account ${account.id} missing IMAP credentials, skipping`);
      return;
    }

    const auth: any = {
      user: account.username || account.emailAddress,
    };
    if (accessToken) {
      auth.accessToken = accessToken;
    } else if (password) {
      auth.pass = password;
    }

    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort || 993,
      secure: account.imapSecure ?? true,
      auth,
      logger: false,
    });

    await this.registerConnection(account, client, reconnectAttempts);
  }

  /** Wire up event handlers, connect, and start IDLE for a pooled connection. */
  private async registerConnection(
    account: EmailAccount,
    client: ImapFlow,
    reconnectAttempts: number
  ): Promise<void> {
    const entry: ConnectionEntry = {
      client,
      accountId: account.id,
      organizationId: account.organizationId,
      isConnected: false,
      reconnectAttempts: reconnectAttempts,
    };

    this.connections.set(account.id, entry);

    // Handle connection events
    client.on('close', () => {
      console.log(`IMAP connection closed for account ${account.id}`);
      entry.isConnected = false;
      if (entry.idleLock) {
        try { entry.idleLock.release(); } catch (e) {}
        entry.idleLock = undefined;
      }
      this.scheduleReconnect(account.id);
    });

    client.on('error', (err: Error) => {
      console.error(`IMAP error for account ${account.id}:`, err.message);
      entry.isConnected = false;
    });

    try {
      await client.connect();
      entry.isConnected = true;
      entry.reconnectAttempts = 0;
      console.log(`Connected to IMAP for account ${account.id} (${account.emailAddress})`);

      // Start IDLE on INBOX
      await this.startIDLE(account.id);
    } catch (error: any) {
      console.error(`Failed to connect account ${account.id}:`, error);
      entry.isConnected = false;

      const errorMessage = error.message?.toLowerCase() || '';
      const isAuthError = errorMessage.includes('auth') ||
                          errorMessage.includes('login') ||
                          errorMessage.includes('credential');

      if (isAuthError) {
        try {
          await prisma.emailAccount.update({
            where: { id: account.id },
            data: { isActive: false, authError: error.message }
          });
          console.log(`Disabled account ${account.id} due to auth error.`);
        } catch (dbError) {
          console.error(`Failed to update authError for account ${account.id}`, dbError);
        }
        return; // Do not schedule reconnect
      }

      this.scheduleReconnect(account.id);
    }
  }

  /**
   * Enter IDLE mode on INBOX, listening for new emails.
   */
  public async startIDLE(accountId: string): Promise<void> {
    const entry = this.connections.get(accountId);
    if (!entry || !entry.isConnected) return;
    if (entry.idleLock) return; // Already in IDLE

    const { client } = entry;

    try {
      const lock = await client.getMailboxLock('INBOX');
      entry.idleLock = lock;

      try {
        // Listen for new mail via EXISTS event.
        // Attach once per connection — startIDLE is re-entered after every sync and
        // every server-side mutation, and re-registering would fetch each new
        // message once per listener.
        if (!entry.existsHandlerAttached) {
          entry.existsHandlerAttached = true;
          client.on('exists', async (data: { path: string; count: number; prevCount: number }) => {
            if (data.path === 'INBOX' && data.count > data.prevCount) {
              console.log(
                `New email(s) in INBOX for account ${accountId}: ${data.count - data.prevCount} new`
              );
              await this.fetchNewEmails(accountId, data.prevCount + 1, data.count);
            }
          });
        }

        // Enter IDLE — this keeps the connection alive
        // The exists event above handles new mail notifications
        console.log(`Entered IDLE for account ${accountId}`);
      } catch (idleError) {
        lock.release();
        entry.idleLock = undefined;
        throw idleError;
      }
    } catch (error) {
      console.error(`Failed to start IDLE for account ${accountId}:`, error);
    }
  }

  /**
   * Fetch and persist new emails by sequence numbers.
   */
  private async fetchNewEmails(
    accountId: string,
    startSeqOrUid: number | number[],
    endSeq?: number,
    folder: string = 'INBOX',
    skipNotifications: boolean = false
  ): Promise<void> {
    const entry = this.connections.get(accountId);
    if (!entry || !entry.isConnected) return;

    const { client, organizationId } = entry;

    try {
      const range = typeof startSeqOrUid === 'number' && endSeq !== undefined
        ? `${startSeqOrUid}:${endSeq}`
        : (startSeqOrUid as number[]).join(',');

      const fetchByUid = Array.isArray(startSeqOrUid);

      const promises: Promise<void>[] = [];
      const batchSize = 10;

      for await (const message of client.fetch(range, {
        source: true,
        uid: true,
      }, { uid: fetchByUid })) {
        promises.push(this.persistEmail(accountId, organizationId, message, folder, skipNotifications));

        if (promises.length >= batchSize) {
          await Promise.all(promises);
          promises.length = 0;
        }
      }

      if (promises.length > 0) {
        await Promise.all(promises);
      }
    } catch (error) {
      console.error(`Failed to fetch new emails for account ${accountId}:`, error);
    }
  }

  /**
   * Parse and persist a single email to the database.
   */
  private async persistEmail(
    accountId: string,
    organizationId: string,
    message: FetchMessageObject,
    folder: string = 'INBOX',
    skipNotifications: boolean = false
  ): Promise<void> {
    try {
      const rawSource = message.source;
      if (!rawSource) return;
      const parsed = await parseEmail(rawSource);

      // Resolve thread ID (cross-account)
      const threadId = await resolveThreadId(
        parsed.messageId,
        parsed.inReplyTo,
        parsed.referencesHeader,
        organizationId
      );

      const finalFolder = folder;
      let isHighRisk = false;
      let riskReason: string | null = null;

      // Only check spam for INBOX and non-historical syncs
      if (!skipNotifications && folder === 'INBOX') {
        const aiCheck = await checkIsHighRisk(parsed.subject || '', parsed.snippet || '', parsed.fromAddress || '');
        if (aiCheck.isHighRisk) {
          isHighRisk = true;
          riskReason = aiCheck.reason || 'Flagged by local LLM';
        }
      }

      // Persist email envelope + body in a transaction
      const email = await prisma.$transaction(async (tx) => {
        const email = await tx.email.upsert({
          where: {
            accountId_messageId: {
              accountId,
              messageId: parsed.messageId,
            },
          },
          create: {
            accountId,
            messageId: parsed.messageId,
            uid: message.uid ? BigInt(message.uid) : null,
            threadId,
            folder: finalFolder,
            isHighRisk,
            riskReason,
            subject: parsed.subject,
            snippet: parsed.snippet,
            fromAddress: parsed.fromAddress,
            fromName: parsed.fromName,
            toAddresses: parsed.toAddresses,
            ccAddresses: parsed.ccAddresses,
            bccAddresses: parsed.bccAddresses,
            replyTo: parsed.replyTo,
            inReplyTo: parsed.inReplyTo,
            referencesHeader: parsed.referencesHeader,
            hasAttachments: parsed.hasAttachments,
            receivedAt: parsed.receivedAt,
            sentAt: parsed.sentAt,
            rawHeaders: parsed.rawHeaders,
          },
          update: {}, // Skip if already exists
        });

        // Store body separately
        await tx.emailBody.upsert({
          where: { emailId: email.id },
          create: {
            emailId: email.id,
            bodyHtml: parsed.bodyHtml,
            bodyText: parsed.bodyText,
          },
          update: {},
        });

        // Store attachments.
        // The email above is an upsert, so a re-synced message reuses the same row.
        // Creating unconditionally here appended a fresh copy of every attachment on
        // each sync; the attachment set for a given messageId never changes, so skip
        // entirely (before the disk writes) once any are already stored.
        const existingAttachments = await tx.attachment.count({
          where: { emailId: email.id },
        });

        if (existingAttachments === 0 && parsed.attachments && parsed.attachments.length > 0) {
          const storageDir = path.join(process.cwd(), '.storage', 'attachments');
          await fs.mkdir(storageDir, { recursive: true }).catch(() => {});

          for (const att of parsed.attachments) {
            const attachmentId = randomUUID();
            const storagePath = path.join(storageDir, attachmentId);

            await fs.writeFile(storagePath, att.content);

            await tx.attachment.create({
              data: {
                id: attachmentId,
                emailId: email.id,
                filename: att.filename,
                contentType: att.contentType,
                sizeBytes: att.size,
                storagePath,
                cid: att.cid,
              }
            });
          }
        }

        return email;
      });

      // Add to search indexing queue
      await searchQueue.add('index-email', { emailId: email.id });

      // Run automated email rules (skip on historical syncs)
      if (!skipNotifications && folder === 'INBOX') {
        processRulesForNewEmail(email.id, accountId, organizationId).catch((ruleErr) => {
          console.error(`[IMAP] Failed to process email rules for email ${email.id}:`, ruleErr);
        });
      }

      // Publish new email event via Redis for SSE only if not skipping
      if (!skipNotifications) {
        await redis.publish(
          `new_email:${organizationId}`,
          JSON.stringify({
            event: 'new_email',
            accountId,
            messageId: parsed.messageId,
            subject: parsed.subject,
            from: parsed.fromAddress,
            folder: 'INBOX',
          })
        );
      }

      if (!skipNotifications) {
        // Send Web Push to all devices subscribed to this organization
        try {
          const webpush = require('web-push');

          webpush.setVapidDetails(
            process.env.VAPID_SUBJECT || 'mailto:support@mailhub.local',
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
            process.env.VAPID_PRIVATE_KEY as string
          );

          const subscriptions = await prisma.pushSubscription.findMany({
            where: { organizationId },
          });

          const pushPayload = JSON.stringify({
            title: `New email from ${parsed.fromAddress}`,
            body: parsed.subject || 'No Subject',
            url: '/inbox',
          });

          const pushPromises = subscriptions.map((sub: any) =>
            webpush.sendNotification({
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              }
            }, pushPayload).catch(async (err: any) => {
              if (err.statusCode === 404 || err.statusCode === 410) {
                console.log('Push subscription expired or removed, deleting from DB');
                await prisma.pushSubscription.delete({ where: { id: sub.id } });
              } else {
                console.error('Push notification failed:', err);
              }
            })
          );

          await Promise.all(pushPromises);
        } catch (err) {
          console.error('Failed to send Web Push:', err);
        }
      }

      console.log(`Persisted email: ${parsed.subject} (${parsed.messageId})`);
    } catch (error) {
      console.error(`Failed to persist email for account ${accountId}:`, error);
    }
  }

  /** Drop the IDLE lock so another mailbox can be locked. */
  private releaseIdle(entry: ConnectionEntry): void {
    if (entry.idleLock) {
      try {
        entry.idleLock.release();
      } catch {
        // Already released
      }
      entry.idleLock = undefined;
    }
  }

  /**
   * Run a mailbox mutation on this account's pooled connection, handling the
   * IDLE dance. Shares its implementation with the per-request helpers above, so
   * worker-side and API-side mutations can't drift apart.
   *
   * Only usable in the process that owns the connection (the worker). API routes
   * should call withImapConnection instead.
   */
  private async onPooledClient<T>(
    accountId: string,
    operation: (client: ImapFlow) => Promise<T>
  ): Promise<T | null> {
    const entry = this.connections.get(accountId);
    if (!entry || !entry.isConnected) {
      console.warn(`Cannot mutate mailbox: account ${accountId} not connected.`);
      return null;
    }

    this.releaseIdle(entry);

    try {
      return await operation(entry.client);
    } catch (error) {
      console.error(`Mailbox operation failed for account ${accountId}:`, error);
      return null;
    } finally {
      await this.startIDLE(accountId);
    }
  }

  /** Move a message between folders. See moveMessageOn for UID semantics. */
  async moveMessage(
    accountId: string,
    uid: bigint | number,
    fromFolder: string,
    toFolder: string
  ): Promise<{ ok: boolean; newUid: bigint | null }> {
    const result = await this.onPooledClient(accountId, (client) =>
      moveMessageOn(client, uid, fromFolder, toFolder)
    );
    return result ?? { ok: false, newUid: null };
  }

  /** Permanently delete messages, verifying each UID's Message-ID first. */
  async deleteMessages(
    accountId: string,
    messages: Array<{ uid: bigint | number; messageId: string }>,
    folder: string
  ): Promise<{ ok: boolean; deleted: number; skipped: number }> {
    if (messages.length === 0) return { ok: true, deleted: 0, skipped: 0 };

    const result = await this.onPooledClient(accountId, (client) =>
      deleteMessagesOn(client, messages, folder)
    );

    if (result === null) {
      return { ok: false, deleted: 0, skipped: messages.length };
    }
    return { ok: true, ...result };
  }

  /** Permanently delete a single message from a folder. */
  async deleteMessage(
    accountId: string,
    uid: bigint | number,
    messageId: string,
    folder: string
  ): Promise<boolean> {
    const { ok, deleted } = await this.deleteMessages(
      accountId,
      [{ uid, messageId }],
      folder
    );
    return ok && deleted === 1;
  }

  /**
   * Fetch historical emails across standard mailboxes.
   */
  async syncHistoricalEmails(accountId: string): Promise<void> {
    const entry = this.connections.get(accountId);
    if (!entry || !entry.isConnected) {
      console.warn(`Cannot sync history: Account ${accountId} not connected.`);
      return;
    }

    const { client, organizationId } = entry;

    // Release IDLE lock so we can lock other mailboxes during sync
    if (entry.idleLock) {
      try { entry.idleLock.release(); } catch (e) {}
      entry.idleLock = undefined;
    }

    try {
      const mailboxes = await client.list();

      for (const mailbox of mailboxes) {
        const mappedFolder = mapSpecialUseToFolder(mailbox);
        if (!mappedFolder) continue;

        console.log(`Syncing ${mailbox.path} -> ${mappedFolder} for account ${accountId}`);
        try {
          const lock = await client.getMailboxLock(mailbox.path);
          try {
            const total = client.mailbox ? client.mailbox.exists : 0;
            if (total > 0) {
              const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
              const uids = await client.search({ since: ninetyDaysAgo }, { uid: true });

              if (uids && uids.length > 0) {
                // Fetch in chunks of 50 to prevent memory exhaustion
                const CHUNK_SIZE = 50;
                for (let i = 0; i < uids.length; i += CHUNK_SIZE) {
                  const chunk = uids.slice(i, i + CHUNK_SIZE);
                  console.log(`Fetching UIDs chunk ${i} to ${i + chunk.length} from ${mailbox.path} (Total recent: ${uids.length})`);
                  await this.fetchNewEmails(accountId, chunk, undefined, mappedFolder, true);
                }
              }
            }
          } finally {
            lock.release();
          }
        } catch (err) {
          console.error(`Failed to sync mailbox ${mailbox.path} for account ${accountId}:`, err);
        }
      }
    } catch (error) {
      console.error(`Failed to list mailboxes for account ${accountId}:`, error);
    } finally {
      // Always resume IDLE on INBOX after syncing is done
      await this.startIDLE(accountId);
    }
  }

  /**
   * Schedule a reconnect with exponential backoff.
   */
  private scheduleReconnect(accountId: string): void {
    const entry = this.connections.get(accountId);
    if (!entry) return;

    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer);
    }

    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * Math.pow(2, entry.reconnectAttempts),
      MAX_RECONNECT_DELAY_MS
    );

    console.log(`Scheduling reconnect for account ${accountId} in ${delay}ms`);

    entry.reconnectTimer = setTimeout(async () => {
      const currentAttempts = entry.reconnectAttempts + 1;
      try {
        const account = await prisma.emailAccount.findUnique({
          where: { id: accountId },
        });
        if (account && account.isActive) {
          this.connections.delete(accountId);
          await this.initializeAccount(account, currentAttempts);
        } else {
          this.connections.delete(accountId);
        }
      } catch (error) {
        console.error(`Reconnect failed for account ${accountId}:`, error);
        entry.reconnectAttempts = currentAttempts;
        this.scheduleReconnect(accountId);
      }
    }, delay);
  }

  /**
   * Disconnect a single account.
   */
  async destroyAccount(accountId: string): Promise<void> {
    const entry = this.connections.get(accountId);
    if (!entry) return;

    if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);

    try {
      if (entry.isConnected) {
        await entry.client.logout();
      }
    } catch {
      // Ignore logout errors
    }

    this.connections.delete(accountId);
    console.log(`Destroyed IMAP connection for account ${accountId}`);
  }

  /**
   * Graceful shutdown — close all connections.
   */
  async shutdown(): Promise<void> {
    console.log(`Shutting down IMAP Connection Manager (${this.connections.size} connections)`);
    const promises = Array.from(this.connections.keys()).map((id) =>
      this.destroyAccount(id)
    );
    await Promise.allSettled(promises);
  }

  /**
   * Get connection status for all accounts.
   */
  getStatus(): Array<{ accountId: string; isConnected: boolean }> {
    return Array.from(this.connections.entries()).map(([id, entry]) => ({
      accountId: id,
      isConnected: entry.isConnected,
    }));
  }
}

// Singleton instance
export const imapManager = new IMAPConnectionManager();
