'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AccountsSection } from './AccountsSection';
import { PenSquare, Settings, Search, LayoutDashboard, Inbox } from 'lucide-react';
import { useAccountStore } from '@/stores/accountStore';
import { useUIStore } from '@/stores/uiStore';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';

import { InstallPWAButton } from '@/components/pwa/InstallPWAButton';

export function Sidebar() {
  const { setComposeModalOpen } = useAccountStore();
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

  return (
    <div className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col h-full overflow-hidden">
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
      </div>

      <div className="flex-none p-3 border-t border-gray-200 space-y-2">
        <InstallPWAButton variant="sidebar" />
        <div className="flex items-center justify-end space-x-1">
          <button
            onClick={() => useUIStore.getState().setSearchOpen(true)}
            className="p-2 text-gray-500 hover:text-accent-600 hover:bg-gray-100 rounded-md transition-colors"
            title="Search (⌘K)"
          >
            <Search className="w-4 h-4" />
          </button>
          <Link 
            href="/overview" 
            className="p-2 text-gray-500 hover:text-accent-600 hover:bg-gray-100 rounded-md transition-colors"
            title="Dashboard Overview"
          >
            <LayoutDashboard className="w-4 h-4" />
          </Link>
          <Link 
            href="/settings/members"
            className="p-2 text-gray-500 hover:text-accent-600 hover:bg-gray-100 rounded-md transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
