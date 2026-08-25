import { prisma } from '@/lib/db/prisma';
import { parseEmail } from '@/lib/imap/email-parser';
import { resolveThreadId } from '@/lib/imap/threading';
import { buildReceivedAttachmentMetadata } from '@/lib/email/attachment-storage';
import { redis } from '@/lib/redis';
import { searchQueue } from '@/lib/queue/client';
import {
  type GmailMessagePart,
  getValidAccessToken,
  fetchMessageFull,
  fetchMessagesList,
  fetchMessageRaw,
} from './api';
import { checkIsHighRisk } from '@/lib/ai/spam-checker';
import { processRulesForNewEmail } from '@/lib/rules/engine';
import type { EmailAccount } from '@prisma/client';
import { sendAccountPushNotification } from '@/lib/notifications/account-push';

function isTextPart(part: GmailMessagePart): boolean {
  return (part.mimeType ?? '').toLowerCase().startsWith('text/');
}

function hasContentIdHeader(part: GmailMessagePart): boolean {
  return Boolean(
    part.headers?.some((header) => header.name?.toLowerCase() === 'content-id' && header.value)
  );
}

function isGmailAttachmentPart(part: GmailMessagePart): boolean {
  if (isTextPart(part)) return false;

  const hasAttachmentId = Boolean(part.filename && part.body?.attachmentId);
  const hasInlineContent = Boolean(part.body?.data && hasContentIdHeader(part));

  return hasAttachmentId || hasInlineContent;
}

export function extractGmailAttachmentReferences(
  payload: GmailMessagePart | null | undefined
): Array<{ ordinal: number; gmailAttachmentId: string | null }> {
  if (!payload) return [];

  const references: Array<{ ordinal: number; gmailAttachmentId: string | null }> = [];

  const visit = (part: GmailMessagePart) => {
    if (isGmailAttachmentPart(part)) {
      references.push({
        ordinal: references.length,
        gmailAttachmentId: part.body?.attachmentId ?? null,
      });
    }

    for (const childPart of part.parts ?? []) {
      visit(childPart);
    }
  };

  visit(payload);

  return references;
}

export class GmailSyncManager {
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Initializes polling for a Gmail account
   */
  async initializeAccount(account: EmailAccount): Promise<void> {
    if (this.pollingIntervals.has(account.id)) {
      console.log(`Gmail polling already running for account ${account.id}`);
      return;
    }

    console.log(`Initializing Gmail polling for account ${account.id}`);

    // Poll every 60 seconds
    const interval = setInterval(() => {
      this.pollNewEmails(account.id, account.organizationId).catch((err) => {
        console.error(`Gmail polling error for account ${account.id}:`, err);
      });
    }, 60 * 1000);

    this.pollingIntervals.set(account.id, interval);
  }

  /**
   * Syncs historical emails for all major folders.
   */
  async syncHistoricalEmails(accountId: string): Promise<void> {
    const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
    if (!account) return;

    console.log(`Starting historical sync for Gmail account ${accountId}`);
    try {
      const accessToken = await getValidAccessToken(accountId);

      const folders = [
        { labelId: 'INBOX', folder: 'INBOX' },
        { labelId: 'SENT', folder: 'SENT' },
        { labelId: 'TRASH', folder: 'TRASH' },
        { labelId: 'SPAM', folder: 'SPAM' },
      ];

      // 90 days ago cutoff for initial sync
      // const ninetyDaysAgo = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
      // const q = `after:${ninetyDaysAgo}`;

      for (const { labelId, folder } of folders) {
        let pageToken: string | undefined = undefined;
        do {
          const result = await fetchMessagesList(accessToken, {
            labelIds: [labelId],
            maxResults: 50,
            pageToken,
            // q,
          });

          if (result.messages && result.messages.length > 0) {
            console.log(`Fetched ${result.messages.length} messages for ${folder} (Account ${accountId})`);

            // Process in batches of 10 for concurrency
            const batchSize = 10;
            for (let i = 0; i < result.messages.length; i += batchSize) {
              const batch = result.messages.slice(i, i + batchSize);
              await Promise.all(
                batch.map((msg: any) =>
                  this.fetchAndPersist(accessToken, accountId, account.organizationId, msg.id, folder, true)
                )
              );
            }
          }
          pageToken = result.nextPageToken;
        } while (pageToken);
      }
    } catch (error) {
      console.error(`Failed historical sync for Gmail account ${accountId}:`, error);
    }
  }

  /**
   * Polls for new emails since the last sync.
   */
  private async pollNewEmails(accountId: string, organizationId: string): Promise<void> {
    try {
      const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
      if (!account || !account.isActive) {
        this.destroyAccount(accountId);
        return;
      }

      const accessToken = await getValidAccessToken(accountId);

      // Query messages newer than the last synced timestamp, or just unread INBOX messages.
      // To catch all new things safely without missing, we can use history API or a date query.
      // For simplicity, let's query the INBOX for recent messages.
      const q = account.lastSyncedAt
        ? `after:${Math.floor(account.lastSyncedAt.getTime() / 1000)}`
        : '';

      const result = await fetchMessagesList(accessToken, {
        labelIds: ['INBOX'],
        maxResults: 50,
        q,
      });

      if (result.messages && result.messages.length > 0) {
        console.log(`Poll: Found ${result.messages.length} new messages for account ${accountId}`);
        for (const msg of result.messages) {
          await this.fetchAndPersist(accessToken, accountId, organizationId, msg.id, 'INBOX');
        }
      }

      await prisma.emailAccount.update({
        where: { id: accountId },
        data: {
          lastSyncedAt: new Date(),
          ...(account.initialSyncCompletedAt ? {} : { initialSyncCompletedAt: new Date() })
        }
      });

    } catch (error) {
      console.error(`Polling failed for account ${accountId}:`, error);
    }
  }

