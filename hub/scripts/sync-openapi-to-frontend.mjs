#!/usr/bin/env node
/**
 * Copies hub/src/openapi.json → frontend/openapi.json (VibeTask monorepo).
 */
import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const hubRoot = join(__dirname, '..')
const src = join(hubRoot, 'src', 'openapi.json')
const dest = join(hubRoot, '..', 'frontend', 'openapi.json')

if (!existsSync(src)) {
  console.error('sync-openapi-to-frontend: missing source', src)
  process.exit(1)
}

copyFileSync(src, dest)
console.log('sync-openapi-to-frontend: wrote', dest)
