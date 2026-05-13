# Backend alignment (Kanban-rewrite)

This app targets the **Kanban-rewrite** backend. The following assets are used to keep the frontend in sync.

## API contract

- **OpenAPI:** `openapi.json` in the project root (canonical copy from `Kanban-rewrite/src/openapi.json`; kept in sync with backend integration tests).
- **Task create:** Frontend keeps the existing contract and sends `projectId`, `name`, `description`, `projectColumnId`, `assigneeId`, `relationId`, `relationMode`. The backend is expected to accept or ignore these; any 500 when sending relation fields is a backend bug (contract should be extended, not narrowed).

## WebSocket (real-time)

- **Guide:** See `Kanban-rewrite/docs/WEBSOCKET_FRONTEND_GUIDE.md` (sibling repo or backend repo).
- **Backend uses Socket.IO** (not raw WebSocket). The guide describes:
  - Connection URL (e.g. `ws://localhost:8080`), auth via JWT.
  - Channels: `TasksIndexChannel`, `TaskIndexChannel`, `ColumnsIndexChannel`, `MembersIndexChannel`, `MemberIndexChannel`, `ProjectIndexChannel`, `UserProjectsIndexChannel`.
  - Subscribe/unsubscribe: `socket.emit('subscribe', { channel, params })` / `socket.emit('unsubscribe', { channel })`.
  - Message format and re-subscribing after reconnect.
- **Current frontend** still uses the legacy WebSocket client. A future migration will switch to `socket.io-client` and the event format described in the guide.
