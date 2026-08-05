import { useSummaryStore } from '../../stores/summaryStore';

describe('useSummaryStore', () => {
  beforeEach(() => {
    useSummaryStore.getState().resetSummary();
    useSummaryStore.getState().closeSummaryModal();
  });

  test('opens modal with initial label and updates store state', () => {
    useSummaryStore.getState().openSummaryModal('lbl-1', 'Invoices');

    const state = useSummaryStore.getState();
    expect(state.isModalOpen).toBe(true);
    expect(state.isMinimized).toBe(false);
    expect(state.activeLabelId).toBe('lbl-1');
    expect(state.activeLabelName).toBe('Invoices');
  });

  test('minimizes active summary without losing active run ID', () => {
    useSummaryStore.getState().setActiveRun('run-999', 'lbl-2', 'Receipts');
    useSummaryStore.getState().minimizeSummary();

    const state = useSummaryStore.getState();
    expect(state.isModalOpen).toBe(false);
    expect(state.isMinimized).toBe(true);
    expect(state.activeRunId).toBe('run-999');
    expect(state.activeLabelName).toBe('Receipts');
  });

  test('expands minimized summary back to modal', () => {
    useSummaryStore.getState().setActiveRun('run-999', 'lbl-2', 'Receipts');
    useSummaryStore.getState().minimizeSummary();
    useSummaryStore.getState().expandSummary();

    const state = useSummaryStore.getState();
    expect(state.isModalOpen).toBe(true);
    expect(state.isMinimized).toBe(false);
    expect(state.activeRunId).toBe('run-999');
  });

  test('resets summary run cleanly', () => {
    useSummaryStore.getState().setActiveRun('run-999', 'lbl-2', 'Receipts');
    useSummaryStore.getState().resetSummary();

    const state = useSummaryStore.getState();
    expect(state.activeRunId).toBeNull();
    expect(state.activeLabelId).toBeNull();
    expect(state.activeLabelName).toBeNull();
    expect(state.isMinimized).toBe(false);
  });
});
