import type { Prisma, PrismaClient } from '@prisma/client';

type SeedAccountRecord = Prisma.EmailAccountCreateManyInput & {
  id: string;
  organizationId: string;
  ownerUserId: string;
};

type SeedAccountAccessClient = Pick<
  PrismaClient,
  'emailAccount' | 'memberEmailAccountAccess' | '$transaction'
>;

export async function seedAccountsWithOwnerAccess(
  client: SeedAccountAccessClient,
  accounts: SeedAccountRecord[]
) {
  await client.$transaction([
    client.emailAccount.createMany({ data: accounts }),
    client.memberEmailAccountAccess.createMany({
      data: accounts.map(({ id, organizationId, ownerUserId }) => ({
        organizationId,
        userId: ownerUserId,
        accountId: id,
      })),
    }),
  ]);
}
