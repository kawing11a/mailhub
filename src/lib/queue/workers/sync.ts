import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { redis as pubsubRedis } from '@/lib/redis';
import { prisma } from '@/lib/db/prisma';
import { imapManager } from '@/lib/imap/connection-manager';
import { gmailSyncManager } from '@/lib/gmail/sync-manager';
import { IncompleteSyncError } from '@/lib/sync-result';
import { runtimeConfig } from '@/lib/runtime-config';
import { enqueueInitialSync, getSyncQueueName } from '@/lib/queue/client';

const WORKER_PARTITION = process.env.WORKER_PARTITION || 'default';
const LEGACY_SYNC_QUEUE_NAME = 'imap-sync';

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
  // Legacy imap-sync jobs did not include this. DB ownership remains authoritative.
  workerPartition?: string;
}

const IMAP_CONNECTION_WAIT_MS = 30_000;

async function waitForImapConnection(accountId: string): Promise<boolean> {
  const deadline = Date.now() + IMAP_CONNECTION_WAIT_MS;

  while (Date.now() < deadline) {
    const status = imapManager.getStatus().find((entry) => entry.accountId === accountId);
    if (status?.isConnected) return true;

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return false;
}

async function processSyncJob(
  job: Job<SyncJobPayload>,
  isLegacyQueue: boolean,
  workerPartition: string
): Promise<void> {
    const { accountId, folder } = job.data;
    
    console.log(`Starting sync for account ${accountId}, folder: ${folder}`);
    
    if (job.name === 'initial-sync' || folder === 'ALL') {
      console.log('Fetching account from prisma...');
      const account = await prisma.emailAccount.findUnique({
        where: { id: accountId }
      });
      console.log('Fetched account from prisma.');
      
      if (!account) return;

      const accountPartition = account.workerPartition || 'default';
      if (isLegacyQueue || accountPartition !== workerPartition) {
        console.log(
          `Forwarding sync for account ${accountId} from ${
            isLegacyQueue ? 'legacy queue' : `worker ${workerPartition}`
          } to ${accountPartition}`
        );
        await enqueueInitialSync(account);
        return;
      }
      
      if (account.provider === 'gmail') {
        const result = await gmailSyncManager.syncHistoricalEmails(accountId);
        if (result.failed > 0) {
          throw new IncompleteSyncError(accountId, result);
        }
      } else {
        // Use standard IMAP manager
        const status = imapManager.getStatus().find((s) => s.accountId === accountId);
        if (!status || !status.isConnected) {
          console.log(`Worker: Initializing IMAP connection for account ${accountId} before sync`);
          await imapManager.initializeAccount(account as any);
        }

        if (!(await waitForImapConnection(accountId))) {
          throw new Error(`IMAP connection was not ready for account ${accountId}; historical sync was not started.`);
        }
        
        // Perform the real historical sync
        const result = await imapManager.syncHistoricalEmails(accountId);
        if (result.failed > 0) {
          throw new IncompleteSyncError(accountId, result);
        }
      }
      
      // Update account sync timestamp
      await prisma.emailAccount.update({
        where: { id: accountId },
        data: { 
          lastSyncedAt: new Date(),
          ...(account.initialSyncCompletedAt ? {} : { initialSyncCompletedAt: new Date() })
        }
      });

      if (account.provider === 'gmail') {
        console.log(`Worker: Starting Gmail polling for account ${accountId} after historical sync`);
        await gmailSyncManager.initializeAccount(account as any);
      } else {
        imapManager.enableReconciliation(accountId);
      }
      
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
}

const createSyncWorker = (queueName: string, workerPartition: string, isLegacyQueue = false) =>
  new Worker<SyncJobPayload>(
    queueName,
    (job) => processSyncJob(job, isLegacyQueue, workerPartition),
    {
      connection: workerRedis as any,
      concurrency: runtimeConfig.syncWorkerConcurrency,
    }
  );

const partitionSyncWorkers = new Map<string, Worker<SyncJobPayload>>();

function getOrCreateSyncWorker(workerPartition: string): Worker<SyncJobPayload> {
  const existingWorker = partitionSyncWorkers.get(workerPartition);
  if (existingWorker) return existingWorker;

  const worker = createSyncWorker(getSyncQueueName(workerPartition), workerPartition);
  partitionSyncWorkers.set(workerPartition, worker);
  worker.on('failed', (job, err) => {
    console.error(`Sync job ${job?.id} failed:`, err.message);
  });
  return worker;
}

export const syncWorker = getOrCreateSyncWorker(WORKER_PARTITION);
export const legacySyncWorker = createSyncWorker(LEGACY_SYNC_QUEUE_NAME, 'legacy', true);

export function ensureSyncWorkersForPartitions(partitions: Iterable<string | null | undefined>): void {
  if (WORKER_PARTITION !== 'default') return;

  for (const partition of partitions) {
    getOrCreateSyncWorker(partition || 'default');
  }
}

export async function closeSyncWorkers(): Promise<void> {
  await Promise.all([
    ...Array.from(partitionSyncWorkers.values()).map((worker) => worker.close()),
    legacySyncWorker.close(),
  ]);
}

legacySyncWorker.on('failed', (job, err) => {
  console.error(`Sync job ${job?.id} failed:`, err.message);
});
