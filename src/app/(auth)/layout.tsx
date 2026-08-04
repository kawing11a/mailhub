import { Mail } from 'lucide-react';
import React from 'react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mail-surface flex h-screen w-full text-gray-900 font-sans selection:bg-accent-200">
      {/* Left pane: Branding & Visuals (hidden on small screens) */}
      <div className="correspondence-panel hidden lg:flex w-1/2 flex-col justify-between relative overflow-hidden">
        {/* Subtle background gradient / glow */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
          <div className="absolute -top-[20%] -left-[10%] w-[70%] h-[70%] rounded-full border border-white/5" />
          <div className="absolute bottom-[10%] -right-[10%] w-[60%] h-[60%] rounded-full border border-accent-400/10" />
        </div>
        
        {/* Content */}
        <div className="p-12 z-10 flex flex-col h-full justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="MailHub Logo" className="h-10 w-auto rounded-lg shadow-sm bg-white" />
            <span className="text-white font-bold text-2xl tracking-tight">MailHub</span>
          </div>
          
          <div className="mb-16 max-w-lg">
            <h1 className="correspondence-title text-4xl md:text-5xl text-white leading-tight mb-6">
              Manage all your inboxes from one unified command center.
            </h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              Connect Google, Microsoft, and IMAP accounts. Search across everything in milliseconds. Respond faster with unified threading.
            </p>
          </div>
        </div>
      </div>
      
      {/* Right pane: Auth forms */}
      <div className="mail-surface w-full lg:w-1/2 flex flex-col justify-center p-6 sm:p-12 lg:p-24 relative">
        <div className="w-full max-w-[400px] mx-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
