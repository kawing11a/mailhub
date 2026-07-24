'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { 
  Bell, 
  Loader2, 
  Mail, 
  Server, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp, 
  Zap, 
  AlertCircle,
  ShieldCheck
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

type Account = {
  id: string;
  emailAddress: string;
  provider: string;
  label: string;
};

type AccountTestState = {
  status: 'idle' | 'testing' | 'success' | 'error';
  result?: any;
  error?: string;
  testedAt?: Date;
};

export default function TestingSuitePage() {
  const [activeTab, setActiveTab] = useState<'sync' | 'notification'>('sync');

  // Sync test state per account
  const [testStates, setTestStates] = useState<Record<string, AccountTestState>>({});
  const [isBatchTesting, setIsBatchTesting] = useState(false);
  const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>({});

  // Notification test state
  const [isSendingPush, setIsSendingPush] = useState(false);
  const [pushResult, setPushResult] = useState<string | null>(null);

  const { data: accounts = [], isLoading: isLoadingAccounts } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts');
      if (!res.ok) throw new Error('Failed to load accounts');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const toggleExpand = (accountId: string) => {
    setExpandedAccounts(prev => ({
      ...prev,
      [accountId]: !prev[accountId]
    }));
  };

  const handleTestAccount = async (accountId: string): Promise<boolean> => {
    setTestStates(prev => ({
      ...prev,
      [accountId]: { status: 'testing' }
    }));

    try {
      const res = await fetch('/api/test-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to test connection');

      setTestStates(prev => ({
        ...prev,
        [accountId]: {
          status: 'success',
          result: data,
          testedAt: new Date()
        }
      }));
      return true;
    } catch (err: any) {
      setTestStates(prev => ({
        ...prev,
        [accountId]: {
          status: 'error',
          error: err.message || 'Connection test failed',
          testedAt: new Date()
        }
      }));
      // Auto-expand on error to show failure details
      setExpandedAccounts(prev => ({ ...prev, [accountId]: true }));
      return false;
    }
  };

  const handleBatchTestAll = async () => {
    if (accounts.length === 0 || isBatchTesting) return;
    setIsBatchTesting(true);

    let successCount = 0;
    let failCount = 0;

    for (const acc of accounts) {
      const ok = await handleTestAccount(acc.id);
      if (ok) successCount++;
      else failCount++;
    }

    setIsBatchTesting(false);
    if (failCount === 0) {
      toast.success(`Batch test complete: All ${accounts.length} account(s) connected!`);
    } else {
      toast.error(`Batch test complete: ${successCount} passed, ${failCount} failed.`);
    }
  };

  const handleClearResults = () => {
    setTestStates({});
    setExpandedAccounts({});
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

  // Metrics for Connection Tester
  const testedCount = Object.values(testStates).filter(s => s.status === 'success' || s.status === 'error').length;
  const successCount = Object.values(testStates).filter(s => s.status === 'success').length;
  const errorCount = Object.values(testStates).filter(s => s.status === 'error').length;
  const testingCount = Object.values(testStates).filter(s => s.status === 'testing').length;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50/50 p-8">
      <div className="max-w-4xl mx-auto">
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-6">
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-accent-50 text-accent-600 rounded-lg">
                    <Server className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Connection Tester</h2>
                    <p className="text-sm text-gray-500">
                      Verify IMAP and Gmail API connectivity across all your email accounts.
                    </p>
                  </div>
                </div>

                {/* Global Actions */}
                <div className="flex items-center space-x-3">
                  {testedCount > 0 && (
                    <button
                      onClick={handleClearResults}
                      disabled={isBatchTesting || testingCount > 0}
                      className="px-3.5 py-2.5 text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Clear Results</span>
                    </button>
                  )}
                  <button
                    onClick={handleBatchTestAll}
                    disabled={accounts.length === 0 || isBatchTesting || testingCount > 0}
                    className="px-5 py-2.5 bg-accent-600 hover:bg-accent-700 text-white text-sm font-semibold rounded-lg shadow-sm disabled:opacity-50 transition-colors flex items-center space-x-2"
                  >
                    {isBatchTesting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Testing All ({testedCount + 1}/{accounts.length})...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 fill-current" />
                        <span>Batch Test All Accounts ({accounts.length})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Progress Summary Bar */}
              {testedCount > 0 && (
                <div className="bg-gray-50 border border-gray-200/80 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3 text-xs font-medium">
                  <div className="flex items-center space-x-4">
                    <span className="text-gray-500">Tested: {testedCount} / {accounts.length}</span>
                    <span className="flex items-center text-emerald-700 bg-emerald-100/70 px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> {successCount} Passed
                    </span>
                    {errorCount > 0 && (
                      <span className="flex items-center text-rose-700 bg-rose-100/70 px-2.5 py-1 rounded-full">
                        <XCircle className="w-3.5 h-3.5 mr-1" /> {errorCount} Failed
                      </span>
                    )}
                  </div>
                  {isBatchTesting && (
                    <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden mt-1 sm:mt-0 sm:w-48">
                      <div 
                        className="bg-accent-600 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${(testedCount / accounts.length) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Accounts List */}
              {isLoadingAccounts ? (
                <div className="py-12 flex flex-col items-center justify-center text-gray-400 space-y-2">
                  <Loader2 className="w-8 h-8 animate-spin text-accent-600" />
                  <p className="text-sm">Loading connected accounts...</p>
                </div>
              ) : accounts.length === 0 ? (
                <div className="py-12 text-center border-2 border-dashed border-gray-200 rounded-xl p-8">
                  <Mail className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <h3 className="text-base font-semibold text-gray-800">No Email Accounts Configured</h3>
                  <p className="text-sm text-gray-500 max-w-md mx-auto mt-1">
                    Add an email account in Settings to test IMAP or Gmail API connections.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {accounts.map((acc: Account) => {
                    const state = testStates[acc.id] || { status: 'idle' };
                    const isExpanded = !!expandedAccounts[acc.id];

                    return (
                      <div 
                        key={acc.id}
                        className={`border rounded-xl transition-all ${
                          state.status === 'error'
                            ? 'border-rose-200 bg-rose-50/30'
                            : state.status === 'success'
                            ? 'border-emerald-200 bg-emerald-50/20'
                            : state.status === 'testing'
                            ? 'border-accent-200 bg-accent-50/10'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        {/* Account Row Header */}
                        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center space-x-3.5 min-w-0">
                            <div className={`p-2.5 rounded-lg flex-shrink-0 ${
                              acc.provider.toUpperCase() === 'GMAIL' 
                                ? 'bg-red-50 text-red-600 border border-red-100' 
                                : 'bg-blue-50 text-blue-600 border border-blue-100'
                            }`}>
                              <Mail className="w-5 h-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                <span className="font-semibold text-gray-900 truncate text-base">
                                  {acc.emailAddress}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-md font-medium bg-gray-100 text-gray-600 border border-gray-200/60 uppercase tracking-wider">
                                  {acc.provider}
                                </span>
                                {acc.label && (
                                  <span className="text-xs px-2 py-0.5 rounded-md font-medium bg-accent-50 text-accent-700 border border-accent-100">
                                    {acc.label}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">Account ID: {acc.id}</p>
                            </div>
                          </div>

                          {/* Status Badge & Actions */}
                          <div className="flex items-center space-x-3 justify-end flex-shrink-0">
                            {/* Status Indicator */}
                            {state.status === 'idle' && (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                                Untested
                              </span>
                            )}
                            {state.status === 'testing' && (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-accent-100 text-accent-800 border border-accent-200 animate-pulse">
                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin text-accent-600" />
                                Testing...
                              </span>
                            )}
                            {state.status === 'success' && (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                                Connected
                              </span>
                            )}
                            {state.status === 'error' && (
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-800 border border-rose-200">
                                <XCircle className="w-3.5 h-3.5 mr-1.5 text-rose-600" />
                                Failed
                              </span>
                            )}

                            {/* Individual Test Button */}
                            <button
                              onClick={() => handleTestAccount(acc.id)}
                              disabled={state.status === 'testing' || isBatchTesting}
                              className="px-3.5 py-1.5 text-xs font-medium text-accent-700 hover:text-accent-800 bg-accent-50 hover:bg-accent-100 border border-accent-200 rounded-lg transition-colors disabled:opacity-50 flex items-center space-x-1.5"
                            >
                              {state.status === 'testing' ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3.5 h-3.5" />
                              )}
                              <span>Test</span>
                            </button>

                            {/* Expand Result Toggle */}
                            {(state.result || state.error) && (
                              <button
                                onClick={() => toggleExpand(acc.id)}
                                className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                                title={isExpanded ? 'Hide details' : 'Show details'}
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Expandable Details Container */}
                        {isExpanded && (state.result || state.error) && (
                          <div className="border-t border-gray-100 p-4 sm:p-5 bg-white/80 rounded-b-xl space-y-3 text-xs">
                            {state.status === 'error' && (
                              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-start space-x-2.5">
                                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                  <h4 className="font-semibold text-rose-900">Connection Failed</h4>
                                  <p className="font-mono text-rose-700 break-all">{state.error}</p>
                                </div>
                              </div>
                            )}

                            {state.status === 'success' && state.result && (
                              <div className="space-y-3">
                                <div className="flex items-center space-x-2 text-emerald-800 font-semibold text-sm">
                                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                                  <span>{state.result.message || 'Successfully connected.'}</span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200/80">
                                    <span className="text-gray-500 block mb-0.5">Provider</span>
                                    <span className="font-semibold text-gray-900">{state.result.provider}</span>
                                  </div>
                                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200/80">
                                    <span className="text-gray-500 block mb-0.5">
                                      {state.result.provider === 'GMAIL' ? 'Total Messages Estimate' : 'Mailbox Message Count'}
                                    </span>
                                    <span className="font-semibold text-gray-900">
                                      {state.result.totalMessagesInQuery ?? state.result.mailboxSize ?? 0}
                                    </span>
                                  </div>
                                </div>

                                {state.result.sampleEmail && (
                                  <div className="p-3.5 bg-gray-50 rounded-lg border border-gray-200/80 space-y-1.5">
                                    <span className="font-semibold text-gray-700 block">Sample Inbox Email:</span>
                                    <div className="text-gray-900 font-medium truncate">
                                      Subject: {state.result.sampleEmail.subject || 'No Subject'}
                                    </div>
                                    <div className="text-gray-600 truncate">
                                      From: {state.result.sampleEmail.from || 'Unknown'}
                                    </div>
                                    {state.result.sampleEmail.snippet && (
                                      <div className="text-gray-500 italic truncate font-mono text-[11px] mt-1">
                                        "{state.result.sampleEmail.snippet}"
                                      </div>
                                    )}
                                  </div>
                                )}

                                <details className="group">
                                  <summary className="cursor-pointer text-gray-500 hover:text-gray-800 font-medium select-none py-1">
                                    View Raw Response Payload
                                  </summary>
                                  <pre className="mt-2 p-3 bg-gray-900 text-gray-100 rounded-lg font-mono text-[11px] overflow-x-auto">
                                    {JSON.stringify(state.result, null, 2)}
                                  </pre>
                                </details>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
