'use client';

import React, { useState } from 'react';
import { Sparkles, Loader2, Check, RefreshCw, Wand2, ArrowRight } from 'lucide-react';
import { extractCleanEmailText } from '@/lib/email/clean-text';

interface ComposeAiWriterProps {
  onApplyDraft: (text: string) => void;
  currentContent?: string;
  replySubject?: string;
  replyBody?: string;
}

export function ComposeAiWriter({ onApplyDraft, currentContent, replySubject, replyBody }: ComposeAiWriterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState('Professional');
  const [length, setLength] = useState('Medium');
  const [mode, setMode] = useState<'generate' | 'rewrite' | 'proofread' | 'expand' | 'shorten'>('generate');
  const [isLoading, setIsLoading] = useState(false);
  const [generatedResult, setGeneratedResult] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim() && mode === 'generate') return;
    setIsLoading(true);
    setError(null);

    try {
      const cleanExistingText = currentContent ? extractCleanEmailText(currentContent, { maxLength: 4000 }) : undefined;
      const cleanReplyText = replyBody ? extractCleanEmailText(replyBody, { maxLength: 4000 }) : undefined;

      const res = await fetch('/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          tone,
          length,
          action: mode,
          existingText: cleanExistingText,
          replyContext: replySubject || cleanReplyText ? { subject: replySubject, body: cleanReplyText } : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate draft');
      }

      setGeneratedResult(data.result);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = () => {
    if (generatedResult) {
      onApplyDraft(generatedResult);
      setIsOpen(false);
      setGeneratedResult('');
      setPrompt('');
    }
  };

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-md border border-purple-200 transition-colors shadow-sm"
        title="AI Draft Assistant"
      >
        <Sparkles className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
        <span>AI Writer</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 bottom-full mb-2 w-80 sm:w-96 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-purple-100 dark:border-purple-900/40 p-4 z-50 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2 mb-3">
            <div className="flex items-center gap-1.5 font-semibold text-sm text-purple-900 dark:text-purple-300">
              <Wand2 className="w-4 h-4 text-purple-600" />
              <span>AI Email Writer</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3 text-xs">
            {/* Mode selection */}
            <div>
              <label className="block text-gray-500 font-medium mb-1">Mode</label>
              <div className="grid grid-cols-3 gap-1 bg-gray-50 dark:bg-gray-800 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setMode('generate')}
                  className={`py-1 px-2 text-center rounded font-medium ${
                    mode === 'generate'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  Generate
                </button>
                <button
                  type="button"
                  onClick={() => setMode('rewrite')}
                  className={`py-1 px-2 text-center rounded font-medium ${
                    mode === 'rewrite'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  Rewrite
                </button>
                <button
                  type="button"
                  onClick={() => setMode('proofread')}
                  className={`py-1 px-2 text-center rounded font-medium ${
                    mode === 'proofread'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  Proofread
                </button>
              </div>
            </div>

            {/* Prompt input */}
            <div>
              <label className="block text-gray-500 font-medium mb-1">
                {mode === 'generate' ? 'What do you want to write?' : 'Instructions / Refinements'}
              </label>
              <textarea
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  mode === 'generate'
                    ? 'e.g. Thank John for the invoice and request updated timeline...'
                    : 'e.g. Make it more concise and polite...'
                }
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              />
            </div>

            {/* Controls: Tone & Length */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-gray-500 font-medium mb-1">Tone</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500"
                >
                  <option value="Professional">Professional</option>
                  <option value="Friendly">Friendly</option>
                  <option value="Formal">Formal</option>
                  <option value="Concise">Concise</option>
                  <option value="Persuasive">Persuasive</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-500 font-medium mb-1">Length</label>
                <select
                  value={length}
                  onChange={(e) => setLength(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500"
                >
                  <option value="Short">Short</option>
                  <option value="Medium">Medium</option>
                  <option value="Detailed">Detailed</option>
                </select>
              </div>
            </div>

            {error && <div className="text-red-500 text-xs">{error}</div>}

            {/* Action button */}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isLoading || (!prompt.trim() && mode === 'generate')}
              className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg font-medium flex items-center justify-center gap-1.5 transition-colors shadow-sm"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Drafting...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{generatedResult ? 'Regenerate Draft' : 'Generate Draft'}</span>
                </>
              )}
            </button>

            {/* Result Preview */}
            {generatedResult && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <label className="block text-gray-500 font-medium mb-1">AI Generated Preview</label>
                <div className="p-2.5 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30 rounded-lg max-h-36 overflow-y-auto text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed text-xs">
                  {generatedResult}
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={handleApply}
                    className="flex-1 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium flex items-center justify-center gap-1 shadow-xs"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Insert into Email</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