  private async fetchAndPersist(
    accessToken: string,
    accountId: string,
    organizationId: string,
    gmailMessageId: string,
    folder: string,
    skipNotifications: boolean = false
  ): Promise<void> {
    try {
      // Check if we already have it using the gmailMessageId.
      // However, our database unique constraint is on `messageId` (which is the RFC822 Message-ID).
      // We will parse the email to get the RFC822 Message-ID.
      const fullMessage = await fetchMessageFull(accessToken, gmailMessageId);
      const rawBuffer = await fetchMessageRaw(accessToken, gmailMessageId);
      const parsed = await parseEmail(rawBuffer);

      // We can use the hex string of the Gmail ID as uid, but it's easier to just convert the first 15 chars to BigInt
      // Gmail IDs are typically 16 chars hex, e.g., 18e6e87b9a9f
      let uid: bigint | null = null;
      try {
        uid = BigInt('0x' + gmailMessageId);
      } catch (e) {
        uid = null;
      }

      const threadId = await resolveThreadId(
        parsed.messageId,
        parsed.inReplyTo,
        parsed.referencesHeader,
        organizationId
      );

      let finalFolder = folder;
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

      // Read attachment metadata before the transaction so filesystem work does
      // not consume Prisma's interactive transaction timeout.
      const existingEmail = await prisma.email.findUnique({
        where: {
          accountId_messageId: {
            accountId,
            messageId: parsed.messageId,
          },
        },
        select: {
          attachments: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              filename: true,
              contentType: true,
              sizeBytes: true,
              storagePath: true,
              cid: true,
              ordinal: true,
              imapPart: true,
              gmailAttachmentId: true,
            },
          },
        },
      });

      const existingAttachments = existingEmail?.attachments ?? [];
      const reconciledAttachments = buildReceivedAttachmentMetadata(
        parsed.attachments,
        existingAttachments,
        extractGmailAttachmentReferences(fullMessage.payload)
      );

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
            providerMessageId: gmailMessageId,
            uid,
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
          update: {
            providerMessageId: gmailMessageId,
            uid,
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
        });

        await tx.emailBody.upsert({
          where: { emailId: email.id },
          create: {
            emailId: email.id,
            bodyHtml: parsed.bodyHtml,
            bodyText: parsed.bodyText,
          },
          update: {
            bodyHtml: parsed.bodyHtml,
            bodyText: parsed.bodyText,
          },
        });

        for (const attachment of reconciledAttachments) {
          if (attachment.existing) {
            await tx.attachment.update({
              where: { id: attachment.id },
              data: {
                filename: attachment.filename,
                contentType: attachment.contentType,
                sizeBytes: attachment.sizeBytes,
                storagePath: attachment.storagePath,
                ordinal: attachment.ordinal,
                imapPart: attachment.imapPart,
                gmailAttachmentId: attachment.gmailAttachmentId,
                cid: attachment.cid,
              },
            });
          } else {
            await tx.attachment.create({
              data: {
                id: attachment.id,
                emailId: email.id,
                filename: attachment.filename,
                contentType: attachment.contentType,
                sizeBytes: attachment.sizeBytes,
                storagePath: attachment.storagePath,
                ordinal: attachment.ordinal,
                imapPart: attachment.imapPart,
                gmailAttachmentId: attachment.gmailAttachmentId,
                cid: attachment.cid,
              },
            });
          }
        }

        await tx.attachment.deleteMany({
          where: {
            emailId: email.id,
            id: {
              notIn: reconciledAttachments.map((attachment) => attachment.id),
            },
          },
        });

        return email;
      }, { timeout: 30_000 });

      // Avoid re-triggering events if the email already existed.
      // Upsert returns the record either way. In a robust system, we check createdAt.
      // Assuming if it's within the last few seconds it's new.
      const isNew = email.createdAt.getTime() > Date.now() - 5000;

      if (isNew) {
        await searchQueue.add('index-email', { emailId: email.id });

        // Run automated email rules (skip on historical syncs)
        if (!skipNotifications && folder === 'INBOX') {
          processRulesForNewEmail(email.id, accountId, organizationId).catch((ruleErr) => {
            console.error(`[Gmail] Failed to process email rules for email ${email.id}:`, ruleErr);
          });
        }

        // Trigger SSE & Push notifications only if not skipping
        if (!skipNotifications) {
          await redis.publish(
            `new_email:${organizationId}`,
            JSON.stringify({
              event: 'new_email',
              accountId,
              messageId: parsed.messageId,
              subject: parsed.subject,
              from: parsed.fromAddress,
              folder,
            })
          );

          if (folder === 'INBOX') {
            try {
              await sendAccountPushNotification({
                organizationId,
                accountId,
                title: `New email from ${parsed.fromAddress}`,
                body: parsed.subject || 'No Subject',
                url: '/inbox',
              });
            } catch (err) {
              console.error('Failed to send Web Push:', err);
            }
          }
        }
      }
    } catch (error) {
      console.error(`Failed to fetch/persist Gmail message ${gmailMessageId} for account ${accountId}:`, error);
    }
  }

  destroyAccount(accountId: string): void {
    const interval = this.pollingIntervals.get(accountId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(accountId);
      console.log(`Stopped Gmail polling for account ${accountId}`);
    }
  }

  async shutdown(): Promise<void> {
    console.log(`Shutting down Gmail Sync Manager (${this.pollingIntervals.size} connections)`);
    for (const [accountId, interval] of this.pollingIntervals.entries()) {
      clearInterval(interval);
    }
    this.pollingIntervals.clear();
  }
}

export const gmailSyncManager = new GmailSyncManager();
