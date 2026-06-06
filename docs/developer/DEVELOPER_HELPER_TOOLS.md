# Developer Helper Tools

Quick reference for day-to-day workflows across the **VibeTask** monorepo (`hub/`, `frontend/`, `app/`).

## Monorepo layout

```
VibeTask/          (repository root)
├── hub/           Express + Prisma backend — OpenAPI source: hub/src/openapi.json
├── frontend/      Vue.js frontend — copy: frontend/openapi.json
└── app/           Rust CLI + MCP — Progenitor client from hub spec at build time
```

## Hub (Backend) Common Scripts

### First-time setup

```bash
cd ~/Projects/VibeTask/hub
npm install
npx prisma generate        # generate Prisma client from schema
npx prisma migrate deploy  # apply pending migrations (local/staging/prod)
```

### Daily dev

- `npm run dev` — start API in watch mode on :3000.
- `npm run build` — TypeScript compile check.
- `npm run test` — backend unit/integration suite (default Vitest config).
- `npm run test:integration` — integration tests via `vitest.integration.config.ts` (requires local Postgres per `.env.test`).
- `npm run test:all` — runs `test` + `test:integration`.

**Integration test failures**

| Symptom | Cause | Fix |
|---------|--------|-----|
| `Failed to load native binding` / `linux-x64-musl` at import, **0 tests run** | `@kreuzberg/tree-sitter-language-pack` entrypoint mis-detects musl on Node 25+ glibc | Use hub code that imports `src/infrastructure/security/tree-sitter-pack.ts` (not the package `index.js`) |
| `Session_userId_fkey` on `POST /api/login` (often admin temporary-password test) | Race: login before Better Auth `Account` row exists after register | Pull latest test helpers (`createTestUser` waits for credential account; login retries). Re-run `npm run test:integration` |

Requires local Postgres configured in `hub/.env.test` (see hub integration setup).

### Database helpers

- `npm run db:generate` — regenerate Prisma client.
- `npm run db:push` — push Prisma schema changes to database **without** migration history (dev-only escape hatch; prefer migrations for anything shared or long-lived).
- `npm run db:migrate` — create/apply local migration in dev mode (`prisma migrate dev`).
- `npm run db:seed` — seed/restore database from CSV dumps via `prisma/full-restore.sh`.
- `npm run db:restore` — alias for `db:seed`.
- `npm run db:reset-and-seed` — destructive reset + seed.
- `npm run db:reset-rate-limits` — reset `RateLimitConfig` rows to code defaults.
- `npm run db:purge-agent-keys` — targeted helper for cleaning agent API keys for a user.

### Prisma migrations — normal workflow

1. Edit `hub/prisma/schema.prisma`.
2. Create a migration: `cd hub && npm run db:migrate` (names the folder under `prisma/migrations/`).
3. Commit **both** the schema and the new migration SQL.
4. Other machines / CI: `npx prisma migrate deploy` (never `db push` on shared DBs unless you know why).

Fresh clone checklist:

```bash
cd ~/Projects/VibeTask/hub
npm install
npx prisma generate
npx prisma migrate deploy
npm run db:seed          # optional — alpha dev fixtures from DATADUMP
```

### Prisma troubleshooting

Symptoms and fixes for the drift cases we have hit locally.

#### `P3018` — migration failed to apply

Example: `type "DelegationMode" already exists` on `20260519220000_agent_lattice_and_task_assignee_api_key`.

**Cause:** Schema objects were created earlier (`db push`, hand-rolled SQL, or a partial failed run) but `_prisma_migrations` does not record the migration as finished.

**Fix (dev DB, objects already present):**

```bash
cd ~/Projects/VibeTask/hub
npx prisma migrate resolve --applied "<migration_folder_name>"
npx prisma migrate deploy
```

Replace `<migration_folder_name>` with the full folder name under `prisma/migrations/` (e.g. `20260519220000_agent_lattice_and_task_assignee_api_key`).

If Prisma still blocks on a **failed** row (`finished_at` is null), run the repair script first (see below), or:

```bash
npx prisma migrate resolve --rolled-back "<migration_folder_name>"
# then either fix SQL and migrate deploy, or resolve --applied if schema already matches
```

#### Drift — “migration from the database are not found locally”

Example: DB lists `20260408004000_extend_prefix_to_10_chars` but the file was missing from git.

**Cause:** A migration was applied locally but never committed, or was deleted from the repo while the DB history row remained.

**Fix:** Restore the missing folder under `hub/prisma/migrations/` (check git history / another dev’s tree), then:

```bash
cd ~/Projects/VibeTask/hub
./scripts/repair-prisma-migrations.sh   # sync checksums, drop failed duplicate rows
npx prisma migrate status
```

Do **not** delete rows from `_prisma_migrations` by hand unless you understand the schema state.

#### Drift — “migration have not yet been applied”

**Fix:** `npx prisma migrate deploy` after `git pull` brings new migration folders.

#### `db push` vs `migrate`

| Tool | History | Use when |
|------|---------|----------|
| `prisma migrate dev` / `deploy` | Yes — `_prisma_migrations` | Default; CI; anything teammates run |
| `prisma db push` | No | Solo spike, disposable DB, prototyping only |

