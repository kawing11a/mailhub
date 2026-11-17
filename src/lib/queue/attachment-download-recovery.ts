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

// Matches BullMQ 5.81.4's reprocessJob-8.lua for standalone attachment jobs.
// Recheck the hash fields, queue keys, and event/marker rules when upgrading BullMQ.
const RETRY_TERMINAL_ATTACHMENT = `
  local leaseKey, jobKey, terminalKey, waitKey, pausedKey, activeKey, markerKey, metaKey, eventsKey = unpack(KEYS)
  local ownerToken, finishedOn, jobId, previousState, pushCommand = unpack(ARGV)

  if redis.call('GET', leaseKey) ~= ownerToken or redis.call('HGET', jobKey, 'finishedOn') ~= finishedOn then
    return 0
  end
  if redis.call('ZREM', terminalKey, jobId) == 0 then
    return -1
  end

  local outcomeField = previousState == 'failed' and 'failedReason' or 'returnvalue'
  redis.call('HDEL', jobKey, 'finishedOn', 'processedOn', outcomeField, 'atm', 'ats')

  local paused, concurrency = unpack(redis.call('HMGET', metaKey, 'paused', 'concurrency'))
  redis.call(pushCommand, paused and pausedKey or waitKey, jobId)
  if not paused and (not concurrency or redis.call('LLEN', activeKey) < tonumber(concurrency)) then
    redis.call('ZADD', markerKey, 0, '0')
  end

  local maxEvents = redis.call('HGET', metaKey, 'opts.maxLenEvents')
  if not maxEvents then
    maxEvents = 10000
    redis.call('HSET', metaKey, 'opts.maxLenEvents', maxEvents)
  end
  redis.call('XADD', eventsKey, 'MAXLEN', '~', maxEvents, '*',
    'event', 'waiting', 'jobId', jobId, 'prev', previousState)
  return 1
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

async function reconcileWithLease(
  { queue, redis }: RecoveryProducer,
  attachmentId: string,
  intervalMs: number,
) {
  const leaseKey = queue.toKey(`recovery-lease:${attachmentId}`);
  const ownerToken = randomUUID();
  const leaseMs = Math.max(intervalMs, MIN_LEASE_MS);
  if (await redis.set(leaseKey, ownerToken, 'PX', leaseMs, 'NX') !== 'OK') return;

  try {
    const jobId = getAttachmentDownloadJobId(attachmentId);
    const job = await queue.getJob(jobId);
    if (!job) {
      await enqueueAttachmentDownload(attachmentId, queue);
      return 'enqueued';
    }

    const { finishedOn } = job;
    if (!finishedOn || finishedOn > Date.now() - intervalMs) return;

    const state = await job.getState();
    if (state !== 'completed' && state !== 'failed') return;

    const keys = [
      leaseKey,
      queue.toKey(jobId),
      queue.keys[state],
      queue.keys.wait,
      queue.keys.paused,
      queue.keys.active,
      queue.keys.marker,
      queue.keys.meta,
      queue.keys.events,
    ];
    const result = await redis.eval(
      RETRY_TERMINAL_ATTACHMENT,
      keys.length,
      ...keys,
      ownerToken,
      String(finishedOn),
      jobId,
      state,
      job.opts.lifo ? 'RPUSH' : 'LPUSH',
    );
    if (result === 1) return 'retried';
    if (result === 0) return;
    if (result === -1 && await job.getState() !== state) return;
    throw new Error('Unexpected attachment recovery retry result');
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
