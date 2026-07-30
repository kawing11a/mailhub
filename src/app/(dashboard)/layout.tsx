'use client';

import { Suspense, useEffect } from 'react';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { ComposeModal } from '@/components/email/ComposeModal';
import { useSSE } from '@/hooks/useSSE';

import { SearchModal } from '@/components/search/SearchModal';
import { AllAccountsModal } from '@/components/accounts/AllAccountsModal';
import { ShortcutProvider } from '@/components/providers/ShortcutProvider';
import { Menu } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { Toaster, useToasterStore, toast } from 'react-hot-toast';

import { ThemeProvider } from '@/components/providers/ThemeProvider';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Initialize SSE connection globally for the dashboard
  useSSE();
  const { setMobileSidebarOpen } = useUIStore();

  return (
    <ThemeProvider>
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
          <div className="ml-2 flex items-center">
            <img src="/logo-transparent.png" alt="MailHub Logo" className="h-10 w-auto object-contain -ml-2" />
          </div>
        </div>

        <div className="hidden md:flex h-full">
          <Suspense fallback={<div className="w-64 border-r border-gray-200 bg-gray-50 h-full" />}>
            <Sidebar />
          </Suspense>
        </div>

        {/* Mobile Sidebar overlay */}
        <MobileSidebarOverlay />

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden pt-14 md:pt-0">
          {children}
        </main>
        
        <ComposeModal />
        <SearchModal />
        <AllAccountsModal />
        <ToastLimit />
        <Toaster position="bottom-right" />
        </div>
      </ShortcutProvider>
    </ThemeProvider>
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

function ToastLimit() {
  const { toasts } = useToasterStore();

  useEffect(() => {
    toasts
      .filter((t) => t.visible)
      .filter((_, i) => i >= 3)
      .forEach((t) => toast.dismiss(t.id));
  }, [toasts]);

  return null;
}
