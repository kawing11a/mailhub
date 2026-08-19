jest.mock('@/lib/auth/middleware', () => ({
  authenticate: jest.fn(),
  requireAdmin: jest.fn((auth: { role: string }) =>
    auth.role !== 'admin'
      ? Response.json({ error: 'Admin access required' }, { status: 403 })
      : null
  ),
  apiResponse: (data: unknown, status = 200) => Response.json(data, { status }),
  apiError: (message: string, status = 400) => Response.json({ error: message }, { status }),
}));

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailRule: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    emailAccount: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    email: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    emailLabel: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import type { NextRequest } from 'next/server';
import { GET as getRules, POST as createRule } from '@/app/api/rules/route';
import {
  GET as getRule,
  PUT as updateRule,
  DELETE as deleteRule,
} from '@/app/api/rules/[id]/route';
import { POST as runRule } from '@/app/api/rules/[id]/run/route';
import { POST as testRule } from '@/app/api/rules/test/route';
import { authenticate } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';

const mockAuthenticate = authenticate as jest.Mock;
const mockPrismaRule = prisma.emailRule as any;
const mockPrismaAccount = prisma.emailAccount as any;
const mockPrismaEmail = prisma.email as any;

describe('Email Rules API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticate.mockResolvedValue({
      userId: 'user-123',
      organizationId: 'org-456',
      role: 'admin',
    });
  });

  describe('GET /api/rules', () => {
    it('returns list of rules for the organization', async () => {
      mockPrismaRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          name: 'Tag Invoices',
          organizationId: 'org-456',
          priority: 0,
        },
      ]);

      const req = new Request('http://localhost/api/rules') as NextRequest;
      const res = await getRules(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.rules).toHaveLength(1);
      expect(json.rules[0].name).toBe('Tag Invoices');
    });
  });

  describe('POST /api/rules', () => {
    it('creates a new rule with valid payload', async () => {
      const payload = {
        name: 'VIP Sender',
        priority: 1,
        conditions: {
          matchType: 'ALL',
          criteria: [{ field: 'from', operator: 'contains', value: 'ceo@acme.com' }],
        },
        actions: {
          markAsStarred: true,
        },
      };

      mockPrismaRule.create.mockResolvedValue({
        id: 'rule-new-1',
        ...payload,
        organizationId: 'org-456',
      });

      const req = new Request('http://localhost/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }) as NextRequest;

      const res = await createRule(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.rule.name).toBe('VIP Sender');
      expect(mockPrismaRule.create).toHaveBeenCalled();
    });

    it('rejects payload missing criteria', async () => {
      const req = new Request('http://localhost/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Invalid Rule',
          conditions: { matchType: 'ALL', criteria: [] },
          actions: {},
        }),
      }) as NextRequest;

      const res = await createRule(req);
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/rules/[id]', () => {
    it('updates rule when found in organization', async () => {
      mockPrismaRule.findFirst.mockResolvedValue({
        id: 'rule-1',
        organizationId: 'org-456',
        name: 'Old Name',
      });

      mockPrismaRule.update.mockResolvedValue({
        id: 'rule-1',
        organizationId: 'org-456',
        name: 'New Name',
      });

      const req = new Request('http://localhost/api/rules/rule-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Name' }),
      }) as NextRequest;

      const res = await updateRule(req, { params: Promise.resolve({ id: 'rule-1' }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.rule.name).toBe('New Name');
    });
  });

  describe('DELETE /api/rules/[id]', () => {
    it('deletes rule when found', async () => {
      mockPrismaRule.findFirst.mockResolvedValue({
        id: 'rule-1',
        organizationId: 'org-456',
      });
      mockPrismaRule.delete.mockResolvedValue({ id: 'rule-1' });

      const req = new Request('http://localhost/api/rules/rule-1', {
        method: 'DELETE',
      }) as NextRequest;

      const res = await deleteRule(req, { params: Promise.resolve({ id: 'rule-1' }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe('POST /api/rules/[id]/run', () => {
    it('evaluates and applies actions to matching existing emails', async () => {
      mockPrismaRule.findFirst.mockResolvedValue({
        id: 'rule-1',
        organizationId: 'org-456',
        name: 'Tag Invoices',
        priority: 1,
        conditions: {
          matchType: 'ALL',
          criteria: [{ field: 'subject', operator: 'contains', value: 'Invoice' }],
        },
        actions: {
          markAsStarred: true,
        },
      });

      mockPrismaAccount.findMany.mockResolvedValue([{ id: 'acc-1' }]);
      mockPrismaEmail.findMany.mockResolvedValue([
        {
          id: 'email-1',
          accountId: 'acc-1',
          subject: 'Monthly Invoice',
          hasAttachments: false,
          isRead: false,
          isStarred: false,
          emailLabels: [],
          body: { bodyText: 'invoice body' },
        },
        {
          id: 'email-2',
          accountId: 'acc-1',
          subject: 'General News',
          hasAttachments: false,
          isRead: false,
          isStarred: false,
          emailLabels: [],
          body: { bodyText: 'hello' },
        },
      ]);

      const req = new Request('http://localhost/api/rules/rule-1/run', {
        method: 'POST',
      }) as NextRequest;

      const res = await runRule(req, { params: Promise.resolve({ id: 'rule-1' }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.totalEvaluated).toBe(2);
      expect(json.matchedCount).toBe(1);
      expect(json.modifiedCount).toBe(1);
      expect(mockPrismaEmail.update).toHaveBeenCalledWith({
        where: { id: 'email-1' },
        data: { isStarred: true },
      });
    });
  });

  describe('POST /api/rules/test', () => {
    it('dry runs rule against sample email', async () => {
      const req = new Request('http://localhost/api/rules/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rule: {
            conditions: {
              matchType: 'ALL',
              criteria: [{ field: 'from', operator: 'contains', value: 'alerts@github.com' }],
            },
            actions: {
              markAsRead: true,
            },
          },
          sampleEmail: {
            fromAddress: 'alerts@github.com',
            subject: 'Security alert',
          },
        }),
      }) as NextRequest;

      const res = await testRule(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.matched).toBe(true);
      expect(json.actionsToApply.markAsRead).toBe(true);
    });
  });
});
