jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailAccount: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  },
}));

jest.mock('@/lib/crypto', () => ({
  encrypt: jest.fn((value: string) => `encrypted:${value}`),
}));

jest.mock('@/lib/auth/jwt', () => ({
  verifyToken: jest.fn(),
}));

jest.mock('@/lib/queue/client', () => ({
  syncQueue: {
    add: jest.fn(),
  },
}));

jest.mock('@/lib/accounts/service', () => ({
  createOwnedAccount: jest.fn(),
}));

import type { NextRequest } from 'next/server';
import { GET as googleCallback } from '@/app/api/accounts/oauth/google/callback/route';
import { GET as microsoftCallback } from '@/app/api/accounts/oauth/microsoft/callback/route';
import { prisma } from '@/lib/db/prisma';
import { encrypt } from '@/lib/crypto';
import { verifyToken } from '@/lib/auth/jwt';
import { syncQueue } from '@/lib/queue/client';
import { createOwnedAccount } from '@/lib/accounts/service';

const mockFindUnique = prisma.emailAccount.findUnique as jest.Mock;
const mockFindFirst = prisma.emailAccount.findFirst as jest.Mock;
const mockUpdate = prisma.emailAccount.update as jest.Mock;
const mockCount = prisma.emailAccount.count as jest.Mock;
const mockEncrypt = encrypt as jest.Mock;
const mockVerifyToken = verifyToken as jest.Mock;
const mockQueueAdd = syncQueue.add as jest.Mock;
const mockCreateOwnedAccount = createOwnedAccount as jest.Mock;
const fetchMock = jest.fn();

global.fetch = fetchMock as typeof fetch;

type ProviderCase = {
  name: 'google' | 'microsoft';
  callback: (req: NextRequest) => Promise<Response>;
  tokenUrl: string;
  identityUrl?: string;
  env: {
    clientId: string;
    clientSecret: string;
  };
  emailProvider: 'gmail' | 'outlook';
  oauthProvider: 'google' | 'microsoft';
};

const providerCases: ProviderCase[] = [
  {
    name: 'google',
    callback: googleCallback,
    tokenUrl: 'https://oauth2.googleapis.com/token',
    identityUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    env: {
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
    },
    emailProvider: 'gmail',
    oauthProvider: 'google',
  },
  {
    name: 'microsoft',
    callback: microsoftCallback,
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    identityUrl: 'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName',
    env: {
      clientId: 'microsoft-client-id',
      clientSecret: 'microsoft-client-secret',
    },
    emailProvider: 'outlook',
    oauthProvider: 'microsoft',
  },
];

function accountLookupMock(provider: ProviderCase) {
  return provider.name === 'microsoft' || provider.name === 'google'
    ? mockFindFirst
    : mockFindUnique;
}

