'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, Mail, AlertTriangle, Server } from 'lucide-react';
import { updateAccountSchema, type UpdateAccountInput } from '@/lib/validation/schemas';
import toast from 'react-hot-toast';

interface EditAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: any | null;
}

export function EditAccountModal({ isOpen, onClose, account }: EditAccountModalProps) {
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isReindexing, setIsReindexing] = useState(false);

  const {
    register: registerImap,
    handleSubmit: handleImapSubmit,
    reset: resetImap,
    formState: { errors: imapErrors },
  } = useForm<UpdateAccountInput>({
    resolver: zodResolver(updateAccountSchema),
    defaultValues: {
      label: '',
      color: '',
      imapHost: '',
      imapPort: 993,
      smtpHost: '',
      smtpPort: 465,
      username: '',
      password: '',
    },
  });

  // Pre-fill form when account changes
  useEffect(() => {
    if (account) {
      resetImap({
        label: account.label || '',
        color: account.color || '',
        imapHost: account.imapHost || '',
        imapPort: account.imapPort || 993,
        smtpHost: account.smtpHost || '',
        smtpPort: account.smtpPort || 465,
        username: account.username || account.emailAddress || '',
        password: '', // Password is blank for security
      });
    }
  }, [account, resetImap]);

  const updateMutation = useMutation({
    mutationFn: async (data: UpdateAccountInput) => {
      if (!account) return;
      
      // Filter out empty password so we don't overwrite with blank
      const payload = { ...data };
      if (!payload.password) {
        delete payload.password;
      }

      const res = await fetch(`/api/accounts/${account.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update account credentials');
      return json;
    },
    onSuccess: () => {
      toast.success('Account credentials updated! It will reconnect shortly.');
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      handleClose();
    },
    onError: (error: Error) => {
      setSubmitError(error.message);
    },
  });

  const handleOauthReauthorize = () => {
    if (!account) return;
    
    if (account.provider === 'gmail' || account.oauthProvider === 'google') {
      const initUrl = new URL('/api/accounts/oauth/google/init', window.location.origin);
      initUrl.searchParams.set('emailAddress', account.emailAddress);
      initUrl.searchParams.set('label', account.label);
      window.location.href = initUrl.toString();
    } else if (account.provider === 'outlook' || account.oauthProvider === 'microsoft') {
      const initUrl = new URL('/api/accounts/oauth/microsoft/init', window.location.origin);
      initUrl.searchParams.set('emailAddress', account.emailAddress);
      initUrl.searchParams.set('label', account.label);
      window.location.href = initUrl.toString();
    } else {
      setSubmitError('Reauthorization for this provider is not yet implemented');
    }
  };

  const handleClose = () => {
    setSubmitError(null);
    onClose();
  };

  const handleReindex = async () => {
    if (!account) return;
    setIsReindexing(true);
    setSubmitError(null);

    try {
      const res = await fetch(`/api/accounts/${account.id}/reindex`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to trigger reindex');
      
      toast.success(data.message);
    } catch (err: any) {
      setSubmitError(err.message);
      toast.error('Reindex failed');
    } finally {
      setIsReindexing(false);
    }
  };

  if (!isOpen || !account) return null;

  const isOauth = account.oauthProvider != null || account.provider === 'gmail';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4 text-center sm:p-0">
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
          onClick={handleClose}
        />
        
        <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-2xl">
          <div className="bg-white px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
            
            {/* Header */}
            <div className="flex items-center justify-between mb-6 border-b border-gray-100 pb-4">
              <h3 className="text-lg font-semibold leading-6 text-gray-900">
                Manage Connection: {account.emailAddress}
              </h3>
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleReindex}
                  disabled={isReindexing}
                  className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 flex items-center space-x-2 transition-colors"
                >
                  {isReindexing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
                  <span>{isReindexing ? 'Queueing...' : 'Reindex Emails'}</span>
                </button>
                <button
                  onClick={handleClose}
                  className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            {submitError && (
              <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
                {submitError}
              </div>
            )}

            {!account.isActive && (
              <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <AlertTriangle className="h-5 w-5 text-yellow-400" aria-hidden="true" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-yellow-700 font-medium">
                      This account is currently inactive due to connection or authentication issues. 
                    </p>
                    {account.authError && (
                      <p className="mt-1 text-sm text-red-600 bg-red-50 p-2 rounded border border-red-100">
                        <span className="font-semibold">Error:</span> {account.authError}
                      </p>
                    )}
                    <p className="mt-2 text-sm text-yellow-700">
                      {isOauth 
                        ? 'Reauthorize with your provider to restore the connection.' 
                        : 'Please update your IMAP/SMTP credentials below to restore the connection.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isOauth ? (
              <div className="space-y-6">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                  <div className="w-12 h-12 flex-shrink-0 bg-white border border-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                    {account.oauthProvider === 'google' || account.provider === 'gmail' ? (
                      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                    ) : account.oauthProvider === 'microsoft' || account.provider === 'outlook' ? (
                      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11.55 3.3L1.5 4.8C1.2 4.85 1 5.1 1 5.4V18.6C1 18.9 1.25 19.15 1.5 19.2L11.55 20.7C11.8 20.75 12 20.55 12 20.3V3.7C12 3.45 11.8 3.25 11.55 3.3z" fill="#0078D4"/>
                        <path d="M22.5 5H12V19H22.5C22.75 19 23 18.75 23 18.5V5.5C23 5.25 22.75 5 22.5 5z" fill="#005A9E"/>
                        <path d="M17.5 14H14.5C14.2 14 14 13.8 14 13.5V10.5C14 10.2 14.2 10 14.5 10H17.5C17.8 10 18 10.2 18 10.5V13.5C18 13.8 17.8 14 17.5 14z" fill="#FFFFFF"/>
                      </svg>
                    ) : (
                      <Mail className="w-6 h-6 text-gray-600" />
                    )}
                  </div>
                  <h4 className="text-md font-medium text-gray-900 mb-1">OAuth Connection</h4>
                  <p className="text-sm text-gray-500 mb-6">
                    This account is connected securely via {account.oauthProvider === 'microsoft' || account.provider === 'outlook' ? 'Microsoft' : (account.oauthProvider || (account.provider === 'gmail' ? 'Google' : 'OAuth'))}. To fix connection issues, you must reauthorize access directly through them.
                  </p>
                  <button
                    type="button"
                    onClick={handleOauthReauthorize}
                    className="inline-flex items-center justify-center rounded-md border border-transparent bg-accent-600 px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-accent-700"
                  >
                    {account.oauthProvider === 'google' || account.provider === 'gmail' ? 'Reauthorize with Gmail' : account.oauthProvider === 'microsoft' || account.provider === 'outlook' ? 'Reauthorize with Microsoft' : 'Reauthorize Account'}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleImapSubmit((data) => updateMutation.mutate(data))} className="space-y-6">
                <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Display Label</label>
                    <input
                      type="text"
                      {...registerImap('label')}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-accent-500 sm:text-sm"
                    />
                    {imapErrors.label && <p className="mt-1 text-sm text-red-600">{imapErrors.label.message}</p>}
                  </div>

                  <div className="col-span-2 pt-4 border-t border-gray-200">
                    <h4 className="text-md font-medium text-gray-900 mb-4">IMAP (Incoming) Settings</h4>
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium text-gray-700">IMAP Host</label>
                    <input
                      type="text"
                      {...registerImap('imapHost')}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-accent-500 sm:text-sm"
                    />
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium text-gray-700">IMAP Port</label>
                    <input
                      type="number"
                      {...registerImap('imapPort', { valueAsNumber: true })}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-accent-500 sm:text-sm"
                    />
                  </div>

                  <div className="col-span-2 pt-4 border-t border-gray-200">
                    <h4 className="text-md font-medium text-gray-900 mb-4">SMTP (Outgoing) Settings</h4>
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium text-gray-700">SMTP Host</label>
                    <input
                      type="text"
                      {...registerImap('smtpHost')}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-accent-500 sm:text-sm"
                    />
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium text-gray-700">SMTP Port</label>
                    <input
                      type="number"
                      {...registerImap('smtpPort', { valueAsNumber: true })}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-accent-500 sm:text-sm"
                    />
                  </div>

                  <div className="col-span-2 pt-4 border-t border-gray-200">
                    <h4 className="text-md font-medium text-gray-900 mb-4">Credentials</h4>
                  </div>

                  <div className="sm:col-span-1">
                    <label className="block text-sm font-medium text-gray-700">Username</label>
                    <input
                      type="text"
                      {...registerImap('username')}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-accent-500 sm:text-sm"
                    />
                  </div>

                  <div className="sm:col-span-1">
                    <label className="block text-sm font-medium text-gray-700">Update Password (Leave blank to keep current)</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      {...registerImap('password')}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-accent-500 sm:text-sm"
                    />
                  </div>

                </div>

                <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateMutation.isPending}
                    className="inline-flex items-center justify-center rounded-md border border-transparent bg-accent-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-700 disabled:opacity-50"
                  >
                    {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Save & Reconnect
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
