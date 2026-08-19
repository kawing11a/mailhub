'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, Check, Search } from 'lucide-react';
import { allowedAccountIdsForLabels, useLabels } from '@/components/accounts/LabelFilterMenu';
import { LabelFilterChips } from '@/components/accounts/LabelFilterChips';
import clsx from 'clsx';

type MemberAccessModalProps = {
  isOpen: boolean;
  onClose: () => void;
  member: any;
  accountId?: never;
};

type AccountAccessModalProps = {
  isOpen: boolean;
  onClose: () => void;
  accountId: string | null;
  member?: never;
};

type ManageAccountAccessModalProps =
  | MemberAccessModalProps
  | AccountAccessModalProps;

type AccountAccessMember = {
  userId: string;
  name: string;
  email: string;
  hasAccess: boolean;
};

type AccountAccessResponse = {
  account: {
    id: string;
    label: string;
    emailAddress: string;
    owner: {
      userId: string;
      name: string;
      email: string;
    };
  };
  members: AccountAccessMember[];
};

async function parseError(res: Response, fallback: string) {
  const data = await res.json().catch(() => null);
  return data?.error || fallback;
}

export function ManageAccountAccessModal(props: ManageAccountAccessModalProps) {
  const { isOpen, onClose } = props;
  const member = 'member' in props ? props.member : null;
  const accountId = 'accountId' in props ? props.accountId : null;
  const isAccountMode = !!accountId;
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const labels = useLabels(isOpen && !isAccountMode);

  const { data: accountsData, isLoading: isLoadingAccounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts');
      if (!res.ok) throw new Error('Failed to fetch accounts');
      return res.json();
    },
    enabled: isOpen && !isAccountMode,
  });

  const { data: accessData, isLoading: isLoadingAccess } = useQuery({
    queryKey: ['member-access', member?.userId],
    queryFn: async () => {
      const res = await fetch(`/api/org/members/${member?.userId}/accounts`);
      if (!res.ok) throw new Error('Failed to fetch access');
      return res.json();
    },
    enabled: isOpen && !isAccountMode && !!member?.userId,
  });

  const accountAccessQuery = useQuery<AccountAccessResponse>({
    queryKey: ['account-access', accountId],
    queryFn: async () => {
      const res = await fetch(`/api/accounts/${accountId}/access`);
      if (!res.ok) {
        throw new Error(await parseError(res, 'Failed to load account access'));
      }
      return res.json();
    },
    enabled: isOpen && !!accountId,
  });

  useEffect(() => {
    if (!isAccountMode && accessData && Array.isArray(accessData)) {
      setSelectedIds(new Set(accessData));
      setSubmitError(null);
    }
  }, [accessData, isAccountMode]);

  useEffect(() => {
    if (!isAccountMode || !accountAccessQuery.data) return;

    const ownerId = accountAccessQuery.data.account.owner.userId;
    const nextSelected = accountAccessQuery.data.members
      .filter((currentMember) => currentMember.userId !== ownerId && currentMember.hasAccess)
      .map((currentMember) => currentMember.userId);

    setSelectedIds(new Set(nextSelected));
    setSubmitError(null);
  }, [accountAccessQuery.data, isAccountMode]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedLabelId(null);
      setSubmitError(null);
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const mutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (isAccountMode && accountId) {
        const res = await fetch(`/api/accounts/${accountId}/access`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberIds: ids }),
        });
        if (!res.ok) throw new Error(await parseError(res, 'Failed to update access'));
        return res.json();
      }

      const res = await fetch(`/api/org/members/${member.userId}/accounts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountIds: ids }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update access');
      return json;
    },
    onSuccess: () => {
      if (isAccountMode) {
        queryClient.invalidateQueries({ queryKey: ['account-access', accountId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['member-access', member?.userId] });
      }
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      onClose();
    },
    onError: (error: Error) => {
      setSubmitError(error.message);
    },
  });

  const handleToggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const accounts = useMemo(() => {
    return Array.isArray(accountsData) ? accountsData : [];
  }, [accountsData]);

  const filteredMembers = useMemo(() => {
    if (!isAccountMode || !accountAccessQuery.data) return [];

    const q = query.trim().toLowerCase();
    return accountAccessQuery.data.members.filter((currentMember) => {
      if (currentMember.userId === accountAccessQuery.data?.account.owner.userId) return false;
      if (!q) return true;
      return (
        currentMember.name.toLowerCase().includes(q) ||
        currentMember.email.toLowerCase().includes(q)
      );
    });
  }, [accountAccessQuery.data, isAccountMode, query]);

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

  if (!isOpen || (!member && !accountId)) return null;

  const isLoading = isAccountMode
    ? accountAccessQuery.isLoading
    : isLoadingAccounts || isLoadingAccess;
  const errorMessage =
    submitError ||
    (accountAccessQuery.error instanceof Error ? accountAccessQuery.error.message : null);

  const handleSelectAll = () => {
    const next = new Set(selectedIds);
    if (isAccountMode) {
      filteredMembers.forEach((currentMember) => next.add(currentMember.userId));
    } else {
      filtered.forEach((account: any) => next.add(account.id));
    }
    setSelectedIds(next);
  };

  const handleClear = () => {
    setSelectedIds(new Set());
  };

  if (isAccountMode) {
    const owner = accountAccessQuery.data?.account.owner;

    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-0">
          <div
            className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
            onClick={onClose}
          />

          <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl">
            <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
              <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-4">
                <div>
                  <h3 className="text-lg font-semibold leading-6 text-gray-900">
                    Manage Account Access
                  </h3>
                  {accountAccessQuery.data ? (
                    <p className="mt-1 text-sm text-gray-500">
                      {accountAccessQuery.data.account.label} · {accountAccessQuery.data.account.emailAddress}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {errorMessage ? (
                <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              <div className="mb-4 relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search teammates…"
                  className="w-full rounded-md border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-accent-500 focus:ring-2 focus:ring-accent-100"
                />
              </div>

              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="space-y-3">
                  {owner ? (
                    <label className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                      <div className="min-w-0 pr-4">
                        <p className="text-sm font-medium text-gray-900">{owner.name}</p>
                        <p className="text-xs text-gray-500">{owner.email}</p>
                        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          Owner
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        aria-label={`${owner.name} access`}
                        checked
                        disabled
                        readOnly
                        className="h-4 w-4 rounded border-gray-300 text-accent-600"
                      />
                    </label>
                  ) : null}

                  {filteredMembers.map((currentMember) => (
                    <label
                      key={currentMember.userId}
                      className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-200 px-4 py-3 hover:bg-gray-50"
                    >
                      <div className="min-w-0 pr-4">
                        <p className="text-sm font-medium text-gray-900">{currentMember.name}</p>
                        <p className="text-xs text-gray-500">{currentMember.email}</p>
                      </div>
                      <input
                        type="checkbox"
                        aria-label={`${currentMember.name} access`}
                        checked={selectedIds.has(currentMember.userId)}
                        onChange={() => handleToggle(currentMember.userId)}
                        className="h-4 w-4 rounded border-gray-300 text-accent-600"
                      />
                    </label>
                  ))}
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={() => mutation.mutate(Array.from(selectedIds))}
                  disabled={mutation.isPending || isLoading || !accountAccessQuery.data}
                  className="inline-flex items-center justify-center rounded-md border border-transparent bg-accent-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-700 disabled:opacity-50"
                >
                  {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Access
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
              <span>{selectedIds.size} of {accounts.length} selected</span>
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
                const isSelected = selectedIds.has(account.id);
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
              onClick={() => mutation.mutate(Array.from(selectedIds))}
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
