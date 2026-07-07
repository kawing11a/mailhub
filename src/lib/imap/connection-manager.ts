import { ImapFlow, FetchMessageObject } from 'imapflow';
import { prisma } from '@/lib/db/prisma';
import { decrypt } from '@/lib/crypto';
import { parseEmail } from './email-parser';
import { resolveThreadId } from './threading';
import { redis } from '@/lib/redis';
import { searchQueue } from '@/lib/queue/client';
import type { EmailAccount } from '@prisma/client';

interface ConnectionEntry {
  client: ImapFlow;
  accountId: string;
  organizationId: string;
  isConnected: boolean;
  reconnectTimer?: NodeJS.Timeout;
  reconnectAttempts: number;
  idleLock?: any;
}

const MAX_RECONNECT_DELAY_MS = 5 * 60 * 1000; // 5 minutes
const BASE_RECONNECT_DELAY_MS = 1000; // 1 second

export class IMAPConnectionManager {
  private connections: Map<string, ConnectionEntry> = new Map();

  /**
   * Initialize an IMAP connection for a single account.
   * Opens connection, enters IDLE on INBOX.
   */
  async initializeAccount(account: EmailAccount): Promise<void> {
    if (this.connections.has(account.id)) {
      console.log(`Account ${account.id} already connected, skipping`);
      return;
    }

    const password = account.passwordEncrypted
      ? decrypt(account.passwordEncrypted)
      : null;
      
    const accessToken = account.oauthAccessToken
      ? decrypt(account.oauthAccessToken)
      : null;

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

    const entry: ConnectionEntry = {
      client,
      accountId: account.id,
      organizationId: account.organizationId,
      isConnected: false,
      reconnectAttempts: 0,
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
    } catch (error) {
      console.error(`Failed to connect account ${account.id}:`, error);
      entry.isConnected = false;
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
        // Listen for new mail via EXISTS event
        client.on('exists', async (data: { path: string; count: number; prevCount: number }) => {
          if (data.path === 'INBOX' && data.count > data.prevCount) {
            console.log(
              `New email(s) in INBOX for account ${accountId}: ${data.count - data.prevCount} new`
            );
            await this.fetchNewEmails(accountId, data.prevCount + 1, data.count);
          }
        });

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
    folder: string = 'INBOX'
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
        promises.push(this.persistEmail(accountId, organizationId, message, folder));
        
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
    folder: string = 'INBOX'
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
            folder: folder,
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
        
        return email;
      });

      // Add to search indexing queue
      await searchQueue.add('index-email', { emailId: email.id });

      // Publish new email event via Redis for SSE
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

      console.log(`Persisted email: ${parsed.subject} (${parsed.messageId})`);
    } catch (error) {
      console.error(`Failed to persist email for account ${accountId}:`, error);
    }
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
      
      const mapSpecialUseToFolder = (mailbox: any): string | null => {
        const use = (mailbox.specialUse || '').toLowerCase();
        const path = mailbox.path.toLowerCase();
        
        if (use.includes('\\sent') || path.includes('sent')) return 'SENT';
        if (use.includes('\\trash') || path.includes('trash') || path.includes('deleted')) return 'TRASH';
        if (use.includes('\\drafts') || path.includes('draft')) return 'DRAFTS';
        if (use.includes('\\junk') || path.includes('junk') || path.includes('spam')) return 'SPAM';
        if (path === 'inbox') return 'INBOX';
        
        return null;
      };

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
                  await this.fetchNewEmails(accountId, chunk, undefined, mappedFolder);
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

    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * Math.pow(2, entry.reconnectAttempts),
      MAX_RECONNECT_DELAY_MS
    );

    console.log(`Scheduling reconnect for account ${accountId} in ${delay}ms`);

    entry.reconnectTimer = setTimeout(async () => {
      entry.reconnectAttempts++;
      try {
        const account = await prisma.emailAccount.findUnique({
          where: { id: accountId },
        });
        if (account && account.isActive) {
          this.connections.delete(accountId);
          await this.initializeAccount(account);
        }
      } catch (error) {
        console.error(`Reconnect failed for account ${accountId}:`, error);
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
