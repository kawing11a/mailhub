'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Mail, RefreshCw, Trash2, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { AddAccountModal } from '@/components/settings/AddAccountModal';
import { EditAccountModal } from '@/components/settings/EditAccountModal';
import { useSearchParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

import { Suspense } from 'react';

function EmailAccountsContent() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any | null>(null);
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

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-12 text-center">
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
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Account Details
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Provider
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Last Synced
                </th>
                {authData?.role === 'admin' && (
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {accounts.map((account: any) => (
                <tr 
                  key={account.id} 
                  className={`transition-colors ${authData?.role === 'admin' ? 'hover:bg-gray-50 cursor-pointer' : ''}`}
                  onClick={() => {
                    if (authData?.role === 'admin') setEditingAccount(account);
                  }}
                >
                  <td className="px-[var(--spacing-density-col)] py-[var(--spacing-density-row)] whitespace-nowrap">
                    <div className="flex items-center">
                      <div 
                        className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-white font-medium shadow-sm"
                        style={{ backgroundColor: account.color || '#3B82F6' }}
                      >
                        {account.avatarInitials || account.label.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{account.label}</div>
                        <div className="text-sm text-gray-500">{account.emailAddress}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-[var(--spacing-density-col)] py-[var(--spacing-density-row)] whitespace-nowrap">
                    <span className="px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-accent-100 text-accent-800 uppercase">
                      {account.provider}
                    </span>
                  </td>
                  <td className="px-[var(--spacing-density-col)] py-[var(--spacing-density-row)] whitespace-nowrap">
                    <span className={`px-2.5 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${account.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {account.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-[var(--spacing-density-col)] py-[var(--spacing-density-row)] whitespace-nowrap text-sm text-gray-500">
                    {account.lastSyncedAt 
                      ? <div className="flex items-center space-x-1">
                          <RefreshCw className="w-3 h-3" />
                          <span>{format(new Date(account.lastSyncedAt), 'MMM d, HH:mm')}</span>
                        </div>
                      : 'Never'}
                  </td>
                  {authData?.role === 'admin' && (
                    <td className="px-[var(--spacing-density-col)] py-[var(--spacing-density-row)] whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-4">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingAccount(account);
                          }}
                          className="text-gray-500 hover:text-gray-700 transition-colors flex items-center space-x-1"
                        >
                          <Settings className="w-4 h-4" />
                          <span>Manage</span>
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Are you sure you want to disconnect this account? All synchronized emails will be deleted from the system.')) {
                              deleteMutation.mutate(account.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          className="text-red-500 hover:text-red-700 transition-colors disabled:opacity-50 flex items-center space-x-1"
                        >
                          {deleteMutation.isPending && deleteMutation.variables === account.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                          <span>Disconnect</span>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
