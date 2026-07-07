import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { prisma } from '../src/lib/db/prisma';

async function main() {
  console.log('Clearing dummy email accounts...');
  const result = await prisma.emailAccount.deleteMany({});
  console.log(`Successfully deleted ${result.count} email accounts and all related emails (via cascade).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
