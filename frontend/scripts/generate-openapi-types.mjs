import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const cwd = resolve(process.cwd())
const input = resolve(cwd, 'openapi.json')
const output = resolve(cwd, 'src/api/generated/openapi-types.ts')

execFileSync('npx', ['openapi-typescript', input, '--output', output], {
  cwd,
  stdio: 'inherit',
})
