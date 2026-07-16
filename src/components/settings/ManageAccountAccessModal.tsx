'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, Check } from 'lucide-react';

interface ManageAccountAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: any; // The member object
}

export function ManageAccountAccessModal({ isOpen, onClose, member }: ManageAccountAccessModalProps) {
  const queryClient = useQueryClient();
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());

  // Fetch all accounts
  const { data: accountsData, isLoading: isLoadingAccounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts');
      if (!res.ok) throw new Error('Failed to fetch accounts');
      return res.json();
    },
    enabled: isOpen,
  });

  // Fetch member's current access
  const { data: accessData, isLoading: isLoadingAccess } = useQuery({
    queryKey: ['member-access', member?.userId],
    queryFn: async () => {
      const res = await fetch(`/api/org/members/${member?.userId}/accounts`);
      if (!res.ok) throw new Error('Failed to fetch access');
      return res.json();
    },
    enabled: isOpen && !!member?.userId,
  });

  useEffect(() => {
    if (accessData && Array.isArray(accessData)) {
      setSelectedAccounts(new Set(accessData));
    }
  }, [accessData]);

  const mutation = useMutation({
    mutationFn: async (accountIds: string[]) => {
      const res = await fetch(`/api/org/members/${member.userId}/accounts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update access');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member-access', member?.userId] });
      // Invalidate dashboard or emails if this user is updating their own access
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      onClose();
    },
  });

  const handleToggle = (accountId: string) => {
    const next = new Set(selectedAccounts);
    if (next.has(accountId)) {
      next.delete(accountId);
    } else {
      next.add(accountId);
    }
    setSelectedAccounts(next);
  };

  if (!isOpen || !member) return null;

  const accounts = Array.isArray(accountsData) ? accountsData : [];
  const isLoading = isLoadingAccounts || isLoadingAccess;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-0">
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
          onClick={onClose}
        />
        
        <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl">
          <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
            
            <div className="flex items-center justify-between mb-6 border-b border-gray-100 pb-4">
              <h3 className="text-lg font-semibold leading-6 text-gray-900">
                Manage Access: {member.name}
              </h3>
              <button
                onClick={onClose}
                className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {isLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="space-y-4">
                {accounts.length > 0 && (
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs text-gray-500 font-medium">{selectedAccounts.size} of {accounts.length} selected</span>
                    <div className="space-x-3">
                      <button 
                        type="button" 
                        className="text-xs text-accent-600 hover:text-accent-700 font-medium"
                        onClick={() => setSelectedAccounts(new Set(accounts.map((a: any) => a.id)))}
                      >
                        Select All
                      </button>
                      <button 
                        type="button" 
                        className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                        onClick={() => setSelectedAccounts(new Set())}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-2">
                  {accounts.length === 0 ? (
                    <p className="text-sm text-gray-500 col-span-2">No email accounts found.</p>
                  ) : (
                    accounts.map((account: any) => (
                      <label
                        key={account.id}
                        className="flex items-center justify-between p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center space-x-3 overflow-hidden">
                          <div
                            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white font-medium text-xs"
                            style={{ backgroundColor: account.color || '#3B82F6' }}
                          >
                            {account.avatarInitials || account.label.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-sm font-medium text-gray-900 truncate">{account.label}</p>
                            <p className="text-xs text-gray-500 truncate">{account.emailAddress}</p>
                          </div>
                        </div>
                        <div className={`flex-shrink-0 ml-2 w-5 h-5 rounded border flex items-center justify-center ${selectedAccounts.has(account.id) ? 'bg-accent-600 border-accent-600 text-white' : 'border-gray-300'}`}>
                          {selectedAccounts.has(account.id) && <Check className="w-3.5 h-3.5" />}
                        </div>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={selectedAccounts.has(account.id)}
                          onChange={() => handleToggle(account.id)}
                        />
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => mutation.mutate(Array.from(selectedAccounts))}
                disabled={mutation.isPending || isLoading}
                className="inline-flex items-center justify-center rounded-md border border-transparent bg-accent-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-700 disabled:opacity-50"
              >
                {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Access
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
