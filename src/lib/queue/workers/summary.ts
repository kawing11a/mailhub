import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { prisma } from '@/lib/db/prisma';
import { generateEmailBatchSummary } from '@/lib/ai/summary-service';
import { dispatchWebhookNotification, WebhookDispatchResult } from '@/lib/notifications';

const workerRedis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy(times) {
    console.warn(`Redis connection lost. Retrying in summary worker (attempt ${times})...`);
    return Math.min(times * 100, 3000);
  },
});

export interface SummaryJobPayload {
  summaryRunId: string;
  organizationId: string;
  userId: string;
  labelId: string;
  webhookIds?: string[];
  timeRangeHours?: number; // e.g., 24, 168 (7 days), or 0 for unlimited
  limit?: number;          // max email count, default 25
}

export async function executeSummaryRun(payload: SummaryJobPayload): Promise<void> {
  const { summaryRunId, organizationId, labelId, webhookIds, timeRangeHours, limit = 25 } = payload;

  const summaryRun = await prisma.emailSummaryRun.findUnique({
    where: { id: summaryRunId },
  });

  if (!summaryRun) {
    console.warn(`EmailSummaryRun ${summaryRunId} not found.`);
    return;
  }

  // Prevent re-processing if already completed or actively in progress
  if (summaryRun.status === 'COMPLETED' || summaryRun.status === 'SUMMARIZING' || summaryRun.status === 'NOTIFYING') {
    return;
  }

  try {
    // 1. Update status to SUMMARIZING
    await prisma.emailSummaryRun.update({
      where: { id: summaryRunId },
      data: { status: 'SUMMARIZING' },
    });

    // 2. Fetch AI settings
    const settings = await prisma.experimentSetting.findUnique({
      where: { organizationId },
    });

    if (settings && settings.isAiEnabled === false) {
      throw new Error('AI features are currently disabled for this organization.');
    }

    // 3. Fetch label details
    const label = await prisma.label.findUnique({
      where: { id: labelId },
    });

    const labelName = label ? label.name : 'Selected Label';

    // 4. Query emails by label ID and optional time window filter
    const timeFilter = timeRangeHours && timeRangeHours > 0
      ? { gte: new Date(Date.now() - timeRangeHours * 60 * 60 * 1000) }
      : undefined;

    const emailLabels = await prisma.emailLabel.findMany({
      where: {
        labelId,
        email: {
          account: { organizationId },
          ...(timeFilter && { receivedAt: timeFilter }),
        },
      },
      ...(limit && limit > 0 ? { take: limit } : {}),
      orderBy: { email: { receivedAt: 'desc' } },
      include: {
        email: {
          select: {
            id: true,
            subject: true,
            fromName: true,
            fromAddress: true,
            snippet: true,
            receivedAt: true,
          },
        },
      },
    });

    const emailsToSummarize = emailLabels.map((el) => el.email);

    // 5. Generate AI Summary
    const summaryText = await generateEmailBatchSummary({
      provider: settings?.aiProvider || 'openai',
      apiKey: settings?.aiApiKey,
      baseUrl: settings?.aiBaseUrl,
      modelName: settings?.aiModelName || 'gpt-4o-mini',
      customPrompt: settings?.aiCustomPrompt,
      labelName,
      emails: emailsToSummarize,
    });

    // 6. Update status to NOTIFYING
    await prisma.emailSummaryRun.update({
      where: { id: summaryRunId },
      data: {
        status: 'NOTIFYING',
        emailCount: emailsToSummarize.length,
        summaryText,
      },
    });

    // 7. Dispatch Webhooks
    const webhookLogs: WebhookDispatchResult[] = [];

    if (webhookIds && webhookIds.length > 0) {
      const webhooks = await prisma.notificationWebhook.findMany({
        where: {
          id: { in: webhookIds },
          organizationId,
          isActive: true,
        },
      });

      for (const webhook of webhooks) {
        const dispatchRes = await dispatchWebhookNotification({
          type: webhook.type as any,
          config: webhook.config,
          labelName,
          summaryText,
          emailCount: emailsToSummarize.length,
        });
        webhookLogs.push(dispatchRes);
      }
    }

    // 8. Update run as COMPLETED
    await prisma.emailSummaryRun.update({
      where: { id: summaryRunId },
      data: {
        status: 'COMPLETED',
        webhookLogs: webhookLogs as any,
      },
    });

    console.log(`Successfully completed email summary run ${summaryRunId}`);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`Email summary job ${summaryRunId} failed:`, errorMsg);

    await prisma.emailSummaryRun.update({
      where: { id: summaryRunId },
      data: {
        status: 'FAILED',
        errorMessage: errorMsg,
      },
    });
    throw err;
  }
}

export const summaryWorker = new Worker<SummaryJobPayload>(
  'email-summary',
  async (job: Job<SummaryJobPayload>) => {
    await executeSummaryRun(job.data);
  },
  {
    connection: workerRedis as any,
    concurrency: 5,
  }
);

summaryWorker.on('failed', (job, err) => {
  console.error(`Summary worker job ${job?.id} failed:`, err.message);
});
