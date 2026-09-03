import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { hash } from 'bcryptjs';
import * as readline from 'readline';
import { prisma } from '../src/lib/db/prisma';
import { createOrganizationSlug } from '../src/lib/identifiers';

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

async function main() {
  console.log('--- MailHub Admin Account Creator ---');

  let email = process.argv[2] || process.env.ADMIN_EMAIL;
  let name = process.argv[3] || process.env.ADMIN_NAME;
  let password = process.argv[4] || process.env.ADMIN_PASSWORD;
  const orgName = process.argv[5] || process.env.ADMIN_ORG || 'Default Organization';

  if (!email) {
    email = await askQuestion('Enter Admin Email: ');
  }
  if (!name) {
    name = await askQuestion('Enter Admin Name: ');
  }
  if (!password) {
    password = await askQuestion('Enter Admin Password: ');
  }

  if (!email || !name || !password) {
    console.error('Error: Email, Name, and Password are required.');
    process.exit(1);
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    console.error(`Error: User with email "${email}" already exists.`);
    process.exit(1);
  }

  const passwordHash = await hash(password, 12);
  const slug = createOrganizationSlug(orgName);

  const result = await prisma.$transaction(async (tx) => {
    // Find or create organization
    let org = await tx.organization.findFirst({ where: { name: orgName } });
    if (!org) {
      org = await tx.organization.create({
        data: { name: orgName, slug },
      });
      console.log(`Created Organization: ${org.name} (${org.id})`);
    } else {
      console.log(`Using existing Organization: ${org.name} (${org.id})`);
    }

    // Create user
    const user = await tx.user.create({
      data: {
        email,
        name,
        passwordHash,
      },
    });

    // Assign admin role to organization
    await tx.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        role: 'admin',
      },
    });

    return { user, org };
  });

  console.log('\n✅ Admin account created successfully!');
  console.log(`User ID:        ${result.user.id}`);
  console.log(`Name:           ${result.user.name}`);
  console.log(`Email:          ${result.user.email}`);
  console.log(`Organization:   ${result.org.name} (${result.org.id})`);
  console.log(`Role:           admin`);
}

main()
  .catch((e) => {
    console.error('Failed to create admin user:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
