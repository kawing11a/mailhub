'use client';

import { useAccountStore } from '@/stores/accountStore';
import { Inbox, Send, FileEdit, Trash2, AlertOctagon } from 'lucide-react';
import clsx from 'clsx';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

const FOLDERS = [
  { id: 'INBOX', name: 'Inbox', icon: Inbox },
  { id: 'SENT', name: 'Sent', icon: Send },
  { id: 'DRAFTS', name: 'Drafts', icon: FileEdit },
  { id: 'SPAM', name: 'Spam', icon: AlertOctagon },
  { id: 'TRASH', name: 'Trash', icon: Trash2 },
];

export function FolderSection() {
  const { selectedFolder, setSelectedFolder, selectedAccountId } = useAccountStore();
  const pathname = usePathname();
  const router = useRouter();

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

  const handleSelect = (id: string) => {
    setSelectedFolder(id);
    if (!pathname.startsWith('/inbox') && !pathname.startsWith('/labels')) {
      router.push('/inbox');
    }
  };

  const renderFolder = (folder: (typeof FOLDERS)[number]) => {
    const isActive = selectedFolder === folder.id;
    const Icon = folder.icon;

    return (
      <button
        key={folder.id}
        onClick={() => handleSelect(folder.id)}
        className={clsx(
          'flex w-full flex-none items-center space-x-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-accent-600 text-white shadow-sm'
            : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
        )}
      >
        <Icon className="w-4 h-4" />
        <span>{folder.name}</span>
        {folder.id === 'INBOX' && stats?.unreadCount > 0 && (
          <span className={clsx(
            'ml-auto text-xs font-semibold px-2 py-0.5 rounded-full',
            isActive ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-900'
          )}>
            {stats.unreadCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-none flex-col p-2">
      <div className="space-y-1">
        <div className="pt-2 pb-1">
          <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Folders
          </p>
        </div>

        {FOLDERS.map(renderFolder)}
      </div>
    </div>
  );
}
