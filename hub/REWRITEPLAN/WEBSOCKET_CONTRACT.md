# WebSocket Contract Documentation

## Overview
WebSocket server runs on port 8080 separately from HTTP API. Used for real-time updates across connected clients.

**URL**: `ws://localhost:8080`  
**Authentication**: JWT token passed as query parameter `Authorization`

## Connection

### Connection URL
```
ws://localhost:8080?Authorization=<jwt_token>
```

### Connection Flow
1. Client opens WebSocket connection with token in query params
2. Server validates JWT token
3. On success, server sends welcome message
4. Client subscribes to specific channels
5. Server sends confirmation for each subscription
6. Real-time updates begin

### Initial Messages

**Server Welcome (on successful connection):**
```json
{
  "type": "welcome",
  "message": "Welcome!"
}
```

**Token Error (on invalid/missing token):**
Connection is terminated immediately without message.

---

## Channels

Channels are subscription topics. Clients subscribe/unsubscribe to receive updates for specific resources.

### Available Channels

| Channel | Description | Parameters |
|---------|-------------|------------|
| `TasksIndexChannel` | Task list updates | `{ projectId }` |
| `TaskIndexChannel` | Single task updates | `{ projectId, taskId }` |
| `MembersIndexChannel` | Member list updates | `{ projectId }` |
| `MemberIndexChannel` | Single member updates | `{ projectId, memberId }` |
| `ColumnsIndexChannel` | Column list updates | `{ projectId }` |
| `ProjectIndexChannel` | Project updates | `{ projectId }` |
| `UserProjectsIndexChannel` | User's projects updates | `{}` (no params) |

### Subscribe to Channel

**Client → Server:**
```json
{
  "command": "subscribe",
  "identifier": {
    "channel": "TasksIndexChannel",
    "params": {
      "projectId": 1
    }
  }
}
```

**Server → Client (Success):**
```json
{
  "type": "confirmSubscription",
  "identifier": {
    "channel": "TasksIndexChannel"
  }
}
```

