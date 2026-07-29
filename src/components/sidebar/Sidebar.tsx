'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { AccountsSection } from './AccountsSection';
import { FolderSection } from './FolderSection';
import { PenSquare, Settings, LogOut, Search, LayoutDashboard, Inbox } from 'lucide-react';
import { useAccountStore } from '@/stores/accountStore';
import { useUIStore } from '@/stores/uiStore';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';

export function Sidebar() {
  const { setComposeModalOpen } = useAccountStore();
  const router = useRouter();
  const pathname = usePathname();

  const { data: newEmails } = useQuery({
    queryKey: ['new-emails-count'],
    queryFn: async () => {
      const res = await fetch('/api/emails/new');
      if (!res.ok) return { emails: [] };
      return res.json();
    },
    refetchInterval: 30000 // Poll every 30s
  });

  const newEmailsCount = newEmails?.emails?.length || 0;

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col h-full overflow-hidden">
      <div className="flex flex-none items-center justify-between border-b border-gray-200 p-4">
        <Link href="/inbox" className="hover:opacity-80 transition-opacity flex items-center">
          <img src="/logo-transparent.png" alt="MailHub Logo" className="h-12 w-auto object-contain" />
        </Link>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => useUIStore.getState().setSearchOpen(true)}
            className="p-1.5 text-gray-500 hover:text-accent-600 hover:bg-accent-50 rounded-md transition-colors"
            title="Search (⌘K)"
          >
            <Search className="w-5 h-5" />
          </button>
          <Link 
            href="/overview" 
            className="p-1.5 text-gray-500 hover:text-accent-600 hover:bg-accent-50 rounded-md transition-colors"
            title="Dashboard Overview"
          >
            <LayoutDashboard className="w-5 h-5" />
          </Link>
        </div>
      </div>

      <div className="flex-none p-4 pb-2">
        <button
          onClick={() => setComposeModalOpen(true)}
          className="w-full flex items-center justify-center space-x-2 bg-accent-600 hover:bg-accent-700 text-white px-4 py-2 rounded-md font-medium transition-colors shadow-sm mb-4"
        >
          <PenSquare className="w-4 h-4" />
          <span>Compose</span>
        </button>

        <Link
          href="/new-emails"
          onClick={() => useAccountStore.getState().setSelectedAccountId('new-emails')}
          className={clsx(
            "w-full flex items-center justify-between px-3 py-2 rounded-md font-medium transition-colors text-sm",
            pathname === '/new-emails'
              ? 'bg-accent-100 text-accent-900'
              : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
          )}
        >
          <div className="flex items-center space-x-2">
            <Inbox className="w-4 h-4" />
            <span>New Emails</span>
          </div>
          {newEmailsCount > 0 && (
            <span className="bg-accent-600 text-white text-xs px-2 py-0.5 rounded-full font-bold">
              {newEmailsCount}
            </span>
          )}
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AccountsSection />
        <FolderSection />
      </div>

      <div className="flex-none p-4 border-t border-gray-200 space-y-1">
        <Link 
          href="/settings/members"
          className="flex items-center space-x-3 w-full px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </Link>
        <button 
          onClick={handleLogout}
          className="flex items-center space-x-3 w-full px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
