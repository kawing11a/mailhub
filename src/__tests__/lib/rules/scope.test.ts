import {
  buildRuleScopePayload,
  getRuleScopeMode,
  validateRuleScopeSelection,
} from '@/lib/rules/scope';

describe('rule scope helpers', () => {
  it('infers label mode when accountLabelId is set', () => {
    expect(
      getRuleScopeMode({
        accountId: null,
        accountLabelId: 'label-1',
      })
    ).toBe('label');
  });

  it('prefers label mode when both scope fields are populated', () => {
    expect(
      getRuleScopeMode({
        accountId: 'account-1',
        accountLabelId: 'label-1',
      })
    ).toBe('label');
  });

  it('builds a label-scoped payload without copying account IDs', () => {
    expect(buildRuleScopePayload('label', null, 'label-1')).toEqual({
      accountId: null,
      accountLabelId: 'label-1',
    });
  });

  it('builds all-account and specific-account payloads', () => {
    expect(buildRuleScopePayload('all', null, null)).toEqual({
      accountId: null,
      accountLabelId: null,
    });
    expect(buildRuleScopePayload('account', 'account-1', null)).toEqual({
      accountId: 'account-1',
      accountLabelId: null,
    });
  });

  it('rejects specific scope modes when no option is selected', () => {
    expect(validateRuleScopeSelection('account', null, null)).toBe(
      'Please select an account for this rule scope'
    );
    expect(validateRuleScopeSelection('label', null, null)).toBe(
      'Please select an account label for this rule scope'
    );
    expect(validateRuleScopeSelection('all', null, null)).toBeNull();
  });
});
