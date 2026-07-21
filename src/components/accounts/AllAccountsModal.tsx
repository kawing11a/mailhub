'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, usePathname } from 'next/navigation';
import { AlertTriangle, Check, Search, Star, Tag, X } from 'lucide-react';
import clsx from 'clsx';
import { useAccountStore } from '@/stores/accountStore';
import { useUIStore } from '@/stores/uiStore';
import {
  accountDisplayName,
  shouldShowEmail,
  sortedByName,
  sortedFavourites,
  useAccounts,
  useFavouriteMutations,
  type SidebarAccount,
} from '@/hooks/useFavouriteMutations';

interface AccountLabel {
  id: string;
  name: string;
  color?: string | null;
  accountIds?: string[];
}

function AccountRow({
  account,
  isSelected,
  onSelect,
  onToggleFavourite,
}: {
  account: SidebarAccount;
  isSelected: boolean;
  onSelect: () => void;
  onToggleFavourite: () => void;
}) {
  return (
    <div
      className={clsx(
        'group flex items-center rounded-md pr-1 transition-colors',
        isSelected ? 'bg-accent-50 ring-1 ring-accent-200' : 'hover:bg-gray-100'
      )}
    >
      <button
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center space-x-3 rounded-md px-3 py-2 text-left"
      >
        <div
          className={clsx(
            'h-2 w-2 flex-shrink-0 rounded-full',
            account.authError
              ? 'bg-red-500'
              : account.isActive === false
                ? 'bg-yellow-500'
                : 'bg-green-500'
          )}
          title={
            account.authError
              ? 'Authentication Error'
              : account.isActive === false
                ? 'Sync Problem'
                : 'Connected and syncing'
          }
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-900">
            {accountDisplayName(account)}
          </div>
          {shouldShowEmail(account) && (
            <div className="truncate text-xs text-gray-500">{account.emailAddress}</div>
          )}
        </div>
        {account.authError && (
          <span title="Authentication Error" className="flex-shrink-0">
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={onToggleFavourite}
        aria-pressed={account.isFavourite}
        title={account.isFavourite ? 'Remove from favourites' : 'Add to favourites'}
        className="flex-shrink-0 rounded p-1.5"
      >
        <Star
          className={clsx(
            'h-4 w-4 transition-colors',
            account.isFavourite
              ? 'fill-yellow-400 text-yellow-400'
              : 'text-gray-300 hover:text-yellow-400'
          )}
        />
      </button>
    </div>
  );
}

export function AllAccountsModal() {
  const isOpen = useUIStore((s) => s.isAllAccountsOpen);
  const setOpen = useUIStore((s) => s.setAllAccountsOpen);
  const { selectedAccountId, setSelectedAccountId } = useAccountStore();
  const router = useRouter();
  const pathname = usePathname();

  const [query, setQuery] = useState('');
  const [selectedLabelIds, setSelectedLabelIds] = useState<Set<string>>(new Set());
  const [labelMenuOpen, setLabelMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: accounts = [] } = useAccounts();
  const { toggleFavourite } = useFavouriteMutations();

  const { data: labelsData } = useQuery<{ labels: AccountLabel[] }>({
    queryKey: ['labels'],
    queryFn: async () => {
      const res = await fetch('/api/labels');
      if (!res.ok) throw new Error('Failed to fetch labels');
      return res.json();
    },
    enabled: isOpen,
  });
  const labels = labelsData?.labels || [];

  // Grouping is frozen while the modal is open: un-favouriting flips the star but
  // leaves the row where it is, so nothing jumps out from under the cursor.
  // Regrouping happens on the next open.
  const [frozenFavouriteIds, setFrozenFavouriteIds] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setFrozenFavouriteIds(sortedFavourites(accounts).map((a) => a.id));
    setQuery('');
    setSelectedLabelIds(new Set());
    setLabelMenuOpen(false);
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
    // Intentionally keyed on isOpen only — we want the snapshot taken at open time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, setOpen]);

  const isFiltering = query.trim().length > 0 || selectedLabelIds.size > 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // An account matches if it carries ANY of the selected labels.
    const allowedIds =
      selectedLabelIds.size > 0
        ? new Set(
            labels
              .filter((l) => selectedLabelIds.has(l.id))
              .flatMap((l) => l.accountIds || [])
          )
        : null;

    return accounts.filter((a) => {
      if (allowedIds && !allowedIds.has(a.id)) return false;
      if (!q) return true;
      return (
        accountDisplayName(a).toLowerCase().includes(q) ||
        a.emailAddress.toLowerCase().includes(q)
      );
    });
  }, [accounts, query, selectedLabelIds, labels]);

  // While filtering, show one flat list — group headers are noise there.
  const groups = useMemo(() => {
    if (isFiltering) return null;
    const frozen = new Set(frozenFavouriteIds);
    const order = new Map(frozenFavouriteIds.map((id, i) => [id, i]));
    return {
      favourites: filtered
        .filter((a) => frozen.has(a.id))
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)),
      others: sortedByName(filtered.filter((a) => !frozen.has(a.id))),
    };
  }, [filtered, isFiltering, frozenFavouriteIds]);

  if (!isOpen) return null;

  const handleSelect = (id: string) => {
    setSelectedAccountId(id);
    setOpen(false);
    if (!pathname.startsWith('/inbox')) {
      router.push('/inbox');
    }
  };

  const toggleLabel = (labelId: string) => {
    setSelectedLabelIds((prev) => {
      const next = new Set(prev);
      if (next.has(labelId)) next.delete(labelId);
      else next.add(labelId);
      return next;
    });
  };

  const renderRow = (account: SidebarAccount) => (
    <AccountRow
      key={account.id}
      account={account}
      isSelected={selectedAccountId === account.id}
      onSelect={() => handleSelect(account.id)}
      onToggleFavourite={() => toggleFavourite(account)}
    />
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-0">
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={() => setOpen(false)}
        />

        <div className="relative flex max-h-[80vh] w-full transform flex-col overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:max-w-2xl">
          <div className="flex flex-none items-center justify-between border-b border-gray-100 px-6 py-4">
            <h3 className="text-lg font-semibold leading-6 text-gray-900">All accounts</h3>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none"
              aria-label="Close"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Search + label filter */}
          <div className="flex flex-none items-center gap-2 border-b border-gray-100 px-6 py-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search accounts…"
                className="w-full rounded-md border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-accent-500 focus:ring-2 focus:ring-accent-100"
              />
            </div>

            <div className="relative flex-none">
              <button
                type="button"
                onClick={() => setLabelMenuOpen((o) => !o)}
                className={clsx(
                  'flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors',
                  selectedLabelIds.size > 0
                    ? 'border-accent-300 bg-accent-50 text-accent-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                )}
              >
                <Tag className="h-4 w-4" />
                <span>
                  {selectedLabelIds.size > 0 ? `${selectedLabelIds.size} label(s)` : 'Labels'}
                </span>
              </button>

              {labelMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLabelMenuOpen(false)} />
                  <div className="absolute right-0 z-50 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                    {labels.length === 0 ? (
                      <p className="px-3 py-2 text-xs italic text-gray-500">No labels</p>
                    ) : (
                      labels.map((label) => {
                        const checked = selectedLabelIds.has(label.id);
                        return (
                          <button
                            key={label.id}
                            type="button"
                            onClick={() => toggleLabel(label.id)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                          >
                            <span
                              className={clsx(
                                'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border',
                                checked
                                  ? 'border-accent-600 bg-accent-600 text-white'
                                  : 'border-gray-300'
                              )}
                            >
                              {checked && <Check className="h-3 w-3" />}
                            </span>
                            <span
                              className="truncate"
                              style={label.color ? { color: label.color } : undefined}
                            >
                              {label.name}
                            </span>
                          </button>
                        );
                      })
                    )}
                    {selectedLabelIds.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedLabelIds(new Set())}
                        className="mt-1 w-full border-t border-gray-100 px-3 py-1.5 text-left text-xs text-gray-500 hover:bg-gray-50"
                      >
                        Clear labels
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Account list */}
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-3">
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm italic text-gray-500">
                No accounts match your filters
              </p>
            ) : groups ? (
              <>
                {groups.favourites.length > 0 && (
                  <>
                    <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Favourites
                    </p>
                    {groups.favourites.map(renderRow)}
                  </>
                )}
                {groups.others.length > 0 && (
                  <>
                    <p className="px-2 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Others
                    </p>
                    {groups.others.map(renderRow)}
                  </>
                )}
              </>
            ) : (
              sortedByName(filtered).map(renderRow)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
