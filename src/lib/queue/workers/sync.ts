import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { redis as pubsubRedis } from '@/lib/redis';
import { prisma } from '@/lib/db/prisma';
import { imapManager } from '@/lib/imap/connection-manager';
import { gmailSyncManager } from '@/lib/gmail/sync-manager';

const workerRedis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy(times) {
    console.warn(`Redis connection lost. Retrying in worker (attempt ${times})...`);
    return Math.min(times * 100, 3000); // Reconnect after max 3 seconds
  }
});

export interface SyncJobPayload {
  accountId: string;
  folder: string; // 'ALL', 'INBOX', 'SENT', 'DRAFTS', 'TRASH'
}

export const syncWorker = new Worker<SyncJobPayload>(
  'imap-sync',
  async (job: Job<SyncJobPayload>) => {
    const { accountId, folder } = job.data;
    
    console.log(`Starting sync for account ${accountId}, folder: ${folder}`);
    
    if (job.name === 'initial-sync' || folder === 'ALL') {
      console.log('Fetching account from prisma...');
      const account = await prisma.emailAccount.findUnique({
        where: { id: accountId }
      });
      console.log('Fetched account from prisma.');
      
      if (!account) return;
      
      if (account.provider === 'gmail') {
        // Use Gmail API manager
        console.log(`Worker: Initializing Gmail polling for account ${accountId} before sync`);
        await gmailSyncManager.initializeAccount(account as any);
        
        await gmailSyncManager.syncHistoricalEmails(accountId);
      } else {
        // Use standard IMAP manager
        const status = imapManager.getStatus().find((s) => s.accountId === accountId);
        if (!status || !status.isConnected) {
          console.log(`Worker: Initializing IMAP connection for account ${accountId} before sync`);
          await imapManager.initializeAccount(account as any);
        }
        
        // Perform the real historical sync
        await imapManager.syncHistoricalEmails(accountId);
      }
      
      // Update account sync timestamp
      await prisma.emailAccount.update({
        where: { id: accountId },
        data: { 
          lastSyncedAt: new Date(),
          ...(account.initialSyncCompletedAt ? {} : { initialSyncCompletedAt: new Date() })
        }
      });
      
      // Trigger SSE to refresh UI instantly
      await pubsubRedis.publish(
        `new_email:${account.organizationId}`,
        JSON.stringify({
          event: 'initial_sync_complete',
          accountId,
          folder: 'ALL',
        })
      );
      
      console.log(`Completed initial historical sync for account ${accountId}`);
    } else {
      // Future granular syncs logic
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    
    console.log(`Completed sync for account ${accountId}, folder: ${folder}`);
  },
  {
    connection: workerRedis as any,
    concurrency: 5,
  }
);

syncWorker.on('failed', (job, err) => {
  console.error(`Sync job ${job?.id} failed:`, err.message);
});
