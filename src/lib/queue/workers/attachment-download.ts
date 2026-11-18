import { mkdir, rename, rm, stat, writeFile } from 'fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import * as path from 'path';
import { Job, Worker } from 'bullmq';
import type { QueueOptions } from 'bullmq';
import Redis from 'ioredis';
import { prisma } from '@/lib/db/prisma';
import {
  AttachmentNotFoundError,
  getReceivedAttachment,
} from '@/lib/email/attachment-retrieval';
import { storedAttachmentFileExists } from '@/lib/email/attachment-storage';

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
      select: {
        id: true,
        emailId: true,
        storagePath: true,
        sizeBytes: true,
        imapPart: true,
        gmailAttachmentId: true,
        ordinal: true,
        email: {
          select: {
            accountId: true,
            providerMessageId: true,
            uid: true,
            folder: true,
          },
        },
      },
    });

    if (!attachment) return;
    if (await storedAttachmentFileExists(attachment.storagePath, attachment.sizeBytes)) return;

    const sourceKey = createHash('sha256')
      .update(JSON.stringify([
        attachment.email.accountId,
        attachment.email.providerMessageId,
        attachment.email.uid?.toString() ?? null,
        attachment.email.folder,
        attachment.imapPart,
        attachment.gmailAttachmentId,
        attachment.ordinal,
        attachment.sizeBytes,
      ]))
      .digest('hex');
    const storagePath = path.join(
      process.cwd(),
      '.storage',
      'attachments-v2',
      attachmentId,
      sourceKey
    );

    if (await storedAttachmentFileExists(storagePath, attachment.sizeBytes)) {
      const savedFile = await stat(storagePath);
      await persistAttachmentPath(attachment, storagePath, savedFile.size);
      return;
    }

    let retrieved: Awaited<ReturnType<typeof getReceivedAttachment>>;
    try {
      retrieved = await getReceivedAttachment(attachment.emailId, attachmentId, {
        skipStoredFile: true,
        expectedSource: {
          ...attachment.email,
          imapPart: attachment.imapPart,
          gmailAttachmentId: attachment.gmailAttachmentId,
          ordinal: attachment.ordinal,
        },
      });
    } catch (error) {
      if (error instanceof AttachmentNotFoundError) return;
      throw error;
    }
    const temporaryPath = `${storagePath}.${randomUUID()}.tmp`;
    await mkdir(path.dirname(storagePath), { recursive: true });
    if (attachment.sizeBytes !== null && retrieved.content.length !== attachment.sizeBytes) {
      throw new Error('Downloaded attachment size does not match the expected size');
    }

    try {
      await writeFile(temporaryPath, retrieved.content, { flag: 'wx' });
      await rename(temporaryPath, storagePath);

      const savedFile = await stat(storagePath);
      if (!savedFile.isFile() || savedFile.size !== retrieved.content.length) {
        throw new Error('Saved attachment file failed verification');
      }

      await persistAttachmentPath(attachment, storagePath, retrieved.sizeBytes);
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  },
  {
    connection: workerRedis as unknown as QueueOptions['connection'],
    concurrency: 5,
  }
);

async function persistAttachmentPath(
  attachment: {
    id: string;
    storagePath: string | null;
    sizeBytes: number | null;
    imapPart: string | null;
    gmailAttachmentId: string | null;
    ordinal: number | null;
    email: {
      accountId: string;
      providerMessageId: string | null;
      uid: bigint | null;
      folder: string;
    };
  },
  storagePath: string,
  sizeBytes: number
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.attachment.updateMany({
      where: {
        id: attachment.id,
        storagePath: attachment.storagePath,
        sizeBytes: attachment.sizeBytes,
        imapPart: attachment.imapPart,
        gmailAttachmentId: attachment.gmailAttachmentId,
        ordinal: attachment.ordinal,
        email: {
          is: {
            accountId: attachment.email.accountId,
            providerMessageId: attachment.email.providerMessageId,
            uid: attachment.email.uid,
            folder: attachment.email.folder,
          },
        },
      },
      data: { storagePath, sizeBytes },
    });

    if (updated.count !== 1) {
      throw new Error('Attachment changed while its file was being saved');
    }

    const committedFile = await stat(storagePath);
    if (!committedFile.isFile() || committedFile.size !== sizeBytes) {
      throw new Error('Saved attachment file failed verification before commit');
    }
  });
}

attachmentDownloadWorker.on('failed', (job, error) => {
  console.error(
    `Attachment download ${job?.data.attachmentId ?? job?.id} failed ` +
      `(attempt ${job?.attemptsMade ?? 0}):`,
    error.message
  );
});
