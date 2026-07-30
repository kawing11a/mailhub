'use client';

import { useState } from 'react';
import { useAccounts } from '@/hooks/useFavouriteMutations';
import { useSignatures, Signature } from '@/hooks/useSignatures';
import { SignatureModal } from '@/components/signatures/SignatureModal';
import { Plus, Edit2, Star, Trash2, CheckCircle2, FileText, Mail } from 'lucide-react';
import clsx from 'clsx';

export default function SignaturesSettingsPage() {
  const { data: accounts = [], isLoading: isLoadingAccounts } = useAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Set default active account once loaded
  const activeAccountId = selectedAccountId || accounts[0]?.id || null;

  const {
    signatures,
    isLoading: isLoadingSignatures,
    deleteSignature,
    setDefaultSignature,
  } = useSignatures(activeAccountId);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSignature, setEditingSignature] = useState<Signature | null>(null);

  const handleOpenCreate = () => {
    setEditingSignature(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (signature: Signature) => {
    setEditingSignature(signature);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this signature?')) {
      await deleteSignature(id);
    }
  };

  const activeAccount = accounts.find((a) => a.id === activeAccountId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Email Signatures</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage rich-text signatures for each email account and choose defaults when composing messages.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          disabled={!activeAccountId}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          <span>Create Signature</span>
        </button>
      </div>

      {/* Account Selector Tabs */}
      {isLoadingAccounts ? (
        <div className="h-10 w-full animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
      ) : accounts.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
          {accounts.map((acc) => {
            const isSelected = acc.id === activeAccountId;
            return (
              <button
                key={acc.id}
                type="button"
                onClick={() => setSelectedAccountId(acc.id)}
                className={clsx(
                  'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isSelected
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                )}
              >
                <Mail className="h-4 w-4" />
                <span>{acc.label || acc.emailAddress}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
          <p className="text-slate-500 dark:text-slate-400">No email accounts found. Add an email account first to create signatures.</p>
        </div>
      )}

      {/* Signatures List Grid */}
      {activeAccountId && (
        <>
          {isLoadingSignatures ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="h-44 rounded-xl bg-slate-100 animate-pulse dark:bg-slate-800" />
              <div className="h-44 rounded-xl bg-slate-100 animate-pulse dark:bg-slate-800" />
            </div>
          ) : signatures.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {signatures.map((sig) => (
                <div
                  key={sig.id}
                  className={clsx(
                    'flex flex-col justify-between rounded-xl border p-5 bg-white dark:bg-slate-900 shadow-sm transition-all',
                    sig.isDefault
                      ? 'border-blue-500 ring-1 ring-blue-500/50 dark:border-blue-500'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  )}
                >
                  <div>
                    {/* Card Title & Default Badge */}
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-500" />
                        {sig.name}
                      </h3>
                      {sig.isDefault && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                          <CheckCircle2 className="h-3 w-3" />
                          Default
                        </span>
                      )}
                    </div>

                    {/* Content Preview */}
                    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/50 max-h-32 overflow-y-auto">
                      <div
                        className="prose prose-xs dark:prose-invert max-w-none"
                        dangerouslySetInnerHTML={{ __html: sig.contentHtml }}
                      />
                    </div>
                  </div>

                  {/* Actions Toolbar */}
                  <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-4 dark:border-slate-800">
                    {!sig.isDefault ? (
                      <button
                        type="button"
                        onClick={() => setDefaultSignature(sig.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors"
                      >
                        <Star className="h-3.5 w-3.5" />
                        <span>Set as Default</span>
                      </button>
                    ) : (
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">Active Default</span>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(sig)}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
                        title="Edit Signature"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(sig.id)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors"
                        title="Delete Signature"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                No signatures saved for {activeAccount?.label || activeAccount?.emailAddress || 'this account'}.
              </p>
              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Add First Signature
              </button>
            </div>
          )}
        </>
      )}

      {/* Signature Modal */}
      {activeAccountId && (
        <SignatureModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          accountId={activeAccountId}
          accounts={accounts}
          signature={editingSignature}
        />
      )}
    </div>
  );
}
