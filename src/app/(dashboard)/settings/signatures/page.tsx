'use client';

import { useState, useMemo } from 'react';
import { useAccounts } from '@/hooks/useFavouriteMutations';
import { useSignatures, Signature } from '@/hooks/useSignatures';
import { SignatureModal } from '@/components/signatures/SignatureModal';
import {
  Plus,
  Edit2,
  Star,
  Trash2,
  CheckCircle2,
  FileText,
  Mail,
  Loader2,
  Search,
  ChevronDown,
  X,
} from 'lucide-react';
import clsx from 'clsx';

export default function SignaturesSettingsPage() {
  const { data: accounts = [], isLoading: isLoadingAccounts } = useAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [accountSearchQuery, setAccountSearchQuery] = useState('');
  const [signatureSearchQuery, setSignatureSearchQuery] = useState('');

  // Default to first account if none selected
  const activeAccountId = selectedAccountId || accounts[0]?.id || null;

  const {
    signatures = [],
    isLoading: isLoadingSignatures,
    deleteSignature,
    setDefaultSignature,
  } = useSignatures(activeAccountId);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSignature, setEditingSignature] = useState<Signature | null>(null);

  // Filter email accounts for quick account searching
  const filteredAccounts = useMemo(() => {
    const q = accountSearchQuery.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        (a.label || '').toLowerCase().includes(q) ||
        a.emailAddress.toLowerCase().includes(q)
    );
  }, [accounts, accountSearchQuery]);

  // Filter signatures for active account
  const filteredSignatures = useMemo(() => {
    const q = signatureSearchQuery.trim().toLowerCase();
    if (!q) return signatures;
    return signatures.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.contentHtml.toLowerCase().includes(q)
    );
  }, [signatures, signatureSearchQuery]);

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
          <h1 className="app-title text-xl font-semibold">Email Signatures</h1>
          <p className="text-sm text-gray-500">
            Manage rich-text signatures for each email account and set default signatures.
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

      {/* Account Selection & Search Bar Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Account Dropdown Select with Label/Email */}
          <div className="flex-1 min-w-[280px]">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Select Email Account ({accounts.length})
            </label>
            {isLoadingAccounts ? (
              <div className="h-10 w-full animate-pulse rounded-md bg-gray-100" />
            ) : accounts.length > 0 ? (
              <div className="relative">
                <select
                  value={activeAccountId || ''}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full appearance-none rounded-md border border-gray-300 bg-white py-2 pl-3 pr-10 text-sm font-medium text-gray-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
                >
                  {filteredAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.label ? `${acc.label} (${acc.emailAddress})` : acc.emailAddress}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              </div>
            ) : (
              <p className="text-sm text-gray-500">No accounts connected</p>
            )}
          </div>

          {/* Account Filter / Search Box */}
          {accounts.length > 5 && (
            <div className="w-full md:w-64">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Filter Accounts
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={accountSearchQuery}
                  onChange={(e) => setAccountSearchQuery(e.target.value)}
                  placeholder="Search account name..."
                  className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-8 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100"
                />
                {accountSearchQuery && (
                  <button
                    onClick={() => setAccountSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Selected Account Info Header Pill */}
        {activeAccount && (
          <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-500">
            <div className="flex items-center space-x-2">
              <div
                className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                style={{ backgroundColor: activeAccount.color || '#3B82F6' }}
              >
                {activeAccount.avatarInitials || activeAccount.label?.substring(0, 2).toUpperCase() || 'EM'}
              </div>
              <span className="font-semibold text-gray-900">{activeAccount.label || activeAccount.emailAddress}</span>
              <span className="text-gray-400">({activeAccount.emailAddress})</span>
            </div>
            <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">
              {signatures.length} {signatures.length === 1 ? 'signature' : 'signatures'}
            </span>
          </div>
        )}
      </div>

      {/* Signature Search Filter & Controls */}
      {activeAccountId && signatures.length > 0 && (
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={signatureSearchQuery}
              onChange={(e) => setSignatureSearchQuery(e.target.value)}
              placeholder="Search signatures by title or content..."
              className="w-full rounded-md border border-gray-300 bg-white py-1.5 pl-9 pr-8 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100"
            />
            {signatureSearchQuery && (
              <button
                onClick={() => setSignatureSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {signatureSearchQuery && (
            <span className="text-xs text-gray-500 font-medium">
              Showing {filteredSignatures.length} of {signatures.length}
            </span>
          )}
        </div>
      )}

      {/* Signatures Cards Grid */}
      {activeAccountId && (
        <>
          {isLoadingSignatures ? (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex justify-center p-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : filteredSignatures.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredSignatures.map((sig) => (
                <div
                  key={sig.id}
                  className={clsx(
                    'bg-white border rounded-xl shadow-sm p-5 flex flex-col justify-between transition-all duration-200',
                    sig.isDefault
                      ? 'border-accent-300 ring-1 ring-accent-200'
                      : 'border-gray-200 hover:border-gray-300'
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
                    <div className="rounded-md border border-gray-200 bg-gray-50/50 p-3 text-xs text-gray-800 max-h-36 overflow-y-auto">
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
          ) : signatureSearchQuery ? (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
              <p className="text-sm text-gray-500 mb-2">No signatures found matching "{signatureSearchQuery}".</p>
              <button
                type="button"
                onClick={() => setSignatureSearchQuery('')}
                className="text-xs font-medium text-accent-600 hover:text-accent-700 underline"
              >
                Clear search filter
              </button>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-12 text-center">
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
