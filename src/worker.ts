import { config } from 'dotenv';
config();

import { imapManager } from '@/lib/imap/connection-manager';
import { prisma } from '@/lib/db/prisma';
import { redis } from '@/lib/redis';
import { initMeilisearch } from '@/lib/search/meilisearch';
import { syncWorker } from '@/lib/queue/workers/sync';
import { searchWorker } from '@/lib/queue/workers/search';

const WORKER_PARTITION = process.env.WORKER_PARTITION || 'default';
const HEARTBEAT_INTERVAL_MS = 30000;

async function bootstrap() {
  console.log(`Bootstrapping Worker [Partition: ${WORKER_PARTITION}]`);

  // 1. Initialize dependencies
  await initMeilisearch();

  // 2. Fetch accounts assigned to this partition (or all if 'default' / single-instance mode)
  const accounts = await prisma.emailAccount.findMany({
    where: {
      isActive: true,
      ...(WORKER_PARTITION !== 'default' && { workerPartition: WORKER_PARTITION }),
    },
  });

  console.log(`Found ${accounts.length} accounts to monitor.`);

  // 3. Initialize IMAP connections for all assigned accounts
  for (const account of accounts) {
    await imapManager.initializeAccount(account);
  }

  // 4. Start heartbeat
  setInterval(async () => {
    try {
      await redis.set(`worker:${WORKER_PARTITION}:heartbeat`, Date.now(), 'EX', 60);
    } catch (err) {
      console.error('Failed to send heartbeat:', err);
    }
  }, HEARTBEAT_INTERVAL_MS);

  // 5. Workers are already imported and running from queue/workers/*
  console.log('BullMQ workers started.');
}

bootstrap().catch(console.error);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down worker...');
  await imapManager.shutdown();
  await syncWorker.close();
  await searchWorker.close();
  await redis.quit();
  process.exit(0);
});
