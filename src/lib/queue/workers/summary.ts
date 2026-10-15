import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { prisma } from '@/lib/db/prisma';
import { meilisearch } from '@/lib/search/meilisearch';
import { generateEmailBatchSummary, generateFallbackEmailBatchDigest, EmailForSummary } from '@/lib/ai/summary-service';
import { AiUnavailableError } from '@/lib/ai/llm-client';
import { getSystemPreferences } from '@/lib/settings/system-preferences';
import { dispatchWebhookNotification, WebhookDispatchResult } from '@/lib/notifications';
import {
  updateAgentStep,
  completeAgentRun,
  failAgentRun,
} from '@/lib/ai/agent-tracker';

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

  // Atomically claim the job by transitioning status from QUEUED -> SUMMARIZING
  const claimResult = await prisma.emailSummaryRun.updateMany({
    where: {
      id: summaryRunId,
      status: 'QUEUED',
    },
    data: {
      status: 'SUMMARIZING',
    },
  });

  if (claimResult.count === 0) {
    console.log(`EmailSummaryRun ${summaryRunId} is already in progress, completed, or does not exist. Skipping duplicate execution.`);
    return;
  }

  try {

    await updateAgentStep(
      summaryRunId,
      {
        id: 'step-config',
        step: 'INITIALIZING',
        title: 'Verifying AI settings & configuration',
        detail: 'Loading organization experiment settings and checking provider authorization...',
        status: 'running',
      },
      {
        status: 'INITIALIZING',
        currentStepTitle: 'Verifying AI configuration...',
      }
    );

    // 2. Fetch AI settings
    const [systemPreferences, settings] = await Promise.all([
      getSystemPreferences(),
      prisma.experimentSetting.findUnique({ where: { organizationId } }),
    ]);

    const aiEnabled = systemPreferences.isAiEnabled && settings?.isAiEnabled !== false;

    const provider = settings?.aiProvider || undefined;
    const modelName = settings?.aiModelName || undefined;
    const providerDescription = provider ? provider.toUpperCase() : 'shared AI configuration';
    const modelDescription = modelName || 'configured model';

    await updateAgentStep(summaryRunId, {
      id: 'step-config',
      step: 'INITIALIZING',
      title: 'Configuration verified',
      detail: aiEnabled
        ? `Active Provider: ${providerDescription} | Model: ${modelDescription}`
        : 'AI is disabled; a basic summary will be generated.',
      status: 'completed',
    }, {
      provider,
      modelName,
    });

    // 3. Fetch label details
    const label = await prisma.label.findUnique({
      where: { id: labelId },
    });

    const labelName = label ? label.name : 'Selected Label';

    // 4. Query assigned accounts for this label
    const timeFilter = timeRangeHours && timeRangeHours > 0
      ? { gte: new Date(Date.now() - timeRangeHours * 60 * 60 * 1000) }
      : undefined;

    const assignedAccounts = await prisma.accountLabel.findMany({
      where: { labelId },
      select: { accountId: true },
    });
    const assignedAccountIds = assignedAccounts.map((a) => a.accountId);

    const timeFilterDesc = timeRangeHours && timeRangeHours > 0 ? `Past ${timeRangeHours}h` : 'All time';
    const limitDesc = limit && limit > 0 ? `Max ${limit} emails` : 'Unlimited';

    await updateAgentStep(
      summaryRunId,
      {
        id: 'step-accounts',
        step: 'RESOLVING_ACCOUNTS',
        title: `Resolved label "${labelName}" and accounts`,
        detail: `Found ${assignedAccountIds.length} linked accounts | Time window: ${timeFilterDesc} | Limit: ${limitDesc}`,
        status: 'completed',
      },
      {
        status: 'SEARCHING_EMAILS',
        currentStepTitle: `Scanning emails for label "${labelName}"...`,
        currentStepDetail: `Time filter: ${timeFilterDesc}`,
      }
    );

    // 5. Attempt Meilisearch query first for fast recency-ranked email retrieval
    await updateAgentStep(summaryRunId, {
      id: 'step-search',
      step: 'SEARCHING_EMAILS',
      title: 'Querying search engine for matching emails',
      detail: 'Executing hybrid vector search with label and time filters in Meilisearch...',
      status: 'running',
    });

    let emailIdsFromMeilisearch: string[] = [];
    try {
      const filterParts: string[] = [`organizationId = "${organizationId}"`];

      const labelAccountFilters: string[] = [`labelIds = "${labelId}"`];
      if (assignedAccountIds.length > 0) {
        labelAccountFilters.push(`accountId IN [${assignedAccountIds.map((id) => `"${id}"`).join(', ')}]`);
      }
      filterParts.push(`(${labelAccountFilters.join(' OR ')})`);

      if (timeRangeHours && timeRangeHours > 0) {
        const minTimestamp = Date.now() - timeRangeHours * 60 * 60 * 1000;
        filterParts.push(`receivedAt >= ${minTimestamp}`);
      }

      const searchRes = await meilisearch.index('emails').search('', {
        filter: filterParts.join(' AND '),
        sort: ['receivedAt:desc'],
        limit: limit && limit > 0 ? limit : 100,
      });

      emailIdsFromMeilisearch = (searchRes.hits || []).map((hit: any) => hit.id);
    } catch (searchError) {
      console.warn('Meilisearch email query failed, falling back to PostgreSQL query:', searchError);
    }

    let rawEmails: Array<{
      id: string;
      subject: string | null;
      fromName: string | null;
      fromAddress: string | null;
      snippet: string | null;
      receivedAt: Date | null;
      body: { bodyText: string | null } | null;
    }> = [];

    if (emailIdsFromMeilisearch.length > 0) {
      rawEmails = await prisma.email.findMany({
        where: {
          id: { in: emailIdsFromMeilisearch },
        },
        select: {
          id: true,
          subject: true,
          fromName: true,
          fromAddress: true,
          snippet: true,
          receivedAt: true,
          body: {
            select: {
              bodyText: true,
            },
          },
        },
        orderBy: { receivedAt: 'desc' },
      });

      await updateAgentStep(summaryRunId, {
        id: 'step-search',
        step: 'SEARCHING_EMAILS',
        title: 'Search completed via Meilisearch',
        detail: `Found ${rawEmails.length} relevant candidate emails via fast index ranking.`,
        status: 'completed',
      });
    } else {
      // Fallback query matching either direct email tag or assigned account
      rawEmails = await prisma.email.findMany({
        where: {
          account: { organizationId },
          ...(timeFilter && { receivedAt: timeFilter }),
          OR: [
            { emailLabels: { some: { labelId } } },
            ...(assignedAccountIds.length > 0 ? [{ accountId: { in: assignedAccountIds } }] : []),
          ],
        },
        select: {
          id: true,
          subject: true,
          fromName: true,
          fromAddress: true,
          snippet: true,
          receivedAt: true,
          body: {
            select: {
              bodyText: true,
            },
          },
        },
        orderBy: { receivedAt: 'desc' },
        ...(limit && limit > 0 ? { take: limit } : {}),
      });

      await updateAgentStep(summaryRunId, {
        id: 'step-search',
        step: 'SEARCHING_EMAILS',
        title: 'Search completed via PostgreSQL',
        detail: `Retrieved ${rawEmails.length} matching emails directly from PostgreSQL database.`,
        status: 'completed',
      });
    }

    const emailsToSummarize: EmailForSummary[] = rawEmails.map((e) => ({
      id: e.id,
      subject: e.subject,
      fromName: e.fromName,
      fromAddress: e.fromAddress,
      snippet: e.snippet,
      bodyText: e.body?.bodyText || null,
      receivedAt: e.receivedAt,
    }));

    // 6. Preparing payload and prompting AI
    await updateAgentStep(
      summaryRunId,
      {
        id: 'step-extract',
        step: 'EXTRACTING_EMAILS',
        title: `Constructed batch of ${emailsToSummarize.length} emails`,
        detail: aiEnabled
          ? `Sanitized snippets & full message bodies into structured context for ${modelDescription}.`
          : 'Prepared message details for a basic summary.',
        status: 'completed',
      },
      {
        status: 'AI_SUMMARIZING',
        emailCount: emailsToSummarize.length,
        currentStepTitle: aiEnabled
          ? `AI model analyzing ${emailsToSummarize.length} emails...`
          : `Preparing basic summary for ${emailsToSummarize.length} emails...`,
        currentStepDetail: aiEnabled ? `Provider: ${providerDescription} (${modelDescription})` : 'AI is disabled',
      }
    );

    await updateAgentStep(summaryRunId, {
      id: 'step-ai',
      step: 'AI_SUMMARIZING',
      title: aiEnabled ? 'Synthesizing threads and executive summary' : 'Generating basic summary',
      detail: aiEnabled
        ? `Prompting ${providerDescription} (${modelDescription}) with instructions to distill key topics, updates, and action items...`
        : 'Compiling subject, sender, date, and snippet for each email.',
      status: 'running',
    });

    let summaryText: string;
    let usedFallback = !aiEnabled;
    if (aiEnabled) {
      try {
        summaryText = await generateEmailBatchSummary({
          organizationId,
          provider,
          apiKey: settings?.aiApiKey,
          baseUrl: settings?.aiBaseUrl,
          modelName,
          customPrompt: settings?.aiCustomPrompt,
          labelName,
          emails: emailsToSummarize,
        });
      } catch (error) {
        if (!(error instanceof AiUnavailableError)) throw error;
        usedFallback = true;
        summaryText = generateFallbackEmailBatchDigest({ labelName, emails: emailsToSummarize });
      }
    } else {
      summaryText = generateFallbackEmailBatchDigest({ labelName, emails: emailsToSummarize });
    }

    await updateAgentStep(summaryRunId, {
      id: 'step-ai',
      step: 'AI_SUMMARIZING',
      title: usedFallback ? 'Basic summary completed' : 'AI synthesis completed',
      detail: `Generated ${usedFallback ? 'basic' : 'AI'} summary (${summaryText.length} characters).`,
      status: 'completed',
    });

    // 7. Update status to NOTIFYING
    await prisma.emailSummaryRun.update({
      where: { id: summaryRunId },
      data: {
        status: 'NOTIFYING',
        emailCount: emailsToSummarize.length,
        summaryText,
      },
    });

    // 8. Dispatch Webhooks
    const webhookLogs: WebhookDispatchResult[] = [];

    if (webhookIds && webhookIds.length > 0) {
      const webhooks = await prisma.notificationWebhook.findMany({
        where: {
          id: { in: webhookIds },
          organizationId,
          isActive: true,
        },
      });

      if (webhooks.length > 0) {
        await updateAgentStep(
          summaryRunId,
          {
            id: 'step-webhooks',
            step: 'DISPATCHING_NOTIFICATIONS',
            title: `Dispatching to ${webhooks.length} webhook channels`,
            detail: `Sending payload to: ${webhooks.map((w) => `${w.name} (${w.type})`).join(', ')}`,
            status: 'running',
          },
          {
            status: 'NOTIFYING',
            currentStepTitle: `Dispatching notifications to ${webhooks.length} channels...`,
          }
        );

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

        const successCount = webhookLogs.filter((w) => w.success).length;
        await updateAgentStep(summaryRunId, {
          id: 'step-webhooks',
          step: 'DISPATCHING_NOTIFICATIONS',
          title: 'Webhook notifications dispatched',
          detail: `Delivered to ${successCount}/${webhooks.length} channels successfully.`,
          status: 'completed',
        });
      }
    }

    // 9. Update run as COMPLETED
    await prisma.emailSummaryRun.update({
      where: { id: summaryRunId },
      data: {
        status: 'COMPLETED',
        webhookLogs: webhookLogs as any,
      },
    });

    await completeAgentRun(summaryRunId, summaryText, emailsToSummarize.length, webhookLogs);

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

    await failAgentRun(summaryRunId, errorMsg);
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
