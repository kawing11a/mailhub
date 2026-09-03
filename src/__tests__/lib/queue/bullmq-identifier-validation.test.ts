import { EventEmitter } from 'events';
import { Job, Queue } from 'bullmq';
import { getInitialSyncJobId, getSyncQueueName } from '@/lib/queue/identifiers';

class TestConnection extends EventEmitter {
  client = Promise.resolve({});
  redisVersion = '7.0.0';
  databaseType = 'redis';

  close(): Promise<void> {
    return Promise.resolve();
  }
}

const queueOptions = {
  connection: {},
  skipMetasUpdate: true,
  skipVersionCheck: true,
};

describe('BullMQ sync identifiers', () => {
  it('generates a partition queue name and deterministic job ID BullMQ accepts', async () => {
    const queueName = getSyncQueueName('worker-1');
    const jobId = getInitialSyncJobId('account-1');
    const queue = new Queue(queueName, queueOptions, TestConnection as any);

    expect(queueName).toBe('imap-sync-worker-1');
    expect(jobId).toBe('initial-sync-account-1');
    expect(() => new Job(queue, 'initial-sync', {}, { jobId })).not.toThrow();

    await queue.close();
  });

  it('captures BullMQ rejection of colon-containing queue names and custom job IDs', async () => {
    expect(
      () => new Queue('imap-sync:worker-1', queueOptions, TestConnection as any)
    ).toThrow('Queue name cannot contain :');

    const queue = new Queue('imap-sync-worker-1', queueOptions, TestConnection as any);
    const invalidJob = new Job(queue, 'initial-sync', {}, { jobId: 'initial-sync:account-1' });
    expect(() => (invalidJob as any).addJob({}, {})).toThrow('Custom Id cannot contain :');

    await queue.close();
  });
});
