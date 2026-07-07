import { Mail } from 'lucide-react';
import React from 'react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full bg-white text-gray-900 font-sans selection:bg-accent-200">
      {/* Left pane: Branding & Visuals (hidden on small screens) */}
      <div className="hidden lg:flex w-1/2 bg-gray-950 flex-col justify-between relative overflow-hidden">
        {/* Subtle background gradient / glow */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
          <div className="absolute -top-[20%] -left-[10%] w-[70%] h-[70%] rounded-full bg-accent-900/20 blur-[120px]" />
          <div className="absolute bottom-[10%] -right-[10%] w-[60%] h-[60%] rounded-full bg-indigo-900/20 blur-[100px]" />
        </div>
        
        {/* Content */}
        <div className="p-12 z-10 flex flex-col h-full justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="MailHub Logo" className="h-10 w-auto rounded-lg shadow-sm bg-white" />
            <span className="text-white font-bold text-2xl tracking-tight">MailHub</span>
          </div>
          
          <div className="mb-16 max-w-lg">
            <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight mb-6 tracking-tight">
              Manage all your inboxes from one unified command center.
            </h1>
            <p className="text-gray-400 text-lg leading-relaxed">
              Connect Google, Microsoft, and IMAP accounts. Search across everything in milliseconds. Respond faster with unified threading.
            </p>
          </div>
        </div>
      </div>
      
      {/* Right pane: Auth forms */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center p-6 sm:p-12 lg:p-24 bg-white relative">
        <div className="w-full max-w-[400px] mx-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
