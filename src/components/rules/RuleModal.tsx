'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  Check,
  Loader2,
  Sliders,
  Tag,
  Star,
  MailCheck,
  ShieldAlert,
  HelpCircle,
  Forward,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { ConditionField, ConditionOperator, MatchType, RuleCriterion } from '@/lib/rules/types';
import {
  buildRuleScopePayload,
  getRuleScopeMode,
  RuleScopeMode,
  validateRuleScopeSelection,
} from '@/lib/rules/scope';

interface LabelItem {
  id: string;
  name: string;
  color: string;
}

interface AccountItem {
  id: string;
  label: string;
  emailAddress: string;
  color?: string | null;
}

interface RuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (rule: any) => void;
  initialRule?: any | null;
  accounts: AccountItem[];
  labels: LabelItem[];
}

const FIELD_OPTIONS: Array<{ value: ConditionField; label: string }> = [
  { value: 'from', label: 'From (Sender)' },
  { value: 'to', label: 'To (Recipient)' },
  { value: 'cc', label: 'Cc' },
  { value: 'subject', label: 'Subject' },
  { value: 'body', label: 'Body Text' },
  { value: 'hasAttachment', label: 'Has Attachment' },
  { value: 'hasLabelId', label: 'Has Label' },
];

const OPERATOR_OPTIONS: Array<{ value: ConditionOperator; label: string }> = [
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'equals', label: 'equals exactly' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'matches_regex', label: 'matches regex' },
];

export function getRuleCriteriaForEdit(initialRule: any): RuleCriterion[] {
  const initialCriteria = initialRule?.conditions?.criteria;
  return Array.isArray(initialCriteria)
    ? initialCriteria
    : [{ field: 'from', operator: 'contains', value: '' }];
}

export function cleanRuleCriteria(criteria: RuleCriterion[]): RuleCriterion[] {
  return criteria.filter((criterion) => {
    if (criterion.field === 'hasAttachment') return true;
    if (criterion.field === 'hasLabelId') return Boolean(criterion.value);
    return String(criterion.value).trim() !== '';
  });
}

export function removeRuleCriterion(criteria: RuleCriterion[], index: number): RuleCriterion[] {
  return criteria.filter((_, idx) => idx !== index);
}

