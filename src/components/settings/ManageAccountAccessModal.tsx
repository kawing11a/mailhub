'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, Check, Search } from 'lucide-react';
import { allowedAccountIdsForLabels, useLabels } from '@/components/accounts/LabelFilterMenu';
import { LabelFilterChips } from '@/components/accounts/LabelFilterChips';
import clsx from 'clsx';

interface ManageAccountAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: any; // The member object
}

export function ManageAccountAccessModal({ isOpen, onClose, member }: ManageAccountAccessModalProps) {
  const queryClient = useQueryClient();
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const labels = useLabels(isOpen);

  // Fetch all accounts
  const { data: accountsData, isLoading: isLoadingAccounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts');
      if (!res.ok) throw new Error('Failed to fetch accounts');
      return res.json();
    },
    enabled: isOpen,
  });

  // Fetch member's current access
  const { data: accessData, isLoading: isLoadingAccess } = useQuery({
    queryKey: ['member-access', member?.userId],
    queryFn: async () => {
      const res = await fetch(`/api/org/members/${member?.userId}/accounts`);
      if (!res.ok) throw new Error('Failed to fetch access');
      return res.json();
    },
    enabled: isOpen && !!member?.userId,
  });

  useEffect(() => {
    if (accessData && Array.isArray(accessData)) {
      setSelectedAccounts(new Set(accessData));
    }
  }, [accessData]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedLabelId(null);
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const mutation = useMutation({
    mutationFn: async (accountIds: string[]) => {
      const res = await fetch(`/api/org/members/${member.userId}/accounts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update access');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member-access', member?.userId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      onClose();
    },
  });

  const handleToggle = (accountId: string) => {
    const next = new Set(selectedAccounts);
    if (next.has(accountId)) {
      next.delete(accountId);
    } else {
      next.add(accountId);
    }
    setSelectedAccounts(next);
  };

  const accounts = useMemo(() => {
    return Array.isArray(accountsData) ? accountsData : [];
  }, [accountsData]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const allowedIds = allowedAccountIdsForLabels(
      labels,
      selectedLabelId ? new Set([selectedLabelId]) : new Set()
    );

    return accounts.filter((a: any) => {
      if (allowedIds && !allowedIds.has(a.id)) return false;
      if (!q) return true;
      const name = (a.label || a.name || '').toLowerCase();
      const email = (a.emailAddress || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [accounts, query, selectedLabelId, labels]);

  if (!isOpen || !member) return null;

  const isLoading = isLoadingAccounts || isLoadingAccess;

  const handleSelectAll = () => {
    const next = new Set(selectedAccounts);
    filtered.forEach((a: any) => next.add(a.id));
    setSelectedAccounts(next);
  };

  const handleClear = () => {
    setSelectedAccounts(new Set());
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-0">
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
          onClick={onClose}
        />
        
        <div className="relative flex h-[70vh] max-h-[650px] w-full transform flex-col overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:max-w-2xl">
          {/* Header */}
          <div className="flex flex-none items-center justify-between border-b border-gray-100 px-6 py-4">
            <h3 className="text-lg font-semibold leading-6 text-gray-900">
              Manage Access: {member.name}
            </h3>
            <button
              onClick={onClose}
              className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none"
              aria-label="Close"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Search + Label Filter */}
          <div className="flex flex-none flex-col gap-3 border-b border-gray-100 px-6 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search accounts…"
                className="w-full rounded-md border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-accent-500 focus:ring-2 focus:ring-accent-100"
              />
            </div>

            {labels.length > 0 && (
              <LabelFilterChips
                wrap
                labels={labels}
                selectedLabelId={selectedLabelId}
                onSelect={setSelectedLabelId}
              />
            )}
          </div>

          {/* Selection control bar */}
          {!isLoading && accounts.length > 0 && (
            <div className="flex flex-none items-center justify-between border-b border-gray-100 bg-gray-50 px-6 py-2 text-xs text-gray-500 font-medium">
              <span>{selectedAccounts.size} of {accounts.length} selected</span>
              <div className="space-x-3">
                <button 
                  type="button" 
                  className="text-accent-600 hover:text-accent-700 font-medium"
                  onClick={handleSelectAll}
                >
                  Select All {filtered.length !== accounts.length ? 'Filtered' : ''}
                </button>
                <button 
                  type="button" 
                  className="text-gray-500 hover:text-gray-700 font-medium"
                  onClick={handleClear}
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Account list */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3 space-y-2">
            {isLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm italic text-gray-500">
                {accounts.length === 0 ? 'No email accounts found.' : 'No accounts match your search or filter.'}
              </p>
            ) : (
              filtered.map((account: any) => {
                const isSelected = selectedAccounts.has(account.id);
                return (
                  <div
                    key={account.id}
                    onClick={() => handleToggle(account.id)}
                    className={clsx(
                      'flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors select-none',
                      isSelected 
                        ? 'border-accent-500 bg-accent-50/50' 
                        : 'border-gray-200 hover:bg-gray-50'
                    )}
                  >
                    <div className="flex items-center space-x-3 min-w-0 flex-1 pr-3">
                      <div
                        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white font-medium text-xs"
                        style={{ backgroundColor: account.color || '#3B82F6' }}
                      >
                        {account.avatarInitials || (account.label || account.name || account.emailAddress || '').substring(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {account.label || account.name || account.emailAddress}
                        </p>
                        {account.emailAddress && (
                          <p className="text-xs text-gray-500 truncate">{account.emailAddress}</p>
                        )}
                      </div>
                    </div>
                    <div className={clsx(
                      'flex-shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors',
                      isSelected ? 'bg-accent-600 border-accent-600 text-white' : 'border-gray-300 bg-white'
                    )}>
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-none items-center justify-end gap-3 border-t border-gray-100 px-6 py-4 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => mutation.mutate(Array.from(selectedAccounts))}
              disabled={mutation.isPending || isLoading}
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-accent-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-700 disabled:opacity-50"
            >
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Access
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
