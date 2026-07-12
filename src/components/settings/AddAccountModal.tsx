'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, Mail, ArrowLeft } from 'lucide-react';
import { createAccountSchema, type CreateAccountInput } from '@/lib/validation/schemas';

interface AddAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ProviderType = 'google' | 'outlook' | 'imap' | null;
type Step = 'provider-selection' | 'oauth-form' | 'imap-form';

export function AddAccountModal({ isOpen, onClose }: AddAccountModalProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('provider-selection');
  const [provider, setProvider] = useState<ProviderType>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // --- IMAP Form Setup ---
  const {
    register: registerImap,
    handleSubmit: handleImapSubmit,
    reset: resetImap,
    formState: { errors: imapErrors },
  } = useForm<CreateAccountInput>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: {
      provider: 'imap',
      color: '#3B82F6',
      imapSecure: true,
      smtpSecure: true,
      imapPort: 993,
      smtpPort: 465,
    },
  });

  const imapMutation = useMutation({
    mutationFn: async (data: CreateAccountInput) => {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to connect account');
      return json;
    },
    onSuccess: () => {
      handleSuccess();
    },
    onError: (error: Error) => {
      setSubmitError(error.message);
    },
  });

  // --- OAuth Form Setup (Simplified) ---
  const [oauthEmail, setOauthEmail] = useState('');
  const [oauthLabel, setOauthLabel] = useState('');

  const handleOauthConnect = () => {
    if (!oauthEmail || !oauthLabel) {
      setSubmitError('Email and Label are required');
      return;
    }
    
    if (provider === 'google') {
      const initUrl = new URL('/api/accounts/oauth/google/init', window.location.origin);
      initUrl.searchParams.set('emailAddress', oauthEmail);
      initUrl.searchParams.set('label', oauthLabel);
      
      // Redirect to Google OAuth
      window.location.href = initUrl.toString();
    } else if (provider === 'outlook') {
      const initUrl = new URL('/api/accounts/oauth/microsoft/init', window.location.origin);
      initUrl.searchParams.set('emailAddress', oauthEmail);
      initUrl.searchParams.set('label', oauthLabel);
      
      // Redirect to Microsoft OAuth
      window.location.href = initUrl.toString();
    } else {
      setSubmitError('OAuth provider is not yet implemented');
    }
  };

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['accounts'] });
    handleClose();
  };

  const handleClose = () => {
    setStep('provider-selection');
    setProvider(null);
    setSubmitError(null);
    resetImap();
    setOauthEmail('');
    setOauthLabel('');
    onClose();
  };

  if (!isOpen) return null;

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
              <div className="flex items-center space-x-3">
                {step !== 'provider-selection' && (
                  <button
                    onClick={() => {
                      setStep('provider-selection');
                      setSubmitError(null);
                    }}
                    className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                )}
                <h3 className="text-lg font-semibold leading-6 text-gray-900">
                  {step === 'provider-selection' ? 'Connect Email Account' : 
                   step === 'oauth-form' ? `Connect with ${provider === 'google' ? 'Google' : 'Outlook'}` : 
                   'Connect via Custom IMAP/SMTP'}
                </h3>
              </div>
              <button
                onClick={handleClose}
                className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {submitError && (
              <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
                {submitError}
              </div>
            )}

            {/* Step 1: Provider Selection */}
            {step === 'provider-selection' && (
              <div className="space-y-4 py-4">
                <button
                  onClick={() => { setProvider('google'); setStep('oauth-form'); }}
                  className="w-full flex items-center p-4 border border-gray-200 rounded-lg hover:border-accent-500 hover:bg-accent-50 transition-all group"
                >
                  <div className="w-10 h-10 flex-shrink-0 bg-white border border-gray-200 rounded-full flex items-center justify-center mr-4">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  </div>
                  <div className="text-left">
                    <div className="text-base font-semibold text-gray-900 group-hover:text-accent-700">Google Workspace / Gmail</div>
                    <div className="text-sm text-gray-500">Fast 1-click connection for Google accounts</div>
                  </div>
                </button>

                <button
                  onClick={() => { setProvider('outlook'); setStep('oauth-form'); }}
                  className="w-full flex items-center p-4 border border-gray-200 rounded-lg hover:border-accent-500 hover:bg-accent-50 transition-all group"
                >
                  <div className="w-10 h-10 flex-shrink-0 bg-white border border-gray-200 rounded-full flex items-center justify-center mr-4">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M11.55 3.3L1.5 4.8C1.2 4.85 1 5.1 1 5.4V18.6C1 18.9 1.25 19.15 1.5 19.2L11.55 20.7C11.8 20.75 12 20.55 12 20.3V3.7C12 3.45 11.8 3.25 11.55 3.3z" fill="#0078D4"/>
                      <path d="M22.5 5H12V19H22.5C22.75 19 23 18.75 23 18.5V5.5C23 5.25 22.75 5 22.5 5z" fill="#005A9E"/>
                      <path d="M17.5 14H14.5C14.2 14 14 13.8 14 13.5V10.5C14 10.2 14.2 10 14.5 10H17.5C17.8 10 18 10.2 18 10.5V13.5C18 13.8 17.8 14 17.5 14z" fill="#FFFFFF"/>
                    </svg>
                  </div>
                  <div className="text-left">
                    <div className="text-base font-semibold text-gray-900 group-hover:text-accent-700">Microsoft Outlook / Office 365</div>
                    <div className="text-sm text-gray-500">Fast 1-click connection for Microsoft accounts</div>
                  </div>
                </button>

                <div className="relative py-4">
                  <div className="absolute inset-0 flex items-center" aria-hidden="true">
                    <div className="w-full border-t border-gray-200" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-white px-3 text-sm text-gray-500">or</span>
                  </div>
                </div>

                <button
                  onClick={() => { setProvider('imap'); setStep('imap-form'); }}
                  className="w-full flex items-center p-4 border border-gray-200 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-all group"
                >
                  <div className="w-10 h-10 flex-shrink-0 bg-white border border-gray-200 rounded-full flex items-center justify-center mr-4">
                    <Mail className="w-5 h-5 text-gray-600 group-hover:text-gray-900" />
                  </div>
                  <div className="text-left">
                    <div className="text-base font-semibold text-gray-900">Custom IMAP & SMTP</div>
                    <div className="text-sm text-gray-500">Connect via server host addresses and ports</div>
                  </div>
                </button>
              </div>
            )}

            {/* Step 2: OAuth Form */}
            {step === 'oauth-form' && (
              <div className="space-y-6">
                <div className="bg-accent-50 border border-accent-100 rounded-md p-4 text-sm text-accent-700 mb-6">
                  You are connecting a {provider === 'google' ? 'Google' : 'Microsoft'} account. 
                  In a production environment, this will open a secure pop-up window to authenticate directly with the provider.
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Display Label</label>
                    <input
                      type="text"
                      placeholder="e.g. Work Support, Personal"
                      value={oauthLabel}
                      onChange={(e) => setOauthLabel(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-accent-500 sm:text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email Address</label>
                    <input
                      type="email"
                      value={oauthEmail}
                      onChange={(e) => setOauthEmail(e.target.value)}
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
                    type="button"
                    onClick={handleOauthConnect}
                    disabled={!oauthEmail || !oauthLabel}
                    className="inline-flex items-center justify-center rounded-md border border-transparent bg-accent-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-700 disabled:opacity-50"
                  >
                    Connect Account
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Custom IMAP Form */}
            {step === 'imap-form' && (
              <form onSubmit={handleImapSubmit((data) => imapMutation.mutate(data))} className="space-y-6">
                <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Display Label</label>
                    <input
                      type="text"
                      placeholder="e.g. Work Support, Personal"
                      {...registerImap('label')}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-accent-500 sm:text-sm"
                    />
                    {imapErrors.label && <p className="mt-1 text-sm text-red-600">{imapErrors.label.message}</p>}
                  </div>

                  <div className="sm:col-span-1">
                    <label className="block text-sm font-medium text-gray-700">Email Address</label>
                    <input
                      type="email"
                      {...registerImap('emailAddress')}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-accent-500 sm:text-sm"
                    />
                    {imapErrors.emailAddress && <p className="mt-1 text-sm text-red-600">{imapErrors.emailAddress.message}</p>}
                  </div>

                  <div className="sm:col-span-1">
                    <label className="block text-sm font-medium text-gray-700">Avatar Color (Hex)</label>
                    <input
                      type="text"
                      {...registerImap('color')}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-accent-500 sm:text-sm"
                    />
                    {imapErrors.color && <p className="mt-1 text-sm text-red-600">{imapErrors.color.message}</p>}
                  </div>

                  <div className="col-span-2 pt-4 border-t border-gray-200">
                    <h4 className="text-md font-medium text-gray-900 mb-4">IMAP (Incoming) Settings</h4>
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium text-gray-700">IMAP Host</label>
                    <input
                      type="text"
                      placeholder="imap.example.com"
                      {...registerImap('imapHost')}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-accent-500 sm:text-sm"
                    />
                    {imapErrors.imapHost && <p className="mt-1 text-sm text-red-600">{imapErrors.imapHost.message}</p>}
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium text-gray-700">IMAP Port</label>
                    <input
                      type="number"
                      {...registerImap('imapPort', { valueAsNumber: true })}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-accent-500 sm:text-sm"
                    />
                    {imapErrors.imapPort && <p className="mt-1 text-sm text-red-600">{imapErrors.imapPort.message}</p>}
                  </div>

                  <div className="col-span-2 pt-4 border-t border-gray-200">
                    <h4 className="text-md font-medium text-gray-900 mb-4">SMTP (Outgoing) Settings</h4>
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium text-gray-700">SMTP Host</label>
                    <input
                      type="text"
                      placeholder="smtp.example.com"
                      {...registerImap('smtpHost')}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-accent-500 sm:text-sm"
                    />
                    {imapErrors.smtpHost && <p className="mt-1 text-sm text-red-600">{imapErrors.smtpHost.message}</p>}
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-sm font-medium text-gray-700">SMTP Port</label>
                    <input
                      type="number"
                      {...registerImap('smtpPort', { valueAsNumber: true })}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-accent-500 sm:text-sm"
                    />
                    {imapErrors.smtpPort && <p className="mt-1 text-sm text-red-600">{imapErrors.smtpPort.message}</p>}
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
                    {imapErrors.username && <p className="mt-1 text-sm text-red-600">{imapErrors.username.message}</p>}
                  </div>

                  <div className="sm:col-span-1">
                    <label className="block text-sm font-medium text-gray-700">App Password</label>
                    <input
                      type="password"
                      {...registerImap('password')}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-accent-500 focus:outline-none focus:ring-accent-500 sm:text-sm"
                    />
                    {imapErrors.password && <p className="mt-1 text-sm text-red-600">{imapErrors.password.message}</p>}
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
                    disabled={imapMutation.isPending}
                    className="inline-flex items-center justify-center rounded-md border border-transparent bg-accent-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-700 disabled:opacity-50"
                  >
                    {imapMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Connect Account
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
