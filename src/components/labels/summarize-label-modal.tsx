'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Clock,
  Mail,
  Bell,
} from 'lucide-react';

interface SummarizeLabelModalProps {
  isOpen: boolean;
  onClose: () => void;
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

interface SummaryRunStatus {
  id: string;
  status: 'QUEUED' | 'SUMMARIZING' | 'NOTIFYING' | 'COMPLETED' | 'FAILED';
  emailCount: number;
  summaryText?: string;
  errorMessage?: string;
  webhookLogs?: Array<{
    type: string;
    success: boolean;
    error?: string;
    deliveredAt: string;
  }>;
}

export function SummarizeLabelModal({ isOpen, onClose, initialLabelId }: SummarizeLabelModalProps) {
  const [selectedLabelId, setSelectedLabelId] = useState<string>(initialLabelId || '');
  const [timeRangeHours, setTimeRangeHours] = useState<number>(0);
  const [limit, setLimit] = useState<number>(0);
  const [selectedWebhookIds, setSelectedWebhookIds] = useState<string[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Sync initial label ID
  useEffect(() => {
    if (initialLabelId) {
      setSelectedLabelId(initialLabelId);
    }
  }, [initialLabelId]);

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

  // Poll Summary Run Status
  const { data: runStatus, isFetching: isPolling } = useQuery<SummaryRunStatus>({
    queryKey: ['summary-run', activeRunId],
    queryFn: async () => {
      const res = await fetch(`/api/experiments/summary/${activeRunId}`);
      if (!res.ok) throw new Error('Failed to fetch summary run status');
      const data = await res.json();
      return data.data || data;
    },
    enabled: Boolean(activeRunId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'COMPLETED' || status === 'FAILED') return false;
      return 1500; // Poll every 1.5 seconds while active
    },
  });

  const handleToggleWebhook = (id: string) => {
    if (selectedWebhookIds.includes(id)) {
      setSelectedWebhookIds(selectedWebhookIds.filter((wId) => wId !== id));
    } else {
      setSelectedWebhookIds([...selectedWebhookIds, id]);
    }
  };

  const handleStartSummary = async () => {
    if (!selectedLabelId) {
      toast.error('Please select a label');
      return;
    }

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
      setActiveRunId(data.summaryRunId || data.data?.summaryRunId);
    } catch (err: any) {
      toast.error(err.message || 'Failed to trigger summary');
    }
  };

  const handleCopySummary = () => {
    if (runStatus?.summaryText) {
      navigator.clipboard.writeText(runStatus.summaryText);
      setCopied(true);
      toast.success('Summary copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleReset = () => {
    setActiveRunId(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">AI Email Summary by Label</h3>
              <p className="text-xs text-gray-500">Summarize email batches and dispatch webhook API alerts.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
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
                  className="w-full text-sm border-gray-300 rounded-md p-2.5 border focus:ring-purple-500 focus:border-purple-500"
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
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2 flex items-center space-x-1">
                    <Clock className="w-3.5 h-3.5 text-gray-500" />
                    <span>Time Range</span>
                  </label>
                  <select
                    value={timeRangeHours}
                    onChange={(e) => setTimeRangeHours(Number(e.target.value))}
                    className="w-full text-sm border-gray-300 rounded-md p-2.5 border font-medium text-gray-800"
                  >
                    <option value={0}>All Time (Recommended)</option>
                    <option value={24}>Last 24 Hours</option>
                    <option value={168}>Last 7 Days</option>
                    <option value={720}>Last 30 Days</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2 flex items-center space-x-1">
                    <Mail className="w-3.5 h-3.5 text-gray-500" />
                    <span>Max Email Limit</span>
                  </label>
                  <select
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    className="w-full text-sm border-gray-300 rounded-md p-2.5 border font-medium text-gray-800"
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
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2 flex items-center space-x-1">
                  <Bell className="w-3.5 h-3.5 text-purple-600" />
                  <span>Notify Webhook Channels</span>
                </label>
                {webhooks.length === 0 ? (
                  <p className="text-xs text-gray-400 italic bg-gray-50 p-3 rounded-md border border-dashed border-gray-200">
                    No webhooks configured. Configure Telegram/WeCom webhooks in Settings &gt; Experimental.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-200 rounded-md p-3 bg-gray-50">
                    {webhooks.map((wh) => (
                      <label
                        key={wh.id}
                        className="flex items-center justify-between text-sm text-gray-800 p-2 hover:bg-white rounded cursor-pointer transition-colors"
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
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-200 font-mono text-gray-700">
                          {wh.type}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Progress & Results View */
            <div className="space-y-5">
              {/* Status Header */}
              <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg border border-purple-100">
                <div className="flex items-center space-x-3">
                  {runStatus?.status === 'COMPLETED' ? (
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  ) : runStatus?.status === 'FAILED' ? (
                    <AlertCircle className="w-6 h-6 text-red-600" />
                  ) : (
                    <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                  )}
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">
                      {runStatus?.status === 'QUEUED' && 'Job Queued...'}
                      {runStatus?.status === 'SUMMARIZING' && 'Summarizing Email Content with AI...'}
                      {runStatus?.status === 'NOTIFYING' && 'Dispatching Webhook Notifications...'}
                      {runStatus?.status === 'COMPLETED' && 'AI Summary Completed!'}
                      {runStatus?.status === 'FAILED' && 'Summary Job Failed'}
                    </h4>
                    <p className="text-xs text-gray-500">
                      {runStatus?.emailCount ? `Processed ${runStatus.emailCount} emails` : 'Processing batch...'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {runStatus?.status === 'FAILED' && (
                <div className="p-4 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
                  <p className="font-semibold">Error:</p>
                  <p className="mt-1">{runStatus.errorMessage || 'Unknown error occurred.'}</p>
                </div>
              )}

              {/* Render Summary Text */}
              {runStatus?.summaryText && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">Generated Summary</span>
                    <button
                      onClick={handleCopySummary}
                      className="flex items-center space-x-1 text-xs text-purple-600 hover:text-purple-700 font-medium"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied' : 'Copy Summary'}</span>
                    </button>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 text-sm text-gray-800 font-sans whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                    {runStatus.summaryText}
                  </div>
                </div>
              )}

              {/* Webhook Delivery Logs */}
              {runStatus?.webhookLogs && runStatus.webhookLogs.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">Notification Delivery Status</span>
                  <div className="space-y-2">
                    {runStatus.webhookLogs.map((log, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center justify-between p-2.5 text-xs rounded border ${
                          log.success ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
                        }`}
                      >
                        <span className="font-semibold">{log.type}</span>
                        <span>{log.success ? 'Delivered' : `Failed: ${log.error}`}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-100">
          {!activeRunId ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartSummary}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-sm font-medium transition-colors flex items-center space-x-2 shadow-sm"
              >
                <Sparkles className="w-4 h-4" />
                <span>Generate Summary</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                New Summary
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-md text-sm font-medium transition-colors"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
