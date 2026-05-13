# Developer Helper Tools

This project has a few helper scripts that are easy to forget. This page is the quick reference for day-to-day workflows.

## OpenAPI Sync (Frontend <-> Backend)

Use these whenever API routes/schemas change in `Kanban-rewrite`:

- From `Kanban-frontend`:
  - `npm run openapi:sync` - copies `Kanban-rewrite/src/openapi.json` into this repo's `openapi.json`.
  - `npm run openapi:check-sync` - verifies both files are currently in sync.
- From `Kanban-rewrite`:
  - `npm run openapi:sync-fe` - pushes backend OpenAPI spec to sibling frontend repo.
  - `npm run openapi:validate` - validates OpenAPI spec using Redocly (shows errors/warnings).
  - `npm run openapi:validate:strict` - validates spec, fails on any issue (max-problems=0).
  - `npm run openapi:bundle` - bundles dereferenced spec to `dist/openapi.json`.

Recommended flow:

1. Update backend API contract.
2. Run `npm run openapi:validate` in backend to check for spec issues.
3. Fix any validation errors before syncing.
4. Run sync (`openapi:sync-fe` or `openapi:sync`).
5. Run `openapi:check-sync` from frontend.
6. Update `docs/API_CONTRACT_REVIEW.md` if behavior/contract changed.

**OpenAPI Validation Configuration**

The backend uses Redocly CLI (configured in `.redocly.yaml`) with recommended rules enabled:
- Schema validation (error on invalid structures)
- Operation ID requirements
- Security definition checks
- Unresolved reference detection

Run validation after any OpenAPI edits to catch issues early before they break generated clients.

## Frontend (Kanban-frontend) Common Scripts

- `npm run dev` - start Vite dev server.
- `npm run build` - typecheck + production build.
- `npm run preview` - serve built app locally.
- `npm run test:unit` - run unit tests once.
- `npm run test:coverage` - unit tests with coverage.
- `npm run test:e2e` - run Playwright end-to-end tests.
- `npm run test:e2e:ui` - run Playwright in UI mode.
- `npm run test:e2e:install` - install Playwright Chromium browser.
- `npm run lint:style` - stylelint checks for Vue/CSS/SCSS.
- `npm run lint:style:fix` - auto-fix stylelint issues where possible.
- `npm run openapi:gen-types` - generate TS types from `openapi.json` into `src/api/generated/openapi-types.ts`.

## Backend (Kanban-rewrite) Common Scripts

- `npm run dev` - start API in watch mode.
- `npm run build` - TypeScript compile check.
- `npm run test` - backend unit/integration suite configured under default Vitest config.
- `npm run test:integration` - integration tests via `vitest.integration.config.ts`.
- `npm run test:all` - runs `test` + `test:integration`.

### Database helpers

- `npm run db:generate` - regenerate Prisma client.
- `npm run db:push` - push Prisma schema changes to database.
- `npm run db:migrate` - create/apply local migration in dev mode.
- `npm run db:seed` - seed/restore database from CSV dumps via `prisma/full-restore.sh`.
- `npm run db:restore` - alias for `db:seed`.
- `npm run db:reset-and-seed` - destructive reset + seed.
- `npm run db:dump` - export current database state to CSV files in `prisma/DATADUMP/`.
- `npm run db:fix-memberships` - detect and insert missing `ProjectUser` rows (owners without membership).
- `npm run db:sync-sequences` - fix sequences after manual ID inserts.
- `npm run db:reset-rate-limits` - reset `RateLimitConfig` rows to code defaults.
- `npm run db:purge-agent-keys` - targeted helper for cleaning agent API keys for a user.
- `npm run db:normalize-dump` - normalize CSV dumps (fix task relations, flatten multiline comments).

#### Database Restore Internals

The `db:seed` command runs `prisma/full-restore.sh` which uses `psql \copy` for reliable CSV ingestion:

1. **Temp tables** - CSV columns are loaded into PostgreSQL temp tables with quoted identifiers matching the CSV header names (handles camelCase columns like `projectId`).
2. **Column mapping** - Inserts from temp tables to actual tables handle column order differences and type casting (enums, timestamps).
3. **CSV format** - The script expects RFC 4180 CSV (quoted fields with embedded newlines handled correctly).
4. **Location** - CSV dumps live in `prisma/DATADUMP/` (users, projects, columns, memberships, tasks, comments, logs, documents, doc-links).

## Notes

- Some backend tests run against the same local DB in this workspace. Be careful with cleanup scripts and test suites when preserving manual test data.
- Prefer running commands from the repo that owns the script (`Kanban-frontend` or `Kanban-rewrite`).
