'use client';

import { useAccountStore } from '@/stores/accountStore';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertOctagon,
  AlertTriangle,
  Copy,
  FileEdit,
  GripVertical,
  Inbox,
  Loader2,
  MailCheck,
  RefreshCw,
  Search,
  Send,
  Settings,
  Settings2,
  Star,
  Trash2,
} from 'lucide-react';
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
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
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
  useLabels,
} from '@/components/accounts/LabelFilterMenu';
import { LabelFilterChips } from '@/components/accounts/LabelFilterChips';
import { EditAccountModal } from '@/components/settings/EditAccountModal';

const FOLDERS = [
  { id: 'INBOX', name: 'Inbox', icon: Inbox },
  { id: 'SENT', name: 'Sent', icon: Send },
  { id: 'DRAFTS', name: 'Drafts', icon: FileEdit },
  { id: 'SPAM', name: 'Spam', icon: AlertOctagon },
  { id: 'TRASH', name: 'Trash', icon: Trash2 },
];

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
  newEmailsCount = 0,
  onSelect,
  onToggleFavourite,
  onContextMenu,
}: {
  account: SidebarAccount;
  isSelected: boolean;
  showEmail: boolean;
  newEmailsCount?: number;
  onSelect: () => void;
  onToggleFavourite: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: account.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onContextMenu={onContextMenu}
      className={clsx(
        'group flex items-center rounded-md pr-1 transition-colors select-none',
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
          'flex min-w-0 flex-1 items-center space-x-2 rounded-md px-2 py-2 text-left text-sm font-medium',
          isSelected ? 'text-white' : 'text-gray-700 group-hover:text-gray-900'
        )}
      >
        <AccountIdentity account={account} isSelected={isSelected} showEmail={showEmail} />
        {newEmailsCount > 0 && (
          <span
            className={clsx(
              'flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-bold transition-colors',
              isSelected
                ? 'bg-white text-accent-700'
                : 'bg-accent-600 text-white'
            )}
          >
            {newEmailsCount > 99 ? '99+' : newEmailsCount}
          </span>
        )}
        {account.authError && (
          <span title="Authentication Error" className="flex-shrink-0">
            <AlertTriangle className={clsx('w-4 h-4', isSelected ? 'text-red-300' : 'text-red-500')} />
          </span>
        )}
      </button>

      <StarButton account={account} isSelected={isSelected} onToggle={onToggleFavourite} />
    </div>
  );
}

/** A standard (non-draggable) row for non-favourites or filtered state. */
function PlainAccountRow({
  account,
  isSelected,
  showEmail,
  newEmailsCount = 0,
  onSelect,
  onToggleFavourite,
  onContextMenu,
}: {
  account: SidebarAccount;
  isSelected: boolean;
  showEmail: boolean;
  newEmailsCount?: number;
  onSelect: () => void;
  onToggleFavourite: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onContextMenu={onContextMenu}
      className={clsx(
        'group flex items-center rounded-md pr-1 transition-colors select-none',
        isSelected ? 'bg-accent-600 shadow-sm' : 'hover:bg-gray-200'
      )}
    >
      <button
        onClick={onSelect}
        className={clsx(
          'flex min-w-0 flex-1 items-center space-x-2 rounded-md px-3 py-2 text-left text-sm font-medium',
          isSelected ? 'text-white' : 'text-gray-700 group-hover:text-gray-900'
        )}
      >
        <AccountIdentity account={account} isSelected={isSelected} showEmail={showEmail} />
        {newEmailsCount > 0 && (
          <span
            className={clsx(
              'flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-bold transition-colors',
              isSelected
                ? 'bg-white text-accent-700'
                : 'bg-accent-600 text-white'
            )}
          >
            {newEmailsCount > 99 ? '99+' : newEmailsCount}
          </span>
        )}
        {account.authError && (
          <span title="Authentication Error" className="flex-shrink-0">
            <AlertTriangle className={clsx('w-4 h-4', isSelected ? 'text-red-300' : 'text-red-500')} />
          </span>
        )}
      </button>

      <StarButton account={account} isSelected={isSelected} onToggle={onToggleFavourite} />
    </div>
  );
}

