'use client';

import { Sidebar } from '@/components/sidebar/Sidebar';
import { ComposeModal } from '@/components/email/ComposeModal';
import { useSSE } from '@/hooks/useSSE';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Initialize SSE connection globally for the dashboard
  useSSE();

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>
      <ComposeModal />
    </div>
  );
}
