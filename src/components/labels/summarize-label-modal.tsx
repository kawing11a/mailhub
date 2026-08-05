'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useSummaryStore } from '@/stores/summaryStore';
import {
  Sparkles,
  X,
  Minus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Clock,
  Mail,
  Bell,
  Bot,
  Terminal,
  Cpu,
  ChevronDown,
  ChevronUp,
  Search,
  Zap,
  Send,
  RotateCcw,
} from 'lucide-react';

interface SummarizeLabelModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  initialLabelId?: string;
}

interface LabelItem {
  id: string;
  name: string;
  color: string;
}

interface WebhookItem {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
}

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

export interface AgentState {
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
  webhookLogs?: Array<{
    type: string;
    success: boolean;
    error?: string;
    deliveredAt?: string;
  }>;
}

interface SummaryRunStatus {
  id: string;
  status: 'QUEUED' | 'SUMMARIZING' | 'NOTIFYING' | 'COMPLETED' | 'FAILED';
  emailCount: number;
  labelName?: string;
  summaryText?: string;
  errorMessage?: string;
  webhookLogs?: Array<{
    type: string;
    success: boolean;
    error?: string;
    deliveredAt?: string;
  }>;
  agentState?: AgentState;
  createdAt: string;
  updatedAt: string;
}

