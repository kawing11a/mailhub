'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AccountList } from './AccountList';
import { FolderSection } from './FolderSection';
import { PenSquare, Settings, LogOut, Search, LayoutDashboard } from 'lucide-react';
import { useAccountStore } from '@/stores/accountStore';
import { useUIStore } from '@/stores/uiStore';

export function Sidebar() {
  const { setComposeModalOpen } = useAccountStore();
  const router = useRouter();

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
        <Link 
          href="/overview" 
          className="p-1.5 text-gray-500 hover:text-accent-600 hover:bg-accent-50 rounded-md transition-colors"
          title="Dashboard Overview"
        >
          <LayoutDashboard className="w-5 h-5" />
        </Link>
      </div>

      <div className="flex-none p-4 space-y-2">
        <button
          onClick={() => setComposeModalOpen(true)}
          className="w-full flex items-center justify-center space-x-2 bg-accent-600 hover:bg-accent-700 text-white px-4 py-2 rounded-md font-medium transition-colors shadow-sm"
        >
          <PenSquare className="w-4 h-4" />
          <span>Compose</span>
        </button>
        <button
          onClick={() => useUIStore.getState().setSearchOpen(true)}
          className="w-full flex items-center justify-between bg-white border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 px-3 py-2 rounded-md text-sm transition-colors shadow-sm group"
        >
          <div className="flex items-center space-x-2">
            <Search className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
            <span>Search emails...</span>
          </div>
          <kbd className="hidden sm:inline-block text-xs font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200">⌘K</kbd>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AccountList />
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
