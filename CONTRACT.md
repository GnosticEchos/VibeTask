## Contract Alignment

This monorepo contains all three components. They are always in sync at the same commit.

| Component | Path | Role |
|-----------|------|------|
| **hub** | `hub/` | Express + Prisma backend (source of truth for API contract) |
| **frontend** | `frontend/` | Vue.js frontend (consumes hub API) |
| **app** | `app/` | Rust CLI + MCP server (consumes hub API) |

API contract is defined by the OpenAPI spec at `hub/src/openapi.json`.
Frontend and MCP tool implementations are kept in sync manually — no automated contract validation yet.