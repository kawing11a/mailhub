'use client';

import { useQuery } from '@tanstack/react-query';
import { useAccountStore } from '@/stores/accountStore';
import { Inbox, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { usePathname, useRouter } from 'next/navigation';

export function AccountList() {
  const { selectedAccountId, setSelectedAccountId } = useAccountStore();
  const pathname = usePathname();
  const router = useRouter();

  const selectFolder = (folderId: string) => {
    console.log('Selected folder:', folderId);
  };

  const selectAccount = (accountId: string) => {
    console.log('Selected account:', accountId);
  };

  const navigateToInboxWhenNeeded = () => {
    if (pathname !== '/inbox') {
      router.push('/inbox');
    }
  };

  const handleFolderSelect = (folderId: string) => {
    selectFolder(folderId);
    navigateToInboxWhenNeeded();
  };

  const handleAccountSelect = (accountId: string) => {
    selectAccount(accountId);
    navigateToInboxWhenNeeded();
  };

  const handleSelect = (id: string) => {
    setSelectedAccountId(id);
    if (!pathname.startsWith('/inbox')) {
      router.push('/inbox');
    }
  };


  const { data: accounts, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts');
      if (!res.ok) throw new Error('Failed to fetch accounts');
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-1 p-2">
      <button
        onClick={() => handleSelect('all')}
        className={clsx(
          'flex items-center space-x-3 px-3 py-2 rounded-md transition-colors text-sm font-medium',
          selectedAccountId === 'all'
            ? 'bg-accent-600 text-white shadow-sm'
            : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
        )}
      >
        <Inbox className="w-4 h-4" />
        <span>Unified Inbox</span>
      </button>

      <div className="pt-4 pb-1">
        <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Accounts
        </p>
      </div>

      {accounts?.map((account: any) => (
        <button
          key={account.id}
          onClick={() => handleSelect(account.id)}
          className={clsx(
            'flex items-center justify-between px-3 py-2 rounded-md transition-colors text-sm font-medium',
            selectedAccountId === account.id
              ? 'bg-accent-600 text-white shadow-sm'
              : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
          )}
        >
          <div className="flex items-center space-x-3 truncate">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: account.color || '#3B82F6' }}
            />
            <span className="truncate">{account.label || account.emailAddress}</span>
          </div>
          {/* We can add unread counts here later by querying /api/accounts/:id/stats */}
        </button>
      ))}
    </div>
  );
}
