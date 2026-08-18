import { accountAccessWhere, canManageAccountAccess, type AccountAuth } from '@/lib/accounts/access';

describe('account access helpers', () => {
  const memberAuth: AccountAuth = {
    userId: 'user-1',
    organizationId: 'org-1',
    role: 'member',
  };

  const adminAuth: AccountAuth = {
    userId: 'admin-1',
    organizationId: 'org-1',
    role: 'admin',
  };

  it('allows a member to see owned or granted accounts only within the organization', () => {
    expect(accountAccessWhere(memberAuth)).toEqual({
      organizationId: 'org-1',
      OR: [
        { ownerUserId: 'user-1' },
        { memberAccess: { some: { userId: 'user-1' } } },
      ],
    });

    expect(accountAccessWhere(memberAuth, 'account-1')).toEqual({
      id: 'account-1',
      organizationId: 'org-1',
      OR: [
        { ownerUserId: 'user-1' },
        { memberAccess: { some: { userId: 'user-1' } } },
      ],
    });
  });

  it('allows an admin to see every account in the organization without explicit access rows', () => {
    expect(accountAccessWhere(adminAuth)).toEqual({
      organizationId: 'org-1',
    });

    expect(accountAccessWhere(adminAuth, 'account-1')).toEqual({
      id: 'account-1',
      organizationId: 'org-1',
    });
  });

  it('allows same-organization admins and owners to manage account access', () => {
    expect(
      canManageAccountAccess(adminAuth, {
        organizationId: 'org-1',
        ownerUserId: 'user-1',
      })
    ).toBe(true);

    expect(
      canManageAccountAccess(memberAuth, {
        organizationId: 'org-1',
        ownerUserId: 'user-1',
      })
    ).toBe(true);
  });

  it('denies cross-organization access management even when the user id matches the owner', () => {
    expect(
      canManageAccountAccess(
        {
          userId: 'user-1',
          organizationId: 'org-2',
          role: 'admin',
        },
        {
          organizationId: 'org-1',
          ownerUserId: 'user-1',
        }
      )
    ).toBe(false);
  });
});
