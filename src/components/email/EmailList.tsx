'use client';

import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAccountStore } from '@/stores/accountStore';
import { EmailRow } from './EmailRow';
import { LabelAssignmentPicker } from '@/components/labels/LabelAssignmentPicker';
import { AccountLabelList } from '@/components/labels/AccountLabelList';
import { Loader2, Search, Inbox, MailOpen, Mail, Star, StarOff, Trash2, Reply, ReplyAll, Forward, X } from 'lucide-react';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useSearch } from '@/hooks/useSearch';
import toast from 'react-hot-toast';

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
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { query: searchQuery, setQuery: setSearchQuery, results: searchResults, isLoading: isSearchLoading } = useSearch('', selectedAccountId || undefined, selectedFolder);
  const isSearching = searchQuery.length > 0;

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
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      email,
    });
  };

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
      queryClient.invalidateQueries({ queryKey: ['emails', selectedAccountId, selectedFolder] });
      queryClient.invalidateQueries({ queryKey: ['search'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: () => toast.error('Failed to update email'),
  });

  const deleteEmailMutation = useMutation({
    mutationFn: async ({ emailId, accountId }: { emailId: string; accountId: string }) => {
      const res = await fetch(`/api/accounts/${accountId}/emails/${emailId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete email');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emails', selectedAccountId, selectedFolder] });
      queryClient.invalidateQueries({ queryKey: ['search'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Email moved to trash');
    },
    onError: () => toast.error('Failed to delete email'),
  });

  const handleContextAction = async (action: string) => {
    if (!contextMenu) return;
    const { email } = contextMenu;
    const accountId = selectedAccountId === 'all' ? email.accountId : selectedAccountId;

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
        deleteEmailMutation.mutate({ emailId: email.id, accountId });
        break;
      case 'reply':
      case 'replyAll':
      case 'forward':
        try {
          // Need full email body for quoting
          const res = await fetch(`/api/accounts/${accountId}/emails/${email.id}`);
          const fullEmail = res.ok ? await res.json() : email;
          
          let to = '';
          let cc = '';
          let subject = fullEmail.subject || '';
          let bodyHtml = `<br><br><blockquote style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex">${fullEmail.body?.bodyHtml || fullEmail.snippet || ''}</blockquote>`;

          if (action === 'reply' || action === 'replyAll') {
            to = fullEmail.replyTo || fullEmail.fromAddress || '';
            subject = subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`;
            if (action === 'replyAll') {
              // Combine from and to minus our own address, but here we just simplify
              const allTos = Array.isArray(fullEmail.toAddresses) ? fullEmail.toAddresses.map((a: any) => a.address).join(', ') : '';
              const allCcs = Array.isArray(fullEmail.ccAddresses) ? fullEmail.ccAddresses.map((a: any) => a.address).join(', ') : '';
              cc = allTos + (allCcs ? `, ${allCcs}` : '');
            }
          } else if (action === 'forward') {
            to = '';
            subject = subject.toLowerCase().startsWith('fwd:') ? subject : `Fwd: ${subject}`;
            bodyHtml = `<br><br>-------- Forwarded Message --------<br>Subject: ${fullEmail.subject}<br>Date: ${new Date(fullEmail.receivedAt).toString()}<br>From: ${fullEmail.fromName} &lt;${fullEmail.fromAddress}&gt;<br><br>${fullEmail.body?.bodyHtml || fullEmail.snippet || ''}`;
          }

          setComposeDraft({
            id: undefined, // New draft
            to,
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

  const handleEmailClick = (email: any) => {
    if (email.isDraft) {
      setComposeDraft({
        id: email.id,
        to: email.toAddresses?.[0]?.address || '',
        subject: email.subject || '',
        bodyHtml: email.body?.bodyHtml || email.snippet || '',
      });
      setComposeModalOpen(true);
      return;
    }
    if (!email.isRead) {
      queryClient.setQueryData(
        ['emails', selectedAccountId, selectedFolder],
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
    }

    onSelectEmail(email.id);
  };

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
    queryKey: ['emails', selectedAccountId, selectedFolder],
    queryFn: async ({ pageParam = 1 }) => {
      let url = `/api/accounts/${selectedAccountId}/emails`;
        
      url += `?folder=${selectedFolder}&page=${pageParam}&limit=20`;
        
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
  const emailsToDisplay = searchQuery ? searchResults : flatEmails;
  const loading = isLoading || isSearchLoading;

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
          {activeAccount ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                <div 
                  className="w-3 h-3 rounded-full flex-shrink-0" 
                  style={{ backgroundColor: activeAccount.color || '#3B82F6' }}
                />
                <span className="truncate">{activeAccount.label || activeAccount.emailAddress}</span>
              </h2>
              {activeAccount.label && (
                <p className="text-xs text-gray-500 truncate mt-0.5 ml-5">{activeAccount.emailAddress}</p>
              )}
              <AccountLabelList
                accountId={activeAccount.id}
              />
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
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 focus:bg-white transition-all"
          />
        </div>
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
          <LabelAssignmentPicker
            emailIds={selectedEmailIds}
            labelCounts={selectionLabelCounts}
            align="right"
            showButtonText
            buttonClassName="flex items-center px-3 py-1.5 bg-accent-600 hover:bg-accent-700 text-white rounded-md text-sm font-medium shadow-sm transition-colors"
          />
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
            className="fixed z-50 bg-white rounded-md shadow-lg border border-gray-200 py-1 w-48 text-sm text-gray-700"
            style={{ 
              top: `${Math.min(contextMenu.y, window.innerHeight - 200)}px`, 
              left: `${Math.min(contextMenu.x, window.innerWidth - 200)}px` 
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
            <button 
              className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center space-x-2 text-red-600"
              onClick={() => handleContextAction('delete')}
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete</span>
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
