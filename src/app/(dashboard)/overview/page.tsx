'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock3,
  Cpu,
  Globe2,
  HardDrive,
  Inbox,
  LayoutDashboard,
  Loader2,
  Mail,
  MemoryStick,
  RefreshCw,
  Send,
  Server,
  Settings,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

type DashboardScope = 'user' | 'system';
type QueueCounts = { active?: number; waiting?: number; failed?: number; delayed?: number; completed?: number };

interface DashboardAccount {
  id: string;
  label: string;
  color: string | null;
  isActive: boolean;
  lastSyncedAt: string | null;
  initialSyncCompletedAt: string | null;
  hasAuthError: boolean;
  unreadEmails: number;
}

interface SystemMetrics {
  cpuPercent: number | null;
  memory: { usedBytes: number; totalBytes: number; percent: number } | null;
  disk: { usedBytes: number; totalBytes: number; percent: number } | null;
  network: { receiveBytesPerSecond: number; sendBytesPerSecond: number } | null;
}

interface DashboardData {
  scope: DashboardScope;
  canViewSystem: boolean;
  refreshedAt: string;
  stats: {
    totalAccounts: number;
    activeAccounts: number;
    attentionAccounts: number;
    totalEmails: number;
    inboxEmails: number;
    unreadEmails: number;
    unreadShare: number;
    sentEmails: number;
    emailTrend: Array<{ day: string; received: number; sent: number }>;
  };
  accounts: DashboardAccount[];
  systemHealth: {
    sync: QueueCounts;
    search: QueueCounts;
    resources: SystemMetrics;
  } | null;
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
    refetchInterval: 10000,
  });

  if (isLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-accent-500" /></div>;
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-5 text-center text-sm text-red-700">{error.message}</div>
      </div>
    );
  }

  if (!data) return null;

  const isSystem = scope === 'system' && data.canViewSystem;
  const { stats } = data;
  const unreadPercent = Math.round(stats.unreadShare * 100);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/80 p-5 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
                <LayoutDashboard className="h-5 w-5" />
              </div>
              <h1 className="app-title text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
            </div>
            <p className="mt-2 text-sm text-slate-500">Account health and email activity at a glance.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className={`h-2 w-2 rounded-full ${isFetching ? 'animate-pulse bg-amber-400' : 'bg-emerald-500'}`} />
              {isFetching ? 'Updating' : `Updated ${formatClock(data.refreshedAt)}`}
            </div>
            {data.canViewSystem && (
              <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm" role="group" aria-label="Dashboard scope">
                <ScopeButton active={!isSystem} onClick={() => setScope('user')} icon={<UserRound className="h-4 w-4" />}>My Data</ScopeButton>
                <ScopeButton active={isSystem} onClick={() => setScope('system')} icon={<Globe2 className="h-4 w-4" />}>System</ScopeButton>
              </div>
            )}
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Email and account summary">
          <SummaryCard
            title="Connected accounts"
            value={stats.totalAccounts}
            note={`${stats.activeAccounts} active`}
            icon={<Settings className="h-5 w-5" />}
            color="indigo"
          />
          <SummaryCard
            title="Need attention"
            value={stats.attentionAccounts}
            note={stats.attentionAccounts ? 'Check sync or connection' : 'All accounts healthy'}
            icon={<AlertTriangle className="h-5 w-5" />}
            color={stats.attentionAccounts ? 'amber' : 'emerald'}
          />
          <SummaryCard
            title="Unread inbox"
            value={stats.unreadEmails}
            note={`${unreadPercent}% of inbox`}
            icon={<Inbox className="h-5 w-5" />}
            color="rose"
          />
          <SummaryCard
            title="Emails stored"
            value={stats.totalEmails}
            note={`${stats.sentEmails.toLocaleString()} sent`}
            icon={<Mail className="h-5 w-5" />}
            color="sky"
          />
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-5">
          <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm xl:col-span-3">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 md:px-6">
              <div>
                <h2 className="font-semibold text-slate-900">Email activity</h2>
                <p className="mt-1 text-xs text-slate-500">Received and sent each day · last 7 days</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                <LegendDot color="bg-indigo-500" label="Received" />
                <LegendDot color="bg-cyan-400" label="Sent" />
              </div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
              <div className="px-5 py-3 md:px-6">
                <div className="flex items-center gap-2 text-xs text-slate-500"><ArrowDown className="h-3.5 w-3.5 text-indigo-500" />Received this week</div>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{stats.emailTrend.reduce((sum, point) => sum + point.received, 0).toLocaleString()}</p>
              </div>
              <div className="px-5 py-3 md:px-6">
                <div className="flex items-center gap-2 text-xs text-slate-500"><ArrowUp className="h-3.5 w-3.5 text-cyan-500" />Sent this week</div>
                <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{stats.emailTrend.reduce((sum, point) => sum + point.sent, 0).toLocaleString()}</p>
              </div>
            </div>
            <EmailTrendChart points={stats.emailTrend} />
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm md:p-6 xl:col-span-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-500"><Inbox className="h-5 w-5" /></div>
              <div>
                <h2 className="font-semibold text-slate-900">Inbox overview</h2>
                <p className="mt-0.5 text-xs text-slate-500">Across your connected accounts</p>
              </div>
            </div>
            <div className="mt-6 flex items-end justify-between gap-4">
              <div>
                <div className="text-3xl font-semibold tracking-tight tabular-nums text-slate-900">{stats.unreadEmails.toLocaleString()}</div>
                <div className="mt-1 text-sm text-slate-500">unread of {stats.inboxEmails.toLocaleString()} inbox emails</div>
              </div>
              <div className="pb-1 text-right">
                <div className="text-2xl font-semibold tabular-nums text-rose-500">{unreadPercent}%</div>
                <div className="text-xs text-slate-400">unread</div>
              </div>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Unread share" aria-valuemin={0} aria-valuemax={100} aria-valuenow={unreadPercent}>
              <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-orange-400 transition-all" style={{ width: `${unreadPercent}%` }} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <MiniStat icon={<Mail className="h-4 w-4" />} label="Inbox" value={stats.inboxEmails} />
              <MiniStat icon={<Send className="h-4 w-4" />} label="Sent" value={stats.sentEmails} />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 md:px-6">
            <div>
              <h2 className="font-semibold text-slate-900">Account health</h2>
              <p className="mt-1 text-xs text-slate-500">Sync state and unread load by account</p>
            </div>
            <Link href="/settings/accounts" className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-indigo-600 transition hover:bg-indigo-50">
              <Settings className="h-4 w-4" />Manage accounts
            </Link>
          </div>
          {data.accounts.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Mail className="h-5 w-5" /></div>
              <p className="mt-3 text-sm font-medium text-slate-700">No accounts connected</p>
              <p className="mt-1 text-xs text-slate-500">Add an account to start seeing sync and email analysis.</p>
            </div>
          ) : (
            <div className="max-h-[440px] overflow-auto">
              <div className="grid grid-cols-[minmax(150px,1.5fr)_minmax(140px,1fr)_minmax(90px,.7fr)_minmax(100px,.8fr)] gap-4 bg-slate-50/80 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-400 md:px-6">
                <span>Account</span><span>Sync status</span><span className="text-right">Unread</span><span className="text-right">Last sync</span>
              </div>
              {data.accounts.map((account) => <AccountRow key={account.id} account={account} />)}
            </div>
          )}
        </section>

        {isSystem && data.systemHealth && (
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600"><Server className="h-5 w-5" /></div>
              <div>
                <h2 className="font-semibold text-slate-900">System health</h2>
                <p className="mt-0.5 text-xs text-slate-500">Web runtime resources and background queues</p>
              </div>
              <span className="ml-auto rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-600">Admin view</span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <ResourceCard title="CPU" icon={<Cpu className="h-4 w-4" />} percent={data.systemHealth.resources.cpuPercent} detail={data.systemHealth.resources.cpuPercent === null ? 'Unavailable' : 'Runtime usage'} />
              <ResourceCard title="Memory" icon={<MemoryStick className="h-4 w-4" />} percent={data.systemHealth.resources.memory?.percent ?? null} detail={data.systemHealth.resources.memory ? `${formatBytes(data.systemHealth.resources.memory.usedBytes)} / ${formatBytes(data.systemHealth.resources.memory.totalBytes)}` : 'Unavailable'} />
              <ResourceCard title="Storage disk" icon={<HardDrive className="h-4 w-4" />} percent={data.systemHealth.resources.disk?.percent ?? null} detail={data.systemHealth.resources.disk ? `${formatBytes(data.systemHealth.resources.disk.usedBytes)} / ${formatBytes(data.systemHealth.resources.disk.totalBytes)}` : 'Unavailable'} />
              <NetworkCard network={data.systemHealth.resources.network} />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <QueueCard title="Sync queue" counts={data.systemHealth.sync} />
              <QueueCard title="Search queue" counts={data.systemHealth.search} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function ScopeButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${active ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}>
      {icon}{children}
    </button>
  );
}

