/**
 * Admin Seed Script
 * 
 * Run with: DATABASE_URL="..." npx tsx prisma/seed-admin.ts
 * Or: npx dotenv -e .env.test -- npx tsx prisma/seed-admin.ts
 * 
 * This script sets specific users as admins for testing purposes.
 */

import { prisma } from '../src/infrastructure/auth/index.js';

const ADMIN_EMAILS = [
  'lukaszpodlipskikontakt@example.com',
  // Add more admin emails as needed
];

async function main() {
  console.log('Setting up admin users...');
  
  for (const email of ADMIN_EMAILS) {
    try {
      const updatedUser = await prisma.user.update({
        where: { email },
        data: { role: 'ADMIN' },
        select: { id: true, email: true, role: true }
      });
      console.log(`✓ Set ${email} as ${updatedUser.role}`);
    } catch (error) {
      console.error(`✗ Failed to update ${email}:`, error);
    }
  }
  
  console.log('\nAdmin setup complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());