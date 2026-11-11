import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { hash } from 'bcryptjs';
import { prisma } from '../src/lib/db/prisma';

const DEMO_PASSWORD = 'DemoPass123!';
const DEMO_ORGANIZATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DEMO_USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const demoAccounts = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    label: 'Tao’s Inbox',
    emailAddress: 'tao@demo.mailhub.test',
    color: '#4F46E5',
    avatarInitials: 'TI',
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    label: 'Northstar Studio',
    emailAddress: 'team@northstar.mailhub.test',
    color: '#0F766E',
    avatarInitials: 'NS',
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    label: 'Orders & Receipts',
    emailAddress: 'orders@demo.mailhub.test',
    color: '#C2410C',
    avatarInitials: 'OR',
  },
] as const;

const demoEmails = [
  {
    accountId: demoAccounts[0].id,
    messageId: '<agreement-signed@northstar.mailhub.test>',
    folder: 'INBOX',
    subject:
      'Agreement signed: Northstar Developer Program License Agreement — Enterprise Services Addendum and Team Authorization Update',
    snippet: 'The Northstar team has signed the updated developer program agreement.',
    fromAddress: 'developer@northstar.mailhub.test',
    fromName: 'Northstar Developer Relations',
    isRead: false,
    isStarred: true,
    receivedAt: new Date('2026-11-10T14:32:00.000Z'),
    bodyText: 'Hello Tao,\n\nThe Northstar team has signed the updated developer program agreement. A copy is ready for your records.\n\nBest,\nNorthstar Developer Relations',
    bodyHtml: '<div style="max-width:720px;margin:0 auto;font-family:Arial,sans-serif;color:#172033"><div style="font-size:13px;color:#64748b">NORTHSTAR DEVELOPER PROGRAM</div><h1 style="font-size:24px;margin:28px 0 20px">Agreement signed</h1><p>Hello Tao,</p><p>The Northstar team has signed the updated developer program agreement. A copy is ready for your records.</p><p style="margin-top:32px">Best,<br>Northstar Developer Relations</p><div style="margin-top:40px;padding:18px;background:#f8fafc;color:#64748b;font-size:12px">This is a synthetic message included with MailHub development demo data.</div></div>',
  },
  {
    accountId: demoAccounts[0].id,
    messageId: '<design-review@northstar.mailhub.test>',
    folder: 'INBOX',
    subject: 'Design review notes and next steps',
    snippet: 'Thanks for the thoughtful review. Here are the next steps we agreed on.',
    fromAddress: 'maya@northstar.mailhub.test',
    fromName: 'Maya Chen',
    isRead: false,
    isStarred: false,
    receivedAt: new Date('2026-11-10T12:10:00.000Z'),
    bodyText: 'Hi Tao,\n\nThanks for the thoughtful review. I captured the decisions and next steps below.\n\n1. Keep the inbox toolbar compact.\n2. Confirm the narrow-screen layout.\n3. Share the updated prototype on Friday.\n\nThanks,\nMaya',
    bodyHtml: '<div style="max-width:720px;margin:0 auto;font-family:Arial,sans-serif;color:#172033"><p>Hi Tao,</p><p>Thanks for the thoughtful review. I captured the decisions and next steps below.</p><ol><li>Keep the inbox toolbar compact.</li><li>Confirm the narrow-screen layout.</li><li>Share the updated prototype on Friday.</li></ol><p>Thanks,<br>Maya</p></div>',
  },
  {
    accountId: demoAccounts[1].id,
    messageId: '<release-checklist@northstar.mailhub.test>',
    folder: 'INBOX',
    subject: 'Release checklist for the November build',
    snippet: 'The build is ready for final review. Please check the attached release notes.',
    fromAddress: 'release@northstar.mailhub.test',
    fromName: 'Northstar Release Team',
    isRead: true,
    isStarred: true,
    receivedAt: new Date('2026-11-09T16:45:00.000Z'),
    bodyText: 'Hello team,\n\nThe build is ready for final review. Please check the release notes and reply with any blockers by Thursday.\n\nNorthstar Release Team',
    bodyHtml: '<div style="max-width:720px;margin:0 auto;font-family:Arial,sans-serif;color:#172033"><h2>November build</h2><p>The build is ready for final review. Please check the release notes and reply with any blockers by Thursday.</p><p>Northstar Release Team</p></div>',
  },
  {
    accountId: demoAccounts[1].id,
    messageId: '<weekly-planning@northstar.mailhub.test>',
    folder: 'INBOX',
    subject: 'Weekly planning: product, design, and engineering',
    snippet: 'Our weekly planning session is Thursday at 10:00 AM.',
    fromAddress: 'maya@northstar.mailhub.test',
    fromName: 'Maya Chen',
    isRead: false,
    isStarred: false,
    receivedAt: new Date('2026-11-09T11:20:00.000Z'),
    bodyText: 'Hi everyone,\n\nOur weekly planning session is Thursday at 10:00 AM. Please add agenda items to the shared document before the meeting.\n\nMaya',
    bodyHtml: '<div style="max-width:720px;margin:0 auto;font-family:Arial,sans-serif;color:#172033"><p>Hi everyone,</p><p>Our weekly planning session is Thursday at 10:00 AM. Please add agenda items to the shared document before the meeting.</p><p>Maya</p></div>',
  },
  {
    accountId: demoAccounts[2].id,
    messageId: '<receipt-10482@shop.mailhub.test>',
    folder: 'INBOX',
    subject: 'Your receipt for order #10482',
    snippet: 'Your order is confirmed. We’ll send a tracking link when it ships.',
    fromAddress: 'receipts@shop.mailhub.test',
    fromName: 'Field & Form Supply',
    isRead: true,
    isStarred: false,
    receivedAt: new Date('2026-11-08T18:05:00.000Z'),
    bodyText: 'Thanks for your order, Tao.\n\nOrder #10482\nNotebook set — $24.00\nShipping — $4.00\nTotal — $28.00\n\nWe’ll send a tracking link when it ships.',
    bodyHtml: '<div style="max-width:720px;margin:0 auto;font-family:Arial,sans-serif;color:#172033"><h2>Thanks for your order, Tao.</h2><p>Order #10482</p><table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">Notebook set</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right">$24.00</td></tr><tr><td style="padding:8px">Shipping</td><td style="padding:8px;text-align:right">$4.00</td></tr><tr><th style="padding:8px;text-align:left">Total</th><th style="padding:8px;text-align:right">$28.00</th></tr></table><p>We’ll send a tracking link when it ships.</p></div>',
  },
  {
    accountId: demoAccounts[2].id,
    messageId: '<shipment-notice@shop.mailhub.test>',
    folder: 'INBOX',
    subject: 'Your order is on the way',
    snippet: 'Your Field & Form Supply order is on its way and should arrive Friday.',
    fromAddress: 'shipping@shop.mailhub.test',
    fromName: 'Field & Form Supply',
    isRead: false,
    isStarred: false,
    receivedAt: new Date('2026-11-08T09:15:00.000Z'),
    bodyText: 'Good news, Tao. Your order is on its way and should arrive Friday.\n\nTracking: DEMO-10482\n\nField & Form Supply',
    bodyHtml: '<div style="max-width:720px;margin:0 auto;font-family:Arial,sans-serif;color:#172033"><p>Good news, Tao. Your order is on its way and should arrive Friday.</p><p><strong>Tracking:</strong> DEMO-10482</p><p>Field &amp; Form Supply</p></div>',
  },
] as const;

