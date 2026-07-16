'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Globe2,
  Inbox,
  LayoutDashboard,
  Loader2,
  Mail,
  Send,
  Settings,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type DashboardScope = 'user' | 'system';

interface DashboardAccount {
  id: string;
  label: string;
  emailAddress: string;
  color: string | null;
}

interface DashboardActivity {
  id: string;
  action: string;
  createdAt: string;
  metadata: { subject?: string } | null;
  user: { name: string } | null;
  account: { emailAddress: string } | null;
}

interface DashboardData {
  scope: DashboardScope;
  canViewSystem: boolean;
  stats: {
    totalAccounts: number;
    totalEmails: number;
    unreadEmails: number;
    sentEmails: number;
  };
  recentActivity: DashboardActivity[];
  accounts: DashboardAccount[];
}

export default function OverviewPage() {
  const [scope, setScope] = useState<DashboardScope>('user');

  const { data, isLoading, isFetching, error } = useQuery<DashboardData>({
    queryKey: ['dashboard-stats', scope],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard?scope=${scope}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Failed to fetch dashboard data');
      }
      return res.json();
    },
    placeholderData: (previousData) => previousData,
  });

  const changeScope = () => {
    setScope((current) => current === 'user' ? 'system' : 'user');
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-5 text-center text-sm text-red-700">
          {error.message}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { stats, recentActivity, accounts } = data;
  const isSystem = scope === 'system';

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50/50 p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center space-x-2">
              <LayoutDashboard className="w-6 h-6 text-accent-500" />
              <span>Dashboard Overview</span>
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-sm text-gray-500">
                {isSystem
                  ? 'A complete view of activity across the system.'
                  : "Here's a summary of the data available to your account."}
              </p>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold transition-colors duration-300 ${
                  isSystem
                    ? 'bg-violet-100 text-violet-700'
                    : 'bg-blue-100 text-blue-700'
                }`}
              >
                {isSystem ? <Globe2 className="h-3 w-3" /> : <UserRound className="h-3 w-3" />}
                {isSystem ? 'System status' : 'User status'}
              </span>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={isSystem}
            aria-label={`Switch to ${isSystem ? 'my data' : 'system data'}`}
            aria-busy={isFetching}
            onClick={changeScope}
            className={`dashboard-scope-switch group relative isolate flex h-16 w-full shrink-0 items-center overflow-hidden rounded-[22px] border p-1.5 transition-all duration-300 sm:w-[328px] ${
              isSystem
                ? 'border-violet-300/90 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50 shadow-[0_12px_34px_-16px_rgba(124,58,237,0.75)]'
                : 'border-blue-300/90 bg-gradient-to-br from-blue-50 via-white to-cyan-50 shadow-[0_12px_34px_-16px_rgba(37,99,235,0.75)]'
            }`}
          >
            <span
              aria-hidden="true"
              className={`dashboard-switch-active absolute inset-y-1.5 left-1.5 z-0 w-[calc(50%-6px)] overflow-hidden rounded-[16px] transition-all duration-500 ease-out ${
                isSystem
                  ? 'translate-x-full bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-500 shadow-lg shadow-violet-500/30'
                  : 'translate-x-0 bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 shadow-lg shadow-blue-500/30'
              }`}
            />
            <span
              className={`relative z-10 flex w-1/2 items-center justify-center gap-2.5 transition-colors duration-300 ${
                isSystem ? 'text-slate-600' : 'text-white'
              }`}
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-300 ${
                isSystem ? 'bg-white text-blue-600 shadow-sm' : 'bg-white/18 text-white ring-1 ring-white/20'
              }`}>
                <UserRound className="h-[18px] w-[18px] transition-transform duration-300 group-hover:scale-110" />
              </span>
              <span className="flex flex-col items-start leading-none">
                <span className="text-sm font-bold">My Data</span>
                <span className={`mt-1 text-[10px] font-semibold tracking-wide ${isSystem ? 'text-slate-400' : 'text-blue-100'}`}>
                  PERSONAL
                </span>
              </span>
            </span>
            <span
              className={`relative z-10 flex w-1/2 items-center justify-center gap-2.5 transition-colors duration-300 ${
                isSystem ? 'text-white' : 'text-slate-600'
              }`}
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-300 ${
                isSystem ? 'bg-white/18 text-white ring-1 ring-white/20' : 'bg-white text-violet-600 shadow-sm'
              }`}>
                <Globe2 className={`h-[18px] w-[18px] transition-transform duration-500 ${isSystem ? 'rotate-180' : ''}`} />
              </span>
              <span className="flex flex-col items-start leading-none">
                <span className="text-sm font-bold">System</span>
                <span className={`mt-1 text-[10px] font-semibold tracking-wide ${isSystem ? 'text-violet-100' : 'text-slate-400'}`}>
                  ALL DATA
                </span>
              </span>
            </span>
            <span
              aria-hidden="true"
              className={`absolute bottom-1.5 z-20 h-1.5 w-1.5 rounded-full ring-2 ring-white transition-all duration-500 ${
                isSystem
                  ? 'left-[calc(100%-14px)] bg-fuchsia-300 shadow-[0_0_8px_rgba(240,171,252,0.9)]'
                  : 'left-2.5 bg-cyan-200 shadow-[0_0_8px_rgba(165,243,252,0.9)]'
              }`}
            />
          </button>
        </div>

      {/* Top Stats Cards */}
        <div className={`relative grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 ${isFetching ? 'dashboard-data-refreshing' : ''}`}>
          <StatCard 
            title="Total Accounts" 
            value={stats.totalAccounts} 
            icon={<Settings className="w-5 h-5 text-purple-500" />} 
            scope={scope}
          />
          <StatCard 
            title="Total Emails" 
            value={stats.totalEmails} 
            icon={<Mail className="w-5 h-5 text-accent-500" />} 
            scope={scope}
          />
          <StatCard 
            title="Unread Inbox" 
            value={stats.unreadEmails} 
            icon={<Inbox className="w-5 h-5 text-red-500" />} 
            highlight={stats.unreadEmails > 0}
            scope={scope}
          />
          <StatCard 
            title="Sent Emails" 
            value={stats.sentEmails} 
            icon={<Send className="w-5 h-5 text-green-500" />} 
            scope={scope}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Connected Accounts */}
          <div className={`relative lg:col-span-1 bg-white rounded-xl shadow-sm border overflow-hidden transition-colors duration-300 ${
            isSystem ? 'border-violet-200' : 'border-blue-100'
          }`}>
            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-gray-900">Connected Accounts</h2>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  isSystem ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  <AnimatedCount value={accounts.length} />
                </span>
              </div>
            </div>
            <div
              key={`${scope}-${accounts.map((account) => account.id).join('-')}`}
              className="dashboard-panel-change divide-y divide-gray-100"
            >
              {accounts.length === 0 ? (
                <div className="p-4 text-sm text-gray-500 text-center">No accounts connected yet.</div>
              ) : (
                accounts.map((account) => (
                  <div key={account.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="flex items-center space-x-3 truncate">
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: account.color || '#3B82F6' }}
                      />
                      <div className="truncate">
                        <p className="text-sm font-medium text-gray-900 truncate">{account.label}</p>
                        <p className="text-xs text-gray-500 truncate">{account.emailAddress}</p>
                      </div>
                    </div>
                    <span className="text-xs font-medium px-2 py-1 bg-green-100 text-green-700 rounded-full">
                      Active
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="p-3 border-t border-gray-100 bg-gray-50">
              <Link 
                href="/settings/accounts" 
                className="text-sm text-accent-600 hover:text-accent-700 font-medium block text-center"
              >
                Manage Accounts
              </Link>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="font-semibold text-gray-900 flex items-center space-x-2">
                <Activity className="w-4 h-4 text-gray-400" />
                <span>Recent Activity</span>
              </h2>
            </div>
            <div key={`${scope}-${recentActivity.map((activity) => activity.id).join('-')}`} className="dashboard-panel-change divide-y divide-gray-100">
              {recentActivity.length === 0 ? (
                <div className="p-8 text-sm text-gray-500 text-center">No recent activity found.</div>
              ) : (
                recentActivity.map((activity) => (
                  <div key={activity.id} className="p-4 flex items-start space-x-4">
                    <div className="w-8 h-8 rounded bg-accent-50 text-accent-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                      {activity.action === 'EMAIL_SENT' ? <Send className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 font-medium">
                        {activity.action.replace('_', ' ')}
                      </p>
                      <p className="text-sm text-gray-500 mt-0.5 truncate">
                        {activity.user?.name} via {activity.account?.emailAddress || 'Unknown Account'}
                      </p>
                      {activity.metadata?.subject && (
                        <p className="text-xs text-gray-400 mt-1 italic">
                          "{activity.metadata.subject}"
                        </p>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 whitespace-nowrap">
                      {new Date(activity.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  highlight = false,
  scope,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  highlight?: boolean;
  scope: DashboardScope;
}) {
  const animatedValue = useAnimatedNumber(value);
  const isSystem = scope === 'system';

  return (
    <div className={`dashboard-stat-card bg-white p-5 rounded-xl shadow-sm border flex items-center space-x-4 transition-colors duration-300 ${
      isSystem ? 'border-violet-200' : 'border-blue-100'
    }`}>
      <div className={`p-3 rounded-lg transition-colors duration-300 ${isSystem ? 'bg-violet-50' : 'bg-gray-50'}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p
          aria-live="polite"
          className={`text-2xl font-bold tracking-tight ${highlight ? 'text-red-600' : 'text-gray-900'}`}
        >
          <span key={value} className="dashboard-value-change inline-block tabular-nums">
            {animatedValue.toLocaleString()}
          </span>
        </p>
      </div>
    </div>
  );
}

function useAnimatedNumber(value: number, duration = 650) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);

  useEffect(() => {
    const from = previousValue.current;
    previousValue.current = value;

    if (from === value) {
      setDisplayValue(value);
      return;
    }

    let animationFrame = 0;
    const startedAt = performance.now();

    const animate = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(from + (value - from) * easedProgress));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [duration, value]);

  return displayValue;
}

function AnimatedCount({ value }: { value: number }) {
  const animatedValue = useAnimatedNumber(value);

  return (
    <span key={value} className="dashboard-value-change inline-block min-w-[1ch] tabular-nums">
      {animatedValue.toLocaleString()}
    </span>
  );
}
