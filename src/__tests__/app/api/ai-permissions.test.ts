jest.mock('@/lib/auth/middleware', () => ({
  authenticate: jest.fn(),
  requireAdmin: jest.fn(),
  apiResponse: (data: unknown, status = 200) => Response.json(data, { status }),
  apiError: (message: string, status = 400) =>
    Response.json({ error: message }, { status }),
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailAccount: {
      findFirst: jest.fn(),
    },
    email: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    label: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    emailSummaryRun: {
      create: jest.fn(),
    },
  },
}));

jest.mock('@/lib/ai/llm-client', () => ({
  callLlmApi: jest.fn(),
}));

jest.mock('@/lib/ai/spam-classifier', () => ({
  recordSpamTrainingSample: jest.fn(),
  getSpamModelStats: jest.fn(),
  resetSpamModelToDefault: jest.fn(),
  exportGenericSpamDataset: jest.fn(),
  importGenericSpamDataset: jest.fn(),
}));

jest.mock('@/lib/queue/client', () => ({
  summaryQueue: {
    add: jest.fn(),
  },
}));

jest.mock('@/lib/queue/workers/summary', () => ({
  executeSummaryRun: jest.fn(),
}));

jest.mock('@/lib/ai/agent-tracker', () => ({
  initAgentRun: jest.fn(),
  getAgentRunState: jest.fn(),
}));

import type { NextRequest } from 'next/server';
import { POST as draftPost } from '@/app/api/ai/draft/route';
import { POST as explainPost } from '@/app/api/ai/explain/route';
import { POST as toolboxPost } from '@/app/api/ai/toolbox/route';
import { POST as spamLabelPost } from '@/app/api/ai/spam/label/route';
import {
  GET as spamStatsGet,
  POST as spamStatsPost,
} from '@/app/api/ai/spam/stats/route';
import {
  GET as spamDatasetGet,
  POST as spamDatasetPost,
} from '@/app/api/ai/spam/dataset/route';
import { POST as triggerSummary } from '@/app/api/experiments/summary/trigger/route';
import { authenticate, requireAdmin } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';
import { callLlmApi } from '@/lib/ai/llm-client';
import {
  exportGenericSpamDataset,
  getSpamModelStats,
  importGenericSpamDataset,
  recordSpamTrainingSample,
  resetSpamModelToDefault,
} from '@/lib/ai/spam-classifier';
import { summaryQueue } from '@/lib/queue/client';

const mockAuthenticate = authenticate as jest.Mock;
const mockRequireAdmin = requireAdmin as jest.Mock;
const mockFindAccount = prisma.emailAccount.findFirst as jest.Mock;
const mockFindEmail = prisma.email.findUnique as jest.Mock;
const mockUpdateEmail = prisma.email.updateMany as jest.Mock;
const mockFindLabel = prisma.label.findFirst as jest.Mock;
const mockFindLabelLegacy = prisma.label.findUnique as jest.Mock;
const mockCreateSummaryRun = prisma.emailSummaryRun.create as jest.Mock;
const mockCallLlmApi = callLlmApi as jest.Mock;
const mockRecordSpamTrainingSample = recordSpamTrainingSample as jest.Mock;
const mockGetSpamModelStats = getSpamModelStats as jest.Mock;
const mockResetSpamModel = resetSpamModelToDefault as jest.Mock;
const mockExportSpamDataset = exportGenericSpamDataset as jest.Mock;
const mockImportSpamDataset = importGenericSpamDataset as jest.Mock;
const mockSummaryQueueAdd = summaryQueue.add as jest.Mock;

const memberAuth = {
  userId: 'member-1',
  organizationId: 'org-1',
  role: 'member',
};

const adminAuth = {
  userId: 'admin-1',
  organizationId: 'org-1',
  role: 'admin',
};

function jsonRequest(path: string, body: unknown): NextRequest {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as NextRequest;
}

function unauthorizedResponse() {
  return Response.json({ error: 'Authentication required' }, { status: 401 });
}

function adminForbiddenResponse() {
  return Response.json({ error: 'Admin access required' }, { status: 403 });
}

