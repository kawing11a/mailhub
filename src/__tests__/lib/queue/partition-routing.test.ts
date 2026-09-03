jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    on: jest.fn(),
  }))
);

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation((name: string) => ({
    name,
    add: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(),
  })),
}));

import { Queue } from 'bullmq';
import * as queueClient from '@/lib/queue/client';

describe('partitioned initial-sync routing', () => {
  it('enqueues a deterministic job that BullMQ removes after terminal failure for reauthorization', async () => {
    await (queueClient as any).enqueueInitialSync({
      id: 'account-1',
      workerPartition: 'worker-1',
    });

    const workerOneQueue = (Queue as unknown as jest.Mock).mock.results
      .map((result) => result.value)
      .find((queue) => queue.name === 'imap-sync-worker-1');

    expect(workerOneQueue.add).toHaveBeenCalledWith(
      'initial-sync',
      {
        accountId: 'account-1',
        folder: 'ALL',
        workerPartition: 'worker-1',
      },
      {
        jobId: 'initial-sync-account-1',
        removeOnComplete: true,
        removeOnFail: true,
      }
    );
  });

  it('uses the same safe job identifier when an account is enqueued again', async () => {
    const account = { id: 'account-1', workerPartition: 'worker-1' };

    await (queueClient as any).enqueueInitialSync(account);
    await (queueClient as any).enqueueInitialSync(account);

    const workerOneQueue = (Queue as unknown as jest.Mock).mock.results
      .map((result) => result.value)
      .find((queue) => queue.name === 'imap-sync-worker-1') as { add: jest.Mock };

    expect(workerOneQueue.add.mock.calls.slice(-2).map((call) => call[2].jobId)).toEqual([
      'initial-sync-account-1',
      'initial-sync-account-1',
    ]);
  });
});
