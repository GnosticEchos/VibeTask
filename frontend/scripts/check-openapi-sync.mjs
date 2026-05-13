#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fePath = join(__dirname, '..', 'openapi.json')
const rwPath = join(__dirname, '..', '..', 'Kanban-rewrite', 'src', 'openapi.json')

const fe = readFileSync(fePath)
const rw = readFileSync(rwPath)

if (Buffer.compare(fe, rw) !== 0) {
  console.error('openapi drift: Kanban-frontend/openapi.json !== Kanban-rewrite/src/openapi.json')
  console.error('Fix: npm run openapi:sync (here) or npm run openapi:sync-fe (Kanban-rewrite)')
  process.exit(1)
}

console.log('openapi: frontend copy matches Kanban-rewrite/src/openapi.json')