export function RuleModal({
  isOpen,
  onClose,
  onSaved,
  initialRule,
  accounts = [],
  labels = [],
}: RuleModalProps) {
  const [name, setName] = useState(initialRule?.name || '');
  const [description, setDescription] = useState(initialRule?.description || '');
  const [scopeMode, setScopeMode] = useState<RuleScopeMode>(
    initialRule ? getRuleScopeMode(initialRule) : 'all'
  );
  const [accountId, setAccountId] = useState<string | null>(initialRule?.accountId || null);
  const [accountLabelId, setAccountLabelId] = useState<string | null>(
    initialRule?.accountLabelId || null
  );
  const [priority, setPriority] = useState(initialRule?.priority ?? 0);
  const [isActive, setIsActive] = useState(initialRule?.isActive ?? true);
  const [stopProcessing, setStopProcessing] = useState(initialRule?.stopProcessing ?? false);

  const [matchType, setMatchType] = useState<MatchType>(initialRule?.conditions?.matchType || 'ALL');
  const [criteria, setCriteria] = useState<RuleCriterion[]>(getRuleCriteriaForEdit(initialRule));

  const [addLabelIds, setAddLabelIds] = useState<string[]>(initialRule?.actions?.addLabelIds || []);
  const [removeLabelIds, setRemoveLabelIds] = useState<string[]>(
    initialRule?.actions?.removeLabelIds || []
  );
  const [markAsRead, setMarkAsRead] = useState(Boolean(initialRule?.actions?.markAsRead));
  const [markAsStarred, setMarkAsStarred] = useState(Boolean(initialRule?.actions?.markAsStarred));
  const [markAsHighRisk, setMarkAsHighRisk] = useState(
    Boolean(initialRule?.actions?.markAsHighRisk)
  );
  const [forwardToInput, setForwardToInput] = useState<string>(
    Array.isArray(initialRule?.actions?.forwardTo) ? initialRule.actions.forwardTo.join(', ') : ''
  );

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialRule) {
      setName(initialRule.name || '');
      setDescription(initialRule.description || '');
      setScopeMode(getRuleScopeMode(initialRule));
      setAccountId(initialRule.accountId || null);
      setAccountLabelId(initialRule.accountLabelId || null);
      setPriority(initialRule.priority ?? 0);
      setIsActive(initialRule.isActive ?? true);
      setStopProcessing(initialRule.stopProcessing ?? false);

      if (initialRule.conditions) {
        setMatchType(initialRule.conditions.matchType || 'ALL');
        setCriteria(getRuleCriteriaForEdit(initialRule));
      }

      if (initialRule.actions) {
        setAddLabelIds(initialRule.actions.addLabelIds || []);
        setRemoveLabelIds(initialRule.actions.removeLabelIds || []);
        setMarkAsRead(Boolean(initialRule.actions.markAsRead));
        setMarkAsStarred(Boolean(initialRule.actions.markAsStarred));
        setMarkAsHighRisk(Boolean(initialRule.actions.markAsHighRisk));
        setForwardToInput(
          Array.isArray(initialRule.actions.forwardTo)
            ? initialRule.actions.forwardTo.join(', ')
            : ''
        );
      }
    } else {
      // Reset form
      setName('');
      setDescription('');
      setScopeMode('all');
      setAccountId(null);
      setAccountLabelId(null);
      setPriority(0);
      setIsActive(true);
      setStopProcessing(false);
      setMatchType('ALL');
      setCriteria([{ field: 'from', operator: 'contains', value: '' }]);
      setAddLabelIds([]);
      setRemoveLabelIds([]);
      setMarkAsRead(false);
      setMarkAsStarred(false);
      setMarkAsHighRisk(false);
      setForwardToInput('');
    }
  }, [initialRule, isOpen]);

  if (!isOpen) return null;

  const handleAddCriterion = () => {
    setCriteria([...criteria, { field: 'from', operator: 'contains', value: '' }]);
  };

  const handleRemoveCriterion = (index: number) => {
    setCriteria(removeRuleCriterion(criteria, index));
  };

  const handleUpdateCriterion = (index: number, patch: Partial<RuleCriterion>) => {
    setCriteria(
      criteria.map((item, idx) => {
        if (idx !== index) return item;
        const updated = { ...item, ...patch };
        // If field changed to hasAttachment, set boolean default
        if (patch.field === 'hasAttachment' && typeof updated.value !== 'boolean') {
          updated.value = true;
          updated.operator = 'equals';
        } else if (patch.field === 'hasLabelId' && (!updated.value || typeof updated.value === 'boolean')) {
          updated.value = labels[0]?.id || '';
          updated.operator = 'equals';
        }
        return updated;
      })
    );
  };

  const handleToggleAddLabel = (labelId: string) => {
    if (addLabelIds.includes(labelId)) {
      setAddLabelIds(addLabelIds.filter((id) => id !== labelId));
    } else {
      setAddLabelIds([...addLabelIds, labelId]);
      setRemoveLabelIds(removeLabelIds.filter((id) => id !== labelId));
    }
  };

  const handleToggleRemoveLabel = (labelId: string) => {
    if (removeLabelIds.includes(labelId)) {
      setRemoveLabelIds(removeLabelIds.filter((id) => id !== labelId));
    } else {
      setRemoveLabelIds([...removeLabelIds, labelId]);
      setAddLabelIds(addLabelIds.filter((id) => id !== labelId));
    }
  };

  const handleScopeModeChange = (mode: RuleScopeMode) => {
    setScopeMode(mode);

    if (mode === 'account' && !accountId) {
      setAccountId(accounts[0]?.id || null);
    }

    if (mode === 'label' && !accountLabelId) {
      setAccountLabelId(labels[0]?.id || null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Please enter a rule name');
      return;
    }

    const cleanedCriteria = cleanRuleCriteria(criteria);

    const actionsPayload: Record<string, any> = {};
    if (addLabelIds.length > 0) actionsPayload.addLabelIds = addLabelIds;
    if (removeLabelIds.length > 0) actionsPayload.removeLabelIds = removeLabelIds;
    if (markAsRead) actionsPayload.markAsRead = true;
    if (markAsStarred) actionsPayload.markAsStarred = true;
    if (markAsHighRisk) actionsPayload.markAsHighRisk = true;

    const parsedForwardTo = forwardToInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (parsedForwardTo.length > 0) {
      actionsPayload.forwardTo = parsedForwardTo;
    }

    if (Object.keys(actionsPayload).length === 0) {
      toast.error('Please select at least one action to apply');
      return;
    }

    const scopeValidationError = validateRuleScopeSelection(
      scopeMode,
      accountId,
      accountLabelId
    );
    if (scopeValidationError) {
      toast.error(scopeValidationError);
      return;
    }

    setIsSubmitting(true);

    try {
      const scope = buildRuleScopePayload(scopeMode, accountId, accountLabelId);
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        priority: Number(priority) || 0,
        isActive,
        stopProcessing,
        conditions: {
          matchType,
          criteria: cleanedCriteria,
        },
        actions: actionsPayload,
        ...scope,
      };

      const isEdit = Boolean(initialRule?.id);
      const url = isEdit ? `/api/rules/${initialRule.id}` : '/api/rules';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to save rule');
      }

      toast.success(isEdit ? 'Rule updated' : 'Rule created');
      onSaved(json.rule);
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Error saving rule');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-2xl w-full my-8 overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-accent-600" />
            <h2 className="font-semibold text-gray-900 text-base">
              {initialRule?.id ? 'Edit Email Rule' : 'Create Email Rule'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 text-sm max-h-[80vh] overflow-y-auto">
          {/* General Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Rule Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Label Stripe Receipts"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Target Account Scope
              </label>
              <select
                value={scopeMode}
                onChange={(e) => handleScopeModeChange(e.target.value as RuleScopeMode)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-accent-500"
              >
                <option value="all">All Connected Accounts</option>
                <option value="account">Specific Account</option>
                <option value="label">Account Label</option>
              </select>

              {scopeMode === 'account' && (
                <select
                  value={accountId || ''}
                  onChange={(e) => setAccountId(e.target.value || null)}
                  className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-accent-500"
                >
                  <option value="" disabled>
                    Select account...
                  </option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.label} ({acc.emailAddress})
                    </option>
                  ))}
                </select>
              )}

              {scopeMode === 'label' && (
                <div className="mt-2 rounded-lg border border-gray-200 bg-white p-2 space-y-2">
                  {labels.length === 0 ? (
                    <p className="text-xs text-gray-500">No account labels available yet.</p>
                  ) : (
                    labels.map((label) => {
                      const isSelected = accountLabelId === label.id;
                      return (
                        <button
                          key={label.id}
                          type="button"
                          onClick={() => setAccountLabelId(label.id)}
                          className={clsx(
                            'w-full inline-flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                            isSelected
                              ? 'border-accent-300 bg-accent-50 text-accent-900'
                              : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                          )}
                        >
                          <span className="inline-flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: label.color }}
                            />
                            <span className="truncate">{label.name}</span>
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                Priority Order (Lower runs first)
              </label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
            </div>
          </div>

          {/* Section 1: Conditions */}
          <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                <span>1. If incoming email matches</span>
              </span>
              {criteria.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500">Match logic:</span>
                  <select
                    value={matchType}
                    onChange={(e) => setMatchType(e.target.value as MatchType)}
                    className="px-2 py-1 border border-gray-300 rounded-md bg-white font-medium text-gray-800"
                  >
                    <option value="ALL">ALL conditions must match (AND)</option>
                    <option value="ANY">ANY condition can match (OR)</option>
                  </select>
                </div>
              )}
            </div>

            {/* Criteria Rows */}
            <div className="space-y-2">
              {criteria.map((criterion, idx) => (
                <div
                  key={idx}
                  className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-white p-2.5 rounded-lg border border-gray-200 shadow-xs"
                >
                  {/* Field Selector */}
                  <select
                    value={criterion.field}
                    onChange={(e) =>
                      handleUpdateCriterion(idx, { field: e.target.value as ConditionField })
                    }
                    className="px-2.5 py-1.5 border border-gray-300 rounded-md text-xs font-medium bg-white"
                  >
                    {FIELD_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>

                  {/* Operator Selector */}
                  {criterion.field !== 'hasAttachment' && criterion.field !== 'hasLabelId' && (
                    <select
                      value={criterion.operator}
                      onChange={(e) =>
                        handleUpdateCriterion(idx, {
                          operator: e.target.value as ConditionOperator,
                        })
                      }
                      className="px-2 py-1.5 border border-gray-300 rounded-md text-xs bg-white text-gray-700"
                    >
                      {OPERATOR_OPTIONS.map((op) => (
                        <option key={op.value} value={op.value}>
                          {op.label}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Value Input */}
                  <div className="flex-1 min-w-0">
                    {criterion.field === 'hasAttachment' ? (
                      <select
                        value={String(criterion.value)}
                        onChange={(e) =>
                          handleUpdateCriterion(idx, { value: e.target.value === 'true' })
                        }
                        className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs bg-white"
                      >
                        <option value="true">Yes, email has attachments</option>
                        <option value="false">No attachments</option>
                      </select>
                    ) : criterion.field === 'hasLabelId' ? (
                      <select
                        value={String(criterion.value || '')}
                        onChange={(e) => handleUpdateCriterion(idx, { value: e.target.value })}
                        className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs bg-white"
                      >
                        <option value="" disabled>
                          Select label...
                        </option>
                        {labels.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={String(criterion.value || '')}
                        onChange={(e) => handleUpdateCriterion(idx, { value: e.target.value })}
                        placeholder={
                          criterion.field === 'from'
                            ? 'e.g. @stripe.com or john@acme.com'
                            : criterion.field === 'subject'
                            ? 'e.g. Invoice, Receipt, Urgent'
                            : 'Enter text to match...'
                        }
                        className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-xs"
                      />
                    )}
                  </div>

                  {/* Remove Button */}
                  <button
                    type="button"
                    onClick={() => handleRemoveCriterion(idx)}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors self-end sm:self-center"
                    title="Remove condition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {criteria.length === 0 && (
                <p className="text-xs text-gray-500">
                  No email conditions: this rule applies to all incoming emails in the selected
                  scope.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleAddCriterion}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-700 hover:text-accent-800 bg-white border border-accent-200 px-3 py-1.5 rounded-lg shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add another condition</span>
            </button>
          </div>

          {/* Section 2: Actions */}
          <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/60 space-y-4">
            <span className="text-xs font-semibold text-gray-900 uppercase tracking-wider block">
              2. Do the following actions
            </span>

            {/* Apply Labels */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-accent-600" />
                <span>Apply Labels</span>
              </label>
              {labels.length === 0 ? (
                <p className="text-xs text-gray-400">No labels created yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {labels.map((label) => {
                    const isSelected = addLabelIds.includes(label.id);
                    return (
                      <button
                        key={label.id}
                        type="button"
                        onClick={() => handleToggleAddLabel(label.id)}
                        className={clsx(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                          isSelected
                            ? 'bg-accent-100 border-accent-400 text-accent-800 ring-1 ring-accent-300'
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'
                        )}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: label.color }}
                        />
                        <span>{label.name}</span>
                        {isSelected && <Check className="w-3 h-3 text-accent-700" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Checkbox Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-gray-200">
              <label className="flex items-center gap-2 cursor-pointer bg-white p-2.5 rounded-lg border border-gray-200 shadow-xs hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={markAsStarred}
                  onChange={(e) => setMarkAsStarred(e.target.checked)}
                  className="rounded text-accent-600 focus:ring-accent-500 w-4 h-4"
                />
                <span className="text-xs font-medium text-gray-800 flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-amber-500" /> Mark Starred
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer bg-white p-2.5 rounded-lg border border-gray-200 shadow-xs hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={markAsRead}
                  onChange={(e) => setMarkAsRead(e.target.checked)}
                  className="rounded text-accent-600 focus:ring-accent-500 w-4 h-4"
                />
                <span className="text-xs font-medium text-gray-800 flex items-center gap-1">
                  <MailCheck className="w-3.5 h-3.5 text-blue-500" /> Mark as Read
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer bg-white p-2.5 rounded-lg border border-gray-200 shadow-xs hover:bg-gray-50 transition-colors">
                <input
                  type="checkbox"
                  checked={markAsHighRisk}
                  onChange={(e) => setMarkAsHighRisk(e.target.checked)}
                  className="rounded text-red-600 focus:ring-red-500 w-4 h-4"
                />
                <span className="text-xs font-medium text-gray-800 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-red-500" /> Flag High Risk
                </span>
              </label>
            </div>

            {/* Forwarding Section */}
            <div className="pt-2 border-t border-gray-200">
              <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                <Forward className="w-3.5 h-3.5 text-accent-600" />
                <span>Forward to Email Addresses (Optional, comma-separated)</span>
              </label>
              <input
                type="text"
                value={forwardToInput}
                onChange={(e) => setForwardToInput(e.target.value)}
                placeholder="e.g. accounting@company.com, alert@ops.io"
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-accent-500 focus:border-accent-500 bg-white"
              />
            </div>

            {/* Stop processing subsequent rules */}
            <div className="pt-2 border-t border-gray-200">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={stopProcessing}
                  onChange={(e) => setStopProcessing(e.target.checked)}
                  className="rounded text-accent-600 focus:ring-accent-500 w-4 h-4"
                />
                <span className="text-xs text-gray-700">
                  Stop evaluating subsequent rules if this rule matches
                </span>
              </label>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded text-accent-600 focus:ring-accent-500 w-4 h-4"
              />
              <span className="text-xs font-semibold text-gray-800">Rule is Active</span>
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-medium text-white bg-accent-600 rounded-lg hover:bg-accent-700 disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>{initialRule?.id ? 'Update Rule' : 'Create Rule'}</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
