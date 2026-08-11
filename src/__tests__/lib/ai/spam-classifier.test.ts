import {
  tokenizeEmail,
  classifySpam,
  recordSpamTrainingSample,
  exportGenericSpamDataset,
  importGenericSpamDataset,
  resetSpamModelToDefault,
  getSpamModelStats,
} from '@/lib/ai/spam-classifier';

describe('Spam Classifier & Portable Trainer', () => {
  beforeEach(() => {
    resetSpamModelToDefault();
  });

  describe('tokenizeEmail', () => {
    it('extracts normalized tokens, financial symbols, and domain features', () => {
      const tokens = tokenizeEmail(
        'URGENT: Claim your $5,000,000 prize now!!!',
        'Congratulations! Click here to transfer funds.',
        'lottery@winner-prize.xyz'
      );

      expect(tokens).toContain('urgent');
      expect(tokens).toContain('claim');
      expect(tokens).toContain('prize');
      expect(tokens).toContain('$5000000');
      expect(tokens).toContain('transfer');
      expect(tokens).toContain('domain:winner-prize.xyz');
    });

    it('handles empty or missing parameters gracefully', () => {
      const tokens = tokenizeEmail('', undefined, null);
      expect(Array.isArray(tokens)).toBe(true);
      expect(tokens.length).toBe(0);
    });
  });

  describe('classifySpam & online training', () => {
    it('classifies obvious default spam patterns with high spam probability', () => {
      const result = classifySpam(
        'Win $1,000,000 cash lottery prize now',
        'Click here to claim wire transfer bitcoin payout',
        'spammer@phish-crypto-winner.xyz'
      );

      expect(result.score).toBeGreaterThan(0.7);
      expect(result.isSpam).toBe(true);
      expect(result.topSpamTriggers.length).toBeGreaterThan(0);
      expect(result.reason).toBeDefined();
    });

    it('classifies normal work emails as safe (low spam probability)', () => {
      const result = classifySpam(
        'Sprint planning and architecture review meeting',
        'Hi team, please find attached the agenda for our sprint standup today.',
        'alice@company.com'
      );

      expect(result.score).toBeLessThan(0.4);
      expect(result.isSpam).toBe(false);
    });

    it('dynamically adapts predictions when user labels emails (continuous learning)', () => {
      const unusualSubject = 'Nebula X99 quantum widget deployment';
      const unusualSnippet = 'Deploying the zorph cluster node today';
      const sender = 'zorph@custom-vendor.org';

      // Initial prediction before training
      const initial = classifySpam(unusualSubject, unusualSnippet, sender);

      // User marks as definite spam multiple times
      recordSpamTrainingSample({
        label: 'spam',
        subject: unusualSubject,
        snippet: unusualSnippet,
        fromAddress: sender,
      });
      recordSpamTrainingSample({
        label: 'spam',
        subject: 'Another zorph cluster notification',
        snippet: 'Click zorph widget link',
        fromAddress: sender,
      });

      const afterSpamTraining = classifySpam(unusualSubject, unusualSnippet, sender);
      expect(afterSpamTraining.score).toBeGreaterThan(initial.score);

      // Now user marks similar as safe (corrects false positive)
      for (let i = 0; i < 5; i++) {
        recordSpamTrainingSample({
          label: 'ham',
          subject: 'Legitimate zorph cluster update',
          snippet: 'Zorph engineering reports all clear',
          fromAddress: sender,
        });
      }

      const afterHamTraining = classifySpam(unusualSubject, unusualSnippet, sender);
      expect(afterHamTraining.score).toBeLessThan(afterSpamTraining.score);
    });
  });

  describe('Portable Generic Dataset Export & Import', () => {
    it('exports a complete, environment-agnostic generic JSON dataset', () => {
      recordSpamTrainingSample({
        label: 'spam',
        subject: 'Export test spam',
        snippet: 'Sample spam snippet',
        fromAddress: 'bad@exporter.com',
      });

      const dataset = exportGenericSpamDataset();
      expect(dataset.version).toBe('1.0');
      expect(typeof dataset.exportedAt).toBe('string');
      expect(dataset.stats.totalSpam).toBeGreaterThan(0);
      expect(Array.isArray(dataset.samples)).toBe(true);
      expect(dataset.modelState.tokenSpamCounts).toBeDefined();
      expect(dataset.modelState.domainScores).toBeDefined();
    });

    it('imports a generic JSON dataset from another environment and restores model state', () => {
      const customDataset = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        stats: { totalSpam: 50, totalHam: 50, vocabularySize: 5 },
        samples: [
          {
            id: 'sample-1',
            label: 'spam' as const,
            fromAddress: 'alien@martian-deals.com',
            fromDomain: 'martian-deals.com',
            subject: 'Martian crystals for sale',
            snippet: 'Buy martian crystals with galactic credits',
            tokens: ['martian', 'crystals', 'credits', 'domain:martian-deals.com'],
            createdAt: new Date().toISOString(),
          },
        ],
        modelState: {
          spamCount: 50,
          hamCount: 50,
          tokenSpamCounts: { martian: 45, crystals: 40 },
          tokenHamCounts: { martian: 1, crystals: 0 },
          domainScores: { 'martian-deals.com': 0.99 },
        },
      };

      const result = importGenericSpamDataset(customDataset);
      expect(result.success).toBe(true);

      const prediction = classifySpam('Buy martian crystals', 'Special deals', 'alien@martian-deals.com');
      expect(prediction.isSpam).toBe(true);
      expect(prediction.score).toBeGreaterThan(0.8);
      expect(prediction.topSpamTriggers).toContain('martian');
    });

    it('returns model statistics and top detected tokens', () => {
      const stats = getSpamModelStats();
      expect(stats.totalSpam).toBeGreaterThanOrEqual(0);
      expect(stats.totalHam).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(stats.topSpamKeywords)).toBe(true);
    });
  });
});
