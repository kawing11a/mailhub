import { executeSummaryRun } from '../../../lib/queue/workers/summary';
import { prisma } from '../../../lib/db/prisma';
import { meilisearch } from '../../../lib/search/meilisearch';
import { generateEmailBatchSummary } from '../../../lib/ai/summary-service';

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    quit: jest.fn(),
    disconnect: jest.fn(),
  }));
});

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
  })),
}));

jest.mock('../../../lib/db/prisma', () => ({
  prisma: {
    emailSummaryRun: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    experimentSetting: {
      findUnique: jest.fn(),
    },
    label: {
      findUnique: jest.fn(),
    },
    accountLabel: {
      findMany: jest.fn(),
    },
    email: {
      findMany: jest.fn(),
    },
    notificationWebhook: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../../lib/search/meilisearch', () => ({
  meilisearch: {
    index: jest.fn(),
  },
}));

jest.mock('../../../lib/ai/summary-service', () => ({
  generateEmailBatchSummary: jest.fn(),
}));

describe('Email Summary Worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('queries Meilisearch for matching email IDs and summarizes fetched emails', async () => {
    (prisma.emailSummaryRun.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'run-1',
      status: 'QUEUED',
    });

    (prisma.experimentSetting.findUnique as jest.Mock).mockResolvedValueOnce({
      isAiEnabled: true,
      aiProvider: 'openai',
    });

    (prisma.label.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'label-1',
      name: 'Invoices',
    });

    (prisma.accountLabel.findMany as jest.Mock).mockResolvedValueOnce([]);

    const mockSearch = jest.fn().mockResolvedValueOnce({
      hits: [{ id: 'email-1' }, { id: 'email-2' }],
    });
    (meilisearch.index as jest.Mock).mockReturnValue({ search: mockSearch });

    (prisma.email.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'email-1',
        subject: 'Invoice 1',
        fromName: 'Vendor',
        fromAddress: 'vendor@test.com',
        snippet: 'Pay invoice 1',
        receivedAt: new Date(),
        body: { bodyText: 'Pay invoice 1 full body' },
      },
    ]);

    (generateEmailBatchSummary as jest.Mock).mockResolvedValueOnce('Generated Summary');

    await executeSummaryRun({
      summaryRunId: 'run-1',
      organizationId: 'org-1',
      userId: 'user-1',
      labelId: 'label-1',
      limit: 25,
    });

    expect(meilisearch.index).toHaveBeenCalledWith('emails');
    expect(mockSearch).toHaveBeenCalledWith('', expect.objectContaining({
      filter: expect.stringContaining('organizationId = "org-1"'),
    }));
    expect(generateEmailBatchSummary).toHaveBeenCalledWith(expect.objectContaining({
      emails: expect.arrayContaining([
        expect.objectContaining({ id: 'email-1', bodyText: 'Pay invoice 1 full body' }),
      ]),
    }));
  });

  test('falls back gracefully to DB query if Meilisearch search fails', async () => {
    (prisma.emailSummaryRun.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'run-2',
      status: 'QUEUED',
    });

    (prisma.experimentSetting.findUnique as jest.Mock).mockResolvedValueOnce({
      isAiEnabled: true,
    });

    (prisma.label.findUnique as jest.Mock).mockResolvedValueOnce({
      id: 'label-2',
      name: 'Support',
    });

    (prisma.accountLabel.findMany as jest.Mock).mockResolvedValueOnce([]);

    const mockSearch = jest.fn().mockRejectedValueOnce(new Error('Meilisearch connection error'));
    (meilisearch.index as jest.Mock).mockReturnValue({ search: mockSearch });

    (prisma.email.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 'email-db-1',
        subject: 'Support Ticket',
        fromName: 'User',
        fromAddress: 'user@test.com',
        snippet: 'Help needed',
        receivedAt: new Date(),
        body: { bodyText: 'Full support ticket details' },
      },
    ]);

    (generateEmailBatchSummary as jest.Mock).mockResolvedValueOnce('Fallback Summary');

    await executeSummaryRun({
      summaryRunId: 'run-2',
      organizationId: 'org-1',
      userId: 'user-1',
      labelId: 'label-2',
    });

    expect(prisma.email.findMany).toHaveBeenCalled();
    expect(generateEmailBatchSummary).toHaveBeenCalledWith(expect.objectContaining({
      labelName: 'Support',
      emails: expect.arrayContaining([
        expect.objectContaining({ id: 'email-db-1' }),
      ]),
    }));
  });
});
