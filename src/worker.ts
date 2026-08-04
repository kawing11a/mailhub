import { config } from 'dotenv';
config();

import { imapManager } from '@/lib/imap/connection-manager';
import { prisma } from '@/lib/db/prisma';
import { redis } from '@/lib/redis';
import { initMeilisearch } from '@/lib/search/meilisearch';
import { syncWorker } from '@/lib/queue/workers/sync';
import { searchWorker } from '@/lib/queue/workers/search';
import { summaryWorker } from '@/lib/queue/workers/summary';
import { gmailSyncManager } from '@/lib/gmail/sync-manager';

const WORKER_PARTITION = process.env.WORKER_PARTITION || 'default';

async function bootstrap() {
  console.log(`Bootstrapping Worker [Partition: ${WORKER_PARTITION}]`);

  // 1. Initialize dependencies
  console.log('API KEY BEING USED:', process.env.MEILISEARCH_API_KEY);
  await initMeilisearch();

  // 2. Fetch accounts assigned to this partition
  const accounts = await prisma.emailAccount.findMany({
    where: {
      isActive: true,
      ...(WORKER_PARTITION !== 'default' && { workerPartition: WORKER_PARTITION }),
    },
  });
  console.log(`Found ${accounts.length} accounts to monitor.`);

  // After initializing connections, enqueue initial sync for each account
  const { syncQueue } = await import('@/lib/queue/client');
  for (const account of accounts) {
    await syncQueue.add('initial-sync', { accountId: account.id, folder: 'ALL' });
  }

  // 3. Setup heartbeat mechanism
  const heartbeat = setInterval(async () => {
    try {
      await redis.set(`worker:${WORKER_PARTITION}:heartbeat`, Date.now(), 'EX', 60);
    } catch (e) {
      console.error('Failed to send worker heartbeat:', e);
    }
  }, 30000);

  // 4. Workers are already imported and running from queue/workers/*
  console.log('BullMQ workers started.');

  // 5. Graceful shutdown handler
  const shutdown = async () => {
    console.log('SIGTERM received. Shutting down worker...');
    clearInterval(heartbeat);
    await syncWorker.close();
    await searchWorker.close();
    await summaryWorker.close();
    await imapManager.shutdown();
    await gmailSyncManager.shutdown();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch(console.error);
