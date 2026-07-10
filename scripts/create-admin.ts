import { prisma } from '../src/lib/db/prisma';
import bcrypt from 'bcryptjs';

async function main() {
  const email = 'info@itcg.ca';
  const password = '905I-techt';
  
  // Hash the password
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  // Check if user already exists
  let user = await prisma.user.findUnique({ where: { email } });
  
  if (user) {
    console.log(`User ${email} already exists. Updating password...`);
    user = await prisma.user.update({
      where: { email },
      data: { passwordHash }
    });
    console.log('Password updated successfully.');
  } else {
    console.log(`Creating new user ${email}...`);
    user = await prisma.user.create({
      data: {
        email,
        name: 'ITCG Admin', // You can change this later
        passwordHash,
      },
    });
    console.log('User created successfully.');
  }

  // Ensure the user belongs to an organization (required by the app structure)
  // Let's check if they already have any memberships
  const memberships = await prisma.organizationMember.findMany({
    where: { userId: user.id }
  });

  if (memberships.length === 0) {
    console.log('Creating a default organization for the admin...');
    const orgSlug = 'itcg-admin-org';
    
    // Check if the org slug already exists
    let org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
    
    if (!org) {
      org = await prisma.organization.create({
        data: {
          name: 'ITCG Admin Workspace',
          slug: orgSlug,
          members: {
            create: {
              userId: user.id,
              role: 'admin',
            },
          },
        },
      });
      console.log(`Organization "${org.name}" created and user assigned as admin.`);
    } else {
      // Org exists, just add the user as admin
      await prisma.organizationMember.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          role: 'admin',
        }
      });
      console.log(`Added user as admin to existing organization "${org.name}".`);
    }
  } else {
    console.log('User already belongs to an organization.');
  }

  console.log('\n--- Done ---');
  console.log(`Admin account ready to use: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
