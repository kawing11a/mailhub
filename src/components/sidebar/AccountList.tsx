'use client';

import { useQuery } from '@tanstack/react-query';
import { useAccountStore } from '@/stores/accountStore';
import { AlertTriangle, ChevronDown, Inbox, Loader2, Tag } from 'lucide-react';
import clsx from 'clsx';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

interface EmailAccount {
  id: string;
  label?: string | null;
  emailAddress: string;
  color?: string | null;
}

interface AccountLabel {
  id: string;
  name: string;
  color?: string | null;
  accountIds?: string[];
}

interface LabelsResponse {
  labels: AccountLabel[];
}

export function AccountList() {
  const { selectedAccountId, setSelectedAccountId } = useAccountStore();
  const pathname = usePathname();
  const router = useRouter();
  const [selectedLabelId, setSelectedLabelId] = useState('all');

  const handleSelect = (id: string) => {
    setSelectedAccountId(id);
    if (!pathname.startsWith('/inbox')) {
      router.push('/inbox');
    }
  };


  const { data: accounts = [], isLoading: isLoadingAccounts } = useQuery<EmailAccount[]>({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts');
      if (!res.ok) throw new Error('Failed to fetch accounts');
      return res.json();
    },
  });

  const {
    data: labelsData,
    isLoading: isLoadingLabels,
    isError: isLabelsError,
  } = useQuery<LabelsResponse>({
    queryKey: ['labels'],
    queryFn: async () => {
      const res = await fetch('/api/labels');
      if (!res.ok) throw new Error('Failed to fetch labels');
      return res.json();
    },
  });

  const labels = labelsData?.labels || [];
  const filteredAccounts = useMemo(() => {
    if (selectedLabelId === 'all') return accounts;
    const selectedLabel = labels.find((label) => label.id === selectedLabelId);
    if (!selectedLabel) return accounts;
    const accountIds = new Set(selectedLabel.accountIds || []);
    return accounts.filter((account) => accountIds.has(account.id));
  }, [accounts, labels, selectedLabelId]);

  if (isLoadingAccounts) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-1 p-2">
      <button
        onClick={() => handleSelect('all')}
        className={clsx(
          'flex flex-none items-center space-x-3 px-3 py-2 rounded-md transition-colors text-sm font-medium',
          selectedAccountId === 'all'
            ? 'bg-accent-600 text-white shadow-sm'
            : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
        )}
      >
        <Inbox className="w-4 h-4" />
        <span>Unified Inbox</span>
      </button>

      <div className="flex-none pt-4 pb-1">
        <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Accounts
        </p>
      </div>

      <div className="flex-none px-2 pb-1">
        <label
          htmlFor="account-label-filter"
          className="mb-1.5 block px-1 text-xs font-medium text-gray-500"
        >
          Filter by label
        </label>
        <div className="relative">
          {isLoadingLabels ? (
            <Loader2 className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
          ) : (
            <Tag className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400" />
          )}
          <select
            id="account-label-filter"
            value={selectedLabelId}
            onChange={(event) => setSelectedLabelId(event.target.value)}
            disabled={isLoadingLabels || isLabelsError || labels.length === 0}
            className="w-full appearance-none rounded-md border border-gray-200 bg-white py-2 pl-8 pr-8 text-sm text-gray-700 shadow-sm outline-none transition-colors hover:border-gray-300 focus:border-accent-500 focus:ring-2 focus:ring-accent-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
          >
            <option value="all">
              {isLoadingLabels
                ? 'Loading labels…'
                : isLabelsError
                  ? 'Labels unavailable'
                  : labels.length === 0
                    ? 'No labels available'
                    : 'All labels'}
            </option>
            {labels.map((label) => (
              <option key={label.id} value={label.id}>
                {label.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">
        {filteredAccounts.length === 0 ? (
          <p className="px-3 py-2 text-xs italic text-gray-500">
            {selectedLabelId === 'all' ? 'No accounts connected' : 'No accounts use this label'}
          </p>
        ) : (
          <div className="space-y-1">
            {filteredAccounts.map((account) => (
              <button
                key={account.id}
                onClick={() => handleSelect(account.id)}
                className={clsx(
                  'flex w-full items-center justify-between px-3 py-2 rounded-md transition-colors text-sm font-medium',
                  selectedAccountId === account.id
                    ? 'bg-accent-600 text-white shadow-sm'
                    : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
                )}
              >
                <div className="flex items-center space-x-3 truncate">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: account.color || '#3B82F6' }}
                  />
                  <span className="truncate">{account.label || account.emailAddress}</span>
                </div>
                {account.authError && (
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 ml-2" title="Authentication Error" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
