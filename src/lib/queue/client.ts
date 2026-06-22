import { Queue, QueueOptions } from 'bullmq';
import { redis } from '@/lib/redis';

const defaultOptions: QueueOptions = {
  connection: redis as any,
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

export async function closeQueues() {
  await Promise.all([
    syncQueue.close(),
    searchQueue.close(),
    emailSendQueue.close(),
    workerHealthQueue.close(),
  ]);
}
