import SignaturesSettingsPage from '@/app/(dashboard)/settings/signatures/page';

describe('Signatures Settings Page export', () => {
  it('exports default SignaturesSettingsPage component', () => {
    expect(typeof SignaturesSettingsPage).toBe('function');
  });
});
