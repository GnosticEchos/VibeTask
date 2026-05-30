# VibeTask Frontend

Vue.js frontend for the VibeTask agent-orchestrated Kanban platform. Part of the [VibeTask monorepo](../README.md).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Vue 3 (Composition API, `<script setup>`) |
| Language | TypeScript (strict mode) |
| Build | Vite |
| State | Pinia (UI state) + TanStack Query (server state) |
| Styling | DaisyUI + Tailwind CSS |
| WebSocket | Socket.IO client |
| Auth | Better Auth session tokens |

## Quick Start

```bash
npm install
npm run dev           # Dev server on :5173
```

Requires the [hub backend](../hub/) running on :3000.

## Project Scripts

See [docs/developer/DEVELOPER_HELPER_TOOLS.md](../docs/developer/DEVELOPER_HELPER_TOOLS.md) for the full command reference.

Key commands:
- `npm run dev` — Vite dev server
- `npm run build` — TypeScript check + production build
- `npm run test:unit` — Unit tests
- `npm run test:e2e` — Playwright E2E tests
- `npm run openapi:sync` — Sync OpenAPI spec from hub
- `npm run openapi:check-sync` — Verify spec parity with hub

## Project Structure

```
src/
├── main.ts                    # App entry point
├── App.vue                    # Root component
├── router/                    # Vue Router config
├── stores/                    # Pinia stores (UI state)
├── composables/               # TanStack Query hooks + reusable logic
├── api/                       # API client (indexApi, authApi, membersApi)
├── components/                # Vue components (organized by domain)
├── utils/                     # Helpers (logger, validation, avatars)
├── types/                     # TypeScript type definitions
├── locale/                    # i18n (en, pl, xx)
├── assets/                    # Static assets (SVGs, images)
└── api/generated/             # Auto-generated OpenAPI types
```

## Key Design Decisions

- **CQRS-style data flow:** Reads go through TanStack Query; writes go through store actions that invalidate query keys. See [docs/CQRS_DATA_FLOW.md](docs/CQRS_DATA_FLOW.md).
- **No mock APIs:** Wire to real hub endpoints; handle loading, error, empty, and 403 states.
- **Settings layout:** Draggable bento-style grid persisted to both `localStorage` and hub API.
- **i18n:** Locale files in `src/locale/` — keep updated when adding UI strings.
- **Logging:** Use `src/utils/logger.ts` (apiLog, storeLog, wsLog, uiLog) instead of `console.*`.

## Architecture

### Data Flow

```
User Action → Component → Store/Composable → API Client → Hub Backend
                                               ↕
                                   TanStack Query Cache
```

### WebSocket Integration

Real-time updates via Socket.IO client connected to hub's WebSocket server.
See [docs/WEBSOCKET_CONTRACT_REVIEW.md](docs/WEBSOCKET_CONTRACT_REVIEW.md) for channel contracts.

### Agent Integration

The frontend includes agent management UI (create, delegate, manage API keys) — see the Agents hub in Settings.

## Related Docs

| Document | Purpose |
|----------|---------|
| [OpenAPI ↔ UI gap analysis](docs/OPENAPI_UI_GAP_ANALYSIS.md) | Feature coverage vs hub OpenAPI |
| [WebSocket Contract](docs/WEBSOCKET_CONTRACT_REVIEW.md) | Socket.IO channel contracts |
| [CQRS Data Flow](docs/CQRS_DATA_FLOW.md) | Query/command boundaries |
| [Account Settings API](docs/ACCOUNT_SETTINGS_API_V1.md) | Profile/password/sessions API |
| [Settings Layout Sync](docs/SETTINGS_LAYOUT_SYNC.md) | Settings grid persistence |
| [Developer Tools](../docs/developer/DEVELOPER_HELPER_TOOLS.md) | Command reference |
| [Type Hardening](docs/HARDENING_STRICT_TYPES_AND_CONTRACTS.md) | Strict typing plan |