function assertDevelopmentDatabase() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo data cannot be seeded when NODE_ENV=production.');
  }

  if (existsSync(resolve(process.cwd(), '.env'))) {
    throw new Error(
      'Demo seeding is disabled while .env exists. The app will use the real database configured there.'
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Set DATABASE_URL in .env.local to a local development database before seeding.');
  }

  const hostname = new URL(databaseUrl).hostname.replace(/^\[|\]$/g, '');
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error(`Demo seeding is restricted to loopback databases; got host "${hostname}".`);
  }
}

async function main() {
  assertDevelopmentDatabase();

  const passwordHash = await hash(DEMO_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: 'admin@demo.mailhub.test' },
    update: { name: 'Tao Demo', passwordHash },
    create: {
      id: DEMO_USER_ID,
      email: 'admin@demo.mailhub.test',
      name: 'Tao Demo',
      passwordHash,
    },
  });

  const organization = await prisma.organization.upsert({
    where: { slug: 'mailhub-demo' },
    update: { name: 'MailHub Demo Workspace' },
    create: {
      id: DEMO_ORGANIZATION_ID,
      name: 'MailHub Demo Workspace',
      slug: 'mailhub-demo',
    },
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: { organizationId: organization.id, userId: user.id },
    },
    update: { role: 'admin' },
    create: { organizationId: organization.id, userId: user.id, role: 'admin' },
  });

  const accounts = [];
  for (const account of demoAccounts) {
    const savedAccount = await prisma.emailAccount.upsert({
      where: {
        organizationId_emailAddress: {
          organizationId: organization.id,
          emailAddress: account.emailAddress,
        },
      },
      update: {
        label: account.label,
        color: account.color,
        avatarInitials: account.avatarInitials,
        isActive: false,
      },
      create: {
        id: account.id,
        organizationId: organization.id,
        ownerUserId: user.id,
        label: account.label,
        emailAddress: account.emailAddress,
        provider: 'imap',
        color: account.color,
        avatarInitials: account.avatarInitials,
        isActive: false,
      },
    });
    accounts.push(savedAccount);

    await prisma.memberEmailAccountAccess.upsert({
      where: {
        organizationId_userId_accountId: {
          organizationId: organization.id,
          userId: user.id,
          accountId: savedAccount.id,
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        userId: user.id,
        accountId: savedAccount.id,
      },
    });
  }

  const label = await prisma.label.upsert({
    where: { organizationId_name: { organizationId: organization.id, name: 'Demo Follow-up' } },
    update: { color: '#7C3AED' },
    create: {
      organizationId: organization.id,
      name: 'Demo Follow-up',
      color: '#7C3AED',
      description: 'Synthetic label for the MailHub development demo.',
    },
  });

  await prisma.accountLabel.upsert({
    where: { accountId_labelId: { accountId: accounts[0].id, labelId: label.id } },
    update: {},
    create: { accountId: accounts[0].id, labelId: label.id },
  });

  for (const demoEmail of demoEmails) {
    const email = await prisma.email.upsert({
      where: {
        accountId_messageId: {
          accountId: demoEmail.accountId,
          messageId: demoEmail.messageId,
        },
      },
      update: {
        folder: demoEmail.folder,
        subject: demoEmail.subject,
        snippet: demoEmail.snippet,
        fromAddress: demoEmail.fromAddress,
        fromName: demoEmail.fromName,
        toAddresses: [{ name: 'Tao Demo', address: demoAccounts[0].emailAddress }],
        isRead: demoEmail.isRead,
        isStarred: demoEmail.isStarred,
        receivedAt: demoEmail.receivedAt,
      },
      create: {
        accountId: demoEmail.accountId,
        messageId: demoEmail.messageId,
        folder: demoEmail.folder,
        subject: demoEmail.subject,
        snippet: demoEmail.snippet,
        fromAddress: demoEmail.fromAddress,
        fromName: demoEmail.fromName,
        toAddresses: [{ name: 'Tao Demo', address: demoAccounts[0].emailAddress }],
        isRead: demoEmail.isRead,
        isStarred: demoEmail.isStarred,
        receivedAt: demoEmail.receivedAt,
      },
    });

    await prisma.emailBody.upsert({
      where: { emailId: email.id },
      update: { bodyText: demoEmail.bodyText, bodyHtml: demoEmail.bodyHtml },
      create: { emailId: email.id, bodyText: demoEmail.bodyText, bodyHtml: demoEmail.bodyHtml },
    });

    if (demoEmail.accountId === demoAccounts[0].id) {
      await prisma.emailLabel.upsert({
        where: { emailId_labelId: { emailId: email.id, labelId: label.id } },
        update: {},
        create: { emailId: email.id, labelId: label.id },
      });
    }
  }

  console.log('Seeded MailHub development demo data.');
  console.log('Login: admin@demo.mailhub.test / DemoPass123!');
  console.log('Demo accounts are inactive and contain no external mail-server credentials.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
