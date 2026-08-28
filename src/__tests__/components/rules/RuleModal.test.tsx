import { renderToStaticMarkup } from 'react-dom/server';
import {
  cleanRuleCriteria,
  getRuleCriteriaForEdit,
  removeRuleCriterion,
  RuleModal,
} from '@/components/rules/RuleModal';

describe('RuleModal component', () => {
  it('exports RuleModal React component function', () => {
    expect(typeof RuleModal).toBe('function');
  });

  it('keeps an explicit empty criteria list when editing', () => {
    expect(
      getRuleCriteriaForEdit({
        conditions: {
          criteria: [],
        },
      })
    ).toEqual([]);
  });

  it('creates an initial editable criterion when the criteria list is missing', () => {
    expect(
      getRuleCriteriaForEdit({
        conditions: {},
      })
    ).toEqual([{ field: 'from', operator: 'contains', value: '' }]);
  });

  it('cleans a blank text criterion down to an empty list', () => {
    expect(
      cleanRuleCriteria([{ field: 'from', operator: 'contains', value: '   ' }])
    ).toEqual([]);
  });

  it('removes the final criterion and returns an empty list', () => {
    expect(removeRuleCriterion([{ field: 'from', operator: 'contains', value: '' }], 0)).toEqual(
      []
    );
  });

  it('renders all three target scope modes in the open modal', () => {
    const html = renderToStaticMarkup(
      <RuleModal
        isOpen
        onClose={() => {}}
        onSaved={() => {}}
        accounts={[
          {
            id: 'account-1',
            label: 'Support',
            emailAddress: 'support@example.com',
            color: '#2563EB',
          },
        ]}
        labels={[
          {
            id: 'label-1',
            name: 'VIP',
            color: '#7C3AED',
          },
        ]}
      />
    );

    expect(html).toContain('All Connected Accounts');
    expect(html).toContain('Specific Account');
    expect(html).toContain('Account Label');
    expect(html).toContain('title="Remove condition"');
  });

  it('renders unconditional explanatory copy and hides match logic for an existing empty rule', () => {
    const html = renderToStaticMarkup(
      <RuleModal
        isOpen
        onClose={() => {}}
        onSaved={() => {}}
        initialRule={{
          id: 'rule-1',
          name: 'Unconditional',
          conditions: {
            matchType: 'ALL',
            criteria: [],
          },
          actions: {
            markAsRead: true,
          },
        }}
        accounts={[
          {
            id: 'account-1',
            label: 'Support',
            emailAddress: 'support@example.com',
            color: '#2563EB',
          },
        ]}
        labels={[]}
      />
    );

    expect(html).toContain(
      'No email conditions: this rule applies to all incoming emails in the selected scope.'
    );
    expect(html).not.toContain('Match logic:');
  });
});
