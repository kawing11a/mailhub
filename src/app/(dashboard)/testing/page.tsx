'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Bell, Loader2, Mail, Server } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

type Account = {
  id: string;
  emailAddress: string;
  provider: string;
  label: string;
};

export default function TestingSuitePage() {
  const [activeTab, setActiveTab] = useState<'sync' | 'notification'>('sync');

  // Sync test state
  const [selectedAccount, setSelectedAccount] = useState('');
  const [syncResult, setSyncResult] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');

  // Notification test state
  const [isSendingPush, setIsSendingPush] = useState(false);
  const [pushResult, setPushResult] = useState<string | null>(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts');
      if (!res.ok) throw new Error('Failed to load accounts');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const handleTestSync = async () => {
    if (!selectedAccount) return;
    setIsSyncing(true);
    setSyncError('');
    setSyncResult(null);

    try {
      const res = await fetch('/api/test-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: selectedAccount })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to test connection');
      setSyncResult(data);
      toast.success('Connection test successful!');
    } catch (err: any) {
      setSyncError(err.message);
      toast.error('Connection test failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTestPush = async () => {
    setIsSendingPush(true);
    setPushResult(null);

    try {
      const res = await fetch('/api/notifications/test', {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send push notification');
      }

      setPushResult(data.message);
      toast.success('Test notification triggered!');
    } catch (error: any) {
      console.error(error);
      setPushResult(error.message);
      toast.error(error.message);
    } finally {
      setIsSendingPush(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50/50 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Testing Suite</h1>
        <p className="text-gray-500 mb-8">Run diagnostic tests for your email connections and background notifications.</p>
        
        {/* Tabs */}
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg mb-8">
          <button
            onClick={() => setActiveTab('sync')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'sync' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/50'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Connection & API Sync</span>
          </button>
          <button
            onClick={() => setActiveTab('notification')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2.5 px-4 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'notification' 
                ? 'bg-white text-gray-900 shadow-sm' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/50'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>Push Notifications</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8">
          
          {/* Sync Test Tab */}
          {activeTab === 'sync' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center space-x-3 mb-6">
                <div className="p-3 bg-accent-50 text-accent-600 rounded-lg">
                  <Server className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Connection Tester</h2>
                  <p className="text-sm text-gray-500">
                    Verify IMAP and Gmail API connectivity and fetch a sample email.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Account</label>
                <select 
                  className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-900 focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none"
                  value={selectedAccount} 
                  onChange={e => setSelectedAccount(e.target.value)}
                >
                  <option value="">-- Choose an account --</option>
                  {accounts.map((acc: Account) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.emailAddress} ({acc.provider}) - {acc.label}
                    </option>
                  ))}
                </select>
              </div>

              <button 
                onClick={handleTestSync}
                disabled={!selectedAccount || isSyncing}
                className="w-full sm:w-auto px-6 py-3 bg-accent-600 hover:bg-accent-700 text-white font-medium rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center space-x-2"
              >
                {isSyncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />}
                <span>{isSyncing ? 'Testing Connection...' : 'Test Connection'}</span>
              </button>

              {syncError && (
                <div className="mt-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
                  <h3 className="font-semibold mb-1">Connection Failed</h3>
                  <p className="text-sm">{syncError}</p>
                </div>
              )}

              {syncResult && (
                <div className="mt-6 p-6 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg overflow-auto">
                  <h3 className="font-semibold text-lg mb-4">Connection Successful</h3>
                  <pre className="text-sm bg-white p-4 rounded-md border border-emerald-100 whitespace-pre-wrap font-mono shadow-sm">
                    {JSON.stringify(syncResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Notification Test Tab */}
          {activeTab === 'notification' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center space-x-3 mb-6">
                <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
                  <Bell className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Push Notification Tester</h2>
                  <p className="text-sm text-gray-500">
                    Verify that background Web Push notifications are reaching your devices.
                  </p>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-100 rounded-lg p-5 text-sm text-gray-600">
                <p className="mb-3 font-medium text-gray-800">How to test background push:</p>
                <ol className="list-decimal pl-5 space-y-2">
                  <li>Click the button below to dispatch the payload to the server.</li>
                  <li><strong>Quickly switch to a different browser tab or minimize the browser.</strong></li>
                  <li>Wait a few seconds for the native OS notification to arrive.</li>
                  <li>Clicking the native notification should automatically focus MailHub.</li>
                </ol>
              </div>

              <button
                onClick={handleTestPush}
                disabled={isSendingPush}
                className="w-full flex items-center justify-center space-x-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white py-3 px-6 rounded-lg font-medium transition-colors"
              >
                {isSendingPush ? <Loader2 className="w-5 h-5 animate-spin" /> : <Bell className="w-5 h-5" />}
                <span>{isSendingPush ? 'Sending to server...' : 'Trigger Push Notification'}</span>
              </button>

              {pushResult && (
                <div className={`mt-6 p-4 rounded-lg text-sm border ${
                  pushResult.includes('Failed') || pushResult.includes('No active') 
                    ? 'bg-red-50 border-red-200 text-red-700' 
                    : 'bg-green-50 border-green-200 text-green-700'
                }`}>
                  <span className="font-medium">Server Response:</span> {pushResult}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
