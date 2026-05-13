/**
 * pg-copy based restore script
 * Uses PostgreSQL COPY with temp tables to handle:
 * 1. Multiline CSV content
 * 2. Column order mismatches between CSV and DB
 * 3. Missing columns with defaults
 * 4. Proper enum casting
 *
 * Run with: npx tsx prisma/pg-restore.ts
 */
import 'dotenv/config';
import { Client } from 'pg';
import * as path from 'path';
import * as fs from 'fs';

const DUMP_DIR = '/tmp';
const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/kanban_rewrite';

async function clearTables(client: Client) {
  console.log('Clearing existing data...');
  await client.query(`TRUNCATE "TaskDocumentLink", "ProjectDocument", "TaskLog", "TaskComment", "Task", "ProjectColumn", "ProjectUser", "Project", "User" CASCADE`);
  console.log('Cleared\n');
}

async function restoreUsers(client: Client): Promise<void> {
  console.log('Restoring users...');
  const filePath = path.join(DUMP_DIR, 'users.csv');
  if (!fs.existsSync(filePath)) { console.log('  users.csv not found'); return; }

  await client.query(`
    CREATE TEMP TABLE users_csv (
      id int,
      email text,
      name text,
      surname text,
      avatarUrl text,
      role text,
      createdAt timestamptz,
      updatedAt timestamptz
    )
  `);
  await client.query(`COPY users_csv FROM '${filePath}' WITH (FORMAT csv, HEADER true, NULL '')`);

  const result = await client.query(`SELECT COUNT(*) FROM users_csv`);
  console.log(`  Loaded ${result.rows[0].count} user rows from CSV`);

  await client.query(`
    INSERT INTO "User" (id, email, name, surname, avatarUrl, role, createdAt, updatedAt)
    SELECT id::int, email, name, NULLIF(surname, '')::text, NULLIF(avatarUrl, '')::text,
           role::"UserRole", createdAt, updatedAt
    FROM users_csv
  `);

  const inserted = await client.query(`SELECT COUNT(*) FROM "User"`);
  console.log(`  Inserted ${inserted.rows[0].count} users`);
  await client.query(`DROP TABLE users_csv`);
}

async function restoreProjects(client: Client): Promise<void> {
  console.log('Restoring projects...');
  const filePath = path.join(DUMP_DIR, 'projects.csv');
  if (!fs.existsSync(filePath)) { console.log('  projects.csv not found'); return; }

  await client.query(`
    CREATE TEMP TABLE projects_csv (
      id int,
      name text,
      description text,
      prefix text,
      ownerId int,
      createdAt timestamptz,
      updatedAt timestamptz
    )
  `);
  await client.query(`COPY projects_csv FROM '${filePath}' WITH (FORMAT csv, HEADER true, NULL '')`);

  await client.query(`
    INSERT INTO "Project" (id, name, description, prefix, ownerId, createdAt, updatedAt)
    SELECT id, name, NULLIF(description, '')::text, prefix, ownerId, createdAt, updatedAt
    FROM projects_csv
  `);

  const inserted = await client.query(`SELECT COUNT(*) FROM "Project"`);
  console.log(`  Inserted ${inserted.rows[0].count} projects`);
  await client.query(`DROP TABLE projects_csv`);
}

async function restoreProjectColumns(client: Client): Promise<void> {
  console.log('Restoring project columns...');
  const filePath = path.join(DUMP_DIR, 'project_columns.csv');
  if (!fs.existsSync(filePath)) { console.log('  project_columns.csv not found'); return; }

  await client.query(`
    CREATE TEMP TABLE cols_csv (
      id int,
      name text,
      projectId int,
      "order" int,
      color text,
      type text,
      description text,
      createdAt timestamptz,
      updatedAt timestamptz
    )
  `);
  await client.query(`COPY cols_csv FROM '${filePath}' WITH (FORMAT csv, HEADER true, NULL '')`);

  await client.query(`
    INSERT INTO "ProjectColumn" (id, name, projectId, "order", color, type, description, createdAt, updatedAt, "roleType")
    SELECT id, name, "projectId", "order", NULLIF(color, '')::text,
           NULLIF(type, '')::text, NULLIF(description, '')::text,
           "createdAt", "updatedAt", 'STANDARD'::"ColumnType"
    FROM cols_csv
  `);

  const inserted = await client.query(`SELECT COUNT(*) FROM "ProjectColumn"`);
  console.log(`  Inserted ${inserted.rows[0].count} columns`);
  await client.query(`DROP TABLE cols_csv`);
}

