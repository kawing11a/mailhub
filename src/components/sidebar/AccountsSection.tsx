'use client';

import { useAccountStore } from '@/stores/accountStore';
import { useUIStore } from '@/stores/uiStore';
import { usePathname, useRouter } from 'next/navigation';
import { AlertTriangle, GripVertical, Loader2, Star, Users } from 'lucide-react';
import clsx from 'clsx';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMemo, useState } from 'react';
import {
  accountDisplayName,
  duplicateDisplayNames,
  normalizedDisplayName,
  shouldShowEmail,
  sortedByName,
  sortedFavourites,
  useAccounts,
  useFavouriteMutations,
  type SidebarAccount,
} from '@/hooks/useFavouriteMutations';
import {
  allowedAccountIdsForLabels,
  LabelFilterMenu,
  useLabels,
} from '@/components/accounts/LabelFilterMenu';

/** How many accounts to show when the user hasn't favourited anything yet. */
const FALLBACK_COUNT = 5;

/**
 * Name, with the address underneath only when the caller says it adds information
 * (active account, or a display name shared with another account).
 */
function AccountIdentity({
  account,
  isSelected,
  showEmail,
}: {
  account: SidebarAccount;
  isSelected: boolean;
  showEmail: boolean;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate">{accountDisplayName(account)}</div>
      {showEmail && (
        <div
          className={clsx(
            'truncate text-xs font-normal',
            isSelected ? 'text-white/70' : 'text-gray-500'
          )}
        >
          {account.emailAddress}
        </div>
      )}
    </div>
  );
}

function StarButton({
  account,
  isSelected,
  onToggle,
}: {
  account: SidebarAccount;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={account.isFavourite}
      title={account.isFavourite ? 'Remove from favourites' : 'Add to favourites'}
      className="flex-shrink-0 rounded p-1"
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
  );
}

/** A draggable favourite row. */
function FavouriteRow({
  account,
  isSelected,
  showEmail,
  onSelect,
  onToggleFavourite,
}: {
  account: SidebarAccount;
  isSelected: boolean;
  showEmail: boolean;
  onSelect: () => void;
  onToggleFavourite: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: account.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(
        'group flex items-center rounded-md pr-1 transition-colors',
        isDragging && 'opacity-60 z-10',
        isSelected ? 'bg-accent-600 shadow-sm' : 'hover:bg-gray-200'
      )}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className={clsx(
          'flex-shrink-0 cursor-grab touch-none rounded p-1 active:cursor-grabbing',
          isSelected ? 'text-white/60 hover:text-white' : 'text-gray-400 hover:text-gray-600'
        )}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <button
        onClick={onSelect}
        className={clsx(
          'flex min-w-0 flex-1 items-center space-x-3 rounded-md px-2 py-2 text-left text-sm font-medium',
          isSelected ? 'text-white' : 'text-gray-700 group-hover:text-gray-900'
        )}
      >
        <AccountIdentity account={account} isSelected={isSelected} showEmail={showEmail} />
        {account.authError && (
          <span title="Authentication Error" className="flex-shrink-0">
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </span>
        )}
      </button>

      <StarButton account={account} isSelected={isSelected} onToggle={onToggleFavourite} />
    </div>
  );
}

