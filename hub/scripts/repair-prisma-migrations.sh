#!/usr/bin/env bash
# Repair common local _prisma_migrations drift (failed duplicate rows, checksum updates).
# Dev DBs only — review before shared/staging use.
set -euo pipefail
cd "$(dirname "$0")/.."

node --import tsx <<'NODE'
import 'dotenv/config'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import pg from 'pg'

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set (hub/.env).')
  process.exit(1)
}

const prefixPath = 'prisma/migrations/20260408004000_extend_prefix_to_10_chars/migration.sql'
const prefixChecksum = createHash('sha256').update(readFileSync(prefixPath)).digest('hex')

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

const dupes = await client.query(`
  DELETE FROM "_prisma_migrations"
  WHERE migration_name = '20260519220000_agent_lattice_and_task_assignee_api_key'
    AND finished_at IS NULL
  RETURNING migration_name
`)
if (dupes.rowCount) {
  console.log(`Removed ${dupes.rowCount} failed lattice migration row(s).`)
}

const prefix = await client.query(
  `UPDATE "_prisma_migrations"
   SET checksum = $1
   WHERE migration_name = '20260408004000_extend_prefix_to_10_chars'
     AND checksum <> $1
   RETURNING migration_name`,
  [prefixChecksum],
)
if (prefix.rowCount) {
  console.log(`Updated checksum for prefix migration (${prefixChecksum.slice(0, 12)}…).`)
}

const applied = await client.query(`
  SELECT DISTINCT migration_name
  FROM "_prisma_migrations"
  WHERE finished_at IS NOT NULL
  ORDER BY 1
`)
const dbNames = new Set(applied.rows.map((r) => r.migration_name))
const repoNames = new Set(
  readdirSync('prisma/migrations').filter((n) => n !== 'migration_lock.toml'),
)

const onlyDb = [...dbNames].filter((n) => !repoNames.has(n))
const onlyRepo = [...repoNames].filter((n) => !dbNames.has(n))

if (onlyDb.length) console.warn('Applied in DB but missing locally:', onlyDb.join(', '))
if (onlyRepo.length) console.warn('In repo but not applied in DB:', onlyRepo.join(', '))
if (!onlyDb.length && !onlyRepo.length) console.log('Repo and applied DB migrations are aligned.')

await client.end()
NODE

echo "Next: npx prisma migrate status && npx prisma migrate deploy"
