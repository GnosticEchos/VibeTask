import 'dotenv/config';
import { prisma } from '../src/infrastructure/auth/index.js';

async function main() {
  const tasks = await prisma.task.count();
  const cols = await prisma.projectColumn.count();
  const docs = await prisma.projectDocument.count();
  const links = await prisma.taskDocumentLink.count();
  console.log(`Tasks: ${tasks}, Columns: ${cols}, Documents: ${docs}, DocLinks: ${links}`);
}

main().finally(() => prisma.$disconnect());
