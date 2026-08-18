jest.mock('@/lib/auth/middleware', () => ({
  authenticate: jest.fn(),
  requireAdmin: jest.fn(),
  apiResponse: (data: unknown, status = 200) =>
    Response.json(data, { status }),
  apiError: (message: string, status = 400) =>
    Response.json({ error: message }, { status }),
}));

jest.mock('@/lib/accounts/service', () => {
  const actual = jest.requireActual('@/lib/accounts/service');
  return {
    ...actual,
    createAccount: jest.fn(),
  };
});

jest.mock('@/lib/queue/client', () => ({
  syncQueue: {
    add: jest.fn(),
  },
}));

import type { NextRequest } from 'next/server';
import { POST } from '@/app/api/accounts/route';
import { authenticate } from '@/lib/auth/middleware';
import { createAccount } from '@/lib/accounts/service';
import { syncQueue } from '@/lib/queue/client';

const mockAuthenticate = authenticate as jest.Mock;
const mockCreateAccount = createAccount as jest.Mock;
const mockQueueAdd = syncQueue.add as jest.Mock;

function createRequest(body: Record<string, unknown>): NextRequest {
  return new Request('http://localhost/api/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe('POST /api/accounts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows members to create accounts and queues sync after persistence resolves', async () => {
    mockAuthenticate.mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });

    let notifyCreateCalled: (() => void) | undefined;
    const createCalled = new Promise<void>((resolve) => {
      notifyCreateCalled = resolve;
    });
    let resolveCreate: ((value: unknown) => void) | undefined;
    const createdAccount = {
      id: 'account-1',
      organizationId: 'org-1',
      ownerUserId: 'member-1',
      label: 'Support',
      emailAddress: 'support@example.com',
      provider: 'imap',
    };

    mockCreateAccount.mockImplementation(
      () =>
        new Promise((resolve) => {
          notifyCreateCalled?.();
          resolveCreate = resolve;
        })
    );
    mockQueueAdd.mockResolvedValue(undefined);

    const body = {
      label: 'Support',
      emailAddress: 'Support@Example.com',
      provider: 'imap',
      imapHost: 'imap.example.com',
      imapPort: 993,
      imapSecure: true,
      smtpHost: 'smtp.example.com',
      smtpPort: 465,
      smtpSecure: true,
      username: 'Support@Example.com',
      password: 'secret',
    };

    const responsePromise = POST(createRequest(body));
    await createCalled;

    expect(mockCreateAccount).toHaveBeenCalledWith('org-1', 'member-1', {
      ...body,
      emailAddress: 'support@example.com',
    });
    expect(mockQueueAdd).not.toHaveBeenCalled();

    resolveCreate?.(createdAccount);

    const response = await responsePromise;
    expect(response.status).toBe(201);
    expect(mockQueueAdd).toHaveBeenCalledWith('initial-sync', {
      accountId: 'account-1',
      folder: 'ALL',
    });

    const responseBody = await response.json();
    expect(responseBody).not.toHaveProperty('ownerUserId');
  });
});
