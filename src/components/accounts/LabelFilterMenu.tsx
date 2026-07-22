'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Tag } from 'lucide-react';
import clsx from 'clsx';

export interface AccountLabel {
  id: string;
  name: string;
  color?: string | null;
  accountIds?: string[];
}

/** Shared labels query, used by both the sidebar filter and the all-accounts modal. */
export function useLabels(enabled = true) {
  const { data } = useQuery<{ labels: AccountLabel[] }>({
    queryKey: ['labels'],
    queryFn: async () => {
      const res = await fetch('/api/labels');
      if (!res.ok) throw new Error('Failed to fetch labels');
      return res.json();
    },
    enabled,
  });
  return data?.labels ?? [];
}

/**
 * Accounts carrying any of the selected labels. Returns null when nothing is
 * selected, meaning "no label filter — allow everything".
 */
export function allowedAccountIdsForLabels(
  labels: AccountLabel[],
  selectedLabelIds: Set<string>
): Set<string> | null {
  if (selectedLabelIds.size === 0) return null;
  return new Set(
    labels.filter((l) => selectedLabelIds.has(l.id)).flatMap((l) => l.accountIds ?? [])
  );
}

/**
 * A compact multi-select label filter: a `Tag` toggle button with a checklist
 * dropdown. Shared by the sidebar's Accounts section and the all-accounts modal
 * so both filters look and behave the same. Selection state is owned by the
 * caller; this component only manages its own open/closed state.
 */
export function LabelFilterMenu({
  labels,
  selectedLabelIds,
  onToggle,
  onClear,
  className,
}: {
  labels: AccountLabel[];
  selectedLabelIds: Set<string>;
  onToggle: (labelId: string) => void;
  onClear: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Fixed viewport coordinates so the menu can be portalled out of any
  // `overflow-hidden` ancestor (e.g. the accounts modal) without being clipped.
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const count = selectedLabelIds.size;

  const positionMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
      minWidth: rect.width,
    });
  };

  const toggleOpen = () => {
    if (!open) positionMenu();
    setOpen((o) => !o);
  };

  // Keep the menu glued to the button while open. A rAF loop (rather than
  // resize/scroll listeners) is used because the button also moves when the
  // centered accounts modal changes height as its list is filtered — which
  // fires no window event. Re-positions only when the rect actually changes.
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    let prev = '';
    const track = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) {
        const key = `${rect.bottom}|${rect.right}|${rect.width}`;
        if (key !== prev) {
          prev = key;
          setMenuStyle({
            position: 'fixed',
            top: rect.bottom + 4,
            right: window.innerWidth - rect.right,
            minWidth: rect.width,
          });
        }
      }
      raf = requestAnimationFrame(track);
    };
    raf = requestAnimationFrame(track);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  return (
    <div className={clsx('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className={clsx(
          'flex w-full items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors',
          count > 0
            ? 'border-accent-300 bg-accent-50 text-accent-700'
            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
        )}
      >
        <Tag className="h-4 w-4 flex-shrink-0" />
        <span className="truncate">{count > 0 ? `${count} label(s)` : 'Filter by label'}</span>
      </button>

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
            <div
              style={menuStyle}
              className="z-[70] max-h-64 w-56 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
            >
              {labels.length === 0 ? (
              <p className="px-3 py-2 text-xs italic text-gray-500">No labels</p>
            ) : (
              labels.map((label) => {
                const checked = selectedLabelIds.has(label.id);
                return (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() => onToggle(label.id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                  >
                    <span
                      className={clsx(
                        'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border',
                        checked ? 'border-accent-600 bg-accent-600 text-white' : 'border-gray-300'
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
            {count > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="mt-1 w-full border-t border-gray-100 px-3 py-1.5 text-left text-xs text-gray-500 hover:bg-gray-50"
              >
                Clear labels
              </button>
            )}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
