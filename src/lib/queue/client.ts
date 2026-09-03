import { Queue, QueueOptions } from 'bullmq';
import Redis from 'ioredis';
import { getInitialSyncJobId, getSyncQueueName } from '@/lib/queue/identifiers';

export { getInitialSyncJobId, getSyncQueueName } from '@/lib/queue/identifiers';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const defaultOptions: QueueOptions = {
  connection: new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy(times) {
      console.warn(`Redis connection lost. Retrying in queue client (attempt ${times})...`);
      return Math.min(times * 100, 3000);
    }
  }) as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000, // 2s, 4s, 8s
    },
    removeOnComplete: 100, // Keep last 100 completed
    removeOnFail: 500,     // Keep last 500 failed
  },
};

// Queues
export const syncQueue = new Queue('imap-sync', defaultOptions);
export const searchQueue = new Queue('search-index', defaultOptions);
export const emailSendQueue = new Queue('email-send', defaultOptions);
export const workerHealthQueue = new Queue('worker-health', defaultOptions);
export const summaryQueue = new Queue('email-summary', defaultOptions);

const partitionSyncQueues = new Map<string, Queue>();

export interface SyncAccountTarget {
  id: string;
  workerPartition: string | null;
}

export function getSyncQueue(workerPartition: string | null | undefined): Queue {
  const partition = workerPartition || 'default';
  const existingQueue = partitionSyncQueues.get(partition);
  if (existingQueue) return existingQueue;

  const queue = new Queue(getSyncQueueName(partition), defaultOptions);
  partitionSyncQueues.set(partition, queue);
  return queue;
}

export async function enqueueInitialSync(account: SyncAccountTarget): Promise<void> {
  await getSyncQueue(account.workerPartition).add(
    'initial-sync',
    {
      accountId: account.id,
      folder: 'ALL',
      workerPartition: account.workerPartition || 'default',
    },
    {
      jobId: getInitialSyncJobId(account.id),
      removeOnComplete: true,
      removeOnFail: true,
    }
  );
}

export async function closeQueues() {
  await Promise.all([
    syncQueue.close(),
    searchQueue.close(),
    emailSendQueue.close(),
    workerHealthQueue.close(),
    summaryQueue.close(),
    ...Array.from(partitionSyncQueues.values()).map((queue) => queue.close()),
  ]);
}
