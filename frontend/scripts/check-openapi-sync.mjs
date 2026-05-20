#!/usr/bin/env node
/**
 * Ensures frontend/openapi.json matches hub/src/openapi.json (byte-identical).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fePath = join(__dirname, '..', 'openapi.json')
const hubPath = join(__dirname, '..', '..', 'hub', 'src', 'openapi.json')

const fe = readFileSync(fePath)
const hub = readFileSync(hubPath)

if (Buffer.compare(fe, hub) !== 0) {
  console.error('openapi drift: frontend/openapi.json !== hub/src/openapi.json')
  console.error('Fix: npm run openapi:sync (from frontend/) or npm run openapi:sync-fe (from hub/)')
  process.exit(1)
}

console.log('openapi: frontend copy matches hub/src/openapi.json')
