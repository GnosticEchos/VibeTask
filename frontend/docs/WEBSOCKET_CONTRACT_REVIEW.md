# WebSocket Contract Review

Frontend now uses Socket.IO client to match `hub` websocket server.

## Transport and auth

- Backend: Socket.IO server on `WS_PORT` (default `8080`), auth middleware checks session token.
- Frontend: `socket.io-client` connects to `VITE_WS_BASE_URL`.
- Auth token is sent as:
  - `auth.token` (primary)
  - `query.Authorization` (compat fallback)

## Subscribe / unsubscribe

- Subscribe emit:

```json
{ "channel": "TasksIndexChannel", "params": { "projectId": 1 } }
```

- Unsubscribe emit:

```json
{ "channel": "TasksIndexChannel" }
```

## Inbound message contract

Backend broadcasts via `message` event:

```json
{
  "identifier": { "channel": "TasksIndexChannel" },
  "message": {
    "itemType": "task",
    "actionType": "create",
    "data": {}
  }
}
```

Frontend dispatch maps on `identifier.channel` + `message.actionType`.

## Channel alignment

- `TasksIndexChannel`
- `TaskIndexChannel`
- `ColumnsIndexChannel`
- `MembersIndexChannel`
- `MemberIndexChannel`
- `ProjectIndexChannel`
- `UserProjectsIndexChannel`

## Notes

- `UserProjectsIndexChannel` invalidates TanStack Query `['projects']`.
- Project route subscribes to project-scoped index channels and unsubscribes on cleanup.
- Member dialog subscribes to `MemberIndexChannel` for targeted member updates.
- Task updates now patch both task store state and `project.columns[].tasks` so board/grid update live without page reload.
- Task moves currently emit burst `Task UPDATE` messages (one per changed task) during drag-drop reorder.
- Frontend websocket debug logs are disabled by default; set `VITE_WS_DEBUG=true` to enable verbose `[WS-CLIENT]` and `[WS-STORE]` traces.
- Backend startup now verifies websocket DB triggers before starting `pg-listen` to avoid trigger drift in local environments.
