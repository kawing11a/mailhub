'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSummaryStore } from '@/stores/summaryStore';
import {
  Bot,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
  Maximize2,
  Loader2,
  ChevronRight,
} from 'lucide-react';

interface SummaryRunStatus {
  id: string;
  status: 'QUEUED' | 'SUMMARIZING' | 'NOTIFYING' | 'COMPLETED' | 'FAILED';
  emailCount: number;
  labelName?: string;
  summaryText?: string;
  errorMessage?: string;
  agentState?: {
    currentStepTitle: string;
    currentStepDetail?: string;
    emailCount?: number;
    startedAt?: string;
    completedAt?: string;
  };
}

export function FloatingSummaryWidget() {
  const { isModalOpen, activeRunId, activeLabelName, expandSummary, resetSummary } =
    useSummaryStore();

  const [elapsedMs, setElapsedMs] = useState(0);

  // Poll status while active
  const { data: runStatus } = useQuery<SummaryRunStatus>({
    queryKey: ['summary-run-floating', activeRunId],
    queryFn: async () => {
      const res = await fetch(`/api/experiments/summary/${activeRunId}`);
      if (!res.ok) throw new Error('Failed to fetch summary run status');
      const data = await res.json();
      return data.data || data;
    },
    enabled: Boolean(activeRunId) && !isModalOpen,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'COMPLETED' || status === 'FAILED') return false;
      return 1000;
    },
  });

  // Elapsed Timer
  useEffect(() => {
    let timer: any;
    const isRunning =
      activeRunId &&
      !isModalOpen &&
      runStatus?.status !== 'COMPLETED' &&
      runStatus?.status !== 'FAILED';

    if (isRunning) {
      const startTime = runStatus?.agentState?.startedAt
        ? new Date(runStatus.agentState.startedAt).getTime()
        : Date.now();

      timer = setInterval(() => {
        setElapsedMs(Date.now() - startTime);
      }, 200);
    } else if (runStatus?.agentState?.startedAt && runStatus?.agentState?.completedAt) {
      const start = new Date(runStatus.agentState.startedAt).getTime();
      const end = new Date(runStatus.agentState.completedAt).getTime();
      setElapsedMs(Math.max(0, end - start));
    }
    return () => clearInterval(timer);
  }, [activeRunId, isModalOpen, runStatus?.status, runStatus?.agentState?.startedAt, runStatus?.agentState?.completedAt]);

  if (isModalOpen || !activeRunId) {
    return null;
  }

  const isCompleted = runStatus?.status === 'COMPLETED';
  const isFailed = runStatus?.status === 'FAILED';
  const isRunning = !isCompleted && !isFailed;
  const labelDisplay = runStatus?.labelName || activeLabelName || 'Selected Label';
  const formattedElapsed = `${(elapsedMs / 1000).toFixed(1)}s`;

  return (
    <div className="fixed bottom-5 right-5 z-40 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div
        className={`flex items-center space-x-3 px-4 py-3 rounded-2xl shadow-2xl border transition-all backdrop-blur-md cursor-pointer select-none group ${
          isCompleted
            ? 'bg-emerald-900/90 text-white border-emerald-700/60 shadow-emerald-950/30'
            : isFailed
            ? 'bg-rose-900/90 text-white border-rose-700/60 shadow-rose-950/30'
            : 'bg-slate-900/95 text-white border-purple-500/40 shadow-purple-950/40 hover:border-purple-400'
        }`}
        onClick={() => expandSummary()}
      >
        {/* Animated Icon */}
        <div className="relative shrink-0">
          <div
            className={`p-2 rounded-xl text-white ${
              isCompleted
                ? 'bg-emerald-500/20 text-emerald-400'
                : isFailed
                ? 'bg-rose-500/20 text-rose-400'
                : 'bg-purple-500/20 text-purple-400'
            }`}
          >
            {isCompleted ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : isFailed ? (
              <AlertCircle className="w-5 h-5" />
            ) : (
              <Bot className="w-5 h-5 animate-pulse" />
            )}
          </div>
          {isRunning && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-500"></span>
            </span>
          )}
        </div>

        {/* Content Info */}
        <div className="flex flex-col min-w-[170px] max-w-[260px]">
          <div className="flex items-center space-x-1.5">
            <span className="text-xs font-bold tracking-wide truncate">
              {isCompleted ? 'Summary Ready' : isFailed ? 'Summary Failed' : 'AI Agent Working'}
            </span>
            <span className="text-[10px] opacity-70 font-mono">({formattedElapsed})</span>
          </div>
          <span className="text-[11px] text-slate-300 truncate mt-0.5">
            {runStatus?.agentState?.currentStepTitle || `Label: "${labelDisplay}"`}
          </span>
        </div>

        {/* Expand & Dismiss Buttons */}
        <div className="flex items-center space-x-1.5 pl-2 border-l border-slate-700/60">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              expandSummary();
            }}
            className="p-1.5 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition-colors"
            title="Expand AI Summary Modal"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              resetSummary();
            }}
            className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
            title="Dismiss widget"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
