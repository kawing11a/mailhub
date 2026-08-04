'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tag, Mail, Search, Check, Loader2, ShieldAlert, Plus, Pencil, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';

// Palette offered when creating a label inline.
const LABEL_COLORS = [
  '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#F59E0B',
  '#EF4444', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

interface LabelWithAccounts {
  id: string;
  name: string;
  color: string;
  accountIds: string[];
}

interface EmailAccount {
  id: string;
  label: string;
  emailAddress: string;
  color?: string | null;
  avatarInitials?: string | null;
}

interface LabelsResponse {
  labels: LabelWithAccounts[];
}

type AssignmentMode = 'account' | 'label';

export default function LabelAssignmentPage() {
  const queryClient = useQueryClient();
  // Assign-by-account was removed from the UI; the mode is pinned to 'label'.
  // The 'account' branches below are kept so the toggle can be restored easily.
  const [assignmentMode] = useState<AssignmentMode>('label');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [labelSearch, setLabelSearch] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [isCreatingLabel, setIsCreatingLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0]);
  const createInputRef = useRef<HTMLInputElement>(null);

  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editLabelName, setEditLabelName] = useState('');
  const [editLabelColor, setEditLabelColor] = useState(LABEL_COLORS[0]);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingLabelId) editInputRef.current?.focus();
  }, [editingLabelId]);

  const { data: authData } = useQuery({
    queryKey: ['auth-me'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me');
      if (!res.ok) throw new Error('Failed to fetch auth info');
      return res.json();
    },
  });

  const {
    data: labelsData,
    isLoading: isLoadingLabels,
    isError: isLabelsError,
  } = useQuery({
    queryKey: ['labels'],
    queryFn: async () => {
      const res = await fetch('/api/labels');
      if (!res.ok) throw new Error('Failed to fetch labels');
      return res.json();
    },
  });

  const {
    data: accountsData,
    isLoading: isLoadingAccounts,
    isError: isAccountsError,
  } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts');
      if (!res.ok) throw new Error('Failed to fetch accounts');
      return res.json();
    },
  });

  const labels: LabelWithAccounts[] = labelsData?.labels || [];
  const accounts: EmailAccount[] = Array.isArray(accountsData) ? accountsData : [];
  const activeAccountId = accounts.some((account) => account.id === selectedAccountId)
    ? selectedAccountId
    : accounts[0]?.id || null;
  const selectedAccount =
    accounts.find((account) => account.id === activeAccountId) || null;
  const activeLabelId = labels.some((label) => label.id === selectedLabelId)
    ? selectedLabelId
    : labels[0]?.id || null;
  const selectedLabel = labels.find((label) => label.id === activeLabelId) || null;

  const mutation = useMutation({
    mutationFn: async ({ labelId, accountIds }: { labelId: string; accountIds: string[] }) => {
      const res = await fetch(`/api/labels/${labelId}/accounts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save assignment');
      return json;
    },
    onMutate: async ({ labelId, accountIds }) => {
      await queryClient.cancelQueries({ queryKey: ['labels'] });
      const previous = queryClient.getQueryData<LabelsResponse>(['labels']);
      queryClient.setQueryData<LabelsResponse>(['labels'], (data) =>
        data
          ? {
              ...data,
              labels: data.labels.map((label) =>
                label.id === labelId ? { ...label, accountIds } : label
              ),
            }
          : data
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['labels'], context.previous);
      toast.error('Failed to save assignment');
    },
    onSuccess: () => {
      toast.success('Assignment saved');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['labels'] });
      queryClient.invalidateQueries({ queryKey: ['labelEmails'] });
      queryClient.invalidateQueries({ queryKey: ['emails'] });
    },
  });

  const createLabel = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      const res = await fetch('/api/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create label');
      return json.label as LabelWithAccounts;
    },
    onSuccess: (label) => {
      const created: LabelWithAccounts = { ...label, accountIds: label.accountIds || [] };
      queryClient.setQueryData<LabelsResponse>(['labels'], (data) => ({
        ...(data || {}),
        labels: [...(data?.labels || []), created].sort((a, b) =>
          a.name.localeCompare(b.name)
        ),
      }));
      setSelectedLabelId(created.id);
      setNewLabelName('');
      setNewLabelColor(LABEL_COLORS[0]);
      setIsCreatingLabel(false);
      toast.success('Label created');
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['labels'] }),
  });

  const updateLabel = useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name: string; color: string }) => {
      const res = await fetch(`/api/labels/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update label');
      return json.label as LabelWithAccounts;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<LabelsResponse>(['labels'], (data) => ({
        ...(data || {}),
        labels: (data?.labels || []).map(l => l.id === updated.id ? { ...updated, accountIds: l.accountIds || [] } : l).sort((a, b) =>
          a.name.localeCompare(b.name)
        ),
      }));
      setEditingLabelId(null);
      toast.success('Label updated');
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['labels'] }),
  });

  const deleteLabel = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/labels/${id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to delete label');
      return id;
    },
    onSuccess: (id) => {
      queryClient.setQueryData<LabelsResponse>(['labels'], (data) => ({
        ...(data || {}),
        labels: (data?.labels || []).filter(l => l.id !== id),
      }));
      if (selectedLabelId === id) setSelectedLabelId(null);
      toast.success('Label deleted');
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['labels'] }),
  });

  const startEditing = (label: LabelWithAccounts) => {
    setEditingLabelId(label.id);
    setEditLabelName(label.name);
    setEditLabelColor(label.color);
  };

  const cancelEditing = () => {
    setEditingLabelId(null);
  };

  const handleUpdateLabel = (event: FormEvent) => {
    event.preventDefault();
    const name = editLabelName.trim();
    if (!name || !editingLabelId || updateLabel.isPending) return;
    updateLabel.mutate({ id: editingLabelId, name, color: editLabelColor });
  };

  const handleCreateLabel = (event: FormEvent) => {
    event.preventDefault();
    const name = newLabelName.trim();
    if (!name || createLabel.isPending) return;
    createLabel.mutate({ name, color: newLabelColor });
  };

  const cancelCreateLabel = () => {
    setNewLabelName('');
    setNewLabelColor(LABEL_COLORS[0]);
    setIsCreatingLabel(false);
  };

  const handleToggleLabel = (label: LabelWithAccounts) => {
    if (!activeAccountId || mutation.isPending) return;
    const current = label.accountIds || [];
    const next = current.includes(activeAccountId)
      ? current.filter((id) => id !== activeAccountId)
      : [...current, activeAccountId];
    mutation.mutate({ labelId: label.id, accountIds: next });
  };

  const handleToggleAccount = (accountId: string) => {
    if (!selectedLabel || mutation.isPending) return;
    const current = selectedLabel.accountIds || [];
    const next = current.includes(accountId)
      ? current.filter((id) => id !== accountId)
      : [...current, accountId];
    mutation.mutate({ labelId: selectedLabel.id, accountIds: next });
  };

  if (authData && authData.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ShieldAlert className="w-10 h-10 text-gray-400 mb-3" />
        <h1 className="text-lg font-semibold text-gray-900">Admin access required</h1>
        <p className="text-sm text-gray-500 mt-1">
          Only organization admins can manage label assignments.
        </p>
      </div>
    );
  }

  const filteredLabels = labels.filter((l) =>
    l.name.toLowerCase().includes(labelSearch.toLowerCase())
  );
  const accountSearchTerm = accountSearch.trim().toLowerCase();
  const filteredAccounts = accountSearchTerm
    ? accounts.filter(
        (account) =>
          (account.label || '').toLowerCase().includes(accountSearchTerm) ||
          (account.emailAddress || '').toLowerCase().includes(accountSearchTerm)
      )
    : accounts;
  const assignedLabelCount = activeAccountId
    ? labels.filter((label) => label.accountIds?.includes(activeAccountId)).length
    : 0;

  const isLoading = isLoadingLabels || isLoadingAccounts;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="app-title text-2xl font-semibold">Label Assignment</h1>
        <p className="text-sm text-gray-500 mt-1">
          Assign labels to email accounts. The label view in the sidebar shows individually
          tagged emails plus all emails from assigned accounts — existing emails are never
          modified. Changes are saved automatically.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : isLabelsError || isAccountsError ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-700">
          Failed to load {isLabelsError ? 'labels' : 'accounts'}. Please refresh the page and
          try again.
        </div>
      ) : accounts.length === 0 ? (
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-start space-x-3">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5 text-gray-400" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">No email accounts connected</h2>
              <p className="mt-1 text-sm text-gray-500">
                Connect an account before assigning labels.{' '}
                <Link href="/settings/accounts" className="text-accent-600 hover:underline">
                  Connect an account
                </Link>
                .
              </p>
            </div>
          </div>
        </section>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* Labels column */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
                <div className="flex items-center space-x-2 min-w-0">
                  <Tag className="w-5 h-5 text-gray-500 flex-shrink-0" />
                  <h2 className="font-semibold text-gray-900 truncate">
                    {assignmentMode === 'account' ? (
                      <>
                        Labels for{' '}
                        <span className="text-accent-700">{selectedAccount?.label}</span>
                      </>
                    ) : (
                      'Labels'
                    )}
                  </h2>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {assignmentMode === 'account' && mutation.isPending ? (
                    <span className="flex items-center space-x-1.5 text-xs text-gray-500">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving…</span>
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">
                      {assignmentMode === 'account'
                        ? `${assignedLabelCount} assigned`
                        : `${labels.length} ${labels.length === 1 ? 'label' : 'labels'}`}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsCreatingLabel(true)}
                    disabled={isCreatingLabel || createLabel.isPending}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-accent-700 hover:bg-accent-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add label</span>
                  </button>
                </div>
              </div>
              <div className="p-4 space-y-3">
                {isCreatingLabel && (
                  <form
                    onSubmit={handleCreateLabel}
                    className="rounded-lg border border-accent-200 bg-accent-50/40 p-3 space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: newLabelColor }}
                      />
                      <input
                        ref={createInputRef}
                        type="text"
                        value={newLabelName}
                        onChange={(event) => setNewLabelName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') cancelCreateLabel();
                        }}
                        placeholder="Label name"
                        maxLength={100}
                        aria-label="New label name"
                        className="flex-1 min-w-0 bg-transparent text-sm font-medium text-gray-900 outline-none placeholder:text-gray-400"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {LABEL_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setNewLabelColor(color)}
                          aria-label={`Use color ${color}`}
                          aria-pressed={newLabelColor === color}
                          className={clsx(
                            'w-5 h-5 rounded-full transition-transform',
                            newLabelColor === color
                              ? 'ring-2 ring-offset-1 ring-gray-400 scale-110'
                              : 'hover:scale-110'
                          )}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelCreateLabel}
                        className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={!newLabelName.trim() || createLabel.isPending}
                        className="inline-flex items-center gap-1.5 rounded-md bg-accent-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {createLabel.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                        <span>Create label</span>
                      </button>
                    </div>
                  </form>
                )}
                {labels.length === 0 ? (
                  !isCreatingLabel && (
                    <p className="py-6 text-center text-sm text-gray-500">
                      No labels yet. Click{' '}
                      <span className="font-medium text-gray-700">Add label</span> to create
                      one.
                    </p>
                  )
                ) : (
                  <>
                    <div className="relative">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={labelSearch}
                      onChange={(event) => setLabelSearch(event.target.value)}
                      placeholder="Search labels..."
                      aria-label="Search labels"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                    />
                  </div>
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {filteredLabels.length === 0 ? (
                      <p className="p-3 text-sm text-gray-500">No labels match your search.</p>
                    ) : (
                      filteredLabels.map((label) => {
                        const isAssigned =
                          !!activeAccountId && label.accountIds?.includes(activeAccountId);
                        const isSelected = label.id === activeLabelId;

                        if (editingLabelId === label.id) {
                          return (
                            <form
                              key={label.id}
                              onSubmit={handleUpdateLabel}
                              className="rounded-lg border border-accent-300 bg-white p-3 space-y-3 ring-1 ring-accent-200 shadow-sm"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-3 h-3 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: editLabelColor }}
                                />
                                <input
                                  ref={editInputRef}
                                  type="text"
                                  value={editLabelName}
                                  onChange={(event) => setEditLabelName(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Escape') cancelEditing();
                                  }}
                                  placeholder="Label name"
                                  maxLength={100}
                                  className="flex-1 min-w-0 bg-transparent text-sm font-medium text-gray-900 outline-none placeholder:text-gray-400"
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {LABEL_COLORS.map((color) => (
                                  <button
                                    key={color}
                                    type="button"
                                    onClick={() => setEditLabelColor(color)}
                                    className={clsx(
                                      'w-5 h-5 rounded-full transition-transform',
                                      editLabelColor === color
                                        ? 'ring-2 ring-offset-1 ring-gray-400 scale-110'
                                        : 'hover:scale-110'
                                    )}
                                    style={{ backgroundColor: color }}
                                  />
                                ))}
                              </div>
                              <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-gray-100">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm('Are you sure you want to delete this label?')) {
                                      deleteLabel.mutate(label.id);
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                                  disabled={deleteLabel.isPending}
                                >
                                  {deleteLabel.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                  <span>Delete</span>
                                </button>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={cancelEditing}
                                    className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="submit"
                                    disabled={!editLabelName.trim() || updateLabel.isPending}
                                    className="inline-flex items-center gap-1.5 rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {updateLabel.isPending ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Check className="w-3 h-3" />
                                    )}
                                    <span>Save</span>
                                  </button>
                                </div>
                              </div>
                            </form>
                          );
                        }

                        const InnerContent = (
                          <>
                            <span className="flex items-center space-x-2.5 min-w-0">
                              <span
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: label.color }}
                              />
                              <span className="text-sm font-medium text-gray-900 truncate">
                                {label.name}
                              </span>
                            </span>
                            <span className="flex items-center space-x-2 flex-shrink-0 ml-3">
                              {assignmentMode === 'label' ? (
                                <>
                                  <span className="text-xs text-gray-400">
                                    {label.accountIds?.length || 0}{' '}
                                    {(label.accountIds?.length || 0) === 1
                                      ? 'account'
                                      : 'accounts'}
                                  </span>
                                  <span
                                    className={clsx(
                                      'w-5 h-5 rounded-full border flex items-center justify-center',
                                      isSelected
                                        ? 'bg-accent-600 border-accent-600 text-white'
                                      : 'border-gray-300'
                                    )}
                                  >
                                    {isSelected && <Check className="w-3.5 h-3.5" />}
                                  </span>
                                </>
                              ) : (
                                <span
                                  className={clsx(
                                    'w-5 h-5 rounded border flex items-center justify-center',
                                    isAssigned
                                      ? 'bg-accent-600 border-accent-600 text-white'
                                      : 'border-gray-300'
                                  )}
                                >
                                  {isAssigned && <Check className="w-3.5 h-3.5" />}
                                </span>
                              )}
                            </span>
                          </>
                        );

                        return (
                          <div
                            key={label.id}
                            className={clsx(
                              'relative flex items-stretch border rounded-lg transition-colors overflow-hidden',
                              mutation.isPending ? 'opacity-70' : '',
                              (assignmentMode === 'label' ? isSelected : isAssigned)
                                ? (assignmentMode === 'label' ? 'border-accent-300 bg-accent-50 ring-1 ring-accent-200' : 'border-accent-200 bg-accent-50/40')
                                : 'border-gray-200 bg-white hover:bg-gray-50'
                            )}
                          >
                            {assignmentMode === 'label' ? (
                              <button
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => setSelectedLabelId(label.id)}
                                disabled={mutation.isPending}
                                className={clsx(
                                  'flex-1 flex items-center justify-between p-3 text-left transition-colors outline-none',
                                  mutation.isPending ? 'cursor-wait' : 'cursor-pointer'
                                )}
                              >
                                {InnerContent}
                              </button>
                            ) : (
                              <label
                                className={clsx(
                                  'flex-1 flex items-center justify-between p-3 transition-colors outline-none',
                                  mutation.isPending ? 'cursor-wait' : 'cursor-pointer'
                                )}
                              >
                                {InnerContent}
                                <input
                                  type="checkbox"
                                  className="sr-only"
                                  checked={!!isAssigned}
                                  disabled={mutation.isPending}
                                  onChange={() => handleToggleLabel(label)}
                                  aria-label={`${isAssigned ? 'Remove' : 'Assign'} label ${
                                    label.name
                                  } ${isAssigned ? 'from' : 'to'} ${selectedAccount?.label}`}
                                />
                              </label>
                            )}
                            
                            <div className={clsx(
                               "flex items-center px-2 border-l",
                               (assignmentMode === 'label' ? isSelected : isAssigned)
                                  ? (assignmentMode === 'label' ? 'border-accent-200' : 'border-accent-200')
                                  : 'border-gray-100'
                            )}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  startEditing(label);
                                }}
                                disabled={mutation.isPending}
                                className="p-1.5 text-gray-400 hover:text-accent-600 hover:bg-accent-50 rounded transition-colors disabled:opacity-50"
                                aria-label="Edit label"
                                title="Edit label"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* Email accounts column */}
            <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
                <div className="flex items-center space-x-2 min-w-0">
                  <Mail className="w-5 h-5 text-gray-500 flex-shrink-0" />
                  <h2 className="font-semibold text-gray-900 truncate">
                    {assignmentMode === 'account' ? (
                      'Email accounts'
                    ) : (
                      <>
                        Accounts for{' '}
                        <span className="text-accent-700">{selectedLabel?.name}</span>
                      </>
                    )}
                  </h2>
                </div>
                {assignmentMode === 'label' && mutation.isPending ? (
                  <span className="flex items-center space-x-1.5 text-xs text-gray-500 flex-shrink-0">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving…</span>
                  </span>
                ) : (
                  <span className="text-xs text-gray-500 flex-shrink-0">
                    {accountSearchTerm
                      ? `${filteredAccounts.length} of ${accounts.length} shown`
                      : assignmentMode === 'account'
                        ? `${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'}`
                        : `${selectedLabel?.accountIds?.length || 0} assigned`}
                  </span>
                )}
              </div>
              <div className="p-4">
                <p className="mb-3 text-xs text-gray-500">
                  {assignmentMode === 'account'
                    ? 'Select an account, then choose all of its labels from the left.'
                    : selectedLabel
                      ? 'Click each account that should use the selected label.'
                      : 'Create a label before assigning email accounts.'}
                </p>
                <div className="relative mb-3">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={accountSearch}
                    onChange={(event) => setAccountSearch(event.target.value)}
                    placeholder="Search accounts..."
                    aria-label="Search accounts"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
                  />
                </div>
                <div
                  role="group"
                  aria-label="Email accounts"
                  className="space-y-2 max-h-[60vh] overflow-y-auto"
                >
                  {accountSearchTerm && filteredAccounts.length === 0 && (
                    <p className="py-6 text-center text-sm text-gray-500">
                      No accounts match “{accountSearch}”.
                    </p>
                  )}
                  {filteredAccounts.map((account) => {
                    const isSelected = account.id === activeAccountId;
                    const isAssigned = !!selectedLabel?.accountIds?.includes(account.id);
                    const accountLabelCount = labels.filter((label) =>
                      label.accountIds?.includes(account.id)
                    ).length;

                    if (assignmentMode === 'label') {
                      return (
                        <label
                          key={account.id}
                          className={clsx(
                            'relative flex items-center justify-between p-3 border rounded-lg transition-colors',
                            mutation.isPending
                              ? 'cursor-wait opacity-70'
                              : !selectedLabel
                                ? 'cursor-not-allowed opacity-60'
                                : 'cursor-pointer hover:bg-gray-50',
                            isAssigned
                              ? 'border-accent-200 bg-accent-50/40'
                              : 'border-gray-200'
                          )}
                        >
                          <span className="flex items-center space-x-3 min-w-0">
                            <span
                              className="w-9 h-9 rounded-full flex items-center justify-center text-white font-medium text-xs flex-shrink-0"
                              style={{ backgroundColor: account.color || '#3B82F6' }}
                            >
                              {account.avatarInitials ||
                                account.label.substring(0, 2).toUpperCase()}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-gray-900 truncate">
                                {account.label}
                              </span>
                              <span className="block text-xs text-gray-500 truncate">
                                {account.emailAddress}
                              </span>
                            </span>
                          </span>
                          <span className="flex items-center space-x-2 flex-shrink-0 ml-3">
                            <span className="text-xs text-gray-400">
                              {isAssigned ? 'Assigned' : 'Not assigned'}
                            </span>
                            <span
                              className={clsx(
                                'w-5 h-5 rounded border flex items-center justify-center',
                                isAssigned
                                  ? 'bg-accent-600 border-accent-600 text-white'
                                  : 'border-gray-300'
                              )}
                            >
                              {isAssigned && <Check className="w-3.5 h-3.5" />}
                            </span>
                          </span>
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={isAssigned}
                            disabled={mutation.isPending || !selectedLabel}
                            onChange={() => handleToggleAccount(account.id)}
                            aria-label={`${isAssigned ? 'Remove' : 'Assign'} account ${
                              account.label
                            } ${isAssigned ? 'from' : 'to'} label ${selectedLabel?.name}`}
                          />
                        </label>
                      );
                    }

                    return (
                      <button
                        key={account.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedAccountId(account.id)}
                        disabled={mutation.isPending}
                        className={clsx(
                          'w-full flex items-center justify-between p-3 border rounded-lg text-left transition-colors',
                          mutation.isPending
                            ? 'cursor-wait opacity-70'
                            : 'cursor-pointer hover:bg-gray-50',
                          isSelected
                            ? 'border-accent-300 bg-accent-50 ring-1 ring-accent-200'
                            : 'border-gray-200'
                        )}
                      >
                        <span className="flex items-center space-x-3 min-w-0">
                          <span
                            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-medium text-xs flex-shrink-0"
                            style={{ backgroundColor: account.color || '#3B82F6' }}
                          >
                            {account.avatarInitials ||
                              account.label.substring(0, 2).toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-gray-900 truncate">
                              {account.label}
                            </span>
                            <span className="block text-xs text-gray-500 truncate">
                              {account.emailAddress}
                            </span>
                          </span>
                        </span>
                        <span className="flex items-center space-x-2 flex-shrink-0 ml-3">
                          <span className="text-xs text-gray-400">
                            {accountLabelCount} {accountLabelCount === 1 ? 'label' : 'labels'}
                          </span>
                          <span
                            className={clsx(
                              'w-5 h-5 rounded-full border flex items-center justify-center',
                              isSelected
                                ? 'bg-accent-600 border-accent-600 text-white'
                                : 'border-gray-300'
                            )}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
