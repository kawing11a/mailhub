'use client';

import { useState } from 'react';
import { EmailList } from '@/components/email/EmailList';
import { EmailViewer } from '@/components/email/EmailViewer';

export default function InboxPage() {
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      <div className="w-1/3 min-w-[320px] max-w-[480px] h-full flex flex-col">
        <EmailList
          selectedEmailId={selectedEmailId}
          onSelectEmail={setSelectedEmailId}
        />
      </div>
      <div className="flex-1 h-full bg-white relative border-l border-gray-200">
        {selectedEmailId ? (
          <EmailViewer 
            emailId={selectedEmailId} 
            onBack={() => setSelectedEmailId(null)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-gray-500 bg-gray-50/50">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-gray-100">
              <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium">Select an item to read</p>
          </div>
        )}
      </div>
    </div>
  );
}
