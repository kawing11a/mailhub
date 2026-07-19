'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import { EmailList } from '@/components/email/EmailList';
import { EmailViewer } from '@/components/email/EmailViewer';
import { useUIStore } from '@/stores/uiStore';
import { useAccountStore } from '@/stores/accountStore';
import clsx from 'clsx';

function NewEmailsContent() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const selectedEmailId = searchParams.get('emailId');
  const { readingPane } = useUIStore();
  const { setSelectedAccountId } = useAccountStore();

  useEffect(() => {
    setSelectedAccountId('new-emails');
    return () => setSelectedAccountId(null);
  }, [setSelectedAccountId]);

  const handleSelectEmail = (id: string | null) => {
    const newParams = new URLSearchParams(searchParams.toString());
    if (id) newParams.set('emailId', id);
    else newParams.delete('emailId');
    const queryString = newParams.toString();
    const url = queryString ? `${pathname}?${queryString}` : pathname;
    window.history.pushState(null, '', url);
  };

  if (readingPane === 'off') {
    return (
      <div className="flex flex-1 h-full overflow-hidden relative">
        {selectedEmailId ? (
          <div className="absolute inset-0 z-10 bg-white flex flex-col">
            <EmailViewer emailId={selectedEmailId} onBack={() => handleSelectEmail(null)} />
          </div>
        ) : (
          <div className="w-full h-full flex flex-col">
            <EmailList selectedEmailId={selectedEmailId} onSelectEmail={handleSelectEmail} />
          </div>
        )}
      </div>
    );
  }

  const isBottomPane = readingPane === 'bottom';

  return (
    <div className={clsx("flex flex-1 h-full overflow-hidden", isBottomPane ? "flex-col" : "")}>
      <div className={clsx("flex flex-col", isBottomPane ? (selectedEmailId ? "h-[45%] min-h-[300px]" : "h-full") : "w-1/3 min-w-[320px] max-w-[480px] h-full")}>
        <EmailList selectedEmailId={selectedEmailId} onSelectEmail={handleSelectEmail} />
      </div>
      <div className={clsx("bg-white relative", isBottomPane ? "flex-1 border-t border-gray-200" : "flex-1 h-full border-l border-gray-200")}>
        {selectedEmailId ? (
          <EmailViewer emailId={selectedEmailId} onBack={() => handleSelectEmail(null)} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-gray-500 bg-gray-50/50">
            <p className="text-sm font-medium">Select an item to read</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function NewEmailsPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center bg-gray-50/50"><div className="w-6 h-6 animate-spin text-accent-500 border-2 border-current border-t-transparent rounded-full" /></div>}>
      <NewEmailsContent />
    </Suspense>
  );
}