**Server → Client (Error - Channel doesn't exist):**
```json
{
  "type": "error",
  "message": "Channel does not exist"
}
```

### Unsubscribe from Channel

**Client → Server:**
```json
{
  "command": "unsubscribe",
  "identifier": {
    "channel": "TasksIndexChannel",
    "params": {
      "projectId": 1
    }
  }
}
```

**Server → Client (Success):**
```json
{
  "type": "confirmUnsubscription",
  "identifier": {
    "channel": "TasksIndexChannel"
  }
}
```

**Server → Client (Error):**
```json
{
  "type": "error",
  "message": "Channel does not exist"
}
```

### Invalid Payload Error

**Server → Client:**
```json
{
  "type": "error",
  "message": "Invalid payload"
}
```

---

## Real-Time Update Messages

When a resource changes, the server broadcasts to all subscribed clients in the channel.

### Message Format

**Frontend expects this exact format:**
```json
{
  "identifier": {
    "channel": "TasksIndexChannel"
  },
  "message": {
    "actionType": "create | update | delete",
    "data": { /* Resource object */ }
  }
}
```

**Note:** Frontend code uses `actionType` (not `itemType` + `actionType`). The `itemType` is derived from the channel name by the frontend store handlers.

### Item Types

| Item Type | Description |
|-----------|-------------|
| `task` | Task entity |
| `column` | Project column |
| `member` | Project member |
| `project` | Project |

### Action Types

| Action Type | Description |
|-------------|-------------|
| `create` | New resource created |
| `update` | Resource modified |
| `delete` | Resource removed |

---

## Channel-Specific Payloads

### TasksIndexChannel

**Create/Update/Delete:**
```json
{
  "identifier": {
    "channel": "TasksIndexChannel"
  },
  "message": {
    "itemType": "task",
    "actionType": "create",
    "data": {
      "id": 1,
      "name": "Task name",
      "description": "Task description",
      "order": 1,
      "identifier": "PIE-1",
      "projectId": 1,
      "projectColumnId": 1,
      "assigneeId": 1,
      "createdById": 1,
      "relationMode": null,
      "relationId": null,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "assignee": {
        "id": 1,
        "fullName": "John Doe"
      },
      "createdBy": {
        "id": 1,
        "fullName": "John Doe"
      }
    }
  }
}
```

### TaskIndexChannel

Full task details including comments and history.

```json
{
  "identifier": {
    "channel": "TaskIndexChannel"
  },
  "message": {
    "itemType": "task",
    "actionType": "update",
    "data": {
      "id": 1,
      "name": "Task name",
      "description": "Task description",
      "order": 1,
      "identifier": "PIE-1",
      "projectId": 1,
      "projectColumnId": 1,
      "assigneeId": 1,
      "createdById": 1,
      "relationMode": null,
      "relationId": null,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "createdBy": {
        "id": 1,
        "fullName": "John Doe"
      },
      "assignee": {
        "id": 1,
        "fullName": "John Doe"
      } | null,
      "comments": [
        {
          "id": 1,
          "content": "Comment text",
          "userId": 1,
          "createdAt": "2024-01-01T00:00:00.000Z"
        }
      ],
      "history": [
        {
          "id": 1,
          "text": "Created task",
          "userId": 1,
          "createdAt": "2024-01-01T00:00:00.000Z"
        }
      ]
    }
  }
}
```

### MembersIndexChannel

```json
{
  "identifier": {
    "channel": "MembersIndexChannel"
  },
  "message": {
    "itemType": "member",
    "actionType": "create",
    "data": {
      "id": 1,
      "userId": 1,
      "name": "John",
      "surname": "Doe",
      "email": "john@example.com",
      "avatarUrl": "https://example.com/avatar.jpg",
      "role": "Editor",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

### MemberIndexChannel

Same payload as MembersIndexChannel, but for single member updates.

### ColumnsIndexChannel

```json
{
  "identifier": {
    "channel": "ColumnsIndexChannel"
  },
  "message": {
    "itemType": "column",
    "actionType": "update",
    "data": {
      "id": 1,
      "name": "TODO",
      "order": 1,
      "color": "#00dfe3",
      "type": "start",
      "description": "To do column",
      "projectId": 1,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

### ProjectIndexChannel

```json
{
  "identifier": {
    "channel": "ProjectIndexChannel"
  },
  "message": {
    "itemType": "project",
    "actionType": "update",
    "data": {
      "name": "Updated Project Name",
      "description": "Updated description"
    }
  }
}
```

### UserProjectsIndexChannel

```json
{
  "identifier": {
    "channel": "UserProjectsIndexChannel"
  },
  "message": {
    "itemType": "project",
    "actionType": "create",
    "data": {
      "id": 1,
      "name": "New Project",
      "description": "Project description",
      "prefix": "NEW",
      "ownerId": 1,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

---

## Receiver Filtering

The server filters WebSocket messages by `receiversIds`. Only clients whose user ID is in the `receiversIds` array AND subscribed to the channel receive the message.

**Server-side logic:**
1. Get `receiversIds` from the broadcast payload
2. Check if connected client's user ID is in `receiversIds`
3. Check if client is subscribed to the target channel
4. Check if client's channel params match the broadcast params
5. If all match, send the message

---

## Client Implementation Notes

### Reconnection Strategy
- Implement exponential backoff for reconnection
- Re-subscribe to all channels after reconnection
- Buffer actions during disconnected state (optional)

### Error Handling
- Handle `Invalid payload` errors by checking message format
- Handle connection drops gracefully
- Token expiration: reconnect with new token

### Security Considerations
**⚠️ CRITICAL SECURITY ISSUE - CURRENTLY IN PRODUCTION:**

Token is passed in URL query params:
```
ws://localhost:8080?Authorization=<jwt_token>
```

This means:
- Token appears in server logs
- Token appears in browser history  
- Token may be exposed to proxies
- Token visible in WebSocket connection URL

**Frontend Connection Code (from useWebsockets.ts):**
```typescript
const url = import.meta.env.VITE_WS_BASE_URL
socket.value = new WebSocket(
  `${url}?Authorization=${token.value}`,
)
```

**Recommended Rewrite Solutions (in order of preference):**

1. **Session cookie (Recommended):** Use HttpOnly cookies for session, extract on WebSocket upgrade request
2. **Post-connection auth:** Authenticate via message after WebSocket connects:
   ```json
   { "type": "auth", "token": "<jwt>" }
   ```
3. **WebSocket subprotocol:** Use custom subprotocol for auth handshake

---

## Events That Trigger WebSocket Broadcasts

### Task Events
- Create task → `TasksIndexChannel` (create)
- Update task → `TasksIndexChannel`, `TaskIndexChannel` (update)
- Move task → `TasksIndexChannel` (update) for all affected tasks
- Add comment → `TaskIndexChannel` (update)
- Delete task → `TasksIndexChannel` (delete)

### Column Events
- Create column → `ColumnsIndexChannel` (create)
- Update column → `ColumnsIndexChannel` (update)
- Delete column → `ColumnsIndexChannel` (delete), tasks moved to backlog

### Member Events
- Invite member → `MembersIndexChannel` (create)
- Update role → `MembersIndexChannel`, `MemberIndexChannel` (update)
- Remove member → `MembersIndexChannel`, `MemberIndexChannel` (delete)

### Project Events
- Create project → `UserProjectsIndexChannel` (create)
- Update project → `ProjectIndexChannel` (update)
- Delete project → `UserProjectsIndexChannel` (delete)