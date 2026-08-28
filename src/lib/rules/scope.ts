import { EmailRuleDefinition } from './types';

export type RuleScopeMode = 'all' | 'account' | 'label';

type RuleScopeFields = Pick<EmailRuleDefinition, 'accountId' | 'accountLabelId'>;

export function getRuleScopeMode(rule: RuleScopeFields): RuleScopeMode {
  if (rule.accountLabelId) {
    return 'label';
  }

  if (rule.accountId) {
    return 'account';
  }

  return 'all';
}

export function buildRuleScopePayload(
  mode: RuleScopeMode,
  accountId: string | null,
  accountLabelId: string | null
): RuleScopeFields {
  if (mode === 'label') {
    return {
      accountId: null,
      accountLabelId,
    };
  }

  if (mode === 'account') {
    return {
      accountId,
      accountLabelId: null,
    };
  }

  return {
    accountId: null,
    accountLabelId: null,
  };
}

export function validateRuleScopeSelection(
  mode: RuleScopeMode,
  accountId: string | null,
  accountLabelId: string | null
): string | null {
  if (mode === 'account' && !accountId) {
    return 'Please select an account for this rule scope';
  }

  if (mode === 'label' && !accountLabelId) {
    return 'Please select an account label for this rule scope';
  }

  return null;
}
