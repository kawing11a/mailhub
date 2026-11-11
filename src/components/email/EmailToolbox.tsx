'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  ListTodo,
  SmilePlus,
  Languages,
  ShieldAlert,
  Loader2,
  X,
  Wrench,
} from 'lucide-react';
import { EmailActionMenu, type EmailActionMenuItem } from './EmailActionMenu';

interface EmailToolboxProps {
  accountId?: string;
  emailText?: string;
  emailSubject?: string;
  selectedEmailCount?: number;
  explanation?: { isOpen: boolean; onToggle: () => void };
}

export function EmailToolbox({ accountId, emailText, emailSubject, selectedEmailCount = 0, explanation }: EmailToolboxProps) {
  const [activeModalTool, setActiveModalTool] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targetLang, setTargetLang] = useState('English');

  const runTool = async (tool: string) => {
    if (!accountId || (!emailText && !emailSubject)) return;
    setActiveModalTool(tool);
    setIsLoading(true);
    setError(null);
    setResultText(null);

    try {
      const res = await fetch('/api/ai/toolbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          tool,
          text: `Subject: ${emailSubject || ''}\n\nContent:\n${emailText || ''}`,
          targetLanguage: targetLang,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Tool execution failed');
      }

      setResultText(data.result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error running AI tool');
    } finally {
      setIsLoading(false);
    }
  };

  const getToolTitle = (tool: string) => {
    switch (tool) {
      case 'extract_tasks':
        return '📋 Action Items Extracted';
      case 'tone_check':
        return '🎭 Tone & Sentiment Analysis';
      case 'translate':
        return `🌐 Translated (${targetLang})`;
      case 'spam_check':
        return '🛡️ Security & Spam Risk Assessment';
      default:
        return 'AI Tool Output';
    }
  };

  const actions: EmailActionMenuItem[] = [
    ...(explanation ? [{
      id: 'explain',
      label: explanation.isOpen ? 'Close explanation' : 'Explain email',
      icon: <Sparkles className="h-4 w-4 text-purple-500" />,
      onSelect: explanation.onToggle,
    }] : []),
    {
      id: 'extract_tasks',
      label: 'Extract action items',
      icon: <ListTodo className="h-4 w-4 text-blue-500" />,
      disabled: isLoading,
      onSelect: () => runTool('extract_tasks'),
    },
    {
      id: 'tone_check',
      label: 'Analyze tone and sentiment',
      icon: <SmilePlus className="h-4 w-4 text-emerald-500" />,
      disabled: isLoading,
      onSelect: () => runTool('tone_check'),
    },
    {
      id: 'translate',
      label: 'Translate email',
      icon: <Languages className="h-4 w-4 text-purple-500" />,
      disabled: isLoading,
      onSelect: () => runTool('translate'),
    },
    {
      id: 'spam_check',
      label: 'Security and phishing check',
      icon: <ShieldAlert className="h-4 w-4 text-amber-500" />,
      disabled: isLoading,
      onSelect: () => runTool('spam_check'),
    },
  ];

  return (
    <div className="relative inline-block">
      <EmailActionMenu
        label="Email AI Toolbox"
        title={selectedEmailCount > 1 ? `AI tools for ${selectedEmailCount} selected emails` : 'Email AI Toolbox'}
        heading="Email AI quick tools"
        icon={<><Wrench className="h-3.5 w-3.5 text-purple-600" /><span>AI Toolbox</span></>}
        triggerClassName="flex items-center gap-1.5 rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 shadow-xs transition-colors hover:bg-purple-100"
        items={actions}
      />

      {/* Tool Output Modal */}
      {activeModalTool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-purple-100 dark:border-purple-900/40 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-purple-50/50 dark:bg-purple-950/20">
              <h3 className="font-semibold text-sm text-purple-900 dark:text-purple-300">
                {getToolTitle(activeModalTool)}
              </h3>
              <button
                onClick={() => setActiveModalTool(null)}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full text-gray-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 text-xs space-y-3">
              {activeModalTool === 'translate' && (
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-gray-500 font-medium">Target Language:</label>
                  <select
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="px-2 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-xs"
                  >
                    <option value="English">English</option>
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                    <option value="German">German</option>
                    <option value="Chinese">Chinese</option>
                    <option value="Japanese">Japanese</option>
                  </select>
                  <button
                    onClick={() => runTool('translate')}
                    className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700"
                  >
                    Translate
                  </button>
                </div>
              )}

              {isLoading && (
                <div className="py-8 flex flex-col items-center justify-center text-gray-500 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                  <span>Processing email tool...</span>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-xs">
                  {error}
                </div>
              )}

              {resultText && !isLoading && (
                <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg max-h-80 overflow-y-auto whitespace-pre-wrap leading-relaxed text-gray-800 dark:text-gray-200">
                  {resultText}
                </div>
              )}
            </div>

            <div className="p-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-850 flex justify-end">
              <button
                onClick={() => setActiveModalTool(null)}
                className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-medium hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
