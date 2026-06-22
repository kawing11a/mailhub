'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { Users, Shield, CreditCard } from 'lucide-react';

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const navItems = [
    { name: 'Members', href: '/settings/members', icon: Users },
    { name: 'Security', href: '/settings/security', icon: Shield },
    { name: 'Billing', href: '/settings/billing', icon: CreditCard },
  ];

  return (
    <div className="flex flex-1 h-full bg-gray-50 overflow-hidden">
      <div className="w-64 border-r border-gray-200 bg-white h-full flex flex-col p-4">
        <h2 className="text-lg font-bold text-gray-900 mb-4 px-2">Settings</h2>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={clsx(
                  'flex items-center space-x-3 px-3 py-2 rounded-md transition-colors text-sm font-medium',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-100'
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
