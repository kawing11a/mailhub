import { mkdir, writeFile } from 'fs/promises';
import * as path from 'path';
import { Job, Worker } from 'bullmq';
import type { QueueOptions } from 'bullmq';
import Redis from 'ioredis';
import { prisma } from '@/lib/db/prisma';
import {
  AttachmentNotFoundError,
  getReceivedAttachment,
} from '@/lib/email/attachment-retrieval';

interface AttachmentDownloadPayload {
  attachmentId: string;
}

const workerRedis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy(times) {
    console.warn(`Redis connection lost. Retrying in attachment worker (attempt ${times})...`);
    return Math.min(times * 100, 3000);
  },
});

export const attachmentDownloadWorker = new Worker<AttachmentDownloadPayload>(
  'attachment-download',
  async (job: Job<AttachmentDownloadPayload>) => {
    const { attachmentId } = job.data;
    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: { id: true, emailId: true, storagePath: true },
    });

    if (!attachment || attachment.storagePath) return;

    let retrieved: Awaited<ReturnType<typeof getReceivedAttachment>>;
    try {
      retrieved = await getReceivedAttachment(attachment.emailId, attachmentId);
    } catch (error) {
      if (error instanceof AttachmentNotFoundError) return;
      throw error;
    }
    const storagePath = path.join(process.cwd(), '.storage', 'attachments', attachmentId);
    await mkdir(path.dirname(storagePath), { recursive: true });
    await writeFile(storagePath, retrieved.content);

    await prisma.attachment.update({
      where: { id: attachmentId },
      data: { storagePath, sizeBytes: retrieved.sizeBytes },
    });
  },
  {
    connection: workerRedis as unknown as QueueOptions['connection'],
    concurrency: 5,
  }
);

attachmentDownloadWorker.on('failed', (job, error) => {
  console.error(
    `Attachment download ${job?.data.attachmentId ?? job?.id} failed ` +
      `(attempt ${job?.attemptsMade ?? 0}):`,
    error.message
  );
});
