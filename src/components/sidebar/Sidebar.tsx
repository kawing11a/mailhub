'use client';

import { AccountList } from './AccountList';
import { PenSquare, Settings, LogOut } from 'lucide-react';
import { useAccountStore } from '@/stores/accountStore';

export function Sidebar() {
  const { setComposeModalOpen } = useAccountStore();

  return (
    <div className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">MailHub</h1>
      </div>

      <div className="p-4">
        <button
          onClick={() => setComposeModalOpen(true)}
          className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors shadow-sm"
        >
          <PenSquare className="w-4 h-4" />
          <span>Compose</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <AccountList />
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
