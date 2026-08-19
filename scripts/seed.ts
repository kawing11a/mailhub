import { prisma } from '../src/lib/db/prisma';
import { seedAccountsWithOwnerAccess } from '../src/lib/accounts/seed';
import { v4 as uuidv4 } from 'uuid';
import { faker } from '@faker-js/faker';

async function main() {
  console.log('Clearing old data...');
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();

  console.log('Seeding organization and user...');
  const user = await prisma.user.create({
    data: {
      email: 'admin@mailhub.local',
      name: 'Admin User',
      passwordHash: 'dummy_hash',
    },
  });

  const org = await prisma.organization.create({
    data: {
      name: 'Test Org',
      slug: 'test-org',
      members: {
        create: {
          userId: user.id,
          role: 'admin',
        },
      },
    },
  });

  console.log('Seeding 100 accounts...');
  const accounts = [];
  for (let i = 0; i < 100; i++) {
    accounts.push({
      id: uuidv4(),
      organizationId: org.id,
      ownerUserId: user.id,
      label: faker.company.name(),
      emailAddress: faker.internet.email(),
      provider: 'imap',
      color: faker.color.rgb(),
      avatarInitials: faker.string.alpha(2).toUpperCase(),
      isActive: true,
      imapHost: 'imap.example.com',
      imapPort: 993,
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      workerPartition: i % 2 === 0 ? 'worker-1' : 'worker-2',
    });
  }

  await seedAccountsWithOwnerAccess(prisma, accounts);

  console.log('Seeding 10,000 emails (100 per account)...');
  const CHUNK_SIZE = 1000;
  let emails = [];
  
  for (const account of accounts) {
    for (let i = 0; i < 100; i++) {
      emails.push({
        id: uuidv4(),
        accountId: account.id,
        messageId: `<${uuidv4()}@mail.example.com>`,
        folder: Math.random() > 0.2 ? 'INBOX' : 'SENT',
        subject: faker.hacker.phrase(),
        snippet: faker.lorem.sentence(),
        fromAddress: faker.internet.email(),
        fromName: faker.person.fullName(),
        isRead: Math.random() > 0.5,
        isStarred: Math.random() > 0.9,
        receivedAt: faker.date.recent({ days: 30 }),
      });
      
      if (emails.length >= CHUNK_SIZE) {
        await prisma.email.createMany({ data: emails });
        emails = [];
      }
    }
  }
  
  if (emails.length > 0) {
    await prisma.email.createMany({ data: emails });
  }

  console.log('Seeding complete! 100 Accounts and 10,000 Emails created.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
