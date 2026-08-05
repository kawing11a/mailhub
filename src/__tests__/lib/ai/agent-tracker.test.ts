import {
  initAgentRun,
  updateAgentStep,
  getAgentRunState,
  completeAgentRun,
  failAgentRun,
} from '../../../lib/ai/agent-tracker';
import { redis } from '../../../lib/redis';

jest.mock('../../../lib/redis', () => {
  const store = new Map<string, string>();
  return {
    redis: {
      set: jest.fn(async (key: string, val: string) => {
        store.set(key, val);
        return 'OK';
      }),
      get: jest.fn(async (key: string) => {
        return store.get(key) || null;
      }),
    },
  };
});

describe('Agent Tracker Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('initializes and retrieves agent state in Redis', async () => {
    const runId = 'test-run-123';
    const state = await initAgentRun(runId, 'Invoices', { timeRangeHours: 24, limit: 10 });

    expect(state.runId).toBe(runId);
    expect(state.status).toBe('QUEUED');
    expect(state.logs.length).toBe(1);
    expect(state.logs[0].step).toBe('INITIALIZING');

    const fetched = await getAgentRunState(runId);
    expect(fetched).not.toBeNull();
    expect(fetched?.runId).toBe(runId);
    expect(fetched?.currentStepTitle).toContain('Initializing');
  });

  test('updates agent steps and maintains chronological log entries', async () => {
    const runId = 'test-run-456';
    await initAgentRun(runId, 'Support');

    await updateAgentStep(
      runId,
      {
        id: 'step-search',
        step: 'SEARCHING_EMAILS',
        title: 'Querying Meilisearch',
        detail: 'Matched 12 emails',
        status: 'completed',
      },
      {
        status: 'SEARCHING_EMAILS',
        currentStepTitle: 'Found 12 emails',
      }
    );

    const state = await getAgentRunState(runId);
    expect(state?.status).toBe('SEARCHING_EMAILS');
    expect(state?.currentStepTitle).toBe('Found 12 emails');
    expect(state?.logs.length).toBe(2);
    expect(state?.logs[1].title).toBe('Querying Meilisearch');
    expect(state?.logs[1].status).toBe('completed');
  });

  test('completes agent run with summary and email count', async () => {
    const runId = 'test-run-789';
    await initAgentRun(runId, 'Billing');

    await completeAgentRun(runId, 'Generated executive summary...', 5, [
      { type: 'telegram', success: true, deliveredAt: new Date().toISOString() },
    ]);

    const state = await getAgentRunState(runId);
    expect(state?.status).toBe('COMPLETED');
    expect(state?.summaryText).toBe('Generated executive summary...');
    expect(state?.emailCount).toBe(5);
    expect(state?.completedAt).toBeDefined();
    expect(state?.webhookLogs?.length).toBe(1);
  });

  test('records failed run with error message', async () => {
    const runId = 'test-run-fail';
    await initAgentRun(runId, 'Orders');

    await failAgentRun(runId, 'Rate limit exceeded on OpenAI');

    const state = await getAgentRunState(runId);
    expect(state?.status).toBe('FAILED');
    expect(state?.errorMessage).toBe('Rate limit exceeded on OpenAI');
    const failedLog = state?.logs.find((l) => l.status === 'failed');
    expect(failedLog).toBeDefined();
    expect(failedLog?.detail).toBe('Rate limit exceeded on OpenAI');
  });
});
