'use client';

import { Sidebar } from '@/components/sidebar/Sidebar';
import { ComposeModal } from '@/components/email/ComposeModal';
import { useSSE } from '@/hooks/useSSE';

import { SearchModal } from '@/components/search/SearchModal';
import { ShortcutProvider } from '@/components/providers/ShortcutProvider';
import { Menu } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Initialize SSE connection globally for the dashboard
  useSSE();
  const { setMobileSidebarOpen } = useUIStore();

  return (
    <ShortcutProvider>
      <div className="flex h-screen overflow-hidden bg-white">
        {/* Mobile header (only visible on small screens) */}
        <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-200 z-30 flex items-center px-4">
          <button 
            onClick={() => setMobileSidebarOpen(true)}
            className="p-2 -ml-2 text-gray-500 hover:text-gray-700"
          >
            <Menu className="h-6 w-6" />
          </button>
          <span className="ml-2 font-bold text-gray-900">MailHub</span>
        </div>

        <div className="hidden md:flex h-full">
          <Sidebar />
        </div>

        {/* Mobile Sidebar overlay */}
        <MobileSidebarOverlay />

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden pt-14 md:pt-0">
          {children}
        </main>
        
        <ComposeModal />
        <SearchModal />
      </div>
    </ShortcutProvider>
  );
}

function MobileSidebarOverlay() {
  const { isMobileSidebarOpen, setMobileSidebarOpen } = useUIStore();
  
  if (!isMobileSidebarOpen) return null;

  return (
    <div className="md:hidden fixed inset-0 z-40 flex">
      <div 
        className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm" 
        onClick={() => setMobileSidebarOpen(false)}
      />
      <div className="relative w-64 max-w-sm bg-white h-full shadow-xl">
        <Sidebar />
      </div>
    </div>
  );
}