export function AccountsSection() {
  const { selectedAccountId, setSelectedAccountId } = useAccountStore();
  const setAllAccountsOpen = useUIStore((s) => s.setAllAccountsOpen);
  const pathname = usePathname();
  const router = useRouter();

  const { data: accounts = [], isLoading } = useAccounts();
  const { toggleFavourite, reorderFavourites } = useFavouriteMutations();

  const labels = useLabels();
  const [selectedLabelIds, setSelectedLabelIds] = useState<Set<string>>(new Set());
  const isFiltering = selectedLabelIds.size > 0;

  const toggleLabel = (labelId: string) =>
    setSelectedLabelIds((prev) => {
      const next = new Set(prev);
      if (next.has(labelId)) next.delete(labelId);
      else next.add(labelId);
      return next;
    });

  const sensors = useSensors(
    // A small activation distance keeps normal clicks (select account) working.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const activeAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId]
  );

  // Favourites drive the list. With none yet, fall back to the first few accounts
  // alphabetically so the section is never empty.
  const listedAccounts = useMemo(() => {
    const favourites = sortedFavourites(accounts);
    const base =
      favourites.length > 0
        ? favourites
        : sortedByName(accounts).slice(0, FALLBACK_COUNT);
    const allowedIds = allowedAccountIdsForLabels(labels, selectedLabelIds);
    return base.filter(
      (a) => a.id !== activeAccount?.id && (!allowedIds || allowedIds.has(a.id))
    );
  }, [accounts, activeAccount, labels, selectedLabelIds]);

  // Reordering acts on the full favourite list; a filtered subset would reorder
  // confusingly, so drag is disabled while a label filter is active.
  const isDraggable = !isFiltering && sortedFavourites(accounts).length > 0;

  // Computed over ALL accounts, not just the rendered rows: an ambiguous name is
  // ambiguous whether or not its twin happens to be listed right now.
  const duplicates = useMemo(() => duplicateDisplayNames(accounts), [accounts]);

  // The address only earns its line when it disambiguates: on the active account
  // (confirming which identity you're acting as) or on a shared display name.
  const showEmailFor = (account: SidebarAccount) =>
    shouldShowEmail(account) &&
    (account.id === selectedAccountId || duplicates.has(normalizedDisplayName(account)));

  const handleSelect = (id: string) => {
    setSelectedAccountId(id);
    if (!pathname.startsWith('/inbox')) {
      router.push('/inbox');
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Reorder against the full favourite list, since the active account is
    // rendered separately and excluded from the draggable rows.
    const favourites = sortedFavourites(accounts);
    const oldIndex = favourites.findIndex((f) => f.id === active.id);
    const newIndex = favourites.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    reorderFavourites(arrayMove(favourites, oldIndex, newIndex).map((f) => f.id));
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-2">
      <div className="flex-none pb-1 pt-2">
        <p className="px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Accounts
        </p>
      </div>

      {labels.length > 0 && (
        <div className="flex-none px-1 pb-2">
          <LabelFilterMenu
            labels={labels}
            selectedLabelIds={selectedLabelIds}
            onToggle={toggleLabel}
            onClear={() => setSelectedLabelIds(new Set())}
          />
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-0.5">
        {/* Active account leads and doubles as the switcher. */}
        {activeAccount && (
          <button
            onClick={() => setAllAccountsOpen(true)}
            title="Switch account"
            className="flex w-full items-center space-x-3 rounded-md bg-accent-600 px-3 py-2 text-left text-sm font-medium text-white shadow-sm"
          >
            <AccountIdentity
              account={activeAccount}
              isSelected
              showEmail={showEmailFor(activeAccount)}
            />
            <span className="flex-none rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              Active
            </span>
            {activeAccount.authError && (
              <span title="Authentication Error" className="flex-shrink-0">
                <AlertTriangle className="w-4 h-4 text-red-300" />
              </span>
            )}
          </button>
        )}

        {listedAccounts.length === 0 && (isFiltering || !activeAccount) ? (
          <p className="px-3 py-2 text-xs italic text-gray-500">
            {isFiltering ? 'No accounts match this label' : 'No accounts connected'}
          </p>
        ) : isDraggable ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={listedAccounts.map((a) => a.id)}
              strategy={verticalListSortingStrategy}
            >
              {listedAccounts.map((account) => (
                <FavouriteRow
                  key={account.id}
                  account={account}
                  isSelected={selectedAccountId === account.id}
                  showEmail={showEmailFor(account)}
                  onSelect={() => handleSelect(account.id)}
                  onToggleFavourite={() => toggleFavourite(account)}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          // No favourites yet: plain (non-draggable) fallback rows.
          listedAccounts.map((account) => {
            const isSelected = selectedAccountId === account.id;
            return (
              <div
                key={account.id}
                className={clsx(
                  'group flex items-center rounded-md pr-1 transition-colors',
                  isSelected ? 'bg-accent-600 shadow-sm' : 'hover:bg-gray-200'
                )}
              >
                <button
                  onClick={() => handleSelect(account.id)}
                  className={clsx(
                    'flex min-w-0 flex-1 items-center space-x-3 rounded-md px-3 py-2 text-left text-sm font-medium',
                    isSelected ? 'text-white' : 'text-gray-700 group-hover:text-gray-900'
                  )}
                >
                  <AccountIdentity
                    account={account}
                    isSelected={isSelected}
                    showEmail={showEmailFor(account)}
                  />
                </button>
                <StarButton
                  account={account}
                  isSelected={isSelected}
                  onToggle={() => toggleFavourite(account)}
                />
              </div>
            );
          })
        )}
      </div>

      <button
        onClick={() => setAllAccountsOpen(true)}
        className="mt-2 flex flex-none items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
      >
        <Users className="h-3.5 w-3.5" />
        <span>View all accounts</span>
      </button>
    </div>
  );
}
