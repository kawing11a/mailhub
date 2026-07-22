'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Star } from 'lucide-react';
import clsx from 'clsx';
import {
  accountDisplayName,
  shouldShowEmail,
  sortedByName,
  sortedFavourites,
  type SidebarAccount,
} from '@/hooks/useFavouriteMutations';

/**
 * "From" address picker for the compose modal: a button showing the current
 * sender that opens a searchable popover of accounts (favourites first, in the
 * user's order). Portalled so it escapes the compose modal's overflow-hidden.
 */
export function FromAddressSelect({
  accounts,
  value,
  onChange,
}: {
  accounts: SidebarAccount[];
  value: SidebarAccount | undefined;
  onChange: (accountId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const positionMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      minWidth: rect.width,
    });
  };

  const openMenu = () => {
    positionMenu();
    setQuery('');
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 20);
  };

  // Keep the popover anchored to the button while open.
  useEffect(() => {
    if (!open) return;
    const onReflow = () => positionMenu();
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open]);

  // Favourites first (in the user's order), then the rest alphabetically.
  const ordered = useMemo(
    () => [...sortedFavourites(accounts), ...sortedByName(accounts.filter((a) => !a.isFavourite))],
    [accounts]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter(
      (a) =>
        accountDisplayName(a).toLowerCase().includes(q) ||
        a.emailAddress.toLowerCase().includes(q)
    );
  }, [ordered, query]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="flex items-center gap-1.5 rounded bg-gray-100 px-2 py-0.5 text-gray-700 transition-colors hover:bg-gray-200"
      >
        <span className="max-w-[260px] truncate font-medium">
          {value?.emailAddress || 'Loading...'}
        </span>
        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-gray-500" />
      </button>

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
            <div
              style={menuStyle}
              className="z-[70] w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg"
            >
              <div className="border-b border-gray-100 p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search addresses…"
                    className="w-full rounded-md border border-gray-200 py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:border-accent-500 focus:ring-2 focus:ring-accent-100"
                  />
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <p className="px-3 py-4 text-center text-sm italic text-gray-500">No addresses</p>
                ) : (
                  filtered.map((a) => {
                    const selected = a.id === value?.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => pick(a.id)}
                        className={clsx(
                          'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50',
                          selected && 'bg-accent-50'
                        )}
                      >
                        {a.isFavourite ? (
                          <Star className="h-3.5 w-3.5 flex-shrink-0 fill-yellow-400 text-yellow-400" />
                        ) : (
                          <span className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-gray-900">
                            {accountDisplayName(a)}
                          </span>
                          {shouldShowEmail(a) && (
                            <span className="block truncate text-xs text-gray-500">
                              {a.emailAddress}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
}
