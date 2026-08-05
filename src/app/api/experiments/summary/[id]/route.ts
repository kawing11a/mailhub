import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticate, apiResponse, apiError } from '@/lib/auth/middleware';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;

  try {
    const summaryRun = await prisma.emailSummaryRun.findUnique({
      where: { id },
    });

    if (!summaryRun || summaryRun.organizationId !== auth.organizationId) {
      return apiError('Summary run not found', 404);
    }

    const { getAgentRunState } = await import('@/lib/ai/agent-tracker');
    const liveAgentState = await getAgentRunState(id);

    return apiResponse({
      ...summaryRun,
      agentState: liveAgentState || {
        runId: summaryRun.id,
        status: summaryRun.status,
        currentStepTitle:
          summaryRun.status === 'COMPLETED'
            ? 'AI Summary Completed'
            : summaryRun.status === 'FAILED'
            ? 'Summary Failed'
            : 'Processing email summary...',
        currentStepDetail: summaryRun.errorMessage || undefined,
        emailCount: summaryRun.emailCount,
        summaryText: summaryRun.summaryText,
        errorMessage: summaryRun.errorMessage,
        webhookLogs: summaryRun.webhookLogs,
        logs: [],
        startedAt: summaryRun.createdAt.toISOString(),
        completedAt:
          summaryRun.status === 'COMPLETED' || summaryRun.status === 'FAILED'
            ? summaryRun.updatedAt.toISOString()
            : undefined,
      },
    });
  } catch (err: any) {
    return apiError(err.message || 'Failed to fetch summary run status', 500);
  }
}
