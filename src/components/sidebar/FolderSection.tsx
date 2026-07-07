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
      if (!selectedAccountId) return null;
      const res = await fetch(`/api/accounts/${selectedAccountId}/stats`);
      if (!res.ok) throw new Error('Failed to fetch stats');
      return res.json();
    },
    enabled: !!selectedAccountId,
  });

  const handleSelect = (id: string) => {
    setSelectedFolder(id);
    if (!pathname.startsWith('/inbox') && !pathname.startsWith('/labels')) {
      router.push('/inbox');
    }
  };

  return (
    <div className="flex flex-col space-y-1 p-2">
      <div className="pt-4 pb-1">
        <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Folders
        </p>
      </div>

      {FOLDERS.map((folder) => {
        const isActive = selectedFolder === folder.id;
        const Icon = folder.icon;

        return (
          <button
            key={folder.id}
            onClick={() => handleSelect(folder.id)}
            className={clsx(
              'flex items-center space-x-3 px-3 py-2 rounded-md transition-colors text-sm font-medium w-full',
              isActive
                ? 'bg-accent-50 text-accent-700'
                : 'text-gray-700 hover:bg-gray-100'
            )}
          >
            <Icon className="w-4 h-4" />
            <span>{folder.name}</span>
            {folder.id === 'INBOX' && stats?.unreadCount > 0 && (
              <span className={clsx(
                'ml-auto text-xs font-semibold px-2 py-0.5 rounded-full',
                isActive ? 'bg-accent-200 text-accent-800' : 'bg-gray-200 text-gray-700'
              )}>
                {stats.unreadCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