async function restoreProjectUsers(client: Client): Promise<void> {
  console.log('Restoring project memberships...');
  const filePath = path.join(DUMP_DIR, 'project_users.csv');
  if (!fs.existsSync(filePath)) { console.log('  project_users.csv not found'); return; }

  await client.query(`
    CREATE TEMP TABLE pu_csv (
      id int,
      userId int,
      projectId int,
      role text,
      createdAt timestamptz,
      updatedAt timestamptz
    )
  `);
  await client.query(`COPY pu_csv FROM '${filePath}' WITH (FORMAT csv, HEADER true, NULL '')`);

  await client.query(`
    INSERT INTO "ProjectUser" (id, userId, projectId, role, createdAt, updatedAt)
    SELECT id, "userId", "projectId", role, "createdAt", "updatedAt"
    FROM pu_csv
  `);

  const inserted = await client.query(`SELECT COUNT(*) FROM "ProjectUser"`);
  console.log(`  Inserted ${inserted.rows[0].count} memberships`);
  await client.query(`DROP TABLE pu_csv`);
}

async function restoreTasks(client: Client): Promise<void> {
  console.log('Restoring tasks...');
  const filePath = path.join(DUMP_DIR, 'tasks.csv');
  if (!fs.existsSync(filePath)) { console.log('  tasks.csv not found'); return; }

  await client.query(`
    CREATE TEMP TABLE tasks_csv (
      id int,
      name text,
      description text,
      createdById int,
      assigneeId int,
      projectId int,
      projectColumnId int,
      "order" int,
      identifier text,
      relationMode text,
      relationId int,
      createdAt timestamptz,
      updatedAt timestamptz
    )
  `);
  await client.query(`COPY tasks_csv FROM '${filePath}' WITH (FORMAT csv, HEADER true, NULL '')`);

  await client.query(`
    INSERT INTO "Task" (id, name, description, "createdById", "assigneeId", "projectId", "projectColumnId", "order", identifier, "relationMode", "relationId", "createdAt", "updatedAt")
    SELECT id, name, NULLIF(description, '')::text, "createdById",
           NULLIF("assigneeId"::text, '')::int,
           "projectId", NULLIF("projectColumnId"::text, '')::int,
           "order", identifier,
           NULLIF("relationMode", '')::text,
           NULLIF("relationId"::text, '')::int,
           "createdAt", "updatedAt"
    FROM tasks_csv
  `);

  const inserted = await client.query(`SELECT COUNT(*) FROM "Task"`);
  console.log(`  Inserted ${inserted.rows[0].count} tasks`);
  await client.query(`DROP TABLE tasks_csv`);
}

async function restoreTaskComments(client: Client): Promise<void> {
  console.log('Restoring task comments...');
  const filePath = path.join(DUMP_DIR, 'task_comments.csv');
  if (!fs.existsSync(filePath)) { console.log('  task_comments.csv not found'); return; }

  await client.query(`
    CREATE TEMP TABLE comments_csv (
      id int,
      taskId int,
      userId int,
      content text,
      createdAt timestamptz,
      updatedAt timestamptz
    )
  `);
  await client.query(`COPY comments_csv FROM '${filePath}' WITH (FORMAT csv, HEADER true, NULL '')`);

  await client.query(`
    INSERT INTO "TaskComment" (id, "taskId", "userId", content, "createdAt", "updatedAt")
    SELECT id, "taskId", "userId", NULLIF(content, '')::text, "createdAt", "updatedAt"
    FROM comments_csv
  `);

  const inserted = await client.query(`SELECT COUNT(*) FROM "TaskComment"`);
  console.log(`  Inserted ${inserted.rows[0].count} comments`);
  await client.query(`DROP TABLE comments_csv`);
}

async function restoreTaskLogs(client: Client): Promise<void> {
  console.log('Restoring task logs...');
  const filePath = path.join(DUMP_DIR, 'task_logs.csv');
  if (!fs.existsSync(filePath)) { console.log('  task_logs.csv not found'); return; }

  await client.query(`
    CREATE TEMP TABLE logs_csv (
      id int,
      taskId int,
      userId int,
      text text,
      createdAt timestamptz,
      updatedAt timestamptz
    )
  `);
  await client.query(`COPY logs_csv FROM '${filePath}' WITH (FORMAT csv, HEADER true, NULL '')`);

  await client.query(`
    INSERT INTO "TaskLog" (id, "taskId", "userId", text, "createdAt", "updatedAt")
    SELECT id, "taskId", "userId", NULLIF(text, '')::text, "createdAt", "updatedAt"
    FROM logs_csv
  `);

  const inserted = await client.query(`SELECT COUNT(*) FROM "TaskLog"`);
  console.log(`  Inserted ${inserted.rows[0].count} logs`);
  await client.query(`DROP TABLE logs_csv`);
}

async function restoreProjectDocuments(client: Client): Promise<void> {
  console.log('Restoring project documents...');
  const filePath = path.join(DUMP_DIR, 'project_documents.csv');
  if (!fs.existsSync(filePath)) { console.log('  project_documents.csv not found'); return; }

  await client.query(`
    CREATE TEMP TABLE docs_csv (
      id int,
      projectId int,
      title text,
      content text,
      docType text,
      version int,
      createdById int,
      createdAt timestamptz,
      updatedAt timestamptz
    )
  `);
  await client.query(`COPY docs_csv FROM '${filePath}' WITH (FORMAT csv, HEADER true, NULL '')`);

  await client.query(`
    INSERT INTO "ProjectDocument" (id, "projectId", title, content, "docType", version, "createdById", "createdAt", "updatedAt")
    SELECT id, "projectId", title, content, "docType"::"DocType", version, "createdById", "createdAt", "updatedAt"
    FROM docs_csv
  `);

  const inserted = await client.query(`SELECT COUNT(*) FROM "ProjectDocument"`);
  console.log(`  Inserted ${inserted.rows[0].count} documents`);
  await client.query(`DROP TABLE docs_csv`);
}