function SummaryCard({ title, value, note, icon, color }: { title: string; value: number; note: string; icon: React.ReactNode; color: 'indigo' | 'amber' | 'emerald' | 'rose' | 'sky' }) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
    sky: 'bg-sky-50 text-sky-600',
  };
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-slate-900">{value.toLocaleString()}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors[color]}`}>{icon}</div>
      </div>
      <p className="mt-3 text-xs text-slate-400">{note}</p>
    </div>
  );
}

function EmailTrendChart({ points }: { points: DashboardData['stats']['emailTrend'] }) {
  const maxValue = Math.max(1, ...points.flatMap((point) => [point.received, point.sent]));
  return (
    <div className="px-4 pb-4 pt-5 md:px-6">
      <div className="flex h-44 items-end justify-between gap-2 sm:gap-4" role="img" aria-label="Daily received and sent email counts over the last seven days">
        {points.map((point) => (
          <div key={point.day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
            <div className="flex h-36 w-full items-end justify-center gap-1.5">
              <div title={`${point.received} received`} className="min-h-1 w-3 rounded-t-md bg-indigo-500 transition-all sm:w-5" style={{ height: `${Math.max(3, (point.received / maxValue) * 100)}%` }} />
              <div title={`${point.sent} sent`} className="min-h-1 w-3 rounded-t-md bg-cyan-400 transition-all sm:w-5" style={{ height: `${Math.max(3, (point.sent / maxValue) * 100)}%` }} />
            </div>
            <span className="text-[10px] font-medium text-slate-400">{formatWeekday(point.day)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-sm ${color}`} />{label}</span>;
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-3">
      <span className="text-slate-400">{icon}</span>
      <span className="min-w-0 flex-1 text-xs text-slate-500">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-slate-800">{value.toLocaleString()}</span>
    </div>
  );
}

function AccountRow({ account }: { account: DashboardAccount }) {
  const state = account.hasAuthError
    ? { label: 'Connection issue', color: 'bg-rose-50 text-rose-700', icon: <AlertTriangle className="h-3.5 w-3.5" /> }
    : !account.isActive
      ? { label: 'Paused', color: 'bg-slate-100 text-slate-600', icon: <Clock3 className="h-3.5 w-3.5" /> }
      : account.lastSyncedAt
        ? { label: 'Connected', color: 'bg-emerald-50 text-emerald-700', icon: <CheckCircle2 className="h-3.5 w-3.5" /> }
        : { label: 'Waiting for sync', color: 'bg-amber-50 text-amber-700', icon: <RefreshCw className="h-3.5 w-3.5" /> };

  return (
    <div className="grid grid-cols-[minmax(150px,1.5fr)_minmax(140px,1fr)_minmax(90px,.7fr)_minmax(100px,.8fr)] items-center gap-4 border-t border-slate-100 px-5 py-3.5 transition hover:bg-slate-50/70 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-slate-50" style={{ backgroundColor: account.color || '#6366f1' }} />
        <span className="truncate text-sm font-medium text-slate-800">{account.label}</span>
      </div>
      <div><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${state.color}`}>{state.icon}{state.label}</span></div>
      <div className="text-right text-sm font-medium tabular-nums text-slate-700">{account.unreadEmails.toLocaleString()}</div>
      <div className="text-right text-xs text-slate-500">{formatRelativeTime(account.lastSyncedAt)}</div>
    </div>
  );
}

function ResourceCard({ title, icon, percent, detail }: { title: string; icon: React.ReactNode; percent: number | null; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-600"><span className="text-violet-500">{icon}</span>{title}<span className="ml-auto text-xs font-semibold tabular-nums text-slate-800">{percent === null ? 'Unavailable' : `${Math.round(percent)}%`}</span></div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${percent !== null && percent >= 85 ? 'bg-rose-500' : 'bg-violet-500'}`} style={{ width: `${percent ?? 0}%` }} /></div>
      <p className="mt-2 truncate text-xs text-slate-400">{detail}</p>
    </div>
  );
}

function NetworkCard({ network }: { network: SystemMetrics['network'] }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-600"><Activity className="h-4 w-4 text-violet-500" />Network rate</div>
      {network ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 p-3"><div className="flex items-center gap-1 text-[11px] text-slate-400"><ArrowDown className="h-3 w-3" />Receive</div><div className="mt-1 text-base font-semibold tabular-nums text-slate-800">{formatRate(network.receiveBytesPerSecond)}</div></div>
          <div className="rounded-xl bg-slate-50 p-3"><div className="flex items-center gap-1 text-[11px] text-slate-400"><ArrowUp className="h-3 w-3" />Send</div><div className="mt-1 text-base font-semibold tabular-nums text-slate-800">{formatRate(network.sendBytesPerSecond)}</div></div>
        </div>
      ) : <div className="mt-6 text-sm text-slate-400">Unavailable</div>}
      <p className="mt-2 text-xs text-slate-400">Live runtime traffic</p>
    </div>
  );
}

function QueueCard({ title, counts }: { title: string; counts: QueueCounts }) {
  const items = [
    { label: 'Active', value: counts.active ?? 0, color: 'text-indigo-600' },
    { label: 'Waiting', value: counts.waiting ?? 0, color: 'text-slate-700' },
    { label: 'Delayed', value: counts.delayed ?? 0, color: 'text-amber-600' },
    { label: 'Failed', value: counts.failed ?? 0, color: counts.failed ? 'text-rose-600' : 'text-slate-700' },
  ];
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {items.map((item) => <div key={item.label} className="rounded-xl bg-slate-50 px-2 py-3 text-center"><div className="text-[10px] text-slate-400">{item.label}</div><div className={`mt-1 text-lg font-semibold tabular-nums ${item.color}`}>{item.value.toLocaleString()}</div></div>)}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unavailable';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) { value /= 1024; unitIndex += 1; }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatRate(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

function formatClock(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatWeekday(day: string): string {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' });
}

function formatRelativeTime(value: string | null): string {
  if (!value) return 'Never';
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (elapsedMinutes < 1) return 'Just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  return `${Math.floor(elapsedHours / 24)}d ago`;
}
