import { redis } from '@/lib/redis';
import { createUniqueId } from '@/lib/identifiers';

export interface AgentLogEntry {
  id: string;
  timestamp: string;
  step:
    | 'INITIALIZING'
    | 'RESOLVING_ACCOUNTS'
    | 'SEARCHING_EMAILS'
    | 'EXTRACTING_EMAILS'
    | 'AI_SUMMARIZING'
    | 'DISPATCHING_NOTIFICATIONS'
    | 'COMPLETED'
    | 'FAILED';
  title: string;
  detail?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'info';
}

export interface AgentRunState {
  runId: string;
  status:
    | 'QUEUED'
    | 'INITIALIZING'
    | 'SEARCHING_EMAILS'
    | 'AI_SUMMARIZING'
    | 'NOTIFYING'
    | 'COMPLETED'
    | 'FAILED';
  currentStepTitle: string;
  currentStepDetail?: string;
  emailCount?: number;
  provider?: string;
  modelName?: string;
  summaryText?: string;
  errorMessage?: string;
  logs: AgentLogEntry[];
  startedAt: string;
  completedAt?: string;
  webhookLogs?: any[];
}

const REDIS_KEY_PREFIX = 'summary_run:';
const TTL_SECONDS = 86400; // 24 hours

function getKey(runId: string): string {
  return `${REDIS_KEY_PREFIX}${runId}:state`;
}

export async function initAgentRun(
  runId: string,
  labelName: string,
  config?: { timeRangeHours?: number; limit?: number }
): Promise<AgentRunState> {
  const now = new Date().toISOString();
  const timeText =
    config?.timeRangeHours && config.timeRangeHours > 0
      ? `Last ${config.timeRangeHours}h`
      : 'All time';
  const limitText = config?.limit && config.limit > 0 ? `Max ${config.limit}` : 'All';

  const initialLog: AgentLogEntry = {
    id: createUniqueId('log-init'),
    timestamp: now,
    step: 'INITIALIZING',
    title: 'AI Agent session queued',
    detail: `Target: "${labelName}" | Time filter: ${timeText} | Limit: ${limitText}`,
    status: 'running',
  };

  const state: AgentRunState = {
    runId,
    status: 'QUEUED',
    currentStepTitle: 'Initializing AI agent & scheduling job...',
    currentStepDetail: `Label: "${labelName}"`,
    logs: [initialLog],
    startedAt: now,
  };

  try {
    if (redis && typeof redis.set === 'function') {
      await redis.set(getKey(runId), JSON.stringify(state), 'EX', TTL_SECONDS);
    }
  } catch (err) {
    console.warn('Failed to save initial agent state to Redis:', err);
  }

  return state;
}

export async function updateAgentStep(
  runId: string,
  log: Omit<AgentLogEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: string },
  overallUpdate?: Partial<AgentRunState>
): Promise<AgentRunState | null> {
  try {
    let state = await getAgentRunState(runId);
    const now = new Date().toISOString();

    if (!state) {
      state = {
        runId,
        status: overallUpdate?.status || 'INITIALIZING',
        currentStepTitle: overallUpdate?.currentStepTitle || log.title,
        currentStepDetail: overallUpdate?.currentStepDetail || log.detail,
        logs: [],
        startedAt: now,
      };
    }

    const logId = log.id || `log-${log.step.toLowerCase()}`;
    const timestamp = log.timestamp || now;

    // Check if log with same ID exists to update in place, or append
    const existingIndex = state.logs.findIndex((l) => l.id === logId);
    const updatedEntry: AgentLogEntry = {
      id: logId,
      timestamp,
      step: log.step,
      title: log.title,
      detail: log.detail,
      status: log.status,
    };

    if (existingIndex >= 0) {
      state.logs[existingIndex] = updatedEntry;
    } else {
      state.logs.push(updatedEntry);
    }

    if (overallUpdate) {
      if (overallUpdate.status) state.status = overallUpdate.status;
      if (overallUpdate.currentStepTitle) state.currentStepTitle = overallUpdate.currentStepTitle;
      if (overallUpdate.currentStepDetail) state.currentStepDetail = overallUpdate.currentStepDetail;
      if (overallUpdate.emailCount !== undefined) state.emailCount = overallUpdate.emailCount;
      if (overallUpdate.provider) state.provider = overallUpdate.provider;
      if (overallUpdate.modelName) state.modelName = overallUpdate.modelName;
      if (overallUpdate.summaryText) state.summaryText = overallUpdate.summaryText;
      if (overallUpdate.errorMessage) state.errorMessage = overallUpdate.errorMessage;
      if (overallUpdate.webhookLogs) state.webhookLogs = overallUpdate.webhookLogs;
      if (overallUpdate.completedAt) state.completedAt = overallUpdate.completedAt;
    }

    if (redis && typeof redis.set === 'function') {
      await redis.set(getKey(runId), JSON.stringify(state), 'EX', TTL_SECONDS);
    }

    return state;
  } catch (err) {
    console.warn(`Failed to update agent step for run ${runId}:`, err);
    return null;
  }
}

export async function getAgentRunState(runId: string): Promise<AgentRunState | null> {
  try {
    if (redis && typeof redis.get === 'function') {
      const data = await redis.get(getKey(runId));
      if (data) {
        return JSON.parse(data) as AgentRunState;
      }
    }
  } catch (err) {
    console.warn(`Failed to get agent state from Redis for run ${runId}:`, err);
  }
  return null;
}

export async function completeAgentRun(
  runId: string,
  summaryText: string,
  emailCount: number,
  webhookLogs?: any[]
): Promise<AgentRunState | null> {
  const now = new Date().toISOString();
  return updateAgentStep(
    runId,
    {
      id: 'step-completed',
      step: 'COMPLETED',
      title: 'AI Summary synthesis completed',
      detail: `Successfully processed ${emailCount} emails and generated summary.`,
      status: 'completed',
    },
    {
      status: 'COMPLETED',
      currentStepTitle: 'AI Summary generation completed!',
      currentStepDetail: `Processed ${emailCount} emails successfully`,
      summaryText,
      emailCount,
      webhookLogs,
      completedAt: now,
    }
  );
}

export async function failAgentRun(
  runId: string,
  errorMessage: string
): Promise<AgentRunState | null> {
  const now = new Date().toISOString();
  return updateAgentStep(
    runId,
    {
      id: createUniqueId('step-failed'),
      step: 'FAILED',
      title: 'Agent run encountered an error',
      detail: errorMessage,
      status: 'failed',
    },
    {
      status: 'FAILED',
      currentStepTitle: 'AI Summary failed',
      currentStepDetail: errorMessage,
      errorMessage,
      completedAt: now,
    }
  );
}