Mixing `db push` on a DB that later uses `migrate deploy` produces the “already exists” / P3018 errors above.

#### Baseline an existing DB (one-time)

If the database already matches all migrations in the repo but `_prisma_migrations` is empty or wrong (e.g. legacy `db push` project):

```bash
cd ~/Projects/VibeTask/hub
./scripts/baseline-prisma-migrations.sh   # marks every repo migration as applied — no SQL
npx prisma migrate deploy                 # applies only migrations added after baseline
```

Use **only** when the live schema truly matches the migration chain.

#### Repair script (dev)

```bash
cd ~/Projects/VibeTask/hub
./scripts/repair-prisma-migrations.sh
```

This script:

- Removes failed duplicate `_prisma_migrations` rows (same name, `finished_at` null).
- Updates checksums when a restored migration file differs from a local-only copy.
- Prints repo vs DB name mismatches.

#### Inspect migration history

```bash
cd ~/Projects/VibeTask/hub
npx prisma migrate status
psql "$DATABASE_URL" -c "SELECT migration_name, finished_at IS NOT NULL AS applied FROM \"_prisma_migrations\" ORDER BY started_at;"
```

### OpenAPI

- `npm run openapi:validate` — validate OpenAPI spec via Redocly.
- `npm run openapi:validate:strict` — fail on any issue.
- `npm run openapi:bundle` — bundle dereferenced spec to `dist/openapi.json`.

**When you edit `hub/src/openapi.json`**, run this order before committing:

```bash
cd ~/Projects/VibeTask/hub
npm run openapi:validate          # required — catches structural/spec errors

cd ~/Projects/VibeTask/frontend
npm run openapi:sync              # copy hub spec → frontend/openapi.json
npm run openapi:check-sync        # confirm copies match
npm run openapi:gen-types         # refresh src/api/generated/openapi-types.ts
```

Use `openapi:validate:strict` when you want zero warnings (today the spec still has legacy Redocly warnings).

For what the SPA exposes vs the contract (gaps, workspace scope semantics, summary routes), see [API_UI_COVERAGE.md](API_UI_COVERAGE.md).

## Frontend Common Scripts

- `npm run dev` — start Vite dev server on :5173.
- `npm run build` — typecheck + production build.
- `npm run preview` — serve built app locally.
- `npm run test:unit` — run unit tests once.
- `npm run test:coverage` — unit tests with coverage.
- `npm run test:e2e` — run Playwright end-to-end tests.
- `npm run test:e2e:ui` — run Playwright in UI mode.
- `npm run test:e2e:install` — install Playwright Chromium browser.
- `npm run lint:style` — stylelint checks for Vue/CSS/SCSS.
- `npm run lint:style:fix` — auto-fix stylelint issues where possible.
- `npm run openapi:gen-types` — generate TS types from `openapi.json` into `src/api/generated/openapi-types.ts`.
- `npm run openapi:check-sync` — verify frontend/backend OpenAPI specs are in sync.
- `npm run openapi:sync` — sync OpenAPI spec from hub.

After hub OpenAPI edits, run **`hub` → `openapi:validate`**, then the frontend sync/check/gen-types steps above (see **Hub → OpenAPI**).

## App (Rust CLI/MCP) Common Scripts

```bash
cd ~/Projects/VibeTask/app
cargo build                         # debug build
cargo build --release               # release build
cargo clippy -- -D warnings         # lint (strict)
cargo test                          # run all tests
```

### CLI usage

```bash
cargo run -- --config config/vibe-cli.toml agent status
cargo run -- --config config/vibe-cli.toml project list
cargo run -- --config config/vibe-cli.toml project tasks 10 --limit 5
```

### MCP server (stdio)

```bash
cargo run -- --config config/vibe-mcp.toml
```

## Recommended startup order

```bash
# Terminal 1: Hub
cd ~/Projects/VibeTask/hub && npm run dev

# Terminal 2: Frontend
cd ~/Projects/VibeTask/frontend && npm run dev

# Terminal 3: CLI (as needed)
cd ~/Projects/VibeTask/app && cargo run -- --config config/vibe-cli.toml health
```

## Database Restore Internals

The `db:seed` command runs `prisma/full-restore.sh` which uses `psql \copy` for reliable CSV ingestion:

1. **Temp tables** — CSV columns are loaded into PostgreSQL temp tables with quoted identifiers matching the CSV header names (handles camelCase columns like `projectId`).
2. **Column mapping** — Inserts from temp tables to actual tables handle column order differences and type casting (enums, timestamps).
3. **CSV format** — The script expects RFC 4180 CSV (quoted fields with embedded newlines handled correctly).
4. **Location** — CSV dumps live in `hub/prisma/DATADUMP/` (users, projects, columns, memberships, tasks, comments, logs, documents, doc-links).

## Notes

- Some backend tests run against the same local DB. Be careful with cleanup scripts and test suites when preserving manual test data.
- All commands assume `~/Projects/VibeTask/` as the root — adjust paths if you have the repo elsewhere.
- Prisma migration files under `hub/prisma/migrations/` are **source of truth** — commit them with schema changes.
