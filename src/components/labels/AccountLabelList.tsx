'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Tag, Plus, X, Check, Search } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';

interface AccountLabel {
  id: string;
  name: string;
  color?: string | null;
  accountIds?: string[];
}

interface LabelsResponse {
  labels: AccountLabel[];
}

interface AccountLabelListProps {
  accountId: string;
  readOnly?: boolean;
}

export function AccountLabelList({ accountId, readOnly = false }: AccountLabelListProps) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setHighlightedIndex(0);
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [isOpen]);

  const { data: labelsData, isLoading } = useQuery<LabelsResponse>({
    queryKey: ['labels'],
    queryFn: async () => {
      const res = await fetch('/api/labels');
      if (!res.ok) throw new Error('Failed to fetch labels');
      return res.json();
    },
  });

  const allLabels = labelsData?.labels || [];

  const accountLabels = useMemo(
    () => allLabels.filter((label) => label.accountIds?.includes(accountId)),
    [allLabels, accountId]
  );

  const filteredLabels = useMemo(
    () =>
      allLabels.filter((l) =>
        l.name.toLowerCase().includes(search.toLowerCase())
      ),
    [allLabels, search]
  );

  const mutation = useMutation({
    mutationFn: async ({ labelId, add }: { labelId: string; add: boolean }) => {
      const targetLabel = allLabels.find((l) => l.id === labelId);
      const currentAccountIds = targetLabel?.accountIds ?? [];
      const newAccountIds = add
        ? Array.from(new Set([...currentAccountIds, accountId]))
        : currentAccountIds.filter((id) => id !== accountId);

      const res = await fetch(`/api/labels/${labelId}/accounts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountIds: newAccountIds }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update label assignment');
      return { json, add, labelId };
    },
    onMutate: async ({ labelId, add }) => {
      await queryClient.cancelQueries({ queryKey: ['labels'] });
      const previousData = queryClient.getQueryData<LabelsResponse>(['labels']);

      queryClient.setQueryData<LabelsResponse>(['labels'], (old) => {
        if (!old) return old;
        return {
          ...old,
          labels: old.labels.map((l) => {
            if (l.id !== labelId) return l;
            const current = l.accountIds ?? [];
            const next = add
              ? Array.from(new Set([...current, accountId]))
              : current.filter((id) => id !== accountId);
            return { ...l, accountIds: next };
          }),
        };
      });

      return { previousData };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['labels'], context.previousData);
      }
      toast.error('Failed to update label assignment');
    },
    onSuccess: (_data, { add, labelId }) => {
      const labelName = allLabels.find((l) => l.id === labelId)?.name || 'Label';
      toast.success(add ? `Assigned "${labelName}"` : `Removed "${labelName}"`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['labels'] });
    },
  });

  const handleRemoveLabel = (e: React.MouseEvent, labelId: string) => {
    e.stopPropagation();
    if (readOnly) return;
    mutation.mutate({ labelId, add: false });
  };

  const handleToggleLabel = (label: AccountLabel) => {
    if (readOnly) return;
    const isAssigned = label.accountIds?.includes(accountId);
    mutation.mutate({ labelId: label.id, add: !isAssigned });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filteredLabels.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const label = filteredLabels[highlightedIndex];
      if (label) handleToggleLabel(label);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mt-2 ml-5 flex items-center gap-1.5 text-xs text-gray-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Loading labels…</span>
      </div>
    );
  }

  if (accountLabels.length === 0 && readOnly) {
    return null;
  }

  return (
    <div className="mt-2 ml-5 flex flex-wrap items-center gap-1.5 relative" aria-label="Account labels">
      {accountLabels.map((label) => (
        <div
          key={label.id}
          className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <Tag
            className="h-3 w-3 flex-shrink-0"
            style={{ color: label.color || '#3B82F6' }}
          />
          <span className="max-w-32 truncate">{label.name}</span>
          {!readOnly && (
            <button
              type="button"
              onClick={(e) => handleRemoveLabel(e, label.id)}
              className="ml-0.5 rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors focus:outline-none"
              title={`Remove ${label.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}

      {!readOnly && (
        <div className="relative inline-block">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={clsx(
              'inline-flex items-center gap-1 rounded-full text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-accent-500',
              accountLabels.length === 0
                ? 'border border-dashed border-gray-300 bg-white px-2.5 py-0.5 text-gray-500 hover:border-gray-400 hover:text-gray-700'
                : 'border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-600 hover:bg-gray-100'
            )}
            title="Assign label to account"
          >
            <Plus className="h-3 w-3 text-gray-400" />
            <span>{accountLabels.length === 0 ? 'Add label' : 'Tag'}</span>
          </button>

          {isOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
              <div className="absolute left-0 mt-1.5 w-56 z-50 rounded-md border border-gray-200 bg-white shadow-lg">
                <div className="border-b border-gray-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Assign Account Labels
                </div>
                <div className="p-2 border-b border-gray-100">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setHighlightedIndex(0);
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder="Search labels..."
                      className="w-full rounded border border-gray-200 py-1 pl-7 pr-2 text-xs focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                    />
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto py-1">
                  {allLabels.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-500">No labels created yet.</p>
                  ) : filteredLabels.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-500">No matching labels.</p>
                  ) : (
                    filteredLabels.map((label, index) => {
                      const isAssigned = label.accountIds?.includes(accountId);
                      const isPending =
                        mutation.isPending && mutation.variables?.labelId === label.id;

                      return (
                        <button
                          key={label.id}
                          type="button"
                          onClick={() => handleToggleLabel(label)}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          className={clsx(
                            'flex w-full items-center justify-between px-3 py-1.5 text-xs text-left transition-colors',
                            index === highlightedIndex ? 'bg-gray-100 text-gray-900' : 'hover:bg-gray-50 text-gray-700'
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: label.color || '#3B82F6' }}
                            />
                            <span className="truncate">{label.name}</span>
                          </div>
                          {isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400 flex-shrink-0" />
                          ) : (
                            <span
                              className={clsx(
                                'flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border transition-colors',
                                isAssigned
                                  ? 'border-accent-600 bg-accent-600 text-white'
                                  : 'border-gray-300'
                              )}
                            >
                              {isAssigned && <Check className="h-3 w-3" />}
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
