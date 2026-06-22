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
  private async startIDLE(accountId: string): Promise<void> {
    const entry = this.connections.get(accountId);
    if (!entry || !entry.isConnected) return;

    const { client } = entry;

    try {
      const lock = await client.getMailboxLock('INBOX');

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
    startSeq: number,
    endSeq: number
  ): Promise<void> {
    const entry = this.connections.get(accountId);
    if (!entry || !entry.isConnected) return;

    const { client, organizationId } = entry;

    try {
      const range = `${startSeq}:${endSeq}`;
      for await (const message of client.fetch(range, {
        source: true,
        uid: true,
      })) {
        await this.persistEmail(accountId, organizationId, message);
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
    message: FetchMessageObject
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
            folder: 'INBOX',
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

      console.log(`Persisted email: ${parsed.subject} (${parsed.messageId})`);
    } catch (error) {
      console.error(`Failed to persist email for account ${accountId}:`, error);
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
