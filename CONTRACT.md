## Contract Alignment

This monorepo contains all three components. They are always in sync at the same commit.

| Component | Path | Role |
|-----------|------|------|
| **hub** | `hub/` | Express + Prisma backend (source of truth for API contract) |
| **frontend** | `frontend/` | Vue.js frontend (consumes hub API) |
| **app** | `app/` | Rust CLI + MCP server (consumes hub API) |

API contract is defined by the OpenAPI spec at `hub/src/openapi.json`.

| Consumer | Sync / generation |
|----------|-------------------|
| **frontend** | Copy via `npm run openapi:sync` (checked in CI with `openapi:check-sync`) |
| **app** | `vibetask-hub-client` build generates Progenitor client from agent routes in the same spec |