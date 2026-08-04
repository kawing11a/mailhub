import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';
import { summaryQueue } from '@/lib/queue/client';

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

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

    // Enqueue summary background job
    await summaryQueue.add('generate-summary', {
      summaryRunId: summaryRun.id,
      organizationId: auth.organizationId,
      userId: auth.userId,
      labelId: label.id,
      webhookIds,
      timeRangeHours: Number(timeRangeHours),
      limit: Number(limit),
    });

    return apiResponse({
      summaryRunId: summaryRun.id,
      status: 'QUEUED',
      labelName: label.name,
    }, 201);
  } catch (err: any) {
    return apiError(err.message || 'Failed to trigger summary job', 500);
  }
}
