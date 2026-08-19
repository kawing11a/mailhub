jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    emailAccount: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/crypto', () => ({
  decrypt: jest.fn(() => 'secret'),
  encrypt: jest.fn(),
}));

jest.mock('@/lib/network/outbound-host', () => ({
  resolveSafeOutboundHost: jest.fn(),
}));

jest.mock('imapflow', () => ({ ImapFlow: jest.fn() }));
jest.mock('@/lib/redis', () => ({ redis: { publish: jest.fn() } }));
jest.mock('@/lib/queue/client', () => ({ searchQueue: { add: jest.fn() } }));
jest.mock('@/lib/ai/spam-checker', () => ({ checkIsHighRisk: jest.fn() }));
jest.mock('@/lib/rules/engine', () => ({ processRulesForNewEmail: jest.fn() }));

import { imapManager, withImapConnection } from '@/lib/imap/connection-manager';
import { prisma } from '@/lib/db/prisma';
import { resolveSafeOutboundHost } from '@/lib/network/outbound-host';
import { ImapFlow } from 'imapflow';

const unsafeAccount = {
  id: 'account-1',
  organizationId: 'org-1',
  emailAddress: 'user@example.com',
  provider: 'imap',
  imapHost: 'imap.internal',
  imapPort: 993,
  imapSecure: true,
  username: 'user@example.com',
  passwordEncrypted: 'encrypted',
  oauthAccessToken: null,
  oauthRefreshToken: null,
  oauthTokenExpiry: null,
  oauthProvider: null,
};

describe('IMAP worker connection SSRF guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (resolveSafeOutboundHost as jest.Mock).mockRejectedValue(
      new Error('imap.internal resolves to a non-public address')
    );
  });

  it('blocks short-lived provider connections before constructing ImapFlow', async () => {
    (prisma.emailAccount.findUnique as jest.Mock).mockResolvedValue(unsafeAccount);

    await expect(
      withImapConnection('account-1', async () => 'never')
    ).resolves.toBeNull();
    expect(ImapFlow).not.toHaveBeenCalled();
  });

  it('blocks pooled worker initialization before constructing ImapFlow', async () => {
    await expect(imapManager.initializeAccount(unsafeAccount as any)).rejects.toThrow(
      'resolves to a non-public address'
    );
    expect(ImapFlow).not.toHaveBeenCalled();
  });
});
