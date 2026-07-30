'use client';

import { useState } from 'react';
import { useAccounts } from '@/hooks/useFavouriteMutations';
import { useSignatures, Signature } from '@/hooks/useSignatures';
import { SignatureModal } from '@/components/signatures/SignatureModal';
import { Plus, Edit2, Star, Trash2, CheckCircle2, FileText, Mail, Loader2 } from 'lucide-react';
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
          <h1 className="text-xl font-bold text-gray-900">Email Signatures</h1>
          <p className="text-sm text-gray-500">
            Manage rich-text signatures for each email account and choose defaults when composing messages.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          disabled={!activeAccountId}
          className="inline-flex items-center space-x-2 bg-accent-600 hover:bg-accent-700 text-white px-4 py-2 rounded-md font-medium text-sm transition-colors shadow-sm disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          <span>Create Signature</span>
        </button>
      </div>

      {/* Account Tabs */}
      {isLoadingAccounts ? (
        <div className="flex items-center justify-center p-8 bg-white border border-gray-200 rounded-lg shadow-sm">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : accounts.length > 0 ? (
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8 overflow-x-auto">
            {accounts.map((acc) => {
              const isSelected = acc.id === activeAccountId;
              const accountSignaturesCount = signatures ? signatures.length : 0;
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => setSelectedAccountId(acc.id)}
                  className={`
                    whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center space-x-2
                    ${isSelected
                      ? 'border-accent-500 text-accent-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <Mail className="w-4 h-4" />
                  <span>{acc.label || acc.emailAddress}</span>
                </button>
              );
            })}
          </nav>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Mail className="w-6 h-6 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900">No email accounts connected</h3>
          <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">
            Connect an email account first to manage and assign signatures.
          </p>
        </div>
      )}

      {/* Signatures Cards Grid */}
      {activeAccountId && (
        <>
          {isLoadingSignatures ? (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm flex justify-center p-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : signatures.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {signatures.map((sig) => (
                <div
                  key={sig.id}
                  className={clsx(
                    'bg-white border rounded-xl shadow-sm p-5 flex flex-col justify-between transition-all duration-200',
                    sig.isDefault ? 'border-accent-300 ring-1 ring-accent-200' : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <div>
                    {/* Header + Default Badge */}
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-900 flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-gray-400" />
                        <span>{sig.name}</span>
                      </h3>
                      {sig.isDefault && (
                        <span className="inline-flex items-center space-x-1 bg-accent-50 text-accent-700 border border-accent-200 font-medium px-2.5 py-0.5 rounded-full text-xs">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Default</span>
                        </span>
                      )}
                    </div>

                    {/* Content Preview */}
                    <div className="rounded-md border border-gray-200 bg-gray-50/50 p-3 text-xs text-gray-800 max-h-32 overflow-y-auto">
                      <div
                        className="prose prose-xs max-w-none"
                        dangerouslySetInnerHTML={{ __html: sig.contentHtml }}
                      />
                    </div>
                  </div>

                  {/* Actions Toolbar */}
                  <div className="flex items-center justify-between border-t border-gray-100 pt-4 mt-4">
                    {!sig.isDefault ? (
                      <button
                        type="button"
                        onClick={() => setDefaultSignature(sig.id)}
                        className="inline-flex items-center space-x-1 text-xs font-medium text-gray-600 hover:text-accent-600 transition-colors"
                      >
                        <Star className="h-3.5 w-3.5" />
                        <span>Set as Default</span>
                      </button>
                    ) : (
                      <span className="text-xs text-accent-600 font-medium">Active Default</span>
                    )}

                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(sig)}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                        title="Edit Signature"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(sig.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
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
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-12 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <FileText className="w-6 h-6 text-gray-400" />
              </div>
              <h3 className="text-base font-medium text-gray-900">No signatures created</h3>
              <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto mb-4">
                Add signatures for {activeAccount?.label || activeAccount?.emailAddress || 'this account'}.
              </p>
              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center space-x-2 bg-accent-600 hover:bg-accent-700 text-white px-4 py-2 rounded-md font-medium transition-colors shadow-sm text-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Create Signature</span>
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