async function restoreTaskDocumentLinks(client: Client): Promise<void> {
  console.log('Restoring task document links...');
  const filePath = path.join(DUMP_DIR, 'task_document_links.csv');
  if (!fs.existsSync(filePath)) { console.log('  task_document_links.csv not found, skipping'); return; }

  const content = fs.readFileSync(filePath, 'utf-8').trim();
  if (!content) { console.log('  task_document_links.csv is empty, skipping'); return; }

  await client.query(`
    CREATE TEMP TABLE links_csv (
      id int,
      projectId int,
      taskId int,
      documentId int,
      role text,
      pinnedVersion int,
      createdAt timestamptz,
      createdBy int
    )
  `);
  await client.query(`COPY links_csv FROM '${filePath}' WITH (FORMAT csv, HEADER true, NULL '')`);

  await client.query(`
    INSERT INTO "TaskDocumentLink" (id, "projectId", "taskId", "documentId", role, "pinnedVersion", "createdAt", "createdBy")
    SELECT id, "projectId", "taskId", "documentId",
           NULLIF(role, '')::"DocLinkRole",
           NULLIF("pinnedVersion"::text, '')::int,
           "createdAt", NULLIF("createdBy"::text, '')::int
    FROM links_csv
  `);

  const inserted = await client.query(`SELECT COUNT(*) FROM "TaskDocumentLink"`);
  console.log(`  Inserted ${inserted.rows[0].count} links`);
  await client.query(`DROP TABLE links_csv`);
}

async function setPasswords(client: Client) {
  console.log('\nSetting default password for all users...');
  const BETTER_AUTH_HASH = '95e21e2717da27e0b70c7a4bca082805:ca8efd7d992e51534f76a62a4801e9fed87a48f9f741e31fd805dabf4fce1abcc4cfd35085a5a1f9f76a859edbdc275189cbd13b84f3ba358eeca41bbd927d65';
  await client.query(`
    UPDATE "User" SET password = '${BETTER_AUTH_HASH}' WHERE password IS NULL
  `);
  console.log('Password set (admin1234)');
}

async function createAccountRecords(client: Client) {
  console.log('\nCreating Better Auth Account records...');
  await client.query(`
    INSERT INTO "Account" ("userId", "accountId", "providerId", "password", "createdAt", "updatedAt")
    SELECT id, id::text, 'credential', '${'95e21e2717da27e0b70c7a4bca082805:ca8efd7d992e51534f76a62a4801e9fed87a48f9f741e31fd805dabf4fce1abcc4cfd35085a5a1f9f76a859edbdc275189cbd13b84f3ba358eeca41bbd927d65'}', NOW(), NOW()
    FROM "User"
    ON CONFLICT ("providerId", "accountId") DO NOTHING
  `);
  const count = await client.query(`SELECT COUNT(*) FROM "Account"`);
  console.log(`Created ${count.rows[0].count} Account records`);
}

async function main() {
  console.log('Starting pg-copy restore...\n');

  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
    await clearTables(client);
    await restoreUsers(client);
    await restoreProjects(client);
    await restoreProjectColumns(client);
    await restoreProjectUsers(client);
    await restoreTasks(client);
    await restoreTaskComments(client);
    await restoreTaskLogs(client);
    await restoreProjectDocuments(client);
    await restoreTaskDocumentLinks(client);
    await setPasswords(client);
    await createAccountRecords(client);

    console.log('\n✅ Restore complete!');

    const counts = await client.query(`
      SELECT 'User' as tbl, COUNT(*) as cnt FROM "User"
      UNION ALL SELECT 'Project', COUNT(*) FROM "Project"
      UNION ALL SELECT 'ProjectColumn', COUNT(*) FROM "ProjectColumn"
      UNION ALL SELECT 'ProjectUser', COUNT(*) FROM "ProjectUser"
      UNION ALL SELECT 'Task', COUNT(*) FROM "Task"
      UNION ALL SELECT 'TaskComment', COUNT(*) FROM "TaskComment"
      UNION ALL SELECT 'TaskLog', COUNT(*) FROM "TaskLog"
      UNION ALL SELECT 'ProjectDocument', COUNT(*) FROM "ProjectDocument"
      UNION ALL SELECT 'TaskDocumentLink', COUNT(*) FROM "TaskDocumentLink"
      ORDER BY tbl
    `);
    console.log('\nFinal row counts:');
    counts.rows.forEach(r => console.log(`  ${r.tbl}: ${r.cnt}`));

  } finally {
    await client.end();
  }
}

main().catch(e => {
  console.error('Restore failed:', e);
  process.exit(1);
});
