'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import { EmailList } from '@/components/email/EmailList';
import { EmailViewer } from '@/components/email/EmailViewer';
import { useUIStore } from '@/stores/uiStore';
import { useAccountStore } from '@/stores/accountStore';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';

function AllEmailsContent() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const selectedEmailId = searchParams.get('emailId');
  const accountIdParam = searchParams.get('accountId');
  const { readingPane } = useUIStore();
  const { setSelectedAccountId } = useAccountStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    const targetAccountId = accountIdParam || 'all';
    setSelectedAccountId(targetAccountId);
    return () => {
      if (useAccountStore.getState().selectedAccountId === targetAccountId) {
        setSelectedAccountId(null);
      }
    };
  }, [accountIdParam, setSelectedAccountId]);

  // Whenever the user visits (or returns to) All Emails, immediately re-fetch
  // the badge counts so they reflect server truth rather than stale optimistic state.
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['new-emails-count'] });
    queryClient.invalidateQueries({ queryKey: ['accountStats'] });
  }, [accountIdParam, queryClient]);

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
      <div className={clsx("flex flex-col", isBottomPane ? (selectedEmailId ? "h-[45%] min-h-[300px]" : "h-full") : (selectedEmailId ? "w-1/3 min-w-[320px] max-w-[480px] h-full" : "w-full h-full"))}>
        <EmailList selectedEmailId={selectedEmailId} onSelectEmail={handleSelectEmail} />
      </div>
      {selectedEmailId && (
        <div className={clsx("bg-white relative", isBottomPane ? "flex-1 border-t border-gray-200" : "flex-1 h-full border-l border-gray-200")}>
          <EmailViewer emailId={selectedEmailId} onBack={() => handleSelectEmail(null)} />
        </div>
      )}
    </div>
  );
}

export default function AllEmailsPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center bg-gray-50/50"><div className="w-6 h-6 animate-spin text-accent-500 border-2 border-current border-t-transparent rounded-full" /></div>}>
      <AllEmailsContent />
    </Suspense>
  );
}
