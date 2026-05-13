import { prisma } from './src/infrastructure/auth/index.js';

async function main() {
  const userEmail = 'lukaszpodlipskikontakt@example.com';
  
  const updatedUser = await prisma.user.update({
    where: { email: userEmail },
    data: { role: 'ADMIN' },
    select: { id: true, email: true, role: true }
  });
  
  console.log('User updated:', updatedUser);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
