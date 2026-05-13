#!/usr/bin/env node
/**
 * Copies Kanban-rewrite/src/openapi.json → Kanban-frontend/openapi.json.
 * Expects this repo and Kanban-frontend to be sibling directories (…/kanban_frontend/Kanban-rewrite + Kanban-frontend).
 */
import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')
const src = join(repoRoot, 'src', 'openapi.json')
const dest = join(repoRoot, '..', 'Kanban-frontend', 'openapi.json')

if (!existsSync(src)) {
  console.error('sync-openapi-to-frontend: missing source', src)
  process.exit(1)
}

copyFileSync(src, dest)
console.log('sync-openapi-to-frontend: wrote', dest)
