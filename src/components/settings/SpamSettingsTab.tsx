'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, ShieldAlert, ShieldCheck, Download, Upload, RefreshCw, Loader2, Sparkles, Check, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export function SpamSettingsTab() {
  const queryClient = useQueryClient();
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');

  // Fetch Stats
  const { data: statsData, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['spam-stats'],
    queryFn: async () => {
      const res = await fetch('/api/ai/spam/stats');
      if (!res.ok) throw new Error('Failed to fetch spam stats');
      return res.json();
    },
  });

  const stats = statsData?.stats || {
    totalSpam: 0,
    totalHam: 0,
    vocabularySize: 0,
    totalSamplesRecorded: 0,
    topSpamKeywords: [],
    topSafeKeywords: [],
  };

  // Export Dataset
  const handleExport = async () => {
    try {
      const res = await fetch('/api/ai/spam/dataset');
      if (!res.ok) throw new Error('Failed to export dataset');
      const data = await res.json();

      const blob = new Blob([JSON.stringify(data.dataset, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `spam-training-dataset-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Spam dataset exported successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Export failed');
    }
  };

  // Import Dataset Mutation
  const importMutation = useMutation({
    mutationFn: async () => {
      let parsedDataset;
      try {
        parsedDataset = JSON.parse(importJsonText);
      } catch {
        throw new Error('Invalid JSON format');
      }

      const res = await fetch('/api/ai/spam/dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset: parsedDataset, mode: importMode }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['spam-stats'] });
      toast.success(data.message || 'Dataset imported successfully!');
      setIsImportModalOpen(false);
      setImportJsonText('');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to import dataset');
    },
  });

  // Reset Model Mutation
  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ai/spam/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      });
      if (!res.ok) throw new Error('Failed to reset model');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spam-stats'] });
      toast.success('Spam model reset to default initial seeds');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to reset model');
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setImportJsonText(content);
    };
    reader.readAsText(file);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-100 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-red-50 text-red-600 rounded-lg">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Spam Filter & Continuous Learning</h2>
            <p className="text-xs text-gray-500">
              Trained incrementally whenever you mark emails as &quot;Definite Spam&quot; or &quot;It&apos;s Safe&quot;. Portable across environments.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleExport}
            className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-md text-xs font-medium transition-colors flex items-center space-x-1.5 shadow-xs"
            title="Download generic JSON dataset to copy to another environment"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Generic Dataset</span>
          </button>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-3 py-1.5 bg-purple-50 border border-purple-200 hover:bg-purple-100 text-purple-700 rounded-md text-xs font-medium transition-colors flex items-center space-x-1.5 shadow-xs"
            title="Import generic JSON dataset from another environment"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import Dataset</span>
          </button>
          <button
            onClick={() => refetch()}
            className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
            title="Refresh stats"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-red-50/50 border border-red-100 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-red-700">Trained Spam Samples</span>
              <ShieldAlert className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-2xl font-bold text-red-900 mt-2">{stats.totalSpam}</p>
            <p className="text-[11px] text-red-600 mt-0.5">Learned spam signals</p>
          </div>

          <div className="p-4 bg-green-50/50 border border-green-100 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-green-700">Trained Safe Samples</span>
              <ShieldCheck className="w-4 h-4 text-green-500" />
            </div>
            <p className="text-2xl font-bold text-green-900 mt-2">{stats.totalHam}</p>
            <p className="text-[11px] text-green-600 mt-0.5">Verified authentic signals</p>
          </div>

          <div className="p-4 bg-purple-50/50 border border-purple-100 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-purple-700">Model Vocabulary</span>
              <Sparkles className="w-4 h-4 text-purple-500" />
            </div>
            <p className="text-2xl font-bold text-purple-900 mt-2">{stats.vocabularySize}</p>
            <p className="text-[11px] text-purple-600 mt-0.5">Weighted tokens & domain scores</p>
          </div>
        </div>

        {/* Top Keywords Cloud */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
              Top Learned Spam Indicators
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {stats.topSpamKeywords.length > 0 ? (
                stats.topSpamKeywords.map((item: any) => (
                  <span
                    key={item.token}
                    className="px-2.5 py-1 bg-red-100/70 border border-red-200 text-red-800 text-xs font-medium rounded-md flex items-center gap-1"
                  >
                    <span>{item.token}</span>
                    <span className="text-[10px] text-red-500 bg-white/80 px-1 rounded font-mono">{item.count}</span>
                  </span>
                ))
              ) : (
                <span className="text-xs text-gray-400">No custom tokens trained yet.</span>
              )}
            </div>
          </div>

          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
              Top Learned Safe Indicators
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {stats.topSafeKeywords.length > 0 ? (
                stats.topSafeKeywords.map((item: any) => (
                  <span
                    key={item.token}
                    className="px-2.5 py-1 bg-green-100/70 border border-green-200 text-green-800 text-xs font-medium rounded-md flex items-center gap-1"
                  >
                    <span>{item.token}</span>
                    <span className="text-[10px] text-green-600 bg-white/80 px-1 rounded font-mono">{item.count}</span>
                  </span>
                ))
              ) : (
                <span className="text-xs text-gray-400">No custom tokens trained yet.</span>
              )}
            </div>
          </div>
        </div>

        {/* Reset Model Button */}
        <div className="pt-2 flex items-center justify-between border-t border-gray-100">
          <p className="text-xs text-gray-400">
            Clicking reset will restore the classifier to default initial seed rules.
          </p>
          <button
            type="button"
            onClick={() => {
              if (confirm('Are you sure you want to reset the spam model back to default seeds?')) {
                resetMutation.mutate();
              }
            }}
            disabled={resetMutation.isPending}
            className="text-xs text-red-600 hover:text-red-700 font-medium transition-colors"
          >
            {resetMutation.isPending ? 'Resetting...' : 'Reset to Default Seeds'}
          </button>
        </div>
      </div>

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-purple-600" />
                <h3 className="text-base font-bold text-gray-900">Import Generic Spam Dataset</h3>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-500">
              Upload or paste generic training JSON exported from another environment (e.g. staging or production) to transfer spam classification intelligence.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Import File (.json)</label>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileUpload}
                  className="w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Or Paste JSON Data</label>
                <textarea
                  rows={6}
                  value={importJsonText}
                  onChange={(e) => setImportJsonText(e.target.value)}
                  placeholder='{ "version": "1.0", "modelState": { ... } }'
                  className="w-full text-xs font-mono p-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-900 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Import Mode</label>
                <div className="flex gap-4 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                      className="text-purple-600 focus:ring-purple-500"
                    />
                    <span>Replace existing model</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'merge'}
                      onChange={() => setImportMode('merge')}
                      className="text-purple-600 focus:ring-purple-500"
                    />
                    <span>Merge with existing model</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!importJsonText.trim() || importMutation.isPending}
                onClick={() => importMutation.mutate()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {importMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Import & Retrain Model</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
