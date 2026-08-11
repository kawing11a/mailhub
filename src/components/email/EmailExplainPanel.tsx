'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, AlertCircle, CheckCircle2, FileText, Info, HelpCircle, Tag, X } from 'lucide-react';

export interface ExplanationData {
  summary: string;
  takeaways: string[];
  actionItems: string[];
  sentiment: string;
  jargon: Array<{ term: string; definition: string }>;
}

interface EmailExplainPanelProps {
  subject?: string;
  bodyText?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function EmailExplainPanel({ subject, bodyText, isOpen, onClose }: EmailExplainPanelProps) {
  const [data, setData] = useState<ExplanationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && !data && !isLoading) {
      fetchExplanation();
    }
  }, [isOpen]);

  const fetchExplanation = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, bodyText }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to explain email');
      }

      setData(resData.explanation);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="w-80 lg:w-96 bg-white dark:bg-gray-900 border-l border-purple-100 dark:border-purple-900/40 h-full flex flex-col shadow-xl z-20 transition-all duration-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-purple-50/50 dark:bg-purple-950/20">
        <div className="flex items-center gap-2 font-semibold text-purple-900 dark:text-purple-300 text-sm">
          <Sparkles className="w-4 h-4 text-purple-600 animate-pulse" />
          <span>AI Email Explanation</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-purple-100 dark:hover:bg-purple-900/50 rounded-full text-gray-500 hover:text-gray-700 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {isLoading && (
          <div className="py-12 flex flex-col items-center justify-center text-gray-500 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
            <span>Analyzing email context...</span>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 rounded-lg text-red-700 dark:text-red-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Analysis Failed</p>
              <p className="text-xs">{error}</p>
              <button
                onClick={fetchExplanation}
                className="mt-2 px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {data && !isLoading && (
          <>
            {/* Sentiment & Tone Badge */}
            {data.sentiment && (
              <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-2.5 rounded-lg border border-gray-200/60 dark:border-gray-700">
                <span className="font-medium text-gray-500 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5" /> Tone & Urgency
                </span>
                <span className="font-semibold px-2 py-0.5 rounded-full text-xs bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
                  {data.sentiment}
                </span>
              </div>
            )}

            {/* Plain English Summary */}
            <div className="space-y-1.5">
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1 text-xs">
                <Info className="w-3.5 h-3.5 text-purple-600" />
                Plain English Summary
              </h4>
              <div className="p-3 bg-purple-50/40 dark:bg-purple-950/10 border border-purple-100 dark:border-purple-900/30 rounded-lg text-gray-700 dark:text-gray-300 leading-relaxed">
                {data.summary}
              </div>
            </div>

            {/* Key Takeaways */}
            {data.takeaways && data.takeaways.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1 text-xs">
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  Key Takeaways
                </h4>
                <ul className="space-y-1 pl-1">
                  {data.takeaways.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-1.5 text-gray-700 dark:text-gray-300">
                      <span className="text-blue-500 font-bold">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action Items */}
            {data.actionItems && data.actionItems.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                  Required Action Items
                </h4>
                <ul className="space-y-1 pl-1">
                  {data.actionItems.map((action, idx) => (
                    <li key={idx} className="flex items-start gap-1.5 text-gray-700 dark:text-gray-300">
                      <span className="text-green-500 font-bold">✓</span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Jargon Glossary */}
            {data.jargon && data.jargon.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-gray-800">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-1 text-xs">
                  <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                  Key Terms & Jargon
                </h4>
                <div className="space-y-2">
                  {data.jargon.map((item, idx) => (
                    <div key={idx} className="p-2 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded">
                      <p className="font-semibold text-amber-900 dark:text-amber-300">{item.term}</p>
                      <p className="text-gray-600 dark:text-gray-400 mt-0.5">{item.definition}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
