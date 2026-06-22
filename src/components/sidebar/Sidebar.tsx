'use client';

import { AccountList } from './AccountList';
import { LabelSection } from './LabelSection';
import { PenSquare, Settings, LogOut, Search } from 'lucide-react';
import { useAccountStore } from '@/stores/accountStore';
import { useUIStore } from '@/stores/uiStore';

export function Sidebar() {
  const { setComposeModalOpen } = useAccountStore();

  return (
    <div className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">MailHub</h1>
      </div>

      <div className="p-4 space-y-2">
        <button
          onClick={() => setComposeModalOpen(true)}
          className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors shadow-sm"
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

      <div className="flex-1 overflow-y-auto">
        <AccountList />
        <LabelSection />
      </div>

      <div className="p-4 border-t border-gray-200 space-y-1">
        <button className="flex items-center space-x-3 w-full px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100 transition-colors">
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </button>
        <button className="flex items-center space-x-3 w-full px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100 transition-colors">
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
