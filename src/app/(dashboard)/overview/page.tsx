'use client';

import { useQuery } from '@tanstack/react-query';
import { Mail, Inbox, Send, Activity, LayoutDashboard, Settings, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function OverviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard');
      if (!res.ok) throw new Error('Failed to fetch dashboard data');
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent-500" />
      </div>
    );
  }

  if (!data) return null;

  const { stats, recentActivity, accounts } = data;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50/50 p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center space-x-2">
            <LayoutDashboard className="w-6 h-6 text-accent-500" />
            <span>Dashboard Overview</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Welcome back! Here's a summary of your email activity.
          </p>
        </div>

        {/* Top Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            title="Total Accounts" 
            value={stats.totalAccounts} 
            icon={<Settings className="w-5 h-5 text-purple-500" />} 
          />
          <StatCard 
            title="Total Emails" 
            value={stats.totalEmails} 
            icon={<Mail className="w-5 h-5 text-accent-500" />} 
          />
          <StatCard 
            title="Unread Inbox" 
            value={stats.unreadEmails} 
            icon={<Inbox className="w-5 h-5 text-red-500" />} 
            highlight={stats.unreadEmails > 0}
          />
          <StatCard 
            title="Sent Emails" 
            value={stats.sentEmails} 
            icon={<Send className="w-5 h-5 text-green-500" />} 
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Connected Accounts */}
          <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="font-semibold text-gray-900">Connected Accounts</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {accounts.length === 0 ? (
                <div className="p-4 text-sm text-gray-500 text-center">No accounts connected yet.</div>
              ) : (
                accounts.map((account: any) => (
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
            <div className="divide-y divide-gray-100">
              {recentActivity.length === 0 ? (
                <div className="p-8 text-sm text-gray-500 text-center">No recent activity found.</div>
              ) : (
                recentActivity.map((activity: any) => (
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

function StatCard({ title, value, icon, highlight = false }: { title: string; value: number; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex items-center space-x-4">
      <div className="p-3 bg-gray-50 rounded-lg">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className={`text-2xl font-bold tracking-tight ${highlight ? 'text-red-600' : 'text-gray-900'}`}>
          {value.toLocaleString()}
        </p>
      </div>
    </div>
  );
}
