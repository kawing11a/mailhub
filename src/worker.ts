import { config } from 'dotenv';
config();

import { imapManager } from '@/lib/imap/connection-manager';
import { prisma } from '@/lib/db/prisma';
import { redis } from '@/lib/redis';
import { configureEmailEmbedder, initMeilisearch } from '@/lib/search/meilisearch';
import { getSystemPreferences } from '@/lib/settings/system-preferences';
import { closeSyncWorkers, ensureSyncWorkersForPartitions } from '@/lib/queue/workers/sync';
import { searchWorker } from '@/lib/queue/workers/search';
import { summaryWorker } from '@/lib/queue/workers/summary';
import { gmailSyncManager } from '@/lib/gmail/sync-manager';

const WORKER_PARTITION = process.env.WORKER_PARTITION || 'default';
const IMAP_STARTUP_CONCURRENCY = (() => {
  const value = Number(process.env.IMAP_STARTUP_CONCURRENCY);
  return Number.isInteger(value) && value > 0 ? value : 10;
})();

/** Open mailbox listeners promptly; historical sync is queued separately. */
async function initializeImapConnections(accounts: any[]): Promise<void> {
  const imapAccounts = accounts.filter((account) => account.provider !== 'gmail');
  let nextAccount = 0;

  const initializeBatch = async () => {
    while (nextAccount < imapAccounts.length) {
      const account = imapAccounts[nextAccount++];
      try {
        await imapManager.initializeAccount(account);
      } catch (error) {
        // The initial-sync job will retry historical work and connection setup.
        // One unavailable account must not delay monitoring for the other 199.
        console.error(`Failed to initialize IMAP listener for account ${account.id}:`, error);
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(IMAP_STARTUP_CONCURRENCY, imapAccounts.length) },
      () => initializeBatch()
    )
  );
}

async function bootstrap() {
  console.log(`Bootstrapping Worker [Partition: ${WORKER_PARTITION}]`);

  // 1. Initialize dependencies
  console.log('API KEY BEING USED:', process.env.MEILISEARCH_API_KEY);
  await initMeilisearch();
  const systemPreferences = await getSystemPreferences();
  await configureEmailEmbedder(systemPreferences.semanticSearchEnabled);

  // 2. Fetch accounts assigned to this partition
  const accounts = await prisma.emailAccount.findMany({
    where: {
      isActive: true,
      ...(WORKER_PARTITION !== 'default' && { workerPartition: WORKER_PARTITION }),
    },
  });
  console.log(`Found ${accounts.length} accounts to monitor.`);

  if (WORKER_PARTITION === 'default') {
    ensureSyncWorkersForPartitions(accounts.map((account) => account.workerPartition));
  }

  // Establish IDLE listeners before the serial historical jobs. Otherwise an
  // account later in a 200-account queue cannot receive new mail until all
  // earlier backfills finish.
  await initializeImapConnections(accounts);

  // After initializing connections, enqueue initial sync for each account
  const { enqueueInitialSync } = await import('@/lib/queue/client');
  for (const account of accounts) {
    await enqueueInitialSync(account);
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
    await closeSyncWorkers();
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
