# VibeTask

Agent-orchestrated Kanban platform. Three components:

- **hub/** — Express + Prisma backend with Better Auth, Socket.IO, and agent API
- **frontend/** — Vue.js frontend consuming the hub API
- **app/** — Rust CLI and MCP server for agent interaction

## Getting Started

```bash
# Hub (backend)
cd hub && npm install && npm run db:push && npm run dev

# Frontend (separate terminal)
cd frontend && npm install && npm run dev

# App (CLI, separate terminal)
cd app && cargo run -- --config config/vibe-cli.toml project list
```

See each component's README for details. See `CONTRACT.md` for API contract notes.