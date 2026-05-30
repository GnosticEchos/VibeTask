# VibeTask

Agent-orchestrated Kanban platform (alpha). One Git repository, three packages:

| Package | Path | Role | Dev port |
|---------|------|------|----------|
| **Hub** | [`hub/`](hub/) | Express + Prisma API, Better Auth, Socket.IO | HTTP `3000`, WS `8080` |
| **Frontend** | [`frontend/`](frontend/) | Vue 3 SPA | `5173` |
| **App** | [`app/`](app/) | Rust CLI + MCP server for agents | — |

## Architecture

```
Browser (frontend) ──REST /api/*──► Hub ──► PostgreSQL
                         │
                    Socket.IO (real-time board updates)

Agents (CLI / MCP) ──REST /api/agent/*──► Hub
```

- **Contract:** OpenAPI at [`hub/src/openapi.json`](hub/src/openapi.json). Frontend keeps a copy at [`frontend/openapi.json`](frontend/openapi.json); sync with `npm run openapi:sync` from `frontend/` or `npm run openapi:sync-fe` from `hub/`.
- **Rust client:** `app/crates/vibetask-hub-client` generates an agent API client from that spec at build time (Progenitor). See [`app/DEVELOPMENT.md`](app/DEVELOPMENT.md).

## Full-stack development setup

### Prerequisites

- **Node.js** 20+ and **npm** 10+
- **PostgreSQL** 11+ with `pg_trgm` (see [`hub/README.md`](hub/README.md))
- **Rust** (stable) for `app/` — [rustup](https://rustup.rs/)

### 1. Hub (backend)

```bash
cd hub
npm install
cp .env.example .env   # set DATABASE_URL, BETTER_AUTH_SECRET, PLATFORM_SESSION_SECRET
createdb kanban        # or your DB name from DATABASE_URL
npx prisma generate
npx prisma migrate deploy
npm run dev            # :3000
```

Details: [`hub/README.md`](hub/README.md) · Env table in hub README · DB helpers in [`docs/developer/DEVELOPER_HELPER_TOOLS.md`](docs/developer/DEVELOPER_HELPER_TOOLS.md)

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env   # VITE_API_BASE_URL=http://localhost:3000, VITE_WS_BASE_URL=http://localhost:8080
npm run dev            # :5173
```

Details: [`frontend/README.md`](frontend/README.md)

### 3. App (CLI / MCP, optional)

```bash
cd app
cp config/vibe-cli.toml config/local-vibe-cli.toml   # configure agents
make dev-setup   # optional: pre-commit hooks
cargo build
cargo run -p vibetask-cli -- --config config/vibe-cli.toml project list
```

Details: [`app/README.md`](app/README.md) · [`app/DEVELOPMENT.md`](app/DEVELOPMENT.md)

### OpenAPI sync (after hub API changes)

```bash
cd hub && npm run openapi:sync-fe
# or
cd frontend && npm run openapi:sync
cd frontend && npm run openapi:check-sync
```

## Documentation map

| Audience | Start here |
|----------|------------|
| **Product users** | [`docs/user/README.md`](docs/user/README.md) (boards, tasks, relations, settings, agents) |
| **Web / hub developers** | [`hub/README.md`](hub/README.md), [`hub/docs/REST_API_DOCUMENTATION.md`](hub/docs/REST_API_DOCUMENTATION.md) |
| **Frontend developers** | [`frontend/README.md`](frontend/README.md), [`docs/developer/DEVELOPER_HELPER_TOOLS.md`](docs/developer/DEVELOPER_HELPER_TOOLS.md) |
| **Agent / CLI / MCP** | [`app/README.md`](app/README.md), [`app/DEVELOPMENT.md`](app/DEVELOPMENT.md) |
| **API contract** | [`CONTRACT.md`](CONTRACT.md), [`frontend/docs/OPENAPI_UI_GAP_ANALYSIS.md`](frontend/docs/OPENAPI_UI_GAP_ANALYSIS.md) |

## CI

GitHub Actions runs from [`.github/workflows/ci.yml`](.github/workflows/ci.yml) at the repo root (hub, frontend, and app jobs). Legacy workflow files under `hub/.github/`, `frontend/.github/`, and `app/.github/` are not used by GitHub.

## License

[MIT](LICENSE)
