/**
 * Fix Project Membership Gaps
 * 
 * Finds projects that exist without ProjectUser entries and adds Owner memberships
 * for the project owner. Also ensures all project owners have ProjectUser rows.
 * 
 * Run with: npx tsx prisma/fix-project-memberships.ts
 */

import 'dotenv/config';
import { prisma } from '../src/infrastructure/auth/index.js';

async function main() {
  console.log('Checking for project membership gaps...\n');

  // Find all projects
  const projects = await prisma.project.findMany({
    select: { id: true, name: true, ownerId: true },
  });

  console.log(`Found ${projects.length} projects\n`);

  const projectIds = projects.map(p => p.id);

  // Find existing memberships
  const memberships = await prisma.projectUser.findMany({
    where: { projectId: { in: projectIds } },
    select: { projectId: true, userId: true, role: true },
  });

  const membershipMap = new Map<string, { role: string; userId: number }>();
  for (const m of memberships) {
    membershipMap.set(`${m.projectId}:${m.userId}`, { role: m.role, userId: m.userId });
  }

  let added = 0;
  let checked = 0;

  for (const project of projects) {
    checked++;
    const key = `${project.id}:${project.ownerId}`;
    const existing = membershipMap.get(key);

    if (!existing) {
      console.log(`  [MISSING] Project ${project.id} (${project.name}): adding owner membership for user ${project.ownerId}`);
      try {
        await prisma.projectUser.create({
          data: {
            projectId: project.id,
            userId: project.ownerId,
            role: 'Owner',
          },
        });
        added++;
      } catch (e: any) {
        if (e?.code === 'P2002') {
          console.log(`    Already exists (race condition), skipping`);
        } else {
          console.error(`    ERROR: ${e.message}`);
        }
      }
    } else {
      console.log(`  [OK] Project ${project.id} (${project.name}): user ${project.ownerId} is ${existing.role}`);
    }
  }

  console.log(`\nDone. Added ${added} membership(s) for ${checked} project(s).\n`);
}

main()
  .catch((e) => {
    console.error('Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
