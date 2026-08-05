import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SummaryStoreState {
  isModalOpen: boolean;
  activeRunId: string | null;
  activeLabelId: string | null;
  activeLabelName: string | null;
  isMinimized: boolean;

  openSummaryModal: (labelId?: string, labelName?: string) => void;
  closeSummaryModal: () => void;
  minimizeSummary: () => void;
  expandSummary: () => void;
  setActiveRun: (runId: string | null, labelId?: string, labelName?: string) => void;
  resetSummary: () => void;
}

export const useSummaryStore = create<SummaryStoreState>()(
  persist(
    (set) => ({
      isModalOpen: false,
      activeRunId: null,
      activeLabelId: null,
      activeLabelName: null,
      isMinimized: false,

      openSummaryModal: (labelId?: string, labelName?: string) =>
        set((state) => ({
          isModalOpen: true,
          isMinimized: false,
          activeLabelId: labelId !== undefined ? labelId : state.activeLabelId,
          activeLabelName: labelName !== undefined ? labelName : state.activeLabelName,
        })),

      closeSummaryModal: () =>
        set({
          isModalOpen: false,
        }),

      minimizeSummary: () =>
        set({
          isModalOpen: false,
          isMinimized: true,
        }),

      expandSummary: () =>
        set({
          isModalOpen: true,
          isMinimized: false,
        }),

      setActiveRun: (runId: string | null, labelId?: string, labelName?: string) =>
        set((state) => ({
          activeRunId: runId,
          activeLabelId: labelId !== undefined ? labelId : state.activeLabelId,
          activeLabelName: labelName !== undefined ? labelName : state.activeLabelName,
          isMinimized: false,
        })),

      resetSummary: () =>
        set({
          activeRunId: null,
          activeLabelId: null,
          activeLabelName: null,
          isMinimized: false,
        }),
    }),
    {
      name: 'mailhub-ai-summary-active',
      partialize: (state) => ({
        activeRunId: state.activeRunId,
        activeLabelId: state.activeLabelId,
        activeLabelName: state.activeLabelName,
        isMinimized: state.isMinimized,
      }),
    }
  )
);
