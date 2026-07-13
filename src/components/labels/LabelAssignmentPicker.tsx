'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tag, Check, Minus, Search, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';

interface LabelAssignmentPickerProps {
  /** Emails the picker acts on (one for the viewer, many for bulk selection). */
  emailIds: string[];
  /** labelId -> how many of emailIds currently carry that label. */
  labelCounts: Map<string, number>;
  align?: 'left' | 'right';
  buttonClassName?: string;
  /** Render a "Labels" text next to the icon (used in the selection toolbar). */
  showButtonText?: boolean;
  /** Allow labels already assigned to every selected email to be removed. */
  allowRemoval?: boolean;
}

export function LabelAssignmentPicker({
  emailIds,
  labelCounts,
  align = 'right',
  buttonClassName,
  showButtonText = false,
  allowRemoval = true,
}: LabelAssignmentPickerProps) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  // Optimistic per-label count overrides, applied on top of labelCounts
  const [overrides, setOverrides] = useState<Map<string, number>>(new Map());
  const searchInputRef = useRef<HTMLInputElement>(null);

  const emailIdsKey = emailIds.join(',');
  useEffect(() => {
    setOverrides(new Map());
  }, [emailIdsKey]);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setHighlightedIndex(0);
      setOverrides(new Map());
      // Focus after the dropdown has rendered
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [isOpen]);

  const { data: labelsData } = useQuery({
    queryKey: ['labels'],
    queryFn: async () => {
      const res = await fetch('/api/labels');
      if (!res.ok) throw new Error('Failed to fetch labels');
      return res.json();
    },
  });

  const labels = labelsData?.labels || [];
  const filteredLabels = useMemo(
    () =>
      labels.filter((l: any) =>
        l.name.toLowerCase().includes(search.toLowerCase())
      ),
    [labels, search]
  );

  const getCount = (labelId: string) =>
    overrides.get(labelId) ?? labelCounts.get(labelId) ?? 0;

  const mutation = useMutation({
    mutationFn: async ({ labelId, add }: { labelId: string; add: boolean }) => {
      const res = await fetch('/api/emails/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailIds,
          addLabelIds: add ? [labelId] : [],
          removeLabelIds: add ? [] : [labelId],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update labels');
      return json;
    },
    onMutate: ({ labelId, add }) => {
      const previous = overrides.has(labelId) ? overrides.get(labelId) : undefined;
      setOverrides((m) => new Map(m).set(labelId, add ? emailIds.length : 0));
      return { previous };
    },
    onError: (_err, { labelId }, context) => {
      setOverrides((m) => {
        const next = new Map(m);
        if (context?.previous === undefined) {
          next.delete(labelId);
        } else {
          next.set(labelId, context.previous);
        }
        return next;
      });
      toast.error('Failed to update labels');
    },
    onSuccess: (_data, { add }) => {
      const n = emailIds.length;
      toast.success(
        add
          ? `Label added to ${n} email${n === 1 ? '' : 's'}`
          : `Label removed from ${n} email${n === 1 ? '' : 's'}`
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      emailIds.forEach((id) =>
        queryClient.invalidateQueries({ queryKey: ['email', id] })
      );
      queryClient.invalidateQueries({ queryKey: ['labelEmails'] });
      queryClient.invalidateQueries({ queryKey: ['search'] });
    },
  });

  const handleToggle = (label: any) => {
    if (emailIds.length === 0) return;
    const isChecked = getCount(label.id) >= emailIds.length;
    if (isChecked && !allowRemoval) return;
    mutation.mutate({ labelId: label.id, add: !isChecked });
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
      if (label) handleToggle(label);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={
          buttonClassName ||
          'p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors flex items-center'
        }
        title="Labels"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Tag className={showButtonText ? 'w-4 h-4' : 'w-5 h-5'} />
        {showButtonText && <span className="ml-1.5 text-sm font-medium">Labels</span>}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div
            className={clsx(
              'absolute mt-1 w-64 bg-white border border-gray-200 rounded-md shadow-lg z-50',
              align === 'right' ? 'right-0' : 'left-0'
            )}
          >
            <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
              Labels
            </div>
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
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
                  className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-accent-500"
                />
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto py-1">
              {labels.length === 0 ? (
                <p className="px-3 py-3 text-sm text-gray-500">
                  No labels yet. Create one from the sidebar.
                </p>
              ) : filteredLabels.length === 0 ? (
                <p className="px-3 py-3 text-sm text-gray-500">No labels found.</p>
              ) : (
                filteredLabels.map((label: any, index: number) => {
                  const count = getCount(label.id);
                  const isChecked = count >= emailIds.length && emailIds.length > 0;
                  const isIndeterminate = !isChecked && count > 0;
                  const isRowPending =
                    mutation.isPending && mutation.variables?.labelId === label.id;
                  const isRemovalDisabled = isChecked && !allowRemoval;
                  return (
                    <button
                      key={label.id}
                      onClick={() => handleToggle(label)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      disabled={isRemovalDisabled}
                      title={isRemovalDisabled ? 'Label removal is disabled here' : undefined}
                      className={clsx(
                        'w-full text-left px-3 py-2 text-sm flex items-center space-x-2 transition-colors',
                        isRemovalDisabled
                          ? 'cursor-not-allowed text-gray-400'
                          : index === highlightedIndex
                            ? 'bg-gray-100'
                            : 'hover:bg-gray-50'
                      )}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: label.color }}
                      />
                      <span className="flex-1 truncate">{label.name}</span>
                      {isRowPending ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400 flex-shrink-0" />
                      ) : (
                        <span
                          className={clsx(
                            'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                            isChecked || isIndeterminate
                              ? 'bg-accent-600 border-accent-600 text-white'
                              : 'border-gray-300'
                          )}
                        >
                          {isChecked && <Check className="w-3 h-3" />}
                          {isIndeterminate && <Minus className="w-3 h-3" />}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            <div className="px-3 py-1.5 text-[11px] text-gray-400 border-t border-gray-100">
              ↑↓ navigate · Enter {allowRemoval ? 'toggle' : 'add'} · Esc close
            </div>
          </div>
        </>
      )}
    </div>
  );
}
