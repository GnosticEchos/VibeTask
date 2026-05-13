/**
 * Restore script using psql \copy (client-side)
 * Works around PostgreSQL server file access restrictions
 *
 * Run with: npx tsx prisma/psql-restore.ts
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/kanban_rewrite';
const DUMP_DIR = path.join(process.cwd(), 'prisma', 'DATADUMP');

function psql(sql: string) {
  console.log(`  Executing: ${sql.substring(0, 60)}...`);
  try {
    execSync(`psql "${DB_URL}" -c "${sql.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
  } catch (e: any) {
    console.error(`  Error: ${e.message}`);
    throw e;
  }
}

function copyFrom(table: string, file: string, columns: string[]) {
  const cols = columns.join(', ');
  const filePath = path.join(DUMP_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.log(`  ${file} not found, skipping`);
    return;
  }
  const count = countLines(filePath) - 1;
  console.log(`  Loading ${count} rows from ${file}...`);
  try {
    execSync(`psql "${DB_URL}" -c "\\copy ${table} (${cols}) FROM '${filePath}' WITH (FORMAT csv, HEADER true, NULL '')"`, { stdio: 'pipe' });
  } catch (e: any) {
    console.error(`  Error: ${e.message}`);
    throw e;
  }
}

function countLines(file: string): number {
  return fs.readFileSync(file, 'utf-8').split('\n').length;
}

async function main() {
  console.log('Starting psql restore...\n');

  console.log('Clearing existing data...');
  try {
    execSync(`psql "${DB_URL}" -c 'TRUNCATE "TaskDocumentLink", "ProjectDocument", "TaskLog", "TaskComment", "Task", "ProjectColumn", "ProjectUser", "Project", "User" CASCADE'`, { stdio: 'pipe' });
  } catch (e: any) {
    if (!e.message.includes('neither data nor foreign-key constraints')) {
      console.error(`  Clear error: ${e.message}`);
    }
  }
  console.log('Cleared\n');

  console.log('Restoring users...');
  copyFrom('"User"', 'users.csv', ['id', 'email', 'name', 'surname', 'avatarUrl', 'role', 'createdAt', 'updatedAt']);

  console.log('Restoring projects...');
  copyFrom('"Project"', 'projects.csv', ['id', 'name', 'description', 'prefix', 'ownerId', 'createdAt', 'updatedAt']);

  console.log('Restoring project columns...');
  copyFrom('"ProjectColumn"', 'project_columns.csv', ['id', 'name', 'projectId', '"order"', 'color', 'type', 'description', 'createdAt', 'updatedAt']);
  psql(`UPDATE "ProjectColumn" SET "roleType" = 'STANDARD'::"ColumnType" WHERE "roleType" IS NULL`);

  console.log('Restoring project memberships...');
  copyFrom('"ProjectUser"', 'project_users.csv', ['id', '"userId"', '"projectId"', 'role', 'createdAt', 'updatedAt']);

  console.log('Restoring tasks...');
  copyFrom('"Task"', 'tasks.csv', ['id', 'name', 'description', '"createdById"', '"assigneeId"', '"projectId"', '"projectColumnId"', '"order"', 'identifier', '"relationMode"', '"relationId"', 'createdAt', 'updatedAt']);

  console.log('Restoring task comments...');
  copyFrom('"TaskComment"', 'task_comments.csv', ['id', '"taskId"', '"userId"', 'content', 'createdAt', 'updatedAt']);

  console.log('Restoring task logs...');
  copyFrom('"TaskLog"', 'task_logs.csv', ['id', '"taskId"', '"userId"', 'text', 'createdAt', 'updatedAt']);

  console.log('Restoring project documents...');
  copyFrom('"ProjectDocument"', 'project_documents.csv', ['id', '"projectId"', 'title', 'content', '"docType"', 'version', '"createdById"', 'createdAt', 'updatedAt']);

  const linksFile = path.join(DUMP_DIR, 'task_document_links.csv');
  if (fs.existsSync(linksFile) && fs.readFileSync(linksFile, 'utf-8').trim()) {
    console.log('Restoring task document links...');
    copyFrom('"TaskDocumentLink"', 'task_document_links.csv', ['id', '"projectId"', '"taskId"', '"documentId"', 'role', '"pinnedVersion"', 'createdAt', '"createdBy"']);
  } else {
    console.log('task_document_links.csv empty or missing, skipping');
  }

  console.log('\nSetting default passwords...');
  const HASH = '95e21e2717da27e0b70c7a4bca082805:ca8efd7d992e51534f76a62a4801e9fed87a48f9f741e31fd805dabf4fce1abcc4cfd35085a5a1f9f76a859edbdc275189cbd13b84f3ba358eeca41bbd927d65';
  psql(`UPDATE "User" SET password = '${HASH}' WHERE password IS NULL`);

  console.log('\nCreating Better Auth Account records...');
  psql(`INSERT INTO "Account" ("userId", "accountId", "providerId", "password", "createdAt", "updatedAt")
        SELECT id, id::text, 'credential', '${HASH}', NOW(), NOW()
        FROM "User"
        ON CONFLICT ("providerId", "accountId") DO NOTHING`);

  console.log('\nVerifying row counts...');
  const result = execSync(`psql "${DB_URL}" -t -c "
    SELECT 'User' as tbl, COUNT(*) as cnt FROM \"User\"
    UNION ALL SELECT 'Project', COUNT(*) FROM \"Project\"
    UNION ALL SELECT 'ProjectColumn', COUNT(*) FROM \"ProjectColumn\"
    UNION ALL SELECT 'ProjectUser', COUNT(*) FROM \"ProjectUser\"
    UNION ALL SELECT 'Task', COUNT(*) FROM \"Task\"
    UNION ALL SELECT 'TaskComment', COUNT(*) FROM \"TaskComment\"
    UNION ALL SELECT 'TaskLog', COUNT(*) FROM \"TaskLog\"
    UNION ALL SELECT 'ProjectDocument', COUNT(*) FROM \"ProjectDocument\"
    UNION ALL SELECT 'TaskDocumentLink', COUNT(*) FROM \"TaskDocumentLink\"
    ORDER BY tbl
  "`, { stdio: 'pipe' }).toString();
  console.log('\nFinal row counts:');
  console.log(result);

  console.log('\n✅ Restore complete!');
  console.log('All users can login with: <email> / admin1234');
}

main().catch(e => {
  console.error('Restore failed:', e.message);
  process.exit(1);
});
