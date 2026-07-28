'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Mail, RefreshCw, Trash2, Settings, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { AddAccountModal } from '@/components/settings/AddAccountModal';
import { EditAccountModal } from '@/components/settings/EditAccountModal';
import { useSearchParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

import { Suspense } from 'react';

function EmailAccountsContent() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<string>('');
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const error = searchParams.get('error');
    const success = searchParams.get('success');

    if (error) {
      toast.error(`OAuth Error: ${error.replace(/_/g, ' ')}`);
      router.replace('/settings/accounts');
    } else if (success) {
      toast.success('Account successfully connected!');
      router.replace('/settings/accounts');
    }
  }, [searchParams, router]);

  const { data, isLoading: isLoadingAccounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts');
      if (!res.ok) throw new Error('Failed to fetch accounts');
      return res.json();
    },
  });

  const { data: authData, isLoading: isLoadingAuth } = useQuery({
    queryKey: ['auth-me'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me');
      if (!res.ok) throw new Error('Failed to fetch auth info');
      return res.json();
    },
  });

  const isLoading = isLoadingAccounts || isLoadingAuth;

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete account');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  const accounts = Array.isArray(data) ? data : [];

  const groupedAccounts = accounts.reduce((acc: Record<string, any[]>, account: any) => {
    let provider = account.provider || 'Other';
    if (provider.toLowerCase() === 'google') provider = 'Google / Gmail';
    else if (provider.toLowerCase() === 'microsoft') provider = 'Microsoft / Outlook';
    else if (provider.toLowerCase() === 'imap') provider = 'Custom IMAP/SMTP';
    
    if (!acc[provider]) {
      acc[provider] = [];
    }
    acc[provider].push(account);
    return acc;
  }, {});

  const providers = Object.keys(groupedAccounts);
  const currentTab = activeTab && providers.includes(activeTab) ? activeTab : (providers[0] || '');
  const providerAccounts = groupedAccounts[currentTab] || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Accounts</h1>
          <p className="text-sm text-gray-500 mt-1">
            Connect and manage email accounts for your organization.
          </p>
        </div>
        {authData?.role === 'admin' && (
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center space-x-2 bg-accent-600 hover:bg-accent-700 text-white px-4 py-2 rounded-md font-medium transition-colors shadow-sm text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Connect Account</span>
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Mail className="w-6 h-6 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900">No accounts connected</h3>
          <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">
            {authData?.role === 'admin' 
              ? 'Get started by connecting an IMAP email account to start receiving and sending emails.'
              : 'No email accounts have been assigned to you yet. Please contact your administrator.'}
          </p>
          {authData?.role === 'admin' && (
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="mt-6 inline-flex items-center space-x-2 bg-accent-600 hover:bg-accent-700 text-white px-4 py-2 rounded-md font-medium transition-colors shadow-sm text-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Connect Account</span>
            </button>
          )}
        </div>
      ) : (
        <div>
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8 overflow-x-auto">
              {providers.map((provider) => (
                <button
                  key={provider}
                  onClick={() => setActiveTab(provider)}
                  className={`
                    whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm capitalize transition-colors
                    ${currentTab === provider
                      ? 'border-accent-500 text-accent-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  {provider} <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{groupedAccounts[provider].length}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {providerAccounts.map((account: any) => (
              <div 
                key={account.id} 
                className={`bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex flex-col transition-all duration-200 ${authData?.role === 'admin' ? 'hover:border-accent-300 hover:shadow-md cursor-pointer' : ''}`}
                onClick={() => {
                  if (authData?.role === 'admin') setEditingAccount(account);
                }}
              >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center space-x-3 overflow-hidden">
                        <div 
                          className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-white font-medium shadow-sm"
                          style={{ backgroundColor: account.color || '#3B82F6' }}
                        >
                          {account.avatarInitials || account.label.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-gray-900 truncate" title={account.label}>{account.label}</h3>
                          <p className="text-xs text-gray-500 truncate" title={account.emailAddress}>{account.emailAddress}</p>
                        </div>
                      </div>
                      
                      {authData?.role === 'admin' && (
                        <div className="flex items-center space-x-1 ml-2">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm('Are you sure you want to disconnect this account? All synchronized emails will be deleted from the system.')) {
                                deleteMutation.mutate(account.id);
                              }
                            }}
                            disabled={deleteMutation.isPending && deleteMutation.variables === account.id}
                            className="text-gray-400 hover:text-red-500 p-1.5 rounded-md hover:bg-red-50 transition-colors disabled:opacity-50 flex-shrink-0"
                            title="Disconnect"
                          >
                            {deleteMutation.isPending && deleteMutation.variables === account.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-auto pt-4 border-t border-gray-100 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className={`px-2.5 py-0.5 inline-flex text-[10px] uppercase leading-5 font-bold rounded-full ${account.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {account.isActive ? 'Active' : 'Inactive'}
                        </span>
                        {!account.isActive && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingAccount(account);
                            }}
                            className="text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-0.5 rounded-md transition-colors"
                          >
                            Reauthorize
                          </button>
                        )}
                        {account.authError && (
                          <span className="flex items-center text-red-600 text-xs font-medium" title={account.authError}>
                            <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                            Auth Error
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-1.5 text-xs text-gray-500" title="Last Synced">
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>{account.lastSyncedAt ? format(new Date(account.lastSyncedAt), 'MMM d, HH:mm') : 'Never'}</span>
                      </div>
                    </div>
                  </div>
            ))}
          </div>
        </div>
      )}

      <AddAccountModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
      />

      <EditAccountModal
        isOpen={!!editingAccount}
        account={editingAccount}
        onClose={() => setEditingAccount(null)}
      />
    </div>
  );
}

export default function EmailAccountsPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    }>
      <EmailAccountsContent />
    </Suspense>
  );
}
