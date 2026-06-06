## Contract Alignment

This monorepo contains all three components. They are always in sync at the same commit.

| Component | Path | Role |
|-----------|------|------|
| **hub** | `hub/` | Express + Prisma backend (source of truth for API contract) |
| **frontend** | `frontend/` | Vue.js frontend (consumes hub API) |
| **app** | `app/` | Rust CLI + MCP server (consumes hub API) |

API contract is defined by the OpenAPI spec at `hub/src/openapi.json` (editable source of truth). Do not maintain a second editable copy; `frontend/openapi.json` is a synced consumer artifact.

| Consumer | Sync / generation |
|----------|-------------------|
| **frontend** | Copy via `npm run openapi:sync` (checked in CI with `openapi:check-sync`); types via `npm run openapi:gen-types` |
| **app** | `vibetask-hub-client` build generates Progenitor client from agent routes in the same spec |

### Validation (after OpenAPI edits)

```bash
cd hub && npm run openapi:validate
cd hub && npm run openapi:sync-fe
cd frontend && npm run openapi:check-sync && npm run openapi:gen-types
cd app && cargo build -p vibetask-hub-client
```

See [`docs/developer/DEVELOPER_HELPER_TOOLS.md`](docs/developer/DEVELOPER_HELPER_TOOLS.md) for full workflow.

### Repo-root OpenAPI

Keep the **editable** spec in `hub/src/openapi.json`. A repo-root `openapi.json` is optional later (symlink or bundled publish artifact only)—not a second source of truth. For SPA coverage vs the contract, see [`docs/developer/API_UI_COVERAGE.md`](docs/developer/API_UI_COVERAGE.md).