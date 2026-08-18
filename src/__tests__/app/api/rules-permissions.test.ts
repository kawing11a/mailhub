jest.mock('@/lib/auth/middleware', () => ({
  authenticate: jest.fn(),
  requireAdmin: jest.fn(),
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
  },
}));

jest.mock('@/lib/rules/engine', () => ({
  evaluateRule: jest.fn(),
  applyRuleActions: jest.fn(),
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
import { authenticate, requireAdmin } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';
import { applyRuleActions, evaluateRule } from '@/lib/rules/engine';

const mockAuthenticate = authenticate as jest.Mock;
const mockRequireAdmin = requireAdmin as jest.Mock;
const mockRule = prisma.emailRule as {
  findMany: jest.Mock;
  findFirst: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
};
const mockAccount = prisma.emailAccount as {
  findFirst: jest.Mock;
  findMany: jest.Mock;
};
const mockEmail = prisma.email as {
  findMany: jest.Mock;
  update: jest.Mock;
};
const mockEvaluateRule = evaluateRule as jest.Mock;
const mockApplyRuleActions = applyRuleActions as jest.Mock;

function createForbiddenResponse() {
  return Response.json({ error: 'Admin access required' }, { status: 403 });
}

function createRequestWithJsonSpy() {
  const json = jest.fn();
  return {
    request: { json } as unknown as NextRequest,
    json,
  };
}

describe('Rules API admin permissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticate.mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });
    mockRequireAdmin.mockReturnValue(createForbiddenResponse());
  });

  it('blocks GET /api/rules before querying rules', async () => {
    const response = await getRules({} as NextRequest);

    expect(response.status).toBe(403);
    expect(mockRequireAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'member' })
    );
    expect(mockRule.findMany).not.toHaveBeenCalled();
  });

  it('blocks POST /api/rules before parsing the body or touching the database', async () => {
    const { request, json } = createRequestWithJsonSpy();

    const response = await createRule(request);

    expect(response.status).toBe(403);
    expect(json).not.toHaveBeenCalled();
    expect(mockRule.create).not.toHaveBeenCalled();
    expect(mockAccount.findFirst).not.toHaveBeenCalled();
  });

  it('blocks GET /api/rules/[id] before loading a rule', async () => {
    const response = await getRule({} as NextRequest, {
      params: Promise.resolve({ id: 'rule-1' }),
    });

    expect(response.status).toBe(403);
    expect(mockRule.findFirst).not.toHaveBeenCalled();
  });

  it('blocks PUT /api/rules/[id] before parsing the body or mutating data', async () => {
    const { request, json } = createRequestWithJsonSpy();

    const response = await updateRule(request, {
      params: Promise.resolve({ id: 'rule-1' }),
    });

    expect(response.status).toBe(403);
    expect(json).not.toHaveBeenCalled();
    expect(mockRule.findFirst).not.toHaveBeenCalled();
    expect(mockRule.update).not.toHaveBeenCalled();
    expect(mockAccount.findFirst).not.toHaveBeenCalled();
  });

  it('blocks DELETE /api/rules/[id] before deleting data', async () => {
    const response = await deleteRule({} as NextRequest, {
      params: Promise.resolve({ id: 'rule-1' }),
    });

    expect(response.status).toBe(403);
    expect(mockRule.findFirst).not.toHaveBeenCalled();
    expect(mockRule.delete).not.toHaveBeenCalled();
  });

  it('blocks POST /api/rules/[id]/run before reading rules, emails, or applying actions', async () => {
    const response = await runRule({} as NextRequest, {
      params: Promise.resolve({ id: 'rule-1' }),
    });

    expect(response.status).toBe(403);
    expect(mockRule.findFirst).not.toHaveBeenCalled();
    expect(mockAccount.findMany).not.toHaveBeenCalled();
    expect(mockEmail.findMany).not.toHaveBeenCalled();
    expect(mockApplyRuleActions).not.toHaveBeenCalled();
  });

  it('blocks POST /api/rules/test before parsing the body or evaluating a rule', async () => {
    const { request, json } = createRequestWithJsonSpy();

    const response = await testRule(request);

    expect(response.status).toBe(403);
    expect(json).not.toHaveBeenCalled();
    expect(mockEvaluateRule).not.toHaveBeenCalled();
  });
});
