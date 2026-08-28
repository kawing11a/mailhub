'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ListFilter,
  Plus,
  Play,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  Tag,
  Star,
  MailCheck,
  ShieldAlert,
  Sliders,
  Sparkles,
  Forward,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { RuleModal } from '@/components/rules/RuleModal';
import { EmailRuleDefinition } from '@/lib/rules/types';
import { RestrictedSettingsNotice } from '@/components/settings/RestrictedSettingsNotice';

export default function RulesSettingsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<any | null>(null);
  const [runningRuleId, setRunningRuleId] = useState<string | null>(null);

  const { data: authData, isLoading: isLoadingAuth } = useQuery({
    queryKey: ['auth-me'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me');
      if (!res.ok) throw new Error('Failed to fetch auth info');
      return res.json();
    },
  });

  const isAdmin = authData?.role === 'admin';

  // Fetch Rules
  const { data: rulesData, isLoading: isLoadingRules } = useQuery({
    queryKey: ['rules'],
    enabled: isAdmin,
    queryFn: async () => {
      const res = await fetch('/api/rules');
      if (!res.ok) throw new Error('Failed to fetch rules');
      return res.json();
    },
  });

  // Fetch Labels
  const { data: labelsData } = useQuery({
    queryKey: ['labels'],
    enabled: isAdmin,
    queryFn: async () => {
      const res = await fetch('/api/labels');
      if (!res.ok) throw new Error('Failed to fetch labels');
      return res.json();
    },
  });

  // Fetch Accounts
  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    enabled: isAdmin,
    queryFn: async () => {
      const res = await fetch('/api/accounts');
      if (!res.ok) throw new Error('Failed to fetch accounts');
      return res.json();
    },
  });

  const rules: any[] = rulesData?.rules || [];
  const labels: any[] = labelsData?.labels || [];
  const accounts: any[] = Array.isArray(accountsData) ? accountsData : [];

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/rules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error('Failed to update rule status');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      toast.success('Rule status updated');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Error updating status');
    },
  });

  // Delete mutation
  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/rules/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete rule');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      toast.success('Rule deleted');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Error deleting rule');
    },
  });

  if (isLoadingAuth) {
    return (
      <div className="py-24 flex flex-col items-center justify-center text-gray-400 gap-2">
        <Loader2 className="w-8 h-8 animate-spin text-accent-600" />
        <span className="text-sm">Loading settings...</span>
      </div>
    );
  }

  if (authData && !isAdmin) {
    return <RestrictedSettingsNotice sectionName="email rules and automation" />;
  }

  const handleRunRule = async (ruleId: string, ruleName: string) => {
    setRunningRuleId(ruleId);
    try {
      const res = await fetch(`/api/rules/${ruleId}/run`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to run rule');
      }
      toast.success(
        `Applied "${ruleName}" to ${data.matchedCount} matching email${
          data.matchedCount === 1 ? '' : 's'
        }`
      );
      queryClient.invalidateQueries({ queryKey: ['emails'] });
      queryClient.invalidateQueries({ queryKey: ['labels'] });
    } catch (err: any) {
      toast.error(err.message || 'Error executing rule');
    } finally {
      setRunningRuleId(null);
    }
  };

  const getLabelById = (id: string) => labels.find((l) => l.id === id);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ListFilter className="w-6 h-6 text-accent-600" />
            <span>Email Rules & Automation</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Create automated rules to filter incoming emails, apply labels, flag priority messages, and organize your inboxes.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingRule(null);
            setIsModalOpen(true);
          }}
          className="inline-flex items-center gap-2 bg-accent-600 hover:bg-accent-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Rule</span>
        </button>
      </div>

      {/* Content */}
      {isLoadingRules ? (
        <div className="py-24 flex flex-col items-center justify-center text-gray-400 gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-accent-600" />
          <span className="text-sm">Loading email rules...</span>
        </div>
      ) : rules.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-full bg-accent-50 text-accent-600 flex items-center justify-center mx-auto mb-4">
            <Sliders className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">No email rules created yet</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mt-1 mb-6">
            Rules let you automatically organize your inboxes. For example, automatically assign the "Invoices" label to all emails from Stripe.
          </p>
          <button
            onClick={() => {
              setEditingRule(null);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-2 bg-accent-600 hover:bg-accent-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Create your first rule</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map((rule) => {
            const isRunning = runningRuleId === rule.id;
            const conditions = rule.conditions as EmailRuleDefinition['conditions'];
            const actions = rule.actions as EmailRuleDefinition['actions'];

            return (
              <div
                key={rule.id}
                className={clsx(
                  'bg-white border rounded-xl p-5 shadow-xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-4',
                  rule.isActive ? 'border-gray-200' : 'border-gray-200 bg-gray-50/60 opacity-75'
                )}
              >
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900 text-base">{rule.name}</span>
                    {rule.priority !== undefined && (
                      <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono font-medium">
                        Priority: {rule.priority}
                      </span>
                    )}
                    {rule.accountLabelId ? (
                      <span
                        className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full font-medium border"
                        style={{
                          backgroundColor: `${rule.accountLabel?.color || '#8B5CF6'}15`,
                          borderColor: `${rule.accountLabel?.color || '#8B5CF6'}40`,
                          color: rule.accountLabel?.color || '#8B5CF6',
                        }}
                      >
                        <Tag className="w-3 h-3" />
                        <span>{rule.accountLabel?.name || rule.accountLabelId}</span>
                      </span>
                    ) : rule.account ? (
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full font-medium text-white"
                        style={{ backgroundColor: rule.account.color || '#3B82F6' }}
                      >
                        {rule.account.label}
                      </span>
                    ) : (
                      <span className="text-[11px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                        All Accounts
                      </span>
                    )}
                    {rule.stopProcessing && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium">
                        Stop processing
                      </span>
                    )}
                  </div>

                  {rule.description && (
                    <p className="text-xs text-gray-500">{rule.description}</p>
                  )}

                  {/* Conditions Summary */}
                  <div className="text-xs text-gray-600 flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="font-semibold text-gray-700">If:</span>
                    {conditions?.criteria?.length === 0 ? (
                      <span className="text-gray-500 italic">All incoming emails</span>
                    ) : (
                      <>
                        <span className="text-gray-500 italic">
                          ({conditions?.matchType === 'ANY' ? 'Any condition' : 'All conditions'})
                        </span>
                        {conditions?.criteria?.map((c, idx) => (
                          <span
                            key={idx}
                            className="bg-gray-100 text-gray-800 px-2 py-0.5 rounded text-[11px] border border-gray-200"
                          >
                            <span className="font-medium">{c.field}</span> {c.operator}{' '}
                            <span className="font-semibold">
                              {c.field === 'hasLabelId'
                                ? getLabelById(String(c.value))?.name || String(c.value)
                                : String(c.value)}
                            </span>
                          </span>
                        ))}
                      </>
                    )}
                  </div>

                  {/* Actions Summary */}
                  <div className="text-xs text-gray-600 flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="font-semibold text-gray-700">Then:</span>
                    {actions?.addLabelIds && actions.addLabelIds.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-gray-500">Apply</span>
                        {actions.addLabelIds.map((lid) => {
                          const lbl = getLabelById(lid);
                          return (
                            <span
                              key={lid}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border"
                              style={{
                                backgroundColor: `${lbl?.color || '#3B82F6'}15`,
                                borderColor: `${lbl?.color || '#3B82F6'}40`,
                                color: lbl?.color || '#3B82F6',
                              }}
                            >
                              <Tag className="w-3 h-3" />
                              <span>{lbl?.name || lid}</span>
                            </span>
                          );
                        })}
                      </span>
                    )}

                    {actions?.markAsStarred && (
                      <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-[11px]">
                        <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> Star
                      </span>
                    )}

                    {actions?.markAsRead && (
                      <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[11px]">
                        <MailCheck className="w-3 h-3 text-blue-600" /> Mark Read
                      </span>
                    )}

                    {actions?.markAsHighRisk && (
                      <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded text-[11px]">
                        <ShieldAlert className="w-3 h-3 text-red-600" /> Flag High Risk
                      </span>
                    )}

                    {actions?.forwardTo && actions.forwardTo.length > 0 && (
                      <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded text-[11px]">
                        <Forward className="w-3 h-3 text-purple-600" /> Forward to {actions.forwardTo.join(', ')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions Button Group */}
                <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                  {/* Run Retroactively */}
                  <button
                    onClick={() => handleRunRule(rule.id, rule.name)}
                    disabled={isRunning}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg transition-colors shadow-2xs"
                    title="Run retroactively on existing emails in inbox"
                  >
                    {isRunning ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-600" />
                    ) : (
                      <Play className="w-3.5 h-3.5 text-accent-600" />
                    )}
                    <span>{isRunning ? 'Running...' : 'Run now'}</span>
                  </button>

                  {/* Active Toggle Switch */}
                  <button
                    type="button"
                    onClick={() =>
                      toggleActiveMutation.mutate({ id: rule.id, isActive: !rule.isActive })
                    }
                    className={clsx(
                      'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none',
                      rule.isActive ? 'bg-accent-600' : 'bg-gray-300'
                    )}
                    title={rule.isActive ? 'Rule is active' : 'Rule is paused'}
                  >
                    <span
                      aria-hidden="true"
                      className={clsx(
                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                        rule.isActive ? 'translate-x-5' : 'translate-x-0'
                      )}
                    />
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => {
                      setEditingRule(rule);
                      setIsModalOpen(true);
                    }}
                    className="p-1.5 text-gray-400 hover:text-accent-600 hover:bg-gray-100 rounded-md transition-colors"
                    title="Edit Rule"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => {
                      if (confirm(`Are you sure you want to delete rule "${rule.name}"?`)) {
                        deleteRuleMutation.mutate(rule.id);
                      }
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    title="Delete Rule"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal for create/edit */}
      <RuleModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['rules'] })}
        initialRule={editingRule}
        accounts={accounts}
        labels={labels}
      />
    </div>
  );
}
