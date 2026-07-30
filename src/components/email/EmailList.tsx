'use client';

import { AccountLabelList } from '@/components/labels/AccountLabelList';
import { useSearch } from '@/hooks/useSearch';
import { buildReplyAllRecipients } from '@/lib/email/addresses';
import { useAccountStore } from '@/stores/accountStore';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Forward, Inbox, Loader2, Mail, MailOpen, Reply, ReplyAll, RotateCcw, Search, Star, StarOff, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { EmailRow } from './EmailRow';

interface ContextMenuState {
  x: number;
  y: number;
  email: any;
}

interface EmailListProps {
  onSelectEmail: (emailId: string | null) => void;
  selectedEmailId: string | null;
}

export function EmailList({ onSelectEmail, selectedEmailId }: EmailListProps) {
  const queryClient = useQueryClient();
  const { selectedAccountId, selectedFolder, setComposeDraft, setComposeModalOpen } = useAccountStore();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const urlQ = searchParams.get('q') || '';
  const urlReadStatus = searchParams.get('readStatus') as 'all' | 'unread' | null;
  const urlAccountScope = searchParams.get('accountScope') as 'all' | 'favourite-accounts' | null;
  const urlStarred = searchParams.get('starred');

  const { query: searchQuery, setQuery: setSearchQuery, results: searchResults, isLoading: isSearchLoading } = useSearch(urlQ, selectedAccountId || undefined, selectedFolder);
  const isSearching = searchQuery.length > 0;

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  // Final on-screen position after clamping the menu to the viewport. Null until
  // the menu is measured (falls back to the raw cursor point for that one frame).
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Escape closes the context menu first, then clears the selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Let focused fields (e.g. the label picker's search) handle Escape themselves
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
        if (contextMenu) {
          setContextMenu(null);
        } else {
          setSelectedIds(new Set());
        }
      }
    };

    if (contextMenu || selectedIds.size > 0) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu, selectedIds.size]);

  // Selection is transient: reset when the viewed list changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedAccountId, selectedFolder, isSearching]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleContextMenu = (e: React.MouseEvent, email: any) => {
    e.preventDefault();
    // Reset so the menu is re-measured and re-clamped for this new position.
    setMenuPos(null);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      email,
    });
  };

  // Once the menu is rendered, measure it and clamp so it never runs off-screen
  // (e.g. right-clicking near the bottom). useLayoutEffect corrects the position
  // before paint, so there's no visible jump.
  useLayoutEffect(() => {
    const el = contextMenuRef.current;
    if (!contextMenu || !el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(contextMenu.x, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(contextMenu.y, window.innerHeight - height - 8));
    setMenuPos({ top, left });
    // eslint-disable-next-line react-hooks/set-state-in-effect
  }, [contextMenu]);

  const updateEmailMutation = useMutation({
    mutationFn: async ({ emailId, accountId, data }: { emailId: string; accountId: string; data: any }) => {
      const res = await fetch(`/api/accounts/${accountId}/emails/${emailId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update email');
      return res.json();
    },
    onSuccess: (updatedEmail) => {
      // Prefix key, not the exact triple: with the global 60s staleTime, the
      // other folder/account lists would otherwise serve stale cached data.
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['search'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['accountStats'] });
      queryClient.invalidateQueries({ queryKey: ['new-emails-count'] });
    },
    onError: () => toast.error('Failed to update email'),
  });

  const invalidateAfterMailboxChange = () => {
    // Moving an email between folders changes *two* lists (source and target),
    // so invalidate the whole ['emails'] prefix rather than just the active one.
    queryClient.invalidateQueries({ queryKey: ['emails'] });
    queryClient.invalidateQueries({ queryKey: ['search'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['accountStats'] });
    queryClient.invalidateQueries({ queryKey: ['new-emails-count'] });
  };

  const deleteEmailMutation = useMutation({
    mutationFn: async ({ emailId, accountId }: { emailId: string; accountId: string }) => {
      const res = await fetch(`/api/accounts/${accountId}/emails/${emailId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete email');
      return res.json();
    },
    onSuccess: (result) => {
      invalidateAfterMailboxChange();
      // serverSynced is false only when a server copy existed and we couldn't
      // reach it — a local-only email reports success with nothing to sync.
      if (result?.serverSynced === false) {
        toast.error(
          result?.permanent
            ? 'Deleted locally, but the mail server could not be updated'
            : 'Moved to trash locally, but the mail server could not be updated'
        );
        return;
      }
      toast.success(result?.permanent ? 'Email permanently deleted' : 'Email moved to trash');
    },
    onError: () => toast.error('Failed to delete email'),
  });

  const restoreEmailMutation = useMutation({
    mutationFn: async ({ emailId, accountId }: { emailId: string; accountId: string }) => {
      const res = await fetch(`/api/accounts/${accountId}/emails/${emailId}/restore`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to restore email');
      return res.json();
    },
    onSuccess: (result) => {
      invalidateAfterMailboxChange();
      const folderName = result?.folder === 'SENT' ? 'Sent' : 'Inbox';
      if (result?.serverSynced === false) {
        toast.error(`Restored to ${folderName} locally, but the mail server could not be updated`);
        return;
      }
      toast.success(`Email restored to ${folderName}`);
    },
    onError: () => toast.error('Failed to restore email'),
  });

  const emptyTrashMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/accounts/${selectedAccountId || 'all'}/emails/empty-trash`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to empty trash');
      return res.json();
    },
    onSuccess: (result) => {
      invalidateAfterMailboxChange();
      const count = result?.deleted ?? 0;
      if (result?.serverFailed > 0) {
        toast.error(
          `Deleted ${count} ${count === 1 ? 'email' : 'emails'}, but ${result.serverFailed} could not be removed from the mail server`
        );
        return;
      }
      toast.success(`Deleted ${count} ${count === 1 ? 'email' : 'emails'}`);
    },
    onError: () => toast.error('Failed to empty trash'),
  });

  const handleContextAction = async (action: string) => {
    if (!contextMenu) return;
    const { email } = contextMenu;
    const accountId = (selectedAccountId === 'all' || selectedAccountId === 'new-emails') ? email.accountId : selectedAccountId;

    setContextMenu(null);

    switch (action) {
      case 'read':
        updateEmailMutation.mutate({ emailId: email.id, accountId, data: { isRead: true } });
        break;
      case 'unread':
        updateEmailMutation.mutate({ emailId: email.id, accountId, data: { isRead: false } });
        break;
      case 'star':
        updateEmailMutation.mutate({ emailId: email.id, accountId, data: { isStarred: !email.isStarred } });
        break;
      case 'delete':
        // Deleting from trash is permanent and propagates to the mail server.
        if (email.folder === 'TRASH') {
          const confirmed = window.confirm(
            `Permanently delete "${email.subject || '(no subject)'}"?\n\nThis removes it from the mail server too and cannot be undone.`
          );
          if (!confirmed) break;
        }
        deleteEmailMutation.mutate({ emailId: email.id, accountId });
        break;
      case 'restore':
        restoreEmailMutation.mutate({ emailId: email.id, accountId });
        break;
      case 'reply':
      case 'replyAll':
      case 'forward':
        try {
          // Need full email body for quoting
          const res = await fetch(`/api/accounts/${accountId}/emails/${email.id}`);
          if (!res.ok) throw new Error('Failed to load full email');
          const fullEmail = await res.json();

          let to = '';
          let cc = '';
          let subject = fullEmail.subject || '';
          let bodyHtml = `<br><br><blockquote style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex">${fullEmail.body?.bodyHtml || fullEmail.snippet || ''}</blockquote>`;

          if (action === 'reply' || action === 'replyAll') {
            to = fullEmail.replyTo || fullEmail.fromAddress || '';
            subject = subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`;
            if (action === 'replyAll') {
              const recipients = buildReplyAllRecipients({
                replyTo: fullEmail.replyTo,
                fromAddress: fullEmail.fromAddress,
                toAddresses: fullEmail.toAddresses,
                ccAddresses: fullEmail.ccAddresses,
                currentAccountAddress: fullEmail.account?.emailAddress,
              });
              to = recipients.to.join(', ');
              cc = recipients.cc.join(', ');
            }
          } else if (action === 'forward') {
            to = '';
            subject = subject.toLowerCase().startsWith('fwd:') ? subject : `Fwd: ${subject}`;
            bodyHtml = `<br><br>-------- Forwarded Message --------<br>Subject: ${fullEmail.subject}<br>Date: ${new Date(fullEmail.receivedAt).toString()}<br>From: ${fullEmail.fromName} &lt;${fullEmail.fromAddress}&gt;<br><br>${fullEmail.body?.bodyHtml || fullEmail.snippet || ''}`;
          }

          setComposeDraft({
            id: undefined, // New draft
            accountId: fullEmail.accountId || email.accountId,
            to,
            cc,
            subject,
            bodyHtml,
          });
          setComposeModalOpen(true);
        } catch (error) {
          toast.error('Failed to load email for compose');
        }
        break;
    }
  };

  const handleEmailClick = async (email: any) => {
    if (email.isDraft) {
      let draft = email;
      try {
        const res = await fetch(`/api/accounts/${email.accountId}/emails/${email.id}`);
        if (res.ok) draft = await res.json();
      } catch (error) {
        console.error('Failed to load complete draft:', error);
      }

      setComposeDraft({
        id: draft.id,
        accountId: draft.accountId
          || (selectedAccountId !== 'all' ? selectedAccountId ?? undefined : undefined),
        to: draft.toAddresses?.map((address: any) => address.address).filter(Boolean).join(', ') || '',
        cc: draft.ccAddresses?.map((address: any) => address.address).filter(Boolean).join(', ') || '',
        bcc: draft.bccAddresses?.map((address: any) => address.address).filter(Boolean).join(', ') || '',
        subject: draft.subject || '',
        bodyHtml: draft.body?.bodyHtml || draft.snippet || '',
      });
      setComposeModalOpen(true);
      return;
    }
    if (!email.isRead) {
      // Update the infinite query cache – the key must include ALL query key fields
      // that were used to register it, otherwise setQueryData targets the wrong entry
      // and the list continues to show the email as unread.
      queryClient.setQueryData(
        ['emails', selectedAccountId, selectedFolder, readStatus, accountScope, isFavouriteEmailsOnly],
        (oldData: any) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page: any) => ({
              ...page,
              emails: page.emails.map((e: any) =>
                e.id === email.id ? { ...e, isRead: true } : e
              ),
            })),
          };
        }
      );

      if (searchQuery) {
        queryClient.setQueriesData(
          { queryKey: ['search'] },
          (oldData: any) => {
            if (!oldData) return oldData;
            return {
              ...oldData,
              hits: oldData.hits?.map((e: any) =>
                e.id === email.id ? { ...e, isRead: true } : e
              )
            };
          }
        );
      }

      // Opening the email marks it read server-side (GET side-effect), so keep the
      // sidebar unread badges in sync optimistically. Invalidating here would race
      // against that server write, so update the caches directly instead.
      const readAccountId =
        (selectedAccountId === 'all' || selectedAccountId === 'new-emails')
          ? email.accountId
          : selectedAccountId;

      if (readAccountId && email.folder === 'INBOX') {
        queryClient.setQueryData(['accountStats', readAccountId], (oldData: any) =>
          oldData
            ? { ...oldData, unreadCount: Math.max(0, (oldData.unreadCount || 0) - 1) }
            : oldData
        );
      }
      queryClient.setQueryData(['new-emails-count'], (oldData: any) => {
        if (!oldData) return oldData;

        const next = { ...oldData };

        // Always filter the emails array so the Sidebar badge (which reads
        // emails.length) immediately reflects the read email being dismissed.
        if (next.emails) {
          next.emails = next.emails.filter((e: any) => e.id !== email.id);
        }

        // The sidebar account badge reads countsByAccount first and only falls back
        // to `emails`, so keep both in sync.
        if (next.countsByAccount && readAccountId && email.folder === 'INBOX') {
          const counts = { ...next.countsByAccount };
          const remaining = (counts[readAccountId] || 0) - 1;
          if (remaining > 0) {
            counts[readAccountId] = remaining;
          } else {
            delete counts[readAccountId];
          }
          next.countsByAccount = counts;
        }

        return next;
      });

      // Invalidate after a short delay so the server's read-marking write (which
      // happens when the viewer fetches the email) has time to complete before we
      // re-fetch the counts. This ensures the badge always reflects server truth.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['new-emails-count'] });
        queryClient.invalidateQueries({ queryKey: ['accountStats'] });
      }, 1500);
    }

    onSelectEmail(email.id);
  };

  const [readStatus, setReadStatusState] = useState<'all' | 'unread'>(() => {
    if (urlReadStatus === 'all' || urlReadStatus === 'unread') return urlReadStatus;
    const activeAccount = searchParams.get('accountId') || selectedAccountId;
    const isAllAccount = activeAccount === 'all' || activeAccount === 'new-emails' || (!searchParams.get('accountId') && pathname === '/all-emails');
    return isAllAccount ? 'unread' : 'all';
  });

  const [accountScope, setAccountScopeState] = useState<'all' | 'favourite-accounts'>(() => {
    if (urlAccountScope === 'all' || urlAccountScope === 'favourite-accounts') return urlAccountScope;
    return 'all';
  });

  const [isFavouriteEmailsOnly, setIsFavouriteEmailsOnlyState] = useState<boolean>(() => {
    if (urlStarred !== null) return urlStarred === 'true';
    return false;
  });

  // Stores email objects seen this session in unread mode.
  // Using a Map (id → email) so emails stay visible in the list even after
  // the server re-fetches and drops them (because they're now read). The Map
  // resets naturally on component unmount (page navigation), so on the next
  // visit only genuinely unread emails from the fresh server response are shown.
  const [retainedEmailsMap, setRetainedEmailsMap] = useState<Map<string, any> | null>(null);

  const updateQueryParam = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '' || value === undefined) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const queryString = params.toString();
    const newUrl = queryString ? `${pathname}?${queryString}` : pathname;
    window.history.pushState(null, '', newUrl);
  }, [pathname]);

  const setReadStatus = (status: 'all' | 'unread') => {
    setReadStatusState(status);
    updateQueryParam({ readStatus: status });
  };

  const setAccountScope = (scope: 'all' | 'favourite-accounts') => {
    setAccountScopeState(scope);
    updateQueryParam({ accountScope: scope === 'all' ? null : scope });
  };

  const setIsFavouriteEmailsOnly = (valOrFn: boolean | ((prev: boolean) => boolean)) => {
    const nextVal = typeof valOrFn === 'function' ? valOrFn(isFavouriteEmailsOnly) : valOrFn;
    setIsFavouriteEmailsOnlyState(nextVal);
    updateQueryParam({ starred: nextVal ? 'true' : null });
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    updateQueryParam({ q: q || null });
  };

  // Sync state when URL searchParams change
  useEffect(() => {
    if (urlQ !== searchQuery) {
      setSearchQuery(urlQ);
    }
  }, [urlQ, searchQuery, setSearchQuery]);

  useEffect(() => {
    if (urlReadStatus) {
      if (urlReadStatus !== readStatus) {
        setReadStatusState(urlReadStatus);
      }
    } else {
      const activeAccount = searchParams.get('accountId') || selectedAccountId;
      const isAllAccount = activeAccount === 'all' || activeAccount === 'new-emails' || (!searchParams.get('accountId') && pathname === '/all-emails');
      const defaultStatus = isAllAccount ? 'unread' : 'all';
      if (readStatus !== defaultStatus) {
        setReadStatusState(defaultStatus);
      }
    }
  }, [urlReadStatus, readStatus, selectedAccountId, pathname, searchParams]);

  useEffect(() => {
    if (urlAccountScope && urlAccountScope !== accountScope) {
      setAccountScopeState(urlAccountScope);
    }
  }, [urlAccountScope, accountScope]);

  useEffect(() => {
    if (urlStarred !== null) {
      const isStarred = urlStarred === 'true';
      if (isStarred !== isFavouriteEmailsOnly) {
        setIsFavouriteEmailsOnlyState(isStarred);
      }
    }
  }, [urlStarred, isFavouriteEmailsOnly]);

  // Reset the retention map whenever filter settings change (new filter = fresh session)
  useEffect(() => {
    setRetainedEmailsMap(null);
  }, [readStatus, accountScope, isFavouriteEmailsOnly, selectedAccountId, selectedFolder]);

  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const activeAccount = selectedAccountId
    ? accounts?.find((a: any) => a.id === selectedAccountId)
    : null;

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ['emails', selectedAccountId, selectedFolder, readStatus, accountScope, isFavouriteEmailsOnly],
    queryFn: async ({ pageParam = 1 }) => {
      let url = `/api/accounts/${selectedAccountId}/emails?folder=${selectedFolder}&page=${pageParam}&limit=20`;

      if (selectedAccountId === 'new-emails') {
        url = `/api/accounts/all/emails?folder=INBOX&page=${pageParam}&limit=20`;
      }

      if (readStatus !== 'all') url += `&readStatus=${readStatus}`;
      if (accountScope !== 'all') url += `&accountScope=${accountScope}`;
      if (isFavouriteEmailsOnly) url += `&favouriteEmailsOnly=true`;

      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch emails');
      return res.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination.page < lastPage.pagination.totalPages) {
        return lastPage.pagination.page + 1;
      }
      return undefined;
    },
    enabled: searchQuery.length === 0 && !!selectedAccountId, // Only fetch normal list if not searching and account is selected
  });

  const observer = useRef<IntersectionObserver | null>(null);
  const lastElementRef = useCallback((node: HTMLDivElement | null) => {
    if (isFetchingNextPage) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasNextPage) {
        fetchNextPage();
      }
    });
    if (node) observer.current.observe(node);
  }, [isFetchingNextPage, hasNextPage, fetchNextPage]);

  // Flatten the pages for the main list
  const flatEmails = useMemo(() => data?.pages.flatMap(page => page.emails) || [], [data?.pages]);

  // Merge incoming emails into the retention map whenever the server list updates.
  // - New emails are added to the map (only if they are unread at seed time).
  // - Existing entries are updated with fresh data (e.g. isRead toggled via optimistic
  //   update) so the row renders correctly (bold/un-bold, etc.).
  // - Emails that left the server list (read + filtered out) are kept in the map
  //   so they stay visible until the user navigates away.
  useEffect(() => {
    if (readStatus !== 'unread' || flatEmails.length === 0) return;

    setRetainedEmailsMap((prev) => {
      const next = new Map(prev ?? []);
      for (const email of flatEmails) {
        if (!prev) {
          // Initial seed: only include emails that are still unread
          if (!email.isRead) next.set(email.id, email);
        } else {
          // Subsequent update: refresh existing entries with latest data, or add new ones
          if (next.has(email.id)) {
            next.set(email.id, email); // keep data fresh (e.g. isRead=true after click)
          } else if (!email.isRead) {
            next.set(email.id, email); // genuinely new unread email arrived
          }
        }
      }
      return next;
    });
  }, [readStatus, flatEmails]);

  const displayableFlatEmails = useMemo(() => {
    if (readStatus === 'unread' && retainedEmailsMap) {
      // Return all retained email objects, sorted newest-first.
      // This preserves emails that have been read (and thus dropped by the server
      // unread filter) until the user navigates away from the page.
      return Array.from(retainedEmailsMap.values()).sort(
        (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
      );
    }
    return flatEmails;
  }, [flatEmails, readStatus, retainedEmailsMap]);

  const emailsToDisplay = searchQuery ? searchResults : displayableFlatEmails;
  const loading = isLoading || isSearchLoading;

  // Total, not just the loaded pages, so the confirmation states the real count
  const trashCount = data?.pages?.[0]?.pagination?.total ?? flatEmails.length;

  const handleEmptyTrash = () => {
    const confirmed = window.confirm(
      `Permanently delete all ${trashCount} ${trashCount === 1 ? 'email' : 'emails'} in the trash?\n\nThis removes them from the mail server too and cannot be undone.`
    );
    if (!confirmed) return;
    emptyTrashMutation.mutate();
  };

  // Derive the live selection from the list so removed emails drop out automatically
  const selectedEmails = useMemo(
    () => flatEmails.filter((e: any) => selectedIds.has(e.id)),
    [flatEmails, selectedIds]
  );
  const selectedEmailIds = useMemo(() => selectedEmails.map((e: any) => e.id), [selectedEmails]);
  const selectionLabelCounts = useMemo(() => {
    const counts = new Map<string, number>();
    selectedEmails.forEach((e: any) => {
      e.emailLabels?.forEach((el: any) => {
        counts.set(el.label.id, (counts.get(el.label.id) || 0) + 1);
      });
    });
    return counts;
  }, [selectedEmails]);

  if (!selectedAccountId) {
    return (
      <div className="flex flex-col h-full bg-white border-r border-gray-200 items-center justify-center p-8 text-center">
        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
          <Inbox className="w-8 h-8 text-gray-300" />
        </div>
        <p className="text-sm font-medium text-gray-900">Please select an account</p>
        <p className="text-sm text-gray-500 mt-1">
          Select an email account from the sidebar to view your inbox.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <div className="mb-4 flex flex-col justify-center min-h-[40px]">
          {activeAccount || selectedAccountId === 'new-emails' || selectedAccountId === 'all' ? (
            <>
              {selectedAccountId === 'new-emails' || selectedAccountId === 'all' ? (
                <h2 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                  <span>All Emails</span>
                </h2>
              ) : (
                <>
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: activeAccount?.color || '#3B82F6' }}
                    />
                    <span className="truncate">{activeAccount?.label || activeAccount?.emailAddress}</span>
                  </h2>
                  {activeAccount?.label && (
                    <p className="text-xs text-gray-500 truncate mt-0.5 ml-5">{activeAccount.emailAddress}</p>
                  )}
                  <AccountLabelList
                    accountId={activeAccount!.id}
                  />
                </>
              )}
            </>
          ) : null}
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            suppressHydrationWarning
            placeholder="Search emails..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:bg-white transition-all"
          />
        </div>

        {(selectedAccountId === 'all' || selectedAccountId === 'new-emails') && (
          <div className="flex flex-wrap items-center gap-2.5 pt-3 pb-0.5 text-xs">
            {/* Group 1: Accounts (Always 1 active: All vs Favourites) */}
            <div className="flex flex-col gap-1 flex-shrink-0">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider pl-1">Accounts</span>
              <div className="flex items-center bg-gray-100 p-0.5 rounded-full border border-gray-200">
                <button
                  type="button"
                  onClick={() => setAccountScope('all')}
                  className={clsx(
                    "px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors",
                    accountScope === 'all'
                      ? "bg-white text-gray-900 shadow-sm font-semibold"
                      : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setAccountScope('favourite-accounts')}
                  className={clsx(
                    "px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors",
                    accountScope === 'favourite-accounts'
                      ? "bg-accent-600 text-white shadow-sm font-semibold"
                      : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  Favourites
                </button>
              </div>
            </div>

            <span className="h-6 w-px bg-gray-200 flex-shrink-0 self-end mb-1" />

            {/* Group 2: Emails (Always 1 active: All vs Unread) */}
            <div className="flex flex-col gap-1 flex-shrink-0">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider pl-1">Emails</span>
              <div className="flex items-center bg-gray-100 p-0.5 rounded-full border border-gray-200">
                <button
                  type="button"
                  onClick={() => setReadStatus('all')}
                  className={clsx(
                    "px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors",
                    readStatus === 'all'
                      ? "bg-white text-gray-900 shadow-sm font-semibold"
                      : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setReadStatus('unread')}
                  className={clsx(
                    "px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors",
                    readStatus === 'unread'
                      ? "bg-accent-600 text-white shadow-sm font-semibold"
                      : "text-gray-600 hover:text-gray-900"
                  )}
                >
                  Unread
                </button>
              </div>
            </div>

            <span className="h-6 w-px bg-gray-200 flex-shrink-0 self-end mb-1" />

            {/* Group 3: Others (Standalone Starred toggle) */}
            <div className="flex flex-col gap-1 flex-shrink-0">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider pl-1">Others</span>
              <button
                type="button"
                onClick={() => setIsFavouriteEmailsOnly((prev) => !prev)}
                className={clsx(
                  "px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors border flex items-center space-x-1",
                  isFavouriteEmailsOnly
                    ? "bg-amber-500 text-white border-amber-500 shadow-sm"
                    : "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200 hover:text-gray-900"
                )}
              >
                <Star className={clsx("w-3 h-3", isFavouriteEmailsOnly ? "fill-white text-white" : "text-amber-500")} />
                <span>Starred</span>
              </button>
            </div>
          </div>
        )}
        {selectedFolder === 'TRASH' && trashCount > 0 && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleEmptyTrash}
              disabled={emptyTrashMutation.isPending}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {emptyTrashMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              <span>Empty trash</span>
            </button>
          </div>
        )}
      </div>

      {selectedEmails.length > 0 && !isSearching && (
        <div className="px-4 py-2 bg-accent-50 border-b border-accent-100 flex items-center justify-between">
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="p-1.5 text-accent-700 hover:bg-accent-100 rounded-md transition-colors"
              title="Clear selection"
              aria-label="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-accent-700">
              {selectedEmails.length} selected
            </span>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : emailsToDisplay?.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8 text-center">
            <InboxEmptyState />
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              {emailsToDisplay?.map((email: any) => (
                <EmailRow
                  key={email.id}
                  email={email}
                  onClick={() => handleEmailClick(email)}
                  onContextMenu={handleContextMenu}
                  isSelected={selectedEmailId === email.id}
                  selectable={!isSearching}
                  isChecked={selectedIds.has(email.id)}
                  selectionActive={selectedEmails.length > 0}
                  onToggleSelect={toggleSelect}
                  showAccountBadge={selectedAccountId === 'all' || selectedAccountId === 'new-emails'}
                />
              ))}
            </div>
            {/* Observer Target */}
            {!searchQuery && hasNextPage && (
              <div ref={lastElementRef} className="h-4 w-full" />
            )}
            {isFetchingNextPage && (
              <div className="flex justify-center p-4">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            )}
          </>
        )}
      </div>

      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
          />
          <div
            ref={contextMenuRef}
            className="fixed z-50 bg-white rounded-md shadow-lg border border-gray-200 py-1 w-48 text-sm text-gray-700"
            style={{
              top: `${menuPos?.top ?? contextMenu.y}px`,
              left: `${menuPos?.left ?? contextMenu.x}px`
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center space-x-2"
              onClick={() => handleContextAction('reply')}
            >
              <Reply className="w-4 h-4 text-gray-500" />
              <span>Reply</span>
            </button>
            <button
              className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center space-x-2"
              onClick={() => handleContextAction('replyAll')}
            >
              <ReplyAll className="w-4 h-4 text-gray-500" />
              <span>Reply All</span>
            </button>
            <button
              className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center space-x-2"
              onClick={() => handleContextAction('forward')}
            >
              <Forward className="w-4 h-4 text-gray-500" />
              <span>Forward</span>
            </button>
            <div className="border-t border-gray-100 my-1"></div>
            {contextMenu.email.isRead ? (
              <button
                className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center space-x-2"
                onClick={() => handleContextAction('unread')}
              >
                <Mail className="w-4 h-4 text-gray-500" />
                <span>Mark as unread</span>
              </button>
            ) : (
              <button
                className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center space-x-2"
                onClick={() => handleContextAction('read')}
              >
                <MailOpen className="w-4 h-4 text-gray-500" />
                <span>Mark as read</span>
              </button>
            )}
            <button
              className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center space-x-2"
              onClick={() => handleContextAction('star')}
            >
              {contextMenu.email.isStarred ? (
                <>
                  <StarOff className="w-4 h-4 text-gray-500" />
                  <span>Remove star</span>
                </>
              ) : (
                <>
                  <Star className="w-4 h-4 text-gray-500" />
                  <span>Add star</span>
                </>
              )}
            </button>
            <div className="border-t border-gray-100 my-1"></div>
            {contextMenu.email.folder === 'TRASH' && (
              <button
                className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center space-x-2"
                onClick={() => handleContextAction('restore')}
              >
                <RotateCcw className="w-4 h-4 text-gray-500" />
                <span>Restore to folder</span>
              </button>
            )}
            <button
              className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center space-x-2 text-red-600"
              onClick={() => handleContextAction('delete')}
            >
              <Trash2 className="w-4 h-4" />
              <span>
                {contextMenu.email.folder === 'TRASH' ? 'Delete permanently' : 'Delete'}
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function InboxEmptyState() {
  return (
    <>
      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
        <Search className="w-8 h-8 text-gray-300" />
      </div>
      <p className="text-sm font-medium text-gray-900">No emails found</p>
      <p className="text-sm text-gray-500 mt-1">
        Try adjusting your search or check back later.
      </p>
    </>
  );
}