export function AccountsSection() {
  const queryClient = useQueryClient();
  const { selectedAccountId, setSelectedAccountId, selectedFolder, setSelectedFolder } =
    useAccountStore();
  const pathname = usePathname();
  const router = useRouter();

  const { data: accounts = [], isLoading } = useAccounts();
  const { toggleFavourite, reorderFavourites } = useFavouriteMutations();

  const { data: stats } = useQuery({
    queryKey: ['accountStats', selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId || selectedAccountId === 'new-emails') return null;
      const res = await fetch(`/api/accounts/${selectedAccountId}/stats`);
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
    enabled: !!selectedAccountId && selectedAccountId !== 'new-emails',
  });

  const { data: newEmailsData } = useQuery({
    queryKey: ['new-emails-count'],
    queryFn: async () => {
      const res = await fetch('/api/emails/new');
      if (!res.ok) return { emails: [] };
      return res.json();
    },
    refetchInterval: 30000,
  });

  const newCountsByAccount = useMemo(() => {
    const map = new Map<string, number>();
    if (newEmailsData?.countsByAccount && typeof newEmailsData.countsByAccount === 'object') {
      for (const [accId, count] of Object.entries(newEmailsData.countsByAccount)) {
        if (typeof count === 'number' && count > 0) {
          map.set(accId, count);
        }
      }
    } else if (newEmailsData?.emails && Array.isArray(newEmailsData.emails)) {
      for (const email of newEmailsData.emails) {
        if (email.accountId) {
          map.set(email.accountId, (map.get(email.accountId) || 0) + 1);
        }
      }
    }
    return map;
  }, [newEmailsData]);

  const { data: authData } = useQuery({
    queryKey: ['auth-me'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me');
      if (!res.ok) throw new Error('Failed to fetch auth info');
      return res.json();
    },
  });
  const isAdmin = authData?.role === 'admin';

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    account: SidebarAccount;
  } | null>(null);
  const [settingsAccount, setSettingsAccount] = useState<SidebarAccount | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = (e: React.MouseEvent, account: SidebarAccount) => {
    e.preventDefault();
    setMenuPos(null);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      account,
    });
  };

  useLayoutEffect(() => {
    const el = contextMenuRef.current;
    if (!contextMenu || !el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(contextMenu.x, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(contextMenu.y, window.innerHeight - height - 8));
    setMenuPos({ top, left });
  }, [contextMenu]);

  const handleContextAction = async (action: string) => {
    if (!contextMenu) return;
    const { account } = contextMenu;
    setContextMenu(null);

    switch (action) {
      case 'toggleFavourite':
        toggleFavourite(account);
        break;
      case 'markAllRead':
        try {
          toast.loading('Marking all emails as read...', { id: 'read-all-toast' });
          const res = await fetch(`/api/accounts/${account.id}/read-all`, { method: 'POST' });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to mark all as read');

          queryClient.invalidateQueries({ queryKey: ['emails'] });
          queryClient.invalidateQueries({ queryKey: ['new-emails-count'] });
          queryClient.invalidateQueries({ queryKey: ['accountStats'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });

          toast.success('All emails marked as read', { id: 'read-all-toast' });
        } catch (err: any) {
          toast.error(err.message || 'Failed to mark all as read', { id: 'read-all-toast' });
        }
        break;
      case 'reindex':
        try {
          toast.loading('Queueing email sync...', { id: 'reindex-toast' });
          const res = await fetch(`/api/accounts/${account.id}/reindex`, { method: 'POST' });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to trigger reindex');
          toast.success(data.message || 'Sync queued successfully', { id: 'reindex-toast' });
        } catch (err: any) {
          toast.error(err.message || 'Failed to trigger reindex', { id: 'reindex-toast' });
        }
        break;
      case 'copyEmail':
        if (account.emailAddress) {
          await navigator.clipboard.writeText(account.emailAddress);
          toast.success('Email address copied to clipboard');
        }
        break;
      case 'accountSettings':
        setSettingsAccount(account);
        break;
      case 'settings':
        router.push('/settings/accounts');
        break;
    }
  };

  const [query, setQuery] = useState('');
  const labels = useLabels();
  const searchParams = useSearchParams();
  const accountIdParam = searchParams.get('accountId');
  const folderParam = searchParams.get('folder');
  const labelIdParam = searchParams.get('labelId');

  const [selectedLabelId, setSelectedLabelIdState] = useState<string | null>(labelIdParam);

  useLayoutEffect(() => {
    if (labelIdParam !== selectedLabelId) {
      setSelectedLabelIdState(labelIdParam);
    }
  }, [labelIdParam]);

  const handleLabelSelect = (id: string | null) => {
    setSelectedLabelIdState(id);
    const params = new URLSearchParams(window.location.search);
    if (id) {
      params.set('labelId', id);
    } else {
      params.delete('labelId');
    }
    const queryString = params.toString();
    const targetPath = pathname.startsWith('/inbox') || pathname.startsWith('/all-emails') || pathname.startsWith('/labels') ? pathname : '/inbox';
    window.history.pushState(null, '', `${targetPath}?${queryString}`);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const favouriteAccounts = useMemo(() => sortedFavourites(accounts), [accounts]);

  const effectiveSelectedLabelId = useMemo(() => {
    return selectedLabelId && labels.some((l) => l.id === selectedLabelId)
      ? selectedLabelId
      : null;
  }, [selectedLabelId, labels]);

  const isFiltering = query.trim().length > 0 || effectiveSelectedLabelId !== null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const allowedIds = effectiveSelectedLabelId
      ? allowedAccountIdsForLabels(labels, new Set([effectiveSelectedLabelId]))
      : null;

    return accounts.filter((a) => {
      if (allowedIds && !allowedIds.has(a.id)) return false;
      if (!q) return true;
      return (
        accountDisplayName(a).toLowerCase().includes(q) ||
        a.emailAddress.toLowerCase().includes(q)
      );
    });
  }, [accounts, query, effectiveSelectedLabelId, labels]);

  const groups = useMemo(() => {
    if (isFiltering) return null;
    const favSet = new Set(favouriteAccounts.map((a) => a.id));
    return {
      favourites: favouriteAccounts.filter((a) => filtered.some((f) => f.id === a.id)),
      others: sortedByName(filtered.filter((a) => !favSet.has(a.id))),
    };
  }, [filtered, isFiltering, favouriteAccounts]);

  // Keep store in sync with URL searchParams
  useLayoutEffect(() => {
    if (accountIdParam && accountIdParam !== selectedAccountId) {
      setSelectedAccountId(accountIdParam);
    }
  }, [accountIdParam, selectedAccountId, setSelectedAccountId]);

  useLayoutEffect(() => {
    if (folderParam && folderParam !== selectedFolder) {
      setSelectedFolder(folderParam);
    }
  }, [folderParam, selectedFolder, setSelectedFolder]);

  // Set default account ID in URL if none selected & accounts available
  useLayoutEffect(() => {
    if (!accountIdParam && !selectedAccountId && accounts.length > 0 && pathname.startsWith('/inbox')) {
      const defaultId = favouriteAccounts[0]?.id || accounts[0]?.id;
      if (defaultId) {
        setSelectedAccountId(defaultId);
        const params = new URLSearchParams(window.location.search);
        params.set('accountId', defaultId);
        window.history.replaceState(null, '', `${pathname}?${params.toString()}`);
      }
    }
  }, [accountIdParam, selectedAccountId, accounts, favouriteAccounts, pathname, setSelectedAccountId]);

  const duplicates = useMemo(() => duplicateDisplayNames(accounts), [accounts]);

  const showEmailInList = (account: SidebarAccount) =>
    shouldShowEmail(account) &&
    (account.id === selectedAccountId || duplicates.has(normalizedDisplayName(account)));

  const handleSelect = (id: string) => {
    setSelectedAccountId(id);
    const params = new URLSearchParams(window.location.search);
    params.set('accountId', id);
    params.delete('emailId');
    params.delete('readStatus');
    const queryString = params.toString();
    const targetPath = pathname.startsWith('/inbox') || pathname.startsWith('/all-emails') ? pathname : '/inbox';
    window.history.pushState(null, '', `${targetPath}?${queryString}`);
  };

  const handleFolderSelect = (folderId: string) => {
    setSelectedFolder(folderId);
    const params = new URLSearchParams(window.location.search);
    params.set('folder', folderId);
    params.delete('emailId');
    const queryString = params.toString();
    const targetPath = pathname.startsWith('/inbox') || pathname.startsWith('/all-emails') || pathname.startsWith('/labels') ? pathname : '/inbox';
    window.history.pushState(null, '', `${targetPath}?${queryString}`);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

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
      {accounts.length > 5 && (
        <div className="flex-none px-1 pb-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search accounts…"
              className="w-full rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-2.5 text-xs text-gray-800 outline-none transition-colors focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
            />
          </div>
        </div>
      )}

      {labels.length > 0 && (
        <div className="flex-none px-1 pb-2">
          <LabelFilterChips
            labels={labels}
            selectedLabelId={effectiveSelectedLabelId}
            onSelect={handleLabelSelect}
            wrap={true}
          />
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-0.5">
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-xs italic text-gray-500">
            {isFiltering ? 'No accounts match your filter' : 'No accounts connected'}
          </p>
        ) : groups ? (
          <>
            {groups.favourites.length > 0 && (
              <>
                <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Favourites
                </p>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={groups.favourites.map((a) => a.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {groups.favourites.map((account) => (
                      <FavouriteRow
                        key={account.id}
                        account={account}
                        isSelected={selectedAccountId === account.id}
                        showEmail={showEmailInList(account)}
                        newEmailsCount={newCountsByAccount.get(account.id) || 0}
                        onSelect={() => handleSelect(account.id)}
                        onToggleFavourite={() => toggleFavourite(account)}
                        onContextMenu={(e) => handleContextMenu(e, account)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </>
            )}

            {groups.others.length > 0 && (
              <>
                {groups.favourites.length > 0 && (
                  <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Others
                  </p>
                )}
                {groups.others.map((account) => (
                  <PlainAccountRow
                    key={account.id}
                    account={account}
                    isSelected={selectedAccountId === account.id}
                    showEmail={showEmailInList(account)}
                    newEmailsCount={newCountsByAccount.get(account.id) || 0}
                    onSelect={() => handleSelect(account.id)}
                    onToggleFavourite={() => toggleFavourite(account)}
                    onContextMenu={(e) => handleContextMenu(e, account)}
                  />
                ))}
              </>
            )}
          </>
        ) : (
          // Flat list when filtering (search query or label filter)
          [
            ...sortedFavourites(filtered),
            ...sortedByName(filtered.filter((a) => !a.isFavourite)),
          ].map((account) => (
            <PlainAccountRow
              key={account.id}
              account={account}
              isSelected={selectedAccountId === account.id}
              showEmail={showEmailInList(account)}
              newEmailsCount={newCountsByAccount.get(account.id) || 0}
              onSelect={() => handleSelect(account.id)}
              onToggleFavourite={() => toggleFavourite(account)}
              onContextMenu={(e) => handleContextMenu(e, account)}
            />
          ))
        )}
      </div>

      {/* Account Context Menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-50 bg-transparent"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
          />
          <div
            ref={contextMenuRef}
            style={{
              position: 'fixed',
              top: menuPos?.top ?? contextMenu.y,
              left: menuPos?.left ?? contextMenu.x,
              visibility: menuPos ? 'visible' : 'hidden',
            }}
            className="z-50 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-1.5 text-sm text-gray-700"
          >
            <div className="px-3 py-2 border-b border-gray-100 bg-gray-50/50">
              <div className="font-semibold text-gray-900 truncate">
                {accountDisplayName(contextMenu.account)}
              </div>
              <div className="text-xs text-gray-500 truncate">
                {contextMenu.account.emailAddress}
              </div>
            </div>

            <div className="py-1">
              <button
                className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center space-x-2.5 transition-colors text-xs font-medium"
                onClick={() => handleContextAction('toggleFavourite')}
              >
                {contextMenu.account.isFavourite ? (
                  <>
                    <Star className="w-4 h-4 text-yellow-500 fill-yellow-400" />
                    <span>Remove from Favourites</span>
                  </>
                ) : (
                  <>
                    <Star className="w-4 h-4 text-gray-400" />
                    <span>Add to Favourites</span>
                  </>
                )}
              </button>

              <button
                className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center space-x-2.5 transition-colors text-xs font-medium"
                onClick={() => handleContextAction('markAllRead')}
              >
                <MailCheck className="w-4 h-4 text-gray-500" />
                <span>Mark all emails as read</span>
              </button>

              <button
                className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center space-x-2.5 transition-colors text-xs font-medium"
                onClick={() => handleContextAction('reindex')}
              >
                <RefreshCw className="w-4 h-4 text-gray-500" />
                <span>Reindex / Sync Account</span>
              </button>

              <button
                className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center space-x-2.5 transition-colors text-xs font-medium"
                onClick={() => handleContextAction('copyEmail')}
              >
                <Copy className="w-4 h-4 text-gray-500" />
                <span>Copy Email Address</span>
              </button>

              <div className="border-t border-gray-100 my-1" />

              {isAdmin && (
                <button
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center space-x-2.5 transition-colors text-xs font-medium text-gray-700"
                  onClick={() => handleContextAction('accountSettings')}
                >
                  <Settings2 className="w-4 h-4 text-gray-500" />
                  <span>Account Settings</span>
                </button>
              )}

              <button
                className="w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center space-x-2.5 transition-colors text-xs font-medium text-gray-700"
                onClick={() => handleContextAction('settings')}
              >
                <Settings className="w-4 h-4 text-gray-500" />
                <span>Manage Accounts</span>
              </button>
            </div>
          </div>
        </>
      )}

      <EditAccountModal
        isOpen={!!settingsAccount}
        account={settingsAccount}
        onClose={() => setSettingsAccount(null)}
      />

      {/* Folder bar: Single row of 5 icons with hover tooltips at the beginning */}
      <div className="flex-none">
        <div className="flex items-center justify-between py-4 gap-1">
          {FOLDERS.map((folder) => {
            const isActive = selectedFolder === folder.id;
            const Icon = folder.icon;
            const unread =
              folder.id === 'INBOX' && stats?.unreadCount > 0 ? ` (${stats.unreadCount})` : '';

            return (
              <button
                key={folder.id}
                onClick={() => handleFolderSelect(folder.id)}
                title={`${folder.name}${unread}`}
                className={clsx(
                  'relative flex h-12 w-12 items-center justify-center rounded-md transition-all',
                  isActive
                    ? 'bg-accent-600 text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                <Icon className="h-4 w-4" />
                {folder.id === 'INBOX' && stats?.unreadCount > 0 && (
                  <span
                    className={clsx(
                      'absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold ring-2',
                      isActive
                        ? 'bg-white text-accent-600 ring-accent-600'
                        : 'bg-accent-600 text-white ring-white'
                    )}
                  >
                    {stats.unreadCount > 99 ? '99+' : stats.unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
