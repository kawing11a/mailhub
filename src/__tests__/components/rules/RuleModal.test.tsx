import { renderToStaticMarkup } from 'react-dom/server';
import { RuleModal } from '@/components/rules/RuleModal';

describe('RuleModal component', () => {
  it('exports RuleModal React component function', () => {
    expect(typeof RuleModal).toBe('function');
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
  });
});
