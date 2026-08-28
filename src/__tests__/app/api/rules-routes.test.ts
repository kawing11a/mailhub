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
    label: {
      findFirst: jest.fn(),
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
const mockPrismaLabel = prisma.label as any;
const mockPrismaEmail = prisma.email as any;

const accountId = '11111111-1111-4111-8111-111111111111';
const accountLabelId = '22222222-2222-4222-8222-222222222222';
const otherAccountLabelId = '33333333-3333-4333-8333-333333333333';

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
          accountLabel: {
            id: accountLabelId,
            name: 'VIP',
            color: '#FF0000',
          },
        },
      ]);

      const req = new Request('http://localhost/api/rules') as NextRequest;
      const res = await getRules(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.rules).toHaveLength(1);
      expect(json.rules[0].name).toBe('Tag Invoices');
      expect(json.rules[0].accountLabel).toEqual({
        id: accountLabelId,
        name: 'VIP',
        color: '#FF0000',
      });
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

    it('accepts an organization-owned accountLabelId and persists it', async () => {
      const payload = {
        name: 'VIP Accounts',
        accountLabelId,
        conditions: {
          matchType: 'ALL',
          criteria: [{ field: 'subject', operator: 'contains', value: 'Urgent' }],
        },
        actions: {
          markAsStarred: true,
        },
      };

      mockPrismaLabel.findFirst.mockResolvedValue({
        id: accountLabelId,
        organizationId: 'org-456',
        name: 'VIP',
        color: '#FF0000',
      });
      mockPrismaRule.create.mockResolvedValue({
        id: 'rule-label-1',
        organizationId: 'org-456',
        ...payload,
        accountId: null,
        accountLabel: {
          id: accountLabelId,
          name: 'VIP',
          color: '#FF0000',
        },
      });

      const req = new Request('http://localhost/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }) as NextRequest;

      const res = await createRule(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.rule.accountLabel).toEqual({
        id: accountLabelId,
        name: 'VIP',
        color: '#FF0000',
      });
      expect(mockPrismaLabel.findFirst).toHaveBeenCalledWith({
        where: { id: accountLabelId, organizationId: 'org-456' },
      });
      expect(mockPrismaRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accountId: null,
            accountLabelId,
          }),
        })
      );
    });

    it('rejects both non-null accountId and accountLabelId', async () => {
      const req = new Request('http://localhost/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Invalid Scope',
          accountId,
          accountLabelId,
          conditions: {
            matchType: 'ALL',
            criteria: [{ field: 'subject', operator: 'contains', value: 'Invoice' }],
          },
          actions: {},
        }),
      }) as NextRequest;

      const res = await createRule(req);
      expect(res.status).toBe(400);
      expect(mockPrismaRule.create).not.toHaveBeenCalled();
    });

    it('rejects a label from another organization', async () => {
      mockPrismaLabel.findFirst.mockResolvedValue(null);

      const req = new Request('http://localhost/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Foreign Label',
          accountLabelId: otherAccountLabelId,
          conditions: {
            matchType: 'ALL',
            criteria: [{ field: 'subject', operator: 'contains', value: 'Invoice' }],
          },
          actions: {},
        }),
      }) as NextRequest;

      const res = await createRule(req);
      expect(res.status).toBe(404);
      expect(mockPrismaRule.create).not.toHaveBeenCalled();
    });

    it('accepts an empty criteria array when actions are present', async () => {
      const payload = {
        name: 'Unconditional Rule',
        conditions: {
          matchType: 'ALL',
          criteria: [],
        },
        actions: {
          markAsStarred: true,
        },
      };

      mockPrismaRule.create.mockResolvedValue({
        id: 'rule-empty-criteria-1',
        organizationId: 'org-456',
        ...payload,
      });

      const req = new Request('http://localhost/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }) as NextRequest;

      const res = await createRule(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.rule.conditions.criteria).toEqual([]);
      expect(mockPrismaRule.create).toHaveBeenCalled();
    });

    it('rejects payload missing criteria', async () => {
      const req = new Request('http://localhost/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Invalid Rule',
          conditions: { matchType: 'ALL' },
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
        accountLabel: {
          id: accountLabelId,
          name: 'VIP',
          color: '#FF0000',
        },
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
      expect(json.rule.accountLabel).toEqual({
        id: accountLabelId,
        name: 'VIP',
        color: '#FF0000',
      });
    });

    it('rejects an effective state where omitted existing scope would leave both IDs non-null', async () => {
      mockPrismaRule.findFirst.mockResolvedValue({
        id: 'rule-1',
        organizationId: 'org-456',
        accountId,
        accountLabelId: null,
      });
      mockPrismaLabel.findFirst.mockResolvedValue({
        id: accountLabelId,
        organizationId: 'org-456',
      });

      const req = new Request('http://localhost/api/rules/rule-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountLabelId }),
      }) as NextRequest;

      const res = await updateRule(req, { params: Promise.resolve({ id: 'rule-1' }) });
      expect(res.status).toBe(400);
      expect(mockPrismaRule.update).not.toHaveBeenCalled();
    });

    it('preserves omitted scope fields', async () => {
      mockPrismaRule.findFirst.mockResolvedValue({
        id: 'rule-1',
        organizationId: 'org-456',
        accountId: null,
        accountLabelId,
        name: 'Old Name',
      });
      mockPrismaRule.update.mockResolvedValue({
        id: 'rule-1',
        organizationId: 'org-456',
        name: 'Renamed',
        accountId: null,
        accountLabelId,
        accountLabel: {
          id: accountLabelId,
          name: 'VIP',
          color: '#FF0000',
        },
      });

      const req = new Request('http://localhost/api/rules/rule-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Renamed' }),
      }) as NextRequest;

      const res = await updateRule(req, { params: Promise.resolve({ id: 'rule-1' }) });
      expect(res.status).toBe(200);
      expect(mockPrismaRule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({
            accountId: expect.anything(),
            accountLabelId: expect.anything(),
          }),
        })
      );
    });

    it('allows explicit null to clear scope fields', async () => {
      mockPrismaRule.findFirst.mockResolvedValue({
        id: 'rule-1',
        organizationId: 'org-456',
        accountId: null,
        accountLabelId,
      });
      mockPrismaRule.update.mockResolvedValue({
        id: 'rule-1',
        organizationId: 'org-456',
        accountId: null,
        accountLabelId: null,
        accountLabel: null,
      });

      const req = new Request('http://localhost/api/rules/rule-1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountLabelId: null }),
      }) as NextRequest;

      const res = await updateRule(req, { params: Promise.resolve({ id: 'rule-1' }) });
      expect(res.status).toBe(200);
      expect(mockPrismaRule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accountLabelId: null,
          }),
        })
      );
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

    it('filters retroactive runs by current account labels and selects them for evaluation', async () => {
      mockPrismaRule.findFirst.mockResolvedValue({
        id: 'rule-label-1',
        organizationId: 'org-456',
        name: 'VIP Invoices',
        priority: 1,
        accountId: null,
        accountLabelId,
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
          id: 'email-label-1',
          accountId: 'acc-1',
          fromAddress: 'billing@stripe.com',
          fromName: 'Stripe',
          subject: 'VIP Invoice',
          hasAttachments: false,
          isRead: false,
          isStarred: false,
          isHighRisk: false,
          emailLabels: [],
          account: {
            accountLabels: [{ labelId: accountLabelId }],
          },
          body: { bodyText: 'invoice body' },
        },
      ]);

      const req = new Request('http://localhost/api/rules/rule-label-1/run', {
        method: 'POST',
      }) as NextRequest;

      const res = await runRule(req, { params: Promise.resolve({ id: 'rule-label-1' }) });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.totalEvaluated).toBe(1);
      expect(json.matchedCount).toBe(1);
      expect(json.modifiedCount).toBe(1);
      expect(mockPrismaAccount.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-456',
          accountLabels: {
            some: {
              labelId: accountLabelId,
            },
          },
        },
        select: { id: true },
      });
      expect(mockPrismaEmail.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            accountId: { in: ['acc-1'] },
          },
          select: expect.objectContaining({
            account: {
              select: {
                accountLabels: {
                  select: {
                    labelId: true,
                  },
                },
              },
            },
          }),
        })
      );
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

    it('uses sample account labels when dry running a label-scoped rule', async () => {
      const req = new Request('http://localhost/api/rules/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rule: {
            accountLabelId,
            conditions: {
              matchType: 'ALL',
              criteria: [{ field: 'subject', operator: 'contains', value: 'Security' }],
            },
            actions: {
              markAsRead: true,
            },
          },
          sampleEmail: {
            subject: 'Security alert',
            accountLabelIds: [],
          },
        }),
      }) as NextRequest;

      const res = await testRule(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.matched).toBe(false);
      expect(json.actionsToApply).toBeNull();
    });

    it('matches a dry run when criteria is empty', async () => {
      const req = new Request('http://localhost/api/rules/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rule: {
            conditions: {
              matchType: 'ALL',
              criteria: [],
            },
            actions: {
              markAsRead: true,
            },
          },
          sampleEmail: {
            subject: 'Anything at all',
          },
        }),
      }) as NextRequest;

      const res = await testRule(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.matched).toBe(true);
      expect(json.actionsToApply).toEqual({
        markAsRead: true,
      });
    });

    it('does not match a scoped dry run when criteria is empty and sample accountId is missing', async () => {
      const req = new Request('http://localhost/api/rules/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rule: {
            accountId,
            conditions: {
              matchType: 'ALL',
              criteria: [],
            },
            actions: {
              markAsRead: true,
            },
          },
          sampleEmail: {
            subject: 'Anything at all',
          },
        }),
      }) as NextRequest;

      const res = await testRule(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.matched).toBe(false);
      expect(json.actionsToApply).toBeNull();
    });
  });
});
