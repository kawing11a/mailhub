import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import {
  createAttachmentRecoveryProducer,
  enqueueAttachmentDownload,
  getAttachmentDownloadJobId,
} from '@/lib/queue/client';

const PAGE_SIZE = 100;
const DEFAULT_RECOVERY_INTERVAL_MS = 5 * 60 * 1000;
const MIN_LEASE_MS = 30_000;
const REDIS_COMMAND_TIMEOUT_MS = 10_000;
const RELEASE_RECOVERY_LEASE = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;

type RecoveryProducer = ReturnType<typeof createAttachmentRecoveryProducer>;

let stopCurrentRecovery: (() => Promise<void>) | undefined;

function findEligibleAttachments(lastSeenId: string | undefined) {
  return prisma.attachment.findMany({
    where: {
      ...(lastSeenId !== undefined && { id: { gt: lastSeenId } }),
      storagePath: null,
      email: { folder: { notIn: ['SENT', 'DRAFTS'] } },
      OR: [
        {
          imapPart: { not: '' },
          email: { uid: { gt: 0 }, folder: { not: '' } },
        },
        {
          email: { providerMessageId: { not: '' } },
          AND: [
            { OR: [{ imapPart: null }, { imapPart: '' }] },
            { OR: [{ gmailAttachmentId: { not: '' } }, { ordinal: { gte: 0 } }] },
          ],
        },
      ],
    },
    select: { id: true },
    orderBy: { id: 'asc' },
    take: PAGE_SIZE,
  });
}

async function reconcileAttachmentDownload(
  queue: RecoveryProducer['queue'],
  { attachmentId, intervalMs, retryBy }: { attachmentId: string; intervalMs: number; retryBy: number },
) {
  const jobId = getAttachmentDownloadJobId(attachmentId);
  const job = await queue.getJob(jobId);
  if (!job) {
    await enqueueAttachmentDownload(attachmentId, queue);
    return 'enqueued';
  }

  if (!job.finishedOn || job.finishedOn > Date.now() - intervalMs) return;

  const state = await job.getState();
  if (state !== 'completed' && state !== 'failed') return;
  if (performance.now() >= retryBy) return;

  try {
    await job.retry(state, { resetAttemptsMade: true, resetAttemptsStarted: true });
    return 'retried';
  } catch (error) {
    // BullMQ exposes the two reprocess conflicts as plain Errors.
    if (
      !(error instanceof Error) ||
      (error.message !== `Missing key for job ${jobId}. reprocessJob` &&
        error.message !== `Job ${jobId} is not in the ${state} state. reprocessJob`)
    ) {
      throw error;
    }

    if (await job.getState() === state) throw error;
  }
}

async function reconcileWithLease(
  { queue, redis }: RecoveryProducer,
  attachmentId: string,
  intervalMs: number,
) {
  const leaseKey = queue.toKey(`recovery-lease:${attachmentId}`);
  const ownerToken = randomUUID();
  const leaseMs = Math.max(intervalMs, MIN_LEASE_MS);
  // Reserve time for BullMQ's script call and ioredis's NOSCRIPT fallback.
  const retryBy = performance.now() + leaseMs - 2 * REDIS_COMMAND_TIMEOUT_MS;
  if (await redis.set(leaseKey, ownerToken, 'PX', leaseMs, 'NX') !== 'OK') return;

  try {
    return await reconcileAttachmentDownload(queue, { attachmentId, intervalMs, retryBy });
  } finally {
    await redis.eval(RELEASE_RECOVERY_LEASE, 1, leaseKey, ownerToken);
  }
}

export function startAttachmentDownloadRecovery(): () => Promise<void> {
  if (stopCurrentRecovery) return stopCurrentRecovery;

  const intervalMs = DEFAULT_RECOVERY_INTERVAL_MS;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function runPass(): Promise<void> {
    const startedAt = Date.now();
    const counts = { scanned: 0, enqueued: 0, retried: 0 };
    let lastSeenId: string | undefined;

    try {
      const producer = createAttachmentRecoveryProducer(REDIS_COMMAND_TIMEOUT_MS);
      try {
        await producer.queue.waitUntilReady();
        while (!stopped) {
          const attachments = await findEligibleAttachments(lastSeenId);
          for (const { id } of attachments) {
            if (stopped) break;

            lastSeenId = id;
            counts.scanned++;
            const action = await reconcileWithLease(producer, id, intervalMs);
            if (action) counts[action]++;
          }

          if (attachments.length < PAGE_SIZE) break;
        }
      } finally {
        producer.redis.disconnect();
        await producer.queue.close();
      }

      if (counts.scanned > 0) {
        console.info('Attachment download recovery scan finished', {
          ...counts,
          elapsedMs: Date.now() - startedAt,
        });
      }
    } catch (error) {
      console.error('Attachment download recovery scan failed', {
        ...counts,
        elapsedMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorCode: error instanceof Error && 'code' in error && typeof error.code === 'string'
          ? error.code
          : undefined,
      });
    } finally {
      if (!stopped) {
        timer = setTimeout(() => {
          activePass = runPass();
        }, intervalMs);
      }
    }
  }

  let activePass = runPass();

  const stop = async () => {
    stopped = true;
    clearTimeout(timer);
    await activePass;
    if (stopCurrentRecovery === stop) stopCurrentRecovery = undefined;
  };

  stopCurrentRecovery = stop;
  return stop;
}
