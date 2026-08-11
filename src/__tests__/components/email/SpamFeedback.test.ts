import { SpamSettingsTab } from '@/components/settings/SpamSettingsTab';
import { EmailViewer } from '@/components/email/EmailViewer';

describe('Spam Feedback & Settings UI Components', () => {
  it('exports SpamSettingsTab component function', () => {
    expect(typeof SpamSettingsTab).toBe('function');
  });

  it('exports EmailViewer component function', () => {
    expect(typeof EmailViewer).toBe('function');
  });
});
