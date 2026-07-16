import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { meilisearch } from '@/lib/search/meilisearch';
import { prisma } from '@/lib/db/prisma';

const workerRedis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy(times) {
    console.warn(`Redis connection lost. Retrying in search worker (attempt ${times})...`);
    return Math.min(times * 100, 3000); // Reconnect after max 3 seconds
  }
});

export interface SearchIndexPayload {
  emailId: string;
}

export const searchWorker = new Worker<SearchIndexPayload>(
  'search-index',
  async (job: Job<SearchIndexPayload>) => {
    const { emailId } = job.data;
    
    // Fetch email details
    const email = await prisma.email.findUnique({
      where: { id: emailId },
      include: {
        body: true,
        account: { select: { organizationId: true } },
        emailLabels: { select: { labelId: true } }
      }
    });

    if (!email) {
      console.warn(`Email ${emailId} not found, skipping index.`);
      return;
    }

    const document = {
      id: email.id,
      accountId: email.accountId,
      organizationId: email.account.organizationId,
      messageId: email.messageId,
      threadId: email.threadId,
      folder: email.folder,
      subject: email.subject,
      snippet: email.snippet,
      fromAddress: email.fromAddress,
      fromName: email.fromName,
      toAddresses: email.toAddresses, // JSON array string or array of objects
      isRead: email.isRead,
      isStarred: email.isStarred,
      hasAttachments: email.hasAttachments,
      labelIds: email.emailLabels.map(l => l.labelId),
      receivedAt: email.receivedAt?.getTime() || 0,
      sentAt: email.sentAt?.getTime() || 0,
    };

    // Index into Meilisearch
    await meilisearch.index('emails').addDocuments([document], { primaryKey: 'id' });
    
    console.log(`Indexed email ${emailId} in Meilisearch.`);
  },
  {
    connection: workerRedis as any,
    concurrency: 15, // Allow up to 15 parallel indexing jobs
  }
);

searchWorker.on('failed', (job, err) => {
  console.error(`Search index job ${job?.id} failed:`, err.message);
});
