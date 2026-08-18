import { seedAccountsWithOwnerAccess } from '@/lib/accounts/seed';

describe('seedAccountsWithOwnerAccess', () => {
  it('creates owner access rows in the same transaction as seeded accounts', async () => {
    const emailAccountCreateMany = jest.fn().mockReturnValue('accounts-op');
    const memberAccessCreateMany = jest.fn().mockReturnValue('access-op');
    const transaction = jest.fn().mockResolvedValue(undefined);

    await seedAccountsWithOwnerAccess(
      {
        emailAccount: { createMany: emailAccountCreateMany },
        memberEmailAccountAccess: { createMany: memberAccessCreateMany },
        $transaction: transaction,
      } as never,
      [
        {
          id: 'account-1',
          organizationId: 'org-1',
          ownerUserId: 'owner-1',
          label: 'Support',
          emailAddress: 'support@example.com',
          provider: 'imap',
          color: '#10B981',
          avatarInitials: 'SU',
          isActive: true,
          imapHost: 'imap.example.com',
          imapPort: 993,
          smtpHost: 'smtp.example.com',
          smtpPort: 587,
          workerPartition: 'worker-1',
        },
      ]
    );

    expect(emailAccountCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          id: 'account-1',
          organizationId: 'org-1',
          ownerUserId: 'owner-1',
        }),
      ],
    });
    expect(memberAccessCreateMany).toHaveBeenCalledWith({
      data: [
        {
          organizationId: 'org-1',
          userId: 'owner-1',
          accountId: 'account-1',
        },
      ],
    });
    expect(transaction).toHaveBeenCalledWith(['accounts-op', 'access-op']);
  });
});
