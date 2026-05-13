/**
 * Fast document restore using pg COPY FROM file
 * Handles multiline CSV content correctly
 */
import 'dotenv/config';
import { Client } from 'pg';
import * as path from 'path';

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:sparkles@localhost:5432/kanban_rewrite',
  });
  await client.connect();

  const docsFile = path.join(process.cwd(), 'prisma', 'DATADUMP', 'project_documents.csv');
  const linksFile = path.join(process.cwd(), 'prisma', 'DATADUMP', 'task_document_links.csv');

  console.log('Restoring documents via COPY...');
  try {
    await client.query(`TRUNCATE "ProjectDocument" CASCADE`);
    // CSV cols: id,projectId,title,content,docType,version,createdById,createdAt,updatedAt
    // Create temp table with CSV column names, load, then copy to target
    await client.query(`
      CREATE TEMP TABLE doc_csv (
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
    await client.query(`COPY doc_csv FROM '${docsFile}' WITH (FORMAT csv, HEADER true, NULL '')`);
    await client.query(`
      INSERT INTO "ProjectDocument" (id,project_id,title,content,doc_type,version,created_by_id,created_at,updated_at)
      SELECT id,projectId,title,content,docType::"DocType",version,createdById,createdAt,updatedAt FROM doc_csv
      ON CONFLICT (id) DO NOTHING
    `);
    await client.query(`DROP TABLE doc_csv`);
    const res = await client.query('SELECT COUNT(*) FROM "ProjectDocument"');
    console.log(`  Documents restored: ${res.rows[0].count} rows`);
  } catch (e: any) {
    console.error(`  Documents failed: ${e.message}`);
  }

  console.log('Restoring doc-links via COPY...');
  try {
    await client.query(`TRUNCATE "TaskDocumentLink" CASCADE`);
    await client.query(`
      CREATE TEMP TABLE link_csv (
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
    await client.query(`COPY link_csv FROM '${linksFile}' WITH (FORMAT csv, HEADER true, NULL '')`);
    await client.query(`
      INSERT INTO "TaskDocumentLink" (id,project_id,task_id,document_id,role,pinned_version,created_at,created_by)
      SELECT id,projectId,taskId,documentId,role,pinnedVersion,createdAt,createdBy FROM link_csv
      ON CONFLICT (id) DO NOTHING
    `);
    await client.query(`DROP TABLE link_csv`);
    const res = await client.query('SELECT COUNT(*) FROM "TaskDocumentLink"');
    console.log(`  Doc-links restored: ${res.rows[0].count} rows`);
  } catch (e: any) {
    console.log(`  Doc-links: ${e.message}`);
  }

  await client.end();
  console.log('Done');
}

main().catch(e => { console.error(e); process.exit(1); });
