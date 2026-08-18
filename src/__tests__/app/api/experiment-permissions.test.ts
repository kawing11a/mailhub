jest.mock('@/lib/auth/middleware', () => ({
  authenticate: jest.fn(),
  requireAdmin: jest.fn(),
  apiResponse: (data: unknown, status = 200) =>
    Response.json(data, { status }),
  apiError: (message: string, status = 400) =>
    Response.json({ error: message }, { status }),
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    experimentSetting: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    notificationWebhook: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    label: {
      findUnique: jest.fn(),
    },
    emailSummaryRun: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('@/lib/notifications', () => ({
  dispatchWebhookNotification: jest.fn(),
}));

jest.mock('@/lib/queue/client', () => ({
  summaryQueue: {
    add: jest.fn(),
  },
}));

jest.mock('@/lib/queue/workers/summary', () => ({
  executeSummaryRun: jest.fn(),
}));

import type { NextRequest } from 'next/server';
import {
  GET as getExperimentSettings,
  PUT as updateExperimentSettings,
} from '@/app/api/experiments/settings/route';
import {
  GET as getWebhooks,
  POST as createWebhook,
} from '@/app/api/experiments/webhooks/route';
import { DELETE as deleteWebhook } from '@/app/api/experiments/webhooks/[id]/route';
import { POST as testWebhook } from '@/app/api/experiments/webhooks/test/route';
import { POST as triggerSummary } from '@/app/api/experiments/summary/trigger/route';
import { GET as getSummaryStatus } from '@/app/api/experiments/summary/[id]/route';
import { authenticate, requireAdmin } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';
import { dispatchWebhookNotification } from '@/lib/notifications';
import { summaryQueue } from '@/lib/queue/client';
import { executeSummaryRun } from '@/lib/queue/workers/summary';

const mockAuthenticate = authenticate as jest.Mock;
const mockRequireAdmin = requireAdmin as jest.Mock;
const mockExperimentSetting = prisma.experimentSetting as {
  findUnique: jest.Mock;
  create: jest.Mock;
  upsert: jest.Mock;
};
const mockWebhook = prisma.notificationWebhook as {
  findMany: jest.Mock;
  create: jest.Mock;
  findUnique: jest.Mock;
  delete: jest.Mock;
};
const mockLabel = prisma.label.findUnique as jest.Mock;
const mockSummaryRun = prisma.emailSummaryRun as {
  create: jest.Mock;
  findUnique: jest.Mock;
};
const mockDispatchWebhookNotification = dispatchWebhookNotification as jest.Mock;
const mockSummaryQueueAdd = summaryQueue.add as jest.Mock;
const mockExecuteSummaryRun = executeSummaryRun as jest.Mock;

function createForbiddenResponse() {
  return Response.json({ error: 'Admin access required' }, { status: 403 });
}

function createRequestWithJsonSpy() {
  const json = jest.fn();
  return {
    request: { json } as unknown as NextRequest,
    json,
  };
}

describe('Experimental API admin permissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticate.mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });
    mockRequireAdmin.mockReturnValue(createForbiddenResponse());
  });

  it('blocks GET /api/experiments/settings before reading settings', async () => {
    const response = await getExperimentSettings({} as NextRequest);

    expect(response.status).toBe(403);
    expect(mockExperimentSetting.findUnique).not.toHaveBeenCalled();
    expect(mockExperimentSetting.create).not.toHaveBeenCalled();
  });

  it('blocks PUT /api/experiments/settings before parsing the body or updating settings', async () => {
    const { request, json } = createRequestWithJsonSpy();

    const response = await updateExperimentSettings(request);

    expect(response.status).toBe(403);
    expect(json).not.toHaveBeenCalled();
    expect(mockExperimentSetting.upsert).not.toHaveBeenCalled();
  });

  it('blocks GET /api/experiments/webhooks before listing channels', async () => {
    const response = await getWebhooks({} as NextRequest);

    expect(response.status).toBe(403);
    expect(mockWebhook.findMany).not.toHaveBeenCalled();
  });

  it('blocks POST /api/experiments/webhooks before parsing the body or creating a channel', async () => {
    const { request, json } = createRequestWithJsonSpy();

    const response = await createWebhook(request);

    expect(response.status).toBe(403);
    expect(json).not.toHaveBeenCalled();
    expect(mockWebhook.create).not.toHaveBeenCalled();
  });

  it('blocks DELETE /api/experiments/webhooks/[id] before loading or deleting a channel', async () => {
    const response = await deleteWebhook({} as NextRequest, {
      params: Promise.resolve({ id: 'webhook-1' }),
    });

    expect(response.status).toBe(403);
    expect(mockWebhook.findUnique).not.toHaveBeenCalled();
    expect(mockWebhook.delete).not.toHaveBeenCalled();
  });

  it('blocks POST /api/experiments/webhooks/test before parsing the body or dispatching a provider call', async () => {
    const { request, json } = createRequestWithJsonSpy();

    const response = await testWebhook(request);

    expect(response.status).toBe(403);
    expect(json).not.toHaveBeenCalled();
    expect(mockDispatchWebhookNotification).not.toHaveBeenCalled();
  });

  it('blocks POST /api/experiments/summary/trigger before parsing the body, reading labels, or queuing work', async () => {
    const { request, json } = createRequestWithJsonSpy();

    const response = await triggerSummary(request);

    expect(response.status).toBe(403);
    expect(json).not.toHaveBeenCalled();
    expect(mockLabel).not.toHaveBeenCalled();
    expect(mockSummaryRun.create).not.toHaveBeenCalled();
    expect(mockSummaryQueueAdd).not.toHaveBeenCalled();
    expect(mockExecuteSummaryRun).not.toHaveBeenCalled();
  });

  it('blocks GET /api/experiments/summary/[id] before loading summary data', async () => {
    const response = await getSummaryStatus({} as NextRequest, {
      params: Promise.resolve({ id: 'summary-1' }),
    });

    expect(response.status).toBe(403);
    expect(mockSummaryRun.findUnique).not.toHaveBeenCalled();
  });
});