export function SummarizeLabelModal({
  isOpen: propsIsOpen,
  onClose: propsOnClose,
  initialLabelId: propsInitialLabelId,
}: SummarizeLabelModalProps) {
  const store = useSummaryStore();

  const isControlled = typeof propsIsOpen === 'boolean';
  const isOpen = isControlled ? propsIsOpen : store.isModalOpen;

  const targetLabelId = propsInitialLabelId || store.activeLabelId || '';

  const [selectedLabelId, setSelectedLabelId] = useState<string>(targetLabelId);
  const [timeRangeHours, setTimeRangeHours] = useState<number>(0);
  const [limit, setLimit] = useState<number>(0);
  const [selectedWebhookIds, setSelectedWebhookIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [showLogs, setShowLogs] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);

  const logsContainerRef = useRef<HTMLDivElement>(null);

  const activeRunId = store.activeRunId;

  // Sync initial label ID
  useEffect(() => {
    if (targetLabelId) {
      setSelectedLabelId(targetLabelId);
    }
  }, [targetLabelId]);

  // Fetch Labels
  const { data: labelsData } = useQuery({
    queryKey: ['labels'],
    queryFn: async () => {
      const res = await fetch('/api/labels');
      if (!res.ok) throw new Error('Failed to fetch labels');
      return res.json();
    },
    enabled: isOpen,
  });

  const labels: LabelItem[] = labelsData?.labels || [];

  // Auto-select first label if none selected
  useEffect(() => {
    if (labels.length > 0 && !selectedLabelId) {
      setSelectedLabelId(labels[0].id);
    }
  }, [labels, selectedLabelId]);

  // Fetch Webhooks
  const { data: webhooksData } = useQuery({
    queryKey: ['notification-webhooks'],
    queryFn: async () => {
      const res = await fetch('/api/experiments/webhooks');
      if (!res.ok) throw new Error('Failed to fetch webhooks');
      return res.json();
    },
    enabled: isOpen,
  });

  const webhooks: WebhookItem[] = Array.isArray(webhooksData) ? webhooksData : webhooksData?.data || [];

  // Poll Summary Run Status (fast 750ms interval for real-time AI Agent streaming experience)
  const { data: runStatus } = useQuery<SummaryRunStatus>({
    queryKey: ['summary-run', activeRunId],
    queryFn: async () => {
      const res = await fetch(`/api/experiments/summary/${activeRunId}`);
      if (!res.ok) throw new Error('Failed to fetch summary run status');
      const data = await res.json();
      return data.data || data;
    },
    enabled: Boolean(activeRunId) && isOpen,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'COMPLETED' || status === 'FAILED') return false;
      return 750; // Fast sub-second poll for agent feeling
    },
  });

  // Elapsed Timer
  useEffect(() => {
    let timer: any;
    const isRunning =
      activeRunId &&
      runStatus?.status !== 'COMPLETED' &&
      runStatus?.status !== 'FAILED';

    if (isRunning) {
      const startTime = runStatus?.agentState?.startedAt
        ? new Date(runStatus.agentState.startedAt).getTime()
        : Date.now();

      timer = setInterval(() => {
        setElapsedMs(Date.now() - startTime);
      }, 100);
    } else if (runStatus?.agentState?.startedAt && runStatus?.agentState?.completedAt) {
      const start = new Date(runStatus.agentState.startedAt).getTime();
      const end = new Date(runStatus.agentState.completedAt).getTime();
      setElapsedMs(Math.max(0, end - start));
    }
    return () => clearInterval(timer);
  }, [activeRunId, runStatus?.status, runStatus?.agentState?.startedAt, runStatus?.agentState?.completedAt]);

  // Auto scroll agent logs to bottom
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [runStatus?.agentState?.logs]);

  const handleToggleWebhook = (id: string) => {
    if (selectedWebhookIds.includes(id)) {
      setSelectedWebhookIds(selectedWebhookIds.filter((wId) => wId !== id));
    } else {
      setSelectedWebhookIds([...selectedWebhookIds, id]);
    }
  };

  const handleClose = () => {
    const isRunning =
      activeRunId &&
      runStatus?.status !== 'COMPLETED' &&
      runStatus?.status !== 'FAILED';

    if (isRunning) {
      toast('🤖 AI Agent will continue running in the background.', {
        icon: '⚡',
        duration: 3500,
      });
      store.minimizeSummary();
    } else {
      store.closeSummaryModal();
    }

    propsOnClose?.();
  };

  const handleMinimize = () => {
    toast('🤖 Summary minimized to background widget.', {
      icon: '⚡',
      duration: 3000,
    });
    store.minimizeSummary();
    propsOnClose?.();
  };

  const handleStartSummary = async () => {
    if (!selectedLabelId) {
      toast.error('Please select a label');
      return;
    }

    const currentLabel = labels.find((l) => l.id === selectedLabelId);

    try {
      const res = await fetch('/api/experiments/summary/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          labelId: selectedLabelId,
          timeRangeHours,
          limit,
          webhookIds: selectedWebhookIds,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to start AI summary job');
      }

      const data = await res.json();
      const runId = data.summaryRunId || data.data?.summaryRunId;

      store.setActiveRun(runId, selectedLabelId, currentLabel?.name);
      setShowLogs(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to trigger summary');
    }
  };

  const handleCopySummary = () => {
    const text = runStatus?.summaryText || runStatus?.agentState?.summaryText;
    if (text) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Summary copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleReset = () => {
    store.resetSummary();
    setElapsedMs(0);
  };

  if (!isOpen) return null;

  const agentState = runStatus?.agentState;
  const isCompleted = runStatus?.status === 'COMPLETED';
  const isFailed = runStatus?.status === 'FAILED';
  const isRunning = !isCompleted && !isFailed && Boolean(activeRunId);

  const formattedElapsed = `${(elapsedMs / 1000).toFixed(1)}s`;

  // Step Icon Helper
  const getStepIcon = (step: AgentLogEntry['step'], status: AgentLogEntry['status']) => {
    if (status === 'failed') return <AlertCircle className="w-4 h-4 text-red-400" />;
    if (status === 'running') return <Loader2 className="w-4 h-4 animate-spin text-purple-400" />;
    if (status === 'completed') return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;

    switch (step) {
      case 'INITIALIZING':
        return <Cpu className="w-4 h-4 text-purple-400" />;
      case 'RESOLVING_ACCOUNTS':
        return <Search className="w-4 h-4 text-blue-400" />;
      case 'SEARCHING_EMAILS':
        return <Search className="w-4 h-4 text-cyan-400" />;
      case 'EXTRACTING_EMAILS':
        return <Mail className="w-4 h-4 text-amber-400" />;
      case 'AI_SUMMARIZING':
        return <Bot className="w-4 h-4 text-purple-400" />;
      case 'DISPATCHING_NOTIFICATIONS':
        return <Send className="w-4 h-4 text-pink-400" />;
      default:
        return <Zap className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-6 max-h-[92vh] flex flex-col border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="p-2.5 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-xl text-white shadow-md shadow-purple-500/20">
                <Bot className="w-5 h-5" />
              </div>
              {isRunning && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-bold text-gray-900">AI Agent Email Summarizer</h3>
                {activeRunId && (
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold ${
                      isCompleted
                        ? 'bg-emerald-100 text-emerald-700'
                        : isFailed
                        ? 'bg-red-100 text-red-700'
                        : 'bg-purple-100 text-purple-700 animate-pulse'
                    }`}
                  >
                    {isCompleted ? 'Completed' : isFailed ? 'Failed' : 'Agent Active'}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">
                Autonomous email synthesis, thread extraction &amp; multi-channel dispatch.
              </p>
            </div>
          </div>

          {/* Action buttons (Minimize & Close) */}
          <div className="flex items-center space-x-1">
            {activeRunId && (
              <button
                type="button"
                onClick={handleMinimize}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Run in Background (Minimize)"
              >
                <Minus className="w-5 h-5" />
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors hover:bg-gray-100"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-1">
          {!activeRunId ? (
            /* Configure Form */
            <div className="space-y-5">
              {/* Select Label */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                  Target Label
                </label>
                <select
                  value={selectedLabelId}
                  onChange={(e) => setSelectedLabelId(e.target.value)}
                  className="w-full text-sm border-gray-300 rounded-xl p-3 border focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 bg-gray-50/50 hover:bg-white transition-all font-medium text-gray-800"
                >
                  {labels.map((lbl) => (
                    <option key={lbl.id} value={lbl.id}>
                      🏷️ {lbl.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filters: Time Range & Limit */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                    <Clock className="w-3.5 h-3.5 text-purple-600" />
                    <span>Time Range</span>
                  </label>
                  <select
                    value={timeRangeHours}
                    onChange={(e) => setTimeRangeHours(Number(e.target.value))}
                    className="w-full text-sm border-gray-300 rounded-xl p-3 border font-medium text-gray-800 bg-gray-50/50 hover:bg-white transition-all"
                  >
                    <option value={0}>All Time (Recommended)</option>
                    <option value={24}>Last 24 Hours</option>
                    <option value={168}>Last 7 Days</option>
                    <option value={720}>Last 30 Days</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                    <Mail className="w-3.5 h-3.5 text-purple-600" />
                    <span>Max Email Limit</span>
                  </label>
                  <select
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    className="w-full text-sm border-gray-300 rounded-xl p-3 border font-medium text-gray-800 bg-gray-50/50 hover:bg-white transition-all"
                  >
                    <option value={0}>Unlimited (All Emails)</option>
                    <option value={25}>Max 25 Emails</option>
                    <option value={50}>Max 50 Emails</option>
                    <option value={100}>Max 100 Emails</option>
                  </select>
                </div>
              </div>

              {/* Webhook Destinations */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                  <Bell className="w-3.5 h-3.5 text-purple-600" />
                  <span>Notify Webhook Channels</span>
                </label>
                {webhooks.length === 0 ? (
                  <div className="p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-xs text-gray-400 flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-gray-400 shrink-0" />
                    <span>
                      No active webhooks configured. Add Telegram/WeCom bots in <strong>Settings &gt; Experimental</strong>.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-200 rounded-xl p-3 bg-gray-50/50">
                    {webhooks.map((wh) => (
                      <label
                        key={wh.id}
                        className="flex items-center justify-between text-sm text-gray-800 p-2.5 hover:bg-white rounded-lg cursor-pointer transition-all border border-transparent hover:border-gray-200"
                      >
                        <div className="flex items-center space-x-2.5">
                          <input
                            type="checkbox"
                            checked={selectedWebhookIds.includes(wh.id)}
                            onChange={() => handleToggleWebhook(wh.id)}
                            className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                          />
                          <span className="font-medium">{wh.name}</span>
                        </div>
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-purple-50 font-mono text-purple-700 border border-purple-100 uppercase">
                          {wh.type}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Live AI Agent View */
            <div className="space-y-5">
              {/* Active Agent Status Card */}
              <div
                className={`p-4 rounded-xl border transition-all ${
                  isCompleted
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                    : isFailed
                    ? 'bg-red-50/70 border-red-200 text-red-950'
                    : 'bg-gradient-to-r from-purple-50/80 via-indigo-50/80 to-blue-50/80 border-purple-200 shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`p-2.5 rounded-lg ${
                        isCompleted
                          ? 'bg-emerald-100 text-emerald-600'
                          : isFailed
                          ? 'bg-red-100 text-red-600'
                          : 'bg-purple-100 text-purple-600'
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : isFailed ? (
                        <AlertCircle className="w-5 h-5" />
                      ) : (
                        <Sparkles className="w-5 h-5 animate-pulse" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h4 className="text-sm font-bold text-gray-900">
                          {agentState?.currentStepTitle ||
                            (isCompleted
                              ? 'Summary Generated Successfully'
                              : isFailed
                              ? 'Agent Run Failed'
                              : 'AI Agent Working...')}
                        </h4>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {agentState?.currentStepDetail ||
                          (isCompleted
                            ? `Synthesized ${runStatus?.emailCount || agentState?.emailCount || 0} emails`
                            : 'Analyzing contextual emails and constructing summary')}
                      </p>
                    </div>
                  </div>

                  {/* Timer Badge */}
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-mono font-bold text-purple-900 bg-purple-100/80 px-2.5 py-1 rounded-md border border-purple-200/60">
                      ⏱️ {formattedElapsed}
                    </span>
                  </div>
                </div>
              </div>

              {/* Collapsible Agent Execution Terminal */}
              <div className="rounded-xl border border-slate-800 bg-slate-950 text-slate-100 shadow-xl overflow-hidden">
                {/* Terminal Header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800">
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80 inline-block"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block"></span>
                    </div>
                    <span className="text-xs font-mono text-slate-400 ml-2 flex items-center space-x-1.5">
                      <Terminal className="w-3.5 h-3.5 text-purple-400" />
                      <span>agent-trace.log</span>
                      <span className="text-slate-600">#{(activeRunId || '').slice(0, 8)}</span>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowLogs(!showLogs)}
                    className="flex items-center space-x-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    <span>{showLogs ? 'Hide trace' : 'Show trace'}</span>
                    {showLogs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Terminal Log Stream */}
                {showLogs && (
                  <div
                    ref={logsContainerRef}
                    className="p-3.5 space-y-2.5 max-h-56 overflow-y-auto font-mono text-xs scrollbar-thin scrollbar-thumb-slate-800"
                  >
                    {(!agentState?.logs || agentState.logs.length === 0) && (
                      <div className="flex items-center space-x-2 text-slate-400 italic">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                        <span>Initializing agent execution runtime...</span>
                      </div>
                    )}

                    {agentState?.logs?.map((log) => (
                      <div
                        key={log.id}
                        className={`flex items-start space-x-2.5 p-2 rounded transition-all ${
                          log.status === 'running'
                            ? 'bg-purple-950/40 border border-purple-800/40 text-purple-200'
                            : log.status === 'failed'
                            ? 'bg-red-950/40 border border-red-800/40 text-red-200'
                            : 'hover:bg-slate-900 text-slate-300'
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">{getStepIcon(log.step, log.status)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-200">{log.title}</span>
                            <span className="text-[10px] text-slate-500">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          {log.detail && (
                            <p className="text-[11px] text-slate-400 mt-0.5 break-words leading-relaxed">
                              {log.detail}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Error Message */}
              {isFailed && (
                <div className="p-4 bg-red-50 text-red-700 text-sm rounded-xl border border-red-200">
                  <div className="flex items-center space-x-2 font-semibold">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <span>Job Error</span>
                  </div>
                  <p className="mt-1 text-xs">{runStatus?.errorMessage || agentState?.errorMessage || 'Unknown error occurred.'}</p>
                </div>
              )}

              {/* Generated Summary Card */}
              {(runStatus?.summaryText || agentState?.summaryText) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                        Generated AI Summary
                      </span>
                      <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-mono">
                        {runStatus?.emailCount || agentState?.emailCount || 0} Emails Analyzed
                      </span>
                    </div>
                    <button
                      onClick={handleCopySummary}
                      className="flex items-center space-x-1.5 text-xs text-purple-600 hover:text-purple-700 font-semibold bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded-md transition-colors"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied' : 'Copy Summary'}</span>
                    </button>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-800 font-sans whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto selection:bg-purple-100 shadow-inner">
                    {runStatus?.summaryText || agentState?.summaryText}
                  </div>
                </div>
              )}

              {/* Webhook Delivery Logs */}
              {((runStatus?.webhookLogs && runStatus.webhookLogs.length > 0) ||
                (agentState?.webhookLogs && agentState.webhookLogs.length > 0)) && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
                    Notification Dispatch Results
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(runStatus?.webhookLogs || agentState?.webhookLogs || []).map((log, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center justify-between p-2.5 text-xs rounded-xl border ${
                          log.success
                            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800'
                            : 'bg-red-50/80 border-red-200 text-red-800'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <span className="font-bold uppercase font-mono">{log.type}</span>
                        </div>
                        <span className="text-[11px] font-medium">
                          {log.success ? '✓ Delivered' : `Failed: ${log.error || 'Err'}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          {!activeRunId ? (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartSummary}
                className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-sm font-medium transition-all flex items-center space-x-2 shadow-md shadow-purple-500/20"
              >
                <Sparkles className="w-4 h-4" />
                <span>Launch AI Summary Agent</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center space-x-2 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5 text-gray-500" />
                <span>New Summary</span>
              </button>
              <div className="flex items-center space-x-2">
                {isRunning && (
                  <button
                    type="button"
                    onClick={handleMinimize}
                    className="px-4 py-2 border border-purple-200 text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl text-sm font-medium transition-colors"
                  >
                    Run in Background
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  {isCompleted ? 'Done' : 'Minimize'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
