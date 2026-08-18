jest.mock('@/lib/auth/middleware', () => ({
  authenticate: jest.fn(),
  requireAdmin: jest.fn(),
  apiError: (message: string, status = 400) =>
    Response.json({ error: message }, { status }),
}));

import { POST as labelPost } from '@/app/api/ai/spam/label/route';
import { GET as datasetGet, POST as datasetPost } from '@/app/api/ai/spam/dataset/route';
import { GET as statsGet, POST as statsPost } from '@/app/api/ai/spam/stats/route';
import { resetSpamModelToDefault } from '@/lib/ai/spam-classifier';
import { checkIsHighRisk } from '@/lib/ai/spam-checker';
import { authenticate, requireAdmin } from '@/lib/auth/middleware';

// Mock prisma for email status update
jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailAccount: {
      findFirst: jest.fn(),
    },
    email: {
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

import { prisma } from '@/lib/db/prisma';

const mockAuthenticate = authenticate as jest.Mock;
const mockRequireAdmin = requireAdmin as jest.Mock;
const mockFindAccount = prisma.emailAccount.findFirst as jest.Mock;
const mockFindEmail = prisma.email.findUnique as jest.Mock;

describe('AI Spam API Endpoints & Checker', () => {
  beforeEach(() => {
    resetSpamModelToDefault();
    jest.clearAllMocks();
    mockAuthenticate.mockResolvedValue({
      userId: 'admin-1',
      organizationId: 'org-1',
      role: 'admin',
    });
    mockRequireAdmin.mockReturnValue(null);
    mockFindAccount.mockResolvedValue({
      id: 'account-1',
      organizationId: 'org-1',
      ownerUserId: 'admin-1',
    });
    mockFindEmail.mockResolvedValue({ accountId: 'account-1' });
  });

  describe('POST /api/ai/spam/label', () => {
    it('returns 400 if label is missing or invalid', async () => {
      const req = new Request('http://localhost/api/ai/spam/label', {
        method: 'POST',
        body: JSON.stringify({ subject: 'Test' }),
      });
      const res = await labelPost(req);
      expect(res.status).toBe(400);
    });

    it('records spam label, updates model, and marks email in DB', async () => {
      const req = new Request('http://localhost/api/ai/spam/label', {
        method: 'POST',
        body: JSON.stringify({
          emailId: '00000000-0000-0000-0000-000000000001',
          label: 'spam',
          subject: 'Special offer crypto payout',
          snippet: 'Transfer your funds today',
          fromAddress: 'promo@crypto-spammer.com',
        }),
      });

      const res = await labelPost(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.label).toBe('spam');
      expect(json.updatedStats.totalSpam).toBeGreaterThan(0);
    });

    it('records safe (ham) label to correct false positives', async () => {
      const req = new Request('http://localhost/api/ai/spam/label', {
        method: 'POST',
        body: JSON.stringify({
          emailId: '00000000-0000-0000-0000-000000000002',
          label: 'ham',
          subject: 'Legitimate business invoice',
          snippet: 'Attached is the invoice for project deliverables',
          fromAddress: 'billing@trusted-vendor.com',
        }),
      });

      const res = await labelPost(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.label).toBe('ham');
    });
  });

  describe('GET & POST /api/ai/spam/dataset', () => {
    it('GET exports generic portable dataset JSON', async () => {
      const req = new Request('http://localhost/api/ai/spam/dataset', { method: 'GET' });
      const res = await datasetGet(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.dataset.version).toBe('1.0');
      expect(json.dataset.modelState).toBeDefined();
    });

    it('POST imports generic dataset JSON and rebuilds model', async () => {
      const sampleDataset = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        stats: { totalSpam: 10, totalHam: 10, vocabularySize: 2 },
        samples: [],
        modelState: {
          spamCount: 10,
          hamCount: 10,
          tokenSpamCounts: { 'super-scam': 9 },
          tokenHamCounts: {},
          domainScores: {},
        },
      };

      const req = new Request('http://localhost/api/ai/spam/dataset', {
        method: 'POST',
        body: JSON.stringify({ dataset: sampleDataset }),
      });

      const res = await datasetPost(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });
  });

  describe('GET & POST /api/ai/spam/stats', () => {
    it('GET returns current model stats', async () => {
      const req = new Request('http://localhost/api/ai/spam/stats', { method: 'GET' });
      const res = await statsGet(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.stats.totalSpam).toBeDefined();
    });

    it('POST with action reset resets model to default seeds', async () => {
      const req = new Request('http://localhost/api/ai/spam/stats', {
        method: 'POST',
        body: JSON.stringify({ action: 'reset' }),
      });
      const res = await statsPost(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
    });
  });

  describe('checkIsHighRisk integration', () => {
    it('uses learned Bayesian classifier to immediately detect obvious spam patterns', async () => {
      const result = await checkIsHighRisk(
        'URGENT: Claim your lottery jackpot payout',
        'Congratulations, your prize is waiting for wire transfer',
        'lottery@winner-prize.xyz'
      );

      expect(result.isHighRisk).toBe(true);
      expect(result.reason).toBeDefined();
    });

    it('identifies safe work emails without calling external LLM', async () => {
      const result = await checkIsHighRisk(
        'Sprint agenda and team discussion review',
        'Hi team, see attached calendar review for our meeting today.',
        'dev@company.com'
      );

      expect(result.isHighRisk).toBe(false);
    });
  });
});
