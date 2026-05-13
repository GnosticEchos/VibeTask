import 'dotenv/config';
import { prisma } from '../src/infrastructure/auth/index.js';

async function main() {
  const projects = await prisma.project.findMany({ include: { members: true } });
  for (const p of projects) {
    console.log(`Project ${p.id} (${p.name}): ownerId=${p.ownerId}, members=[${p.members.map(m => `user${m.userId}(${m.role})`).join(', ')}]`);
  }
}

main().finally(() => prisma.$disconnect());