function accountLookupArgs(provider: ProviderCase, emailAddress: string) {
  return provider.name === 'microsoft' || provider.name === 'google'
    ? {
        where: {
          organizationId: 'org-1',
          emailAddress: { equals: emailAddress, mode: 'insensitive' },
        },
      }
    : {
        where: {
          organizationId_emailAddress: {
            organizationId: 'org-1',
            emailAddress,
          },
        },
      };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function encodeState(overrides: Record<string, unknown> = {}): string {
  return Buffer.from(
    JSON.stringify({
      emailAddress: 'shared@example.com',
      label: 'Shared Inbox',
      organizationId: 'org-1',
      ...overrides,
    })
  ).toString('base64');
}

function createRequest(options: {
  code?: string;
  error?: string;
  stateOverrides?: Record<string, unknown>;
} = {}): NextRequest {
  const url = new URL('http://localhost/api/accounts/oauth/callback');
  if (options.code !== null) {
    url.searchParams.set('code', options.code ?? 'oauth-code');
  }
  if (options.error) {
    url.searchParams.set('error', options.error);
  }
  if (options.stateOverrides !== null) {
    url.searchParams.set('state', encodeState(options.stateOverrides));
  }

  return {
    url: url.toString(),
    cookies: {
      get(name: string) {
        return name === 'auth-token' ? { value: 'auth-token-value' } : undefined;
      },
    },
  } as NextRequest;
}

function mockSuccessfulFetches(
  provider: ProviderCase,
  emailAddress = 'shared@example.com',
  identity: Record<string, unknown> = provider.name === 'microsoft'
    ? { mail: emailAddress }
    : { email: emailAddress }
) {
  fetchMock.mockImplementation((input: string | URL | Request) => {
    const url = input.toString();

    if (url === provider.tokenUrl) {
      return Promise.resolve(
        jsonResponse({
          access_token: `${provider.name}-access-token`,
          refresh_token: `${provider.name}-refresh-token`,
          expires_in: 3600,
        })
      );
    }

    if (provider.identityUrl && url === provider.identityUrl) {
      return Promise.resolve(jsonResponse(identity));
    }

    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

describe.each(providerCases)('$name OAuth callback ownership', (provider) => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindUnique.mockReset();
    mockFindFirst.mockReset();
    mockUpdate.mockReset();
    mockCount.mockReset();
    mockVerifyToken.mockReset();
    mockQueueAdd.mockReset();
    mockCreateOwnedAccount.mockReset();
    fetchMock.mockReset();
    mockEncrypt.mockImplementation((value: string) => `encrypted:${value}`);

    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost';
    process.env.GOOGLE_CLIENT_ID = 'google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';
    process.env.MICROSOFT_CLIENT_ID = 'microsoft-client-id';
    process.env.MICROSOFT_CLIENT_SECRET = 'microsoft-client-secret';

    mockVerifyToken.mockResolvedValue({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'member',
    });
    mockCount.mockResolvedValue(0);
    mockQueueAdd.mockResolvedValue(undefined);
  });

  it('creates a new member-owned account, ignores state ownership, and queues sync only after persistence', async () => {
    accountLookupMock(provider).mockResolvedValue(null);
    mockSuccessfulFetches(provider, 'new-owner@example.com');

    let createReachedResolve!: () => void;
    const createReached = new Promise<void>((resolve) => {
      createReachedResolve = resolve;
    });
    let resolveCreate!: (account: { id: string }) => void;

    mockCreateOwnedAccount.mockImplementation(
      () =>
        new Promise((resolve) => {
          createReachedResolve();
          resolveCreate = resolve;
        })
    );

    const responsePromise = provider.callback(
      createRequest({
        stateOverrides: {
          emailAddress: 'new-owner@example.com',
          label: 'New Owner Inbox',
          ownerUserId: 'malicious-owner',
        },
      })
    );

    await createReached;

    expect(accountLookupMock(provider)).toHaveBeenCalledWith(
      accountLookupArgs(provider, 'new-owner@example.com')
    );
    expect(mockCreateOwnedAccount).toHaveBeenCalledWith(
      'org-1',
      'member-1',
      expect.objectContaining({
        label: 'New Owner Inbox',
        emailAddress: 'new-owner@example.com',
        provider: provider.emailProvider,
        oauthProvider: provider.oauthProvider,
        oauthAccessToken: `encrypted:${provider.name}-access-token`,
        oauthRefreshToken: `encrypted:${provider.name}-refresh-token`,
        passwordEncrypted: null,
      })
    );
    expect(mockQueueAdd).not.toHaveBeenCalled();

    resolveCreate({ id: 'account-new' });

    const response = await responsePromise;
    expect(response.headers.get('location')).toBe(
      'http://localhost/settings/accounts?success=true&accountId=account-new&share=1'
    );
    expect(mockQueueAdd).toHaveBeenCalledWith('initial-sync', {
      accountId: 'account-new',
      folder: 'ALL',
    });
  });

  it('allows the owner to reauthorize an existing account and redirects without share mode', async () => {
    accountLookupMock(provider).mockResolvedValue({
      id: 'account-existing',
      organizationId: 'org-1',
      emailAddress: 'shared@example.com',
      ownerUserId: 'member-1',
      oauthRefreshToken: 'encrypted:old-refresh-token',
    });
    mockUpdate.mockResolvedValue({ id: 'account-existing' });
    mockSuccessfulFetches(provider);

    const response = await provider.callback(createRequest());

    expect(accountLookupMock(provider)).toHaveBeenCalledWith(
      accountLookupArgs(provider, 'shared@example.com')
    );
    if (provider.name === 'google') {
      expect(accountLookupMock(provider).mock.invocationCallOrder[0]).toBeLessThan(
        fetchMock.mock.invocationCallOrder[0]
      );
    } else {
      expect(fetchMock.mock.invocationCallOrder[0]).toBeLessThan(
        accountLookupMock(provider).mock.invocationCallOrder[0]
      );
    }
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'account-existing' },
      data: expect.objectContaining({
        oauthAccessToken: `encrypted:${provider.name}-access-token`,
        oauthRefreshToken: `encrypted:${provider.name}-refresh-token`,
        isActive: true,
      }),
    });
    expect(mockCreateOwnedAccount).not.toHaveBeenCalled();
    expect(mockQueueAdd).toHaveBeenCalledWith('initial-sync', {
      accountId: 'account-existing',
      folder: 'ALL',
    });
    expect(response.headers.get('location')).toBe(
      'http://localhost/settings/accounts?success=true&accountId=account-existing'
    );
  });

  it('allows an admin to reauthorize any same-organization existing account', async () => {
    mockVerifyToken.mockResolvedValue({
      userId: 'admin-1',
      organizationId: 'org-1',
      role: 'admin',
    });
    accountLookupMock(provider).mockResolvedValue({
      id: 'account-existing',
      organizationId: 'org-1',
      emailAddress: 'shared@example.com',
      ownerUserId: 'member-2',
      oauthRefreshToken: 'encrypted:old-refresh-token',
    });
    mockUpdate.mockResolvedValue({ id: 'account-existing' });
    mockSuccessfulFetches(provider);

    const response = await provider.callback(createRequest());

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'account-existing' },
      data: expect.objectContaining({
        oauthAccessToken: `encrypted:${provider.name}-access-token`,
        oauthRefreshToken: `encrypted:${provider.name}-refresh-token`,
        isActive: true,
      }),
    });
    expect(mockQueueAdd).toHaveBeenCalledWith('initial-sync', {
      accountId: 'account-existing',
      folder: 'ALL',
    });
    expect(response.headers.get('location')).toBe(
      'http://localhost/settings/accounts?success=true&accountId=account-existing'
    );
  });

  it('rejects non-owner member reauthorization before exchanging tokens or queueing sync', async () => {
    mockVerifyToken.mockResolvedValue({
      userId: 'member-2',
      organizationId: 'org-1',
      role: 'member',
    });
    accountLookupMock(provider).mockResolvedValue({
      id: 'account-existing',
      organizationId: 'org-1',
      emailAddress: 'shared@example.com',
      ownerUserId: 'member-1',
      oauthRefreshToken: 'encrypted:old-refresh-token',
    });
    mockSuccessfulFetches(provider);

    const response = await provider.callback(createRequest());

    expect(response.headers.get('location')).toBe(
      'http://localhost/settings/accounts?error=unauthorized_reauthorization'
    );
    if (provider.name === 'google') {
      expect(fetchMock).not.toHaveBeenCalled();
    } else {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreateOwnedAccount).not.toHaveBeenCalled();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  if (provider.name === 'google') {
    it('normalizes the requested mailbox before the pre-token reauthorization guard', async () => {
      mockVerifyToken.mockResolvedValue({
        userId: 'member-2',
        organizationId: 'org-1',
        role: 'member',
      });
      mockFindFirst.mockResolvedValue({
        id: 'account-existing',
        organizationId: 'org-1',
        ownerUserId: 'member-1',
        emailAddress: 'Owner@Example.com',
        oauthRefreshToken: 'encrypted:old-refresh-token',
      });

      const response = await provider.callback(
        createRequest({
          stateOverrides: {
            emailAddress: 'Owner@Example.com',
          },
        })
      );

      expect(mockFindFirst).toHaveBeenCalledWith(
        accountLookupArgs(provider, 'owner@example.com')
      );
      expect(response.headers.get('location')).toBe(
        'http://localhost/settings/accounts?error=unauthorized_reauthorization'
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockEncrypt).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockCreateOwnedAccount).not.toHaveBeenCalled();
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it('rejects callbacks without a provider-confirmed Google mailbox before credential storage', async () => {
      mockFindFirst.mockResolvedValue(null);
      mockSuccessfulFetches(provider, 'unused@example.com', {});

      const response = await provider.callback(createRequest());

      expect(response.headers.get('location')).toBe(
        'http://localhost/settings/accounts?error=provider_identity_unconfirmed'
      );
      expect(mockEncrypt).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockCreateOwnedAccount).not.toHaveBeenCalled();
      expect(mockCount).not.toHaveBeenCalled();
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it('rejects reauthorization when provider-confirmed email resolves to another users existing account', async () => {
      mockVerifyToken.mockResolvedValue({
        userId: 'member-2',
        organizationId: 'org-1',
        role: 'member',
      });
      mockFindFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'account-provider-email',
          organizationId: 'org-1',
          ownerUserId: 'member-1',
          emailAddress: 'provider-owned@example.com',
          oauthRefreshToken: 'encrypted:old-refresh-token',
        });
      mockSuccessfulFetches(provider, 'provider-owned@example.com');

      const response = await provider.callback(
        createRequest({
          stateOverrides: {
            emailAddress: 'state-email@example.com',
          },
        })
      );

      expect(mockFindFirst).toHaveBeenNthCalledWith(1, {
        where: {
          organizationId: 'org-1',
          emailAddress: { equals: 'state-email@example.com', mode: 'insensitive' },
        },
      });
      expect(mockFindFirst).toHaveBeenNthCalledWith(2, {
        where: {
          organizationId: 'org-1',
          emailAddress: { equals: 'provider-owned@example.com', mode: 'insensitive' },
        },
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(response.headers.get('location')).toBe(
        'http://localhost/settings/accounts?error=unauthorized_reauthorization'
      );
      expect(mockEncrypt).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockCreateOwnedAccount).not.toHaveBeenCalled();
      expect(mockCount).not.toHaveBeenCalled();
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it('rejects mixed-case provider-confirmed mailbox reauthorization before credential storage', async () => {
      mockVerifyToken.mockResolvedValue({
        userId: 'member-2',
        organizationId: 'org-1',
        role: 'member',
      });
      mockFindFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'account-provider-email',
          organizationId: 'org-1',
          ownerUserId: 'member-1',
          emailAddress: 'Provider-Owned@Example.COM',
          oauthRefreshToken: 'encrypted:old-refresh-token',
        });
      mockSuccessfulFetches(provider, 'unused@example.com', {
        email: 'Provider-Owned@Example.COM',
      });

      const response = await provider.callback(
        createRequest({
          stateOverrides: {
            emailAddress: 'state-email@example.com',
          },
        })
      );

      expect(mockFindFirst).toHaveBeenNthCalledWith(1, {
        where: {
          organizationId: 'org-1',
          emailAddress: { equals: 'state-email@example.com', mode: 'insensitive' },
        },
      });
      expect(mockFindFirst).toHaveBeenNthCalledWith(2, {
        where: {
          organizationId: 'org-1',
          emailAddress: { equals: 'provider-owned@example.com', mode: 'insensitive' },
        },
      });
      expect(response.headers.get('location')).toBe(
        'http://localhost/settings/accounts?error=unauthorized_reauthorization'
      );
      expect(mockEncrypt).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockCreateOwnedAccount).not.toHaveBeenCalled();
      expect(mockCount).not.toHaveBeenCalled();
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });
  }

  if (provider.name === 'microsoft') {
    it('uses the provider-confirmed normalized Graph mailbox for lookup and creation', async () => {
      accountLookupMock(provider).mockResolvedValue(null);
      mockCreateOwnedAccount.mockResolvedValue({ id: 'account-new' });
      mockSuccessfulFetches(provider, 'unused@example.com', {
        mail: null,
        userPrincipalName: 'Provider-Owned@Example.COM',
      });

      const response = await provider.callback(
        createRequest({
          stateOverrides: {
            emailAddress: 'state-email@example.com',
          },
        })
      );

      expect(accountLookupMock(provider)).toHaveBeenCalledWith(
        accountLookupArgs(provider, 'provider-owned@example.com')
      );
      expect(fetchMock).toHaveBeenNthCalledWith(2, provider.identityUrl, {
        method: 'GET',
        headers: { Authorization: 'Bearer microsoft-access-token' },
      });
      expect(mockCreateOwnedAccount).toHaveBeenCalledWith(
        'org-1',
        'member-1',
        expect.objectContaining({
          emailAddress: 'provider-owned@example.com',
        })
      );
      expect(response.headers.get('location')).toBe(
        'http://localhost/settings/accounts?success=true&accountId=account-new&share=1'
      );
    });

    it('rejects mixed-case existing mailbox reauthorization before credential storage', async () => {
      mockVerifyToken.mockResolvedValue({
        userId: 'member-2',
        organizationId: 'org-1',
        role: 'member',
      });
      accountLookupMock(provider).mockResolvedValue({
        id: 'account-provider-email',
        organizationId: 'org-1',
        ownerUserId: 'member-1',
        emailAddress: 'Provider-Owned@Example.COM',
        oauthRefreshToken: 'encrypted:old-refresh-token',
      });
      mockSuccessfulFetches(provider, 'provider-owned@example.com');

      const response = await provider.callback(
        createRequest({
          stateOverrides: {
            emailAddress: 'state-email@example.com',
          },
        })
      );

      expect(accountLookupMock(provider)).toHaveBeenCalledWith(
        accountLookupArgs(provider, 'provider-owned@example.com')
      );
      expect(response.headers.get('location')).toBe(
        'http://localhost/settings/accounts?error=unauthorized_reauthorization'
      );
      expect(mockEncrypt).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockCreateOwnedAccount).not.toHaveBeenCalled();
      expect(mockCount).not.toHaveBeenCalled();
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it('rejects callbacks without a confirmed Graph mailbox before any account lookup or storage', async () => {
      accountLookupMock(provider).mockResolvedValue(null);
      mockSuccessfulFetches(provider, 'unused@example.com', {
        mail: null,
        userPrincipalName: null,
      });

      const response = await provider.callback(createRequest());

      expect(response.headers.get('location')).toBe(
        'http://localhost/settings/accounts?error=provider_identity_unconfirmed'
      );
      expect(accountLookupMock(provider)).not.toHaveBeenCalled();
      expect(mockEncrypt).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockCreateOwnedAccount).not.toHaveBeenCalled();
      expect(mockQueueAdd).not.toHaveBeenCalled();
    });
  }
});
