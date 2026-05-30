# VibeTask Hub

Express + Prisma backend with Better Auth, Socket.IO, and PostgreSQL full-text search. Part of the [VibeTask monorepo](../README.md).

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 20+ | |
| npm | 10+ | |
| PostgreSQL | **11+** | Required for `websearch_to_tsquery` full-text search |
| PostgreSQL extensions | `pg_trgm` | For trigram-based text matching on document titles |

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL, BETTER_AUTH_SECRET, and PLATFORM_SESSION_SECRET

# 3. Set up the database
createdb kanban                        # create the database
npx prisma generate                    # generate Prisma client
npx prisma migrate deploy              # apply all migrations
# Migration 20260415200000 creates the tsvector searchVector column +
# GIN index + pg_trgm extension automatically

# 4. Start dev server
npm run dev                            # :3000
```

On first startup the server automatically:
- Creates WebSocket database triggers (`pg_notify` for real-time updates)
- Verifies the `searchVector` generated column exists

## Database Details

### PostgreSQL Extensions

The `ProjectDocument.searchVector` column uses `tsvector` for full-text search across document titles and content:

```sql
-- Created by migration 20260415200000:
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "ProjectDocument" ADD COLUMN IF NOT EXISTS "searchVector" tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(content, '')), 'B')
) STORED;

CREATE INDEX IF NOT EXISTS idx_doc_search ON "ProjectDocument" USING GIN ("searchVector");
```

This auto-indexes document content — no manual trigger maintenance needed.

### WebSocket Triggers

Real-time updates use PostgreSQL `LISTEN/NOTIFY` via the `pg-listen` npm package. The startup script (`ensureWebsocketTriggers`) creates `NOTIFY` triggers on `Task`, `ProjectColumn`, `ProjectUser`, and `Project` tables.

### Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORT` | 3000 | | HTTP server port |
| `WS_PORT` | 8080 | | WebSocket port |
| `DATABASE_URL` | — | ✅ | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | — | ✅ | Min 32 chars, run `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | `http://localhost:3000` | | Public-facing URL for OAuth callbacks |
| `PLATFORM_SESSION_SECRET` | — | ✅ | HMAC secret for agent JWT, `openssl rand -hex 32` |
| `DEVELOPMENT_FE_ORIGIN` | `http://localhost:5173` | | CORS origins, comma-separated |

### Database Scripts

See [DEVELOPER_HELPER_TOOLS.md](../docs/developer/DEVELOPER_HELPER_TOOLS.md) for the full list of `npm run db:*` commands (seed, dump, reset, fix sequences, etc.).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + TypeScript |
| HTTP | Express.js |
| WebSocket | Socket.IO + `pg-listen` (pg NOTIFY/LISTEN) |
| Auth | Better Auth (Argon2id, JWT sessions) |
| DB | PostgreSQL via Prisma ORM |
| Validation | Zod |
| Real-time | PostgreSQL triggers → `pg_notify` → `pg-listen` → Socket.IO broadcast |

## Project Structure

```
src/
├── index.ts                     # Entry point — Express + Socket.IO + pg-listen
├── api/routes/                  # Route handlers
│   ├── agent/                   # Agent API (CLI/MCP endpoints)
│   ├── auth.ts, projects.ts, tasks.ts, columns.ts, members.ts, users.ts
├── infrastructure/
│   ├── auth/                    # Better Auth + Prisma singleton + platform session
│   ├── http/                    # Express middleware (error handler, validation, CORS)
│   ├── websocket/               # Socket.IO server + broadcast logic
│   └── database/                # pg-listen subscriber + trigger setup
├── domain/                      # Business logic (rate-limit service, etc.)
├── validation/schemas/          # Zod schemas
└── shared/transformers/         # Response formatters
```