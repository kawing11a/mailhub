import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  authenticate,
  requireAdmin,
  apiResponse,
  apiError,
} from '@/lib/auth/middleware';
import { summaryQueue } from '@/lib/queue/client';
import { executeSummaryRun } from '@/lib/queue/workers/summary';

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const adminCheck = requireAdmin(auth);
  if (adminCheck) return adminCheck;

  try {
    const body = await req.json();
    const { labelId, timeRangeHours = 24, limit = 25, webhookIds = [] } = body;

    if (!labelId) {
      return apiError('labelId is required', 400);
    }

    const label = await prisma.label.findUnique({
      where: { id: labelId },
    });

    if (!label || label.organizationId !== auth.organizationId) {
      return apiError('Label not found', 404);
    }

    // Create EmailSummaryRun record
    const summaryRun = await prisma.emailSummaryRun.create({
      data: {
        organizationId: auth.organizationId,
        userId: auth.userId,
        labelId: label.id,
        labelName: label.name,
        status: 'QUEUED',
      },
    });

    const parsedLimit = Number(limit);
    const parsedTimeRangeHours = Number(timeRangeHours);

    // Initialize real-time agent tracker in Redis
    const { initAgentRun } = await import('@/lib/ai/agent-tracker');
    await initAgentRun(summaryRun.id, label.name, {
      timeRangeHours: isNaN(parsedTimeRangeHours) ? 0 : parsedTimeRangeHours,
      limit: isNaN(parsedLimit) ? 0 : parsedLimit,
    });

    const uniqueWebhookIds = Array.isArray(webhookIds)
      ? Array.from(new Set(webhookIds.filter((id: any) => typeof id === 'string' && id.trim().length > 0)))
      : [];

    const payload = {
      summaryRunId: summaryRun.id,
      organizationId: auth.organizationId,
      userId: auth.userId,
      labelId: label.id,
      webhookIds: uniqueWebhookIds,
      timeRangeHours: isNaN(parsedTimeRangeHours) ? 0 : parsedTimeRangeHours,
      limit: isNaN(parsedLimit) ? 0 : parsedLimit,
    };

    // 1. Enqueue to BullMQ for dedicated worker processes
    try {
      await summaryQueue.add('generate-summary', payload);
    } catch (err) {
      console.warn('BullMQ enqueue failed, falling back to direct summary execution:', err);
      // Fallback: run directly only if queue enqueue failed
      executeSummaryRun(payload).catch((execErr) => {
        console.error('Direct summary execution error:', execErr);
      });
    }

    return apiResponse(
      {
        summaryRunId: summaryRun.id,
        status: 'QUEUED',
        labelName: label.name,
      },
      201
    );
  } catch (err: any) {
    return apiError(err.message || 'Failed to trigger summary job', 500);
  }
}
