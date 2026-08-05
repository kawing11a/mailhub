'use client';

import { useState, Suspense, use } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { EmailRow } from '@/components/email/EmailRow';
import { EmailViewer } from '@/components/email/EmailViewer';
import { useSummaryStore } from '@/stores/summaryStore';
import { Loader2, Sparkles } from 'lucide-react';

function LabelContent({ labelId }: { labelId: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const selectedEmailId = searchParams.get('emailId');
  const openSummaryModal = useSummaryStore((s) => s.openSummaryModal);

  const handleSelectEmail = (id: string | null) => {
    const newParams = new URLSearchParams(searchParams.toString());
    if (id) {
      newParams.set('emailId', id);
    } else {
      newParams.delete('emailId');
    }
    const queryString = newParams.toString();
    const url = queryString ? `${pathname}?${queryString}` : pathname;
    window.history.pushState(null, '', url);
  };

  const { data: labelData } = useQuery({
    queryKey: ['labels'],
    queryFn: async () => {
      const res = await fetch('/api/labels');
      return res.json();
    },
  });

  const label = labelData?.labels?.find((l: any) => l.id === labelId);

  const { data: emailsData, isLoading } = useQuery({
    queryKey: ['labelEmails', labelId],
    queryFn: async () => {
      const res = await fetch(`/api/labels/${labelId}/emails`);
      if (!res.ok) throw new Error('Failed to fetch labeled emails');
      return res.json();
    },
  });

  const emails = emailsData?.emails || [];

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      <div className="w-1/3 min-w-[320px] max-w-[480px] h-full flex flex-col bg-white border-r border-gray-200">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {label && (
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: label.color }}
              />
            )}
            <h2 className="font-semibold text-gray-900">
              {label ? label.name : 'Loading label...'}
            </h2>
          </div>
          <button
            onClick={() => openSummaryModal(labelId, label?.name)}
            className="px-2.5 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 text-xs font-semibold rounded-md transition-colors flex items-center space-x-1"
            title="Summarize emails in this label using AI"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Summary</span>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : emails.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No emails with this label.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {emails.map((email: any) => (
                <EmailRow
                  key={email.id}
                  email={email}
                  onClick={(id) => handleSelectEmail(id)}
                  isSelected={selectedEmailId === email.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 h-full bg-white relative">
        {selectedEmailId ? (
          <EmailViewer 
            emailId={selectedEmailId} 
            onBack={() => handleSelectEmail(null)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-gray-500 bg-gray-50/50">
            <p className="text-sm font-medium">Select an item to read</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LabelPage({ params }: { params: Promise<{ labelId: string }> }) {
  const { labelId } = use(params);
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center bg-gray-50/50"><Loader2 className="w-6 h-6 animate-spin text-accent-500" /></div>}>
      <LabelContent labelId={labelId} />
    </Suspense>
  );
}
