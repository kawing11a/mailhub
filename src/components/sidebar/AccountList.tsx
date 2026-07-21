'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccountStore } from '@/stores/accountStore';
import { useUIStore } from '@/stores/uiStore';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Star, Tag } from 'lucide-react';
import clsx from 'clsx';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

interface EmailAccount {
  id: string;
  label?: string | null;
  emailAddress: string;
  color?: string | null;
  authError?: string | null;
  isActive?: boolean;
  isFavourite?: boolean;
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
  const { accountsExpanded, setAccountsExpanded } = useUIStore();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedLabelId, setSelectedLabelId] = useState('all');

  const handleSelect = (id: string) => {
    setSelectedAccountId(id);
    if (!pathname.startsWith('/inbox')) {
      router.push('/inbox');
    }
  };

  // Toggle an account's favourite state. `isFavourite` is the CURRENT state:
  // true means it's favourited, so this call removes it (soft delete); false adds it.
  const favouriteMutation = useMutation({
    mutationFn: async ({ accountId, isFavourite }: { accountId: string; isFavourite: boolean }) => {
      const res = await fetch(
        isFavourite ? `/api/favourites/${accountId}` : '/api/favourites',
        {
          method: isFavourite ? 'DELETE' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: isFavourite ? undefined : JSON.stringify({ accountId }),
        }
      );
      if (!res.ok) throw new Error('Failed to update favourite');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favourites'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });


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
  const selectedLabel = useMemo(() => labels.find((l) => l.id === selectedLabelId), [labels, selectedLabelId]);
  
  const filteredAccounts = useMemo(() => {
    if (selectedLabelId === 'all') return accounts;
    if (!selectedLabel) return accounts;
    const accountIds = new Set(selectedLabel.accountIds || []);
    return accounts.filter((account) => accountIds.has(account.id));
  }, [accounts, selectedLabelId, selectedLabel]);

  // Force the list open when there's nothing favourited, otherwise honour the
  // user's persisted collapse preference.
  const hasFavourites = useMemo(() => accounts.some((a) => a.isFavourite), [accounts]);
  const showList = accountsExpanded || !hasFavourites;

  if (isLoadingAccounts) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className={clsx('flex flex-col space-y-1 p-2', !hasFavourites ? 'min-h-0 flex-1' : 'flex-none')}>


      <div className="flex-none pt-4 pb-1">
        <button
          type="button"
          onClick={() => setAccountsExpanded(!accountsExpanded)}
          disabled={!hasFavourites}
          className="flex w-full items-center gap-1 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider transition-colors hover:text-gray-700 disabled:cursor-default disabled:hover:text-gray-500"
          title={hasFavourites ? (showList ? 'Collapse accounts' : 'Expand accounts') : undefined}
        >
          {hasFavourites && (
            showList
              ? <ChevronDown className="h-3.5 w-3.5" />
              : <ChevronRight className="h-3.5 w-3.5" />
          )}
          <span>Accounts</span>
        </button>
      </div>

      {showList && (
      <>
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
            <Tag 
              className={clsx(
                "pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2",
                !selectedLabel?.color && "text-gray-400"
              )}
              style={selectedLabel?.color ? { color: selectedLabel.color } : undefined}
            />
          )}
          <select
            id="account-label-filter"
            value={selectedLabelId}
            onChange={(event) => setSelectedLabelId(event.target.value)}
            disabled={isLoadingLabels || isLabelsError || labels.length === 0}
            className="w-full appearance-none rounded-md border border-gray-200 bg-white py-2 pl-8 pr-8 text-sm text-gray-700 shadow-sm outline-none transition-colors hover:border-gray-300 focus:border-accent-500 focus:ring-2 focus:ring-accent-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
            style={selectedLabel?.color ? { color: selectedLabel.color, fontWeight: 500 } : undefined}
          >
            <option value="all" style={{ color: '#374151' }}>
              {isLoadingLabels
                ? 'Loading labels…'
                : isLabelsError
                  ? 'Labels unavailable'
                  : labels.length === 0
                    ? 'No labels available'
                    : 'All labels'}
            </option>
            {labels.map((label) => (
              <option key={label.id} value={label.id} style={{ color: label.color || undefined, fontWeight: 500 }}>
                {label.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      <div className={clsx(
        'overflow-y-auto overscroll-contain pr-0.5',
        !hasFavourites ? 'min-h-0 flex-1' : 'max-h-[35vh]'
      )}>
        {filteredAccounts.length === 0 ? (
          <p className="px-3 py-2 text-xs italic text-gray-500">
            {selectedLabelId === 'all' ? 'No accounts connected' : 'No accounts use this label'}
          </p>
        ) : (
          <div className="space-y-1">
            {filteredAccounts.map((account) => {
              const isSelected = selectedAccountId === account.id;
              return (
              <div
                key={account.id}
                className={clsx(
                  'group flex items-center rounded-md pr-1 transition-colors',
                  isSelected
                    ? 'bg-accent-600 shadow-sm'
                    : 'hover:bg-gray-200'
                )}
              >
                <button
                  onClick={() => handleSelect(account.id)}
                  className={clsx(
                    'flex min-w-0 flex-1 items-center space-x-3 px-3 py-2 rounded-md text-left text-sm font-medium',
                    isSelected ? 'text-white' : 'text-gray-700 group-hover:text-gray-900'
                  )}
                >
                  <div
                    className={clsx(
                      "w-2 h-2 rounded-full flex-shrink-0",
                      account.authError
                        ? "bg-red-500"
                        : account.isActive === false
                          ? "bg-yellow-500"
                          : "bg-green-500"
                    )}
                    title={
                      account.authError
                        ? "Authentication Error"
                        : account.isActive === false
                          ? "Sync Problem"
                          : "Connected and syncing"
                    }
                  />
                  <span className="truncate">{account.label || account.emailAddress}</span>
                </button>
                {account.authError && (
                  <span title="Authentication Error" className="flex-shrink-0 mr-0.5">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  </span>
                )}
                <button
                  onClick={() =>
                    favouriteMutation.mutate({
                      accountId: account.id,
                      isFavourite: !!account.isFavourite,
                    })
                  }
                  disabled={favouriteMutation.isPending}
                  title={account.isFavourite ? 'Remove from favourites' : 'Add to favourites'}
                  aria-pressed={account.isFavourite}
                  className="flex-shrink-0 rounded p-1 transition-colors disabled:opacity-50"
                >
                  <Star
                    className={clsx(
                      'w-4 h-4 transition-colors',
                      account.isFavourite
                        ? 'fill-yellow-400 text-yellow-400'
                        : isSelected
                          ? 'text-white/70 hover:text-white'
                          : 'text-gray-300 hover:text-yellow-400'
                    )}
                  />
                </button>
              </div>
              );
            })}
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
