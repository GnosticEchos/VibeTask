/**
 * Dump Database to CSV
 * 
 * Exports current database state to CSV files in prisma/DATADUMP/
 * for use with restore-from-dump.ts
 * 
 * Run with: npx tsx prisma/dump-db.ts
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../src/infrastructure/auth/index.js';

const DUMP_DIR = path.join(process.cwd(), 'prisma', 'DATADUMP');

// Ensure dump directory exists
if (!fs.existsSync(DUMP_DIR)) {
  fs.mkdirSync(DUMP_DIR, { recursive: true });
}

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function row(values: Record<string, unknown>[]): string {
  return values.map(v => escapeCSV(v)).join(',');
}

async function dumpTable(tableName: string, records: Record<string, unknown>[]) {
  if (records.length === 0) {
    console.log(`  ${tableName}: no records, skipping`);
    return;
  }
  const headers = Object.keys(records[0]);
  const lines = [
    headers.join(','),
    ...records.map(r => headers.map(h => escapeCSV(r[h])).join(',')),
  ];
  const filePath = path.join(DUMP_DIR, `${tableName}.csv`);
  fs.writeFileSync(filePath, lines.join('\n') + '\n');
  console.log(`  ${tableName}: ${records.length} rows -> ${path.basename(filePath)}`);
}

async function main() {
  console.log('Dumping database to CSV...\n');

  console.log('Users:');
  const users = await prisma.user.findMany({ orderBy: { id: 'asc' } });
  await dumpTable('users', users.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name ?? '',
    surname: u.surname ?? '',
    avatarUrl: u.avatarUrl ?? '',
    role: u.role,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  })));

  console.log('\nProjects:');
  const projects = await prisma.project.findMany({ orderBy: { id: 'asc' } });
  await dumpTable('projects', projects.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description ?? '',
    prefix: p.prefix,
    ownerId: p.ownerId,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  })));

  console.log('\nProject Columns:');
  const columns = await prisma.projectColumn.findMany({ orderBy: { id: 'asc' } });
  await dumpTable('project_columns', columns.map(c => ({
    id: c.id,
    name: c.name,
    projectId: c.projectId,
    "order": c.order,
    color: c.color ?? '',
    type: c.type ?? '',
    roleType: c.roleType ?? '',
    description: c.description ?? '',
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  })));

  console.log('\nProject Users (memberships):');
  const projectUsers = await prisma.projectUser.findMany({ orderBy: { id: 'asc' } });
  await dumpTable('project_users', projectUsers.map(pu => ({
    id: pu.id,
    userId: pu.userId,
    projectId: pu.projectId,
    role: pu.role,
    createdAt: pu.createdAt.toISOString(),
    updatedAt: pu.updatedAt.toISOString(),
  })));

  console.log('\nTasks:');
  const tasks = await prisma.task.findMany({ orderBy: { id: 'asc' } });
  await dumpTable('tasks', tasks.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description ?? '',
    projectId: t.projectId,
    projectColumnId: t.projectColumnId ?? '',
    assigneeId: t.assigneeId ?? '',
    createdById: t.createdById,
    "order": t.order,
    identifier: t.identifier,
    relationMode: t.relationMode ?? '',
    relationId: t.relationId ?? '',
    parentId: t.parentId ?? '',
    isContainer: t.isContainer ?? false,
    planAccepted: t.planAccepted ?? false,
    subBoardOutlineColor: t.subBoardOutlineColor ?? '',
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  })));

  console.log('\nTask Comments:');
  const comments = await prisma.taskComment.findMany({ orderBy: { id: 'asc' } });
  await dumpTable('task_comments', comments.map(c => ({
    id: c.id,
    taskId: c.taskId,
    userId: c.userId,
    content: c.content ?? '',
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  })));

  console.log('\nTask Logs:');
  const logs = await prisma.taskLog.findMany({ orderBy: { id: 'asc' } });
  await dumpTable('task_logs', logs.map(l => ({
    id: l.id,
    taskId: l.taskId,
    userId: l.userId,
    text: l.text ?? '',
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  })));

  console.log('\nProject Documents:');
  const docs = await prisma.projectDocument.findMany({ orderBy: { id: 'asc' } });
  await dumpTable('project_documents', docs.map(d => ({
    id: d.id,
    projectId: d.projectId,
    title: d.title,
    content: d.content ?? '',
    docType: d.docType,
    version: d.version,
    createdById: d.createdById,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  })));

  console.log('\nTask Document Links:');
  const links = await prisma.taskDocumentLink.findMany({ orderBy: { id: 'asc' } });
  await dumpTable('task_document_links', links.map(l => ({
    id: l.id,
    projectId: l.projectId,
    taskId: l.taskId,
    documentId: l.documentId,
    role: l.role ?? '',
    pinnedVersion: l.pinnedVersion ?? '',
    createdAt: l.createdAt.toISOString(),
    createdBy: l.createdBy ?? '',
  })));

  console.log('\n✅ Dump complete! Files written to prisma/DATADUMP/');
  console.log('\nTo use as new seed, run: npm run db:seed-from-dump');
}

main()
  .catch((e) => {
    console.error('Dump failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