describe('AI account permissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticate.mockResolvedValue(memberAuth);
    mockRequireAdmin.mockImplementation((auth: typeof memberAuth) =>
      auth.role === 'admin' ? null : adminForbiddenResponse()
    );
    mockCallLlmApi.mockResolvedValue('AI result');
    mockRecordSpamTrainingSample.mockReturnValue({
      sample: { label: 'spam' },
      updatedStats: { totalSpam: 1, totalHam: 0 },
    });
    mockGetSpamModelStats.mockReturnValue({ totalSpam: 1, totalHam: 1 });
    mockExportSpamDataset.mockReturnValue({ version: '1.0' });
    mockImportSpamDataset.mockReturnValue({ stats: { totalSpam: 1, totalHam: 1 } });
    mockUpdateEmail.mockResolvedValue({ count: 1 });
  });

  it.each([
    ['draft', draftPost, '/api/ai/draft', { accountId: 'account-1', prompt: 'Write a note' }],
    [
      'explain',
      explainPost,
      '/api/ai/explain',
      { emailId: 'email-1', subject: 'Subject', bodyText: 'Body' },
    ],
    [
      'toolbox',
      toolboxPost,
      '/api/ai/toolbox',
      { accountId: 'account-1', tool: 'tone_check', text: 'Body' },
    ],
    [
      'spam label',
      spamLabelPost,
      '/api/ai/spam/label',
      { emailId: 'email-1', label: 'spam', subject: 'Subject' },
    ],
    ['spam stats reset', spamStatsPost, '/api/ai/spam/stats', { action: 'reset' }],
    [
      'spam dataset import',
      spamDatasetPost,
      '/api/ai/spam/dataset',
      { dataset: { version: '1.0' } },
    ],
  ])('authenticates %s before parsing its request body', async (_name, handler, path, body) => {
    mockAuthenticate.mockResolvedValue(unauthorizedResponse());
    const json = jest.fn().mockResolvedValue(body);
    const request = { json } as unknown as NextRequest;

    const response = await (handler as (req: NextRequest) => Promise<Response>)(request);

    expect(response.status).toBe(401);
    expect(json).not.toHaveBeenCalled();
    expect(mockCallLlmApi).not.toHaveBeenCalled();
    expect(mockRecordSpamTrainingSample).not.toHaveBeenCalled();
    expect(mockResetSpamModel).not.toHaveBeenCalled();
    expect(mockImportSpamDataset).not.toHaveBeenCalled();
  });

  it.each([
    ['draft', draftPost, '/api/ai/draft', { prompt: 'Write a note' }],
    [
      'explain',
      explainPost,
      '/api/ai/explain',
      { subject: 'Subject', bodyText: 'Body' },
    ],
    [
      'toolbox',
      toolboxPost,
      '/api/ai/toolbox',
      { tool: 'tone_check', text: 'Body' },
    ],
    [
      'spam label',
      spamLabelPost,
      '/api/ai/spam/label',
      { label: 'spam', subject: 'Subject' },
    ],
  ])('rejects %s without account or email context before AI mutation', async (_name, handler, path, body) => {
    const response = await (handler as (req: NextRequest) => Promise<Response>)(
      jsonRequest(path, body)
    );

    expect(response.status).toBe(400);
    expect(mockFindAccount).not.toHaveBeenCalled();
    expect(mockCallLlmApi).not.toHaveBeenCalled();
    expect(mockRecordSpamTrainingSample).not.toHaveBeenCalled();
  });

  it.each([
    [
      'draft',
      draftPost,
      '/api/ai/draft',
      { accountId: 'account-2', prompt: 'Write a note' },
    ],
    [
      'toolbox',
      toolboxPost,
      '/api/ai/toolbox',
      { accountId: 'account-2', tool: 'tone_check', text: 'Body' },
    ],
  ])('denies a member using an inaccessible account for %s', async (_name, handler, path, body) => {
    mockFindAccount.mockResolvedValue(null);

    const response = await (handler as (req: NextRequest) => Promise<Response>)(
      jsonRequest(path, body)
    );

    expect(response.status).toBe(403);
    expect(mockFindAccount).toHaveBeenCalledWith({
      where: {
        id: 'account-2',
        organizationId: 'org-1',
        OR: [
          { ownerUserId: 'member-1' },
          { memberAccess: { some: { userId: 'member-1' } } },
        ],
      },
      select: {
        id: true,
        organizationId: true,
        ownerUserId: true,
      },
    });
    expect(mockCallLlmApi).not.toHaveBeenCalled();
  });

  it('resolves an explanation email to its account and denies access before the LLM call', async () => {
    mockFindEmail.mockResolvedValue({ accountId: 'account-2' });
    mockFindAccount.mockResolvedValue(null);

    const response = await explainPost(
      jsonRequest('/api/ai/explain', {
        emailId: 'email-2',
        subject: 'Private subject',
        bodyText: 'Private body',
      })
    );

    expect(mockFindEmail).toHaveBeenCalledWith({
      where: { id: 'email-2' },
      select: { accountId: true },
    });
    expect(response.status).toBe(403);
    expect(mockCallLlmApi).not.toHaveBeenCalled();
  });

  it('resolves spam feedback to its email account before training or updating the email', async () => {
    mockFindEmail.mockResolvedValue({ accountId: 'account-2' });
    mockFindAccount.mockResolvedValue(null);

    const response = await spamLabelPost(
      jsonRequest('/api/ai/spam/label', {
        emailId: 'email-2',
        label: 'spam',
        subject: 'Private subject',
      })
    );

    expect(response.status).toBe(403);
    expect(mockRecordSpamTrainingSample).not.toHaveBeenCalled();
    expect(mockUpdateEmail).not.toHaveBeenCalled();
  });

  it('lets an admin use any account in the same organization without member filters', async () => {
    mockAuthenticate.mockResolvedValue(adminAuth);
    mockFindAccount.mockResolvedValue({
      id: 'account-2',
      organizationId: 'org-1',
      ownerUserId: 'member-2',
    });

    const response = await draftPost(
      jsonRequest('/api/ai/draft', {
        accountId: 'account-2',
        prompt: 'Write a note',
      })
    );

    expect(mockFindAccount).toHaveBeenCalledWith({
      where: { id: 'account-2', organizationId: 'org-1' },
      select: {
        id: true,
        organizationId: true,
        ownerUserId: true,
      },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: 'AI result', status: 'success' });
  });

  it('keeps spam model statistics and reset operations admin-only', async () => {
    const getResponse = await (spamStatsGet as (req: NextRequest) => Promise<Response>)(
      new Request('http://localhost/api/ai/spam/stats') as NextRequest
    );

    const json = jest.fn().mockResolvedValue({ action: 'reset' });
    const postResponse = await spamStatsPost({ json } as unknown as NextRequest);

    expect(getResponse.status).toBe(403);
    expect(postResponse.status).toBe(403);
    expect(json).not.toHaveBeenCalled();
    expect(mockGetSpamModelStats).not.toHaveBeenCalled();
    expect(mockResetSpamModel).not.toHaveBeenCalled();
  });

  it('keeps spam dataset export and import operations admin-only', async () => {
    const getResponse = await (spamDatasetGet as (req: NextRequest) => Promise<Response>)(
      new Request('http://localhost/api/ai/spam/dataset') as NextRequest
    );

    const json = jest.fn().mockResolvedValue({ dataset: { version: '1.0' } });
    const postResponse = await spamDatasetPost({ json } as unknown as NextRequest);

    expect(getResponse.status).toBe(403);
    expect(postResponse.status).toBe(403);
    expect(json).not.toHaveBeenCalled();
    expect(mockExportSpamDataset).not.toHaveBeenCalled();
    expect(mockImportSpamDataset).not.toHaveBeenCalled();
  });

  it('preserves the admin boundary for label summaries before parsing or queueing', async () => {
    const json = jest.fn().mockResolvedValue({ labelId: 'label-1' });

    const response = await triggerSummary({ json } as unknown as NextRequest);

    expect(response.status).toBe(403);
    expect(json).not.toHaveBeenCalled();
    expect(mockFindLabel).not.toHaveBeenCalled();
    expect(mockCreateSummaryRun).not.toHaveBeenCalled();
    expect(mockSummaryQueueAdd).not.toHaveBeenCalled();
  });

  it('queues an admin label summary only after finding a same-organization accessible account', async () => {
    mockAuthenticate.mockResolvedValue(adminAuth);
    mockFindLabel.mockResolvedValue({ id: 'label-1', name: 'Invoices' });
    mockFindLabelLegacy.mockResolvedValue({ id: 'label-1', name: 'Invoices' });
    mockCreateSummaryRun.mockResolvedValue({ id: 'run-1' });
    mockSummaryQueueAdd.mockResolvedValue({ id: 'job-1' });

    const response = await triggerSummary(
      jsonRequest('/api/experiments/summary/trigger', { labelId: 'label-1' })
    );

    expect(mockFindLabel).toHaveBeenCalledWith({
      where: {
        id: 'label-1',
        organizationId: 'org-1',
        accountLabels: {
          some: {
            account: { organizationId: 'org-1' },
          },
        },
      },
    });
    expect(response.status).toBe(201);
    expect(mockSummaryQueueAdd).toHaveBeenCalledTimes(1);
  });

  it('does not create or queue a summary when the label has no accessible account', async () => {
    mockAuthenticate.mockResolvedValue(adminAuth);
    mockFindLabel.mockResolvedValue(null);
    mockFindLabelLegacy.mockResolvedValue({ id: 'label-1', name: 'Invoices' });

    const response = await triggerSummary(
      jsonRequest('/api/experiments/summary/trigger', { labelId: 'label-1' })
    );

    expect(response.status).toBe(404);
    expect(mockCreateSummaryRun).not.toHaveBeenCalled();
    expect(mockSummaryQueueAdd).not.toHaveBeenCalled();
  });
});
