# WebSocket Frontend Guide

## Overview

The Kanban backend provides real-time updates via WebSocket connections. The server uses **Socket.IO** for WebSocket communication, running on port **8080** by default.

> **Important Note:** The backend currently uses Socket.IO, which requires a Socket.IO client library on the frontend. The original contract was designed for native WebSocket connections. See the "Migration Notes" section below for details.

---

## Table of Contents

1. [Connection](#connection)
2. [Authentication](#authentication)
3. [Channels](#channels)
4. [Subscribing & Unsubscribing](#subscribing--unsubscribing)
5. [Message Format](#message-format)
6. [Events Reference](#events-reference)
7. [Reconnection Behavior](#reconnection-behavior)
8. [Error Handling](#error-handling)
9. [Code Examples](#code-examples)
10. [Migration Notes](#migration-notes)

---

## Connection

### Connection URL

```
ws://localhost:8080
```

Or with authentication:
```
ws://localhost:8080?Authorization=<jwt_token>
```

### Configuration

```typescript
// Environment variable
VITE_WS_BASE_URL=ws://localhost:8080
```

---

## Authentication

### Authentication Flow

1. Client connects to WebSocket server with JWT token
2. Server validates the token via Better Auth
3. On success, server sends a welcome message
4. On failure, the connection is terminated

### Token Header

The token is passed as:
- Query parameter: `?Authorization=<token>`
- Or Socket.IO auth option: `{ auth: { token: '<token>' } }`

```typescript
// Using Socket.IO client
import { io } from 'socket.io-client';

const socket = io('http://localhost:8080', {
  auth: {
    token: 'your-jwt-token-here'
  }
});
```

---

## Channels

Channels determine which real-time updates a client receives. Subscribe to the channels relevant to the user's current view.

### Available Channels

| Channel | Description | Parameters |
|---------|-------------|------------|
| `TasksIndexChannel` | Task list updates for a project | `{ projectId: number }` |
| `TaskIndexChannel` | Single task updates | `{ projectId: number, taskId: number }` |
| `ColumnsIndexChannel` | Column list updates | `{ projectId: number }` |
| `MembersIndexChannel` | Member list updates | `{ projectId: number }` |
| `MemberIndexChannel` | Single member updates | `{ projectId: number, memberId: number }` |
| `ProjectIndexChannel` | Project details updates | `{ projectId: number }` |
| `UserProjectsIndexChannel` | User's projects list | `{}` (no params) |

---

## Subscribing & Unsubscribing

### Subscribe to a Channel

```typescript
// Subscribe to a channel
socket.emit('subscribe', {
  channel: 'TasksIndexChannel',
  params: { projectId: 1 }
});
```

**Expected Response:**
```json
{
  "type": "confirmSubscription",
  "identifier": {
    "channel": "TasksIndexChannel"
  }
}
```

### Unsubscribe from a Channel

```typescript
// Unsubscribe from a channel
socket.emit('unsubscribe', {
  channel: 'TasksIndexChannel'
});
```

**Expected Response:**
```json
{
  "type": "confirmUnsubscription",
  "identifier": {
    "channel": "TasksIndexChannel"
  }
}
```

---

## Message Format

### Incoming Real-Time Updates

When a resource changes, the server broadcasts to all subscribed clients:

```typescript
// Received message structure
{
  identifier: {
    channel: "TasksIndexChannel"
  },
  message: {
    itemType: "task",
    actionType: "create" | "update" | "delete",
    data: {
      // Resource data
    }
  }
}
```

### Action Types

| Action | Description |
|--------|-------------|
| `create` | New resource was created |
| `update` | Existing resource was modified |
| `delete` | Resource was removed |

---

## Events Reference

### Server → Client Messages

#### Welcome Message
Sent immediately after successful connection:

```json
{
  "type": "welcome",
  "message": "Welcome!"
}
```

#### Subscription Confirmation

```json
{
  "type": "confirmSubscription",
  "identifier": {
    "channel": "TasksIndexChannel"
  }
}
```

#### Unsubscription Confirmation

```json
{
  "type": "confirmUnsubscription",
  "identifier": {
    "channel": "TasksIndexChannel"
  }
}
```

#### Error Message

```json
{
  "type": "error",
  "message": "Channel does not exist"
}
```

### Real-Time Update Payloads

#### TasksIndexChannel

```json
{
  "identifier": { "channel": "TasksIndexChannel" },
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
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

#### ColumnsIndexChannel

```json
{
  "identifier": { "channel": "ColumnsIndexChannel" },
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

#### MembersIndexChannel

```json
{
  "identifier": { "channel": "MembersIndexChannel" },
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

#### ProjectIndexChannel

```json
{
  "identifier": { "channel": "ProjectIndexChannel" },
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

#### UserProjectsIndexChannel

```json
{
  "identifier": { "channel": "UserProjectsIndexChannel" },
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

## Reconnection Behavior

### Automatic Reconnection

Socket.IO client automatically handles reconnection:

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:8080', {
  auth: { token: 'your-token' },
  reconnection: true,           // Enabled by default
  reconnectionAttempts: Infinity, // Number of attempts (default: Infinity)
  reconnectionDelay: 1000,     // Initial delay in ms
  reconnectionDelayMax: 5000   // Maximum delay
});
```

### Reconnection Events

```typescript
socket.on('connect', () => {
  console.log('Connected:', socket.id);
  // Re-subscribe to channels after reconnect
  subscribeToChannels();
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});

socket.on('reconnect', (attemptNumber) => {
  console.log('Reconnected after', attemptNumber, 'attempts');
  // IMPORTANT: Re-subscribe to all channels
  subscribeToChannels();
});

socket.on('reconnect_failed', () => {
  console.log('Reconnection failed after all attempts');
});
```

### Best Practice: Re-subscribe After Reconnect

Always re-subscribe to channels after reconnection:

```typescript
function subscribeToChannels() {
  // Subscribe to user's projects
  socket.emit('subscribe', {
    channel: 'UserProjectsIndexChannel',
    params: {}
  });
  
  // Subscribe to current project (if any)
  if (currentProjectId) {
    socket.emit('subscribe', {
      channel: 'TasksIndexChannel',
      params: { projectId: currentProjectId }
    });
    
    socket.emit('subscribe', {
      channel: 'ColumnsIndexChannel',
      params: { projectId: currentProjectId }
    });
    
    socket.emit('subscribe', {
      channel: 'MembersIndexChannel',
      params: { projectId: currentProjectId }
    });
  }
}
```

---

## Error Handling

### Connection Errors

```typescript
socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
  
  switch (error.message) {
    case 'Authentication required':
      // Redirect to login
      break;
    case 'Invalid session':
      // Refresh token and reconnect
      break;
    case 'Authentication failed':
      // Re-authenticate
      break;
  }
});
```

### Invalid Payload Errors

```typescript
socket.on('error', (error) => {
  console.error('Socket error:', error.message);
  
  switch (error.message) {
    case 'Invalid payload':
      // Check message format
      break;
    case 'Channel does not exist':
      // Verify channel name
      break;
  }
});
```

### Handling Missing Token

If the token expires during connection:

```typescript
// Check connection status
if (socket.connected === false) {
  // Get new token and reconnect
  const newToken = await refreshToken();
  socket.auth = { token: newToken };
  socket.connect();
}
```

---

## Code Examples

### Complete WebSocket Hook (React)

```typescript
import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseWebSocketOptions {
  token: string | null;
  onMessage?: (data: any) => void;
}

export function useWebSocket({ token, onMessage }: UseWebSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  
  // Initialize socket connection
  useEffect(() => {
    if (!token) return;
    
    socketRef.current = io('http://localhost:8080', {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });
    
    const socket = socketRef.current;
    
    socket.on('connect', () => {
      console.log('WebSocket connected:', socket.id);
    });
    
    socket.on('welcome', (data) => {
      console.log('Welcome:', data.message);
    });
    
    socket.on('message', (data) => {
      console.log('Received message:', data);
      onMessage?.(data);
    });
    
    socket.on('error', (error) => {
      console.error('WebSocket error:', error.message);
    });
    
    socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
    });
    
    return () => {
      socket.disconnect();
    };
  }, [token, onMessage]);
  
  // Subscribe to channel
  const subscribe = useCallback((channel: string, params: Record<string, any> = {}) => {
    socketRef.current?.emit('subscribe', { channel, params });
  }, []);
  
  // Unsubscribe from channel
  const unsubscribe = useCallback((channel: string) => {
    socketRef.current?.emit('unsubscribe', { channel });
  }, []);
  
  return { subscribe, unsubscribe, socket: socketRef.current };
}
```

### Usage in React Component

```typescript
import { useWebSocket } from './hooks/useWebSocket';
import { useTaskStore } from './stores/taskStore';

export function TaskBoard({ projectId }: { projectId: number }) {
  const { subscribe, unsubscribe } = useWebSocket({
    token: userToken,
    onMessage: handleWebSocketMessage
  });
  
  // Subscribe to project channels on mount
  useEffect(() => {
    subscribe('TasksIndexChannel', { projectId });
    subscribe('ColumnsIndexChannel', { projectId });
    subscribe('MembersIndexChannel', { projectId });
    
    return () => {
      unsubscribe('TasksIndexChannel');
      unsubscribe('ColumnsIndexChannel');
      unsubscribe('MembersIndexChannel');
    };
  }, [projectId, subscribe, unsubscribe]);
  
  function handleWebSocketMessage(data: any) {
    const { identifier, message } = data;
    
    switch (identifier.channel) {
      case 'TasksIndexChannel':
        taskStore.handleTaskUpdate(message);
        break;
      case 'ColumnsIndexChannel':
        columnStore.handleColumnUpdate(message);
        break;
      case 'MembersIndexChannel':
        memberStore.handleMemberUpdate(message);
        break;
    }
  }
  
  // ... render component
}
```

### Vanilla JavaScript Example

```typescript
import { io } from 'socket.io-client';

// Configuration
const WS_URL = 'http://localhost:8080';
const TOKEN = 'your-jwt-token';

// Create socket
const socket = io(WS_URL, {
  auth: { token: TOKEN },
  reconnection: true
});

// Event handlers
socket.on('connect', () => {
  console.log('Connected:', socket.id);
  
  // Subscribe to tasks for project 1
  socket.emit('subscribe', {
    channel: 'TasksIndexChannel',
    params: { projectId: 1 }
  });
  
  // Subscribe to columns for project 1
  socket.emit('subscribe', {
    channel: 'ColumnsIndexChannel',
    params: { projectId: 1 }
  });
});

socket.on('welcome', (data) => {
  console.log('Welcome:', data.message);
});

socket.on('confirmSubscription', (data) => {
  console.log('Subscribed to:', data.channel);
});

socket.on('message', (data) => {
  console.log('Update received:', data);
  
  // Handle based on channel
  const { identifier, message } = data;
  
  if (identifier.channel === 'TasksIndexChannel') {
    handleTaskUpdate(message);
  } else if (identifier.channel === 'ColumnsIndexChannel') {
    handleColumnUpdate(message);
  }
});

socket.on('error', (error) => {
  console.error('Error:', error.message);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});

// Reconnection handler
socket.on('reconnect', () => {
  console.log('Reconnected - re-subscribing');
  socket.emit('subscribe', {
    channel: 'TasksIndexChannel',
    params: { projectId: 1 }
  });
});

// Cleanup
function cleanup() {
  socket.emit('unsubscribe', { channel: 'TasksIndexChannel' });
  socket.emit('unsubscribe', { channel: 'ColumnsIndexChannel' });
  socket.disconnect();
}
```

---

## Migration Notes

### Socket.IO vs Native WebSocket

> **Important:** The backend uses **Socket.IO** (not native WebSocket). This requires changes to the frontend client implementation.

#### Original Contract (Native WebSocket)
- Used raw `WebSocket` API
- Message format: JSON strings
- Subscribe: `{"command":"subscribe","identifier":{...}}`
- Events sent as event names

#### Current Implementation (Socket.IO)
- Uses Socket.IO client library
- Binary-safe protocol
- Same message format for data
- Authentication via `auth` option or query param

#### Migration Steps

1. **Install Socket.IO client:**
   ```bash
   npm install socket.io-client
   ```

2. **Update connection code:**
   ```typescript
   // Before (native WebSocket)
   const socket = new WebSocket(`ws://localhost:8080?Authorization=${token}`);
   
   // After (Socket.IO)
   import { io } from 'socket.io-client';
   const socket = io('http://localhost:8080', {
     auth: { token }
   });
   ```

3. **Update message handling:**
   ```typescript
   // Before (native WebSocket)
   socket.onmessage = (event) => {
     const data = JSON.parse(event.data);
   };
   
   // After (Socket.IO)
   socket.on('message', (data) => {
     // Already parsed
   });
   ```

---

## Troubleshooting

### Connection Issues

1. **"Authentication required"**
   - Token is missing or invalid
   - Ensure token is passed via `auth` option

2. **"Invalid session"**
   - Token has expired
   - Refresh the token and reconnect

3. **CORS errors**
   - Ensure the WebSocket server CORS is configured to allow your origin

### Message Issues

1. **Not receiving messages**
   - Check subscription confirmation was received
   - Verify you're subscribed to the correct channel with correct params
   - Ensure you have permission (must be project member)

2. **Wrong message format**
   - Check console for error messages
   - Verify channel name matches exactly

### Reconnection Issues

1. **Infinite reconnection loop**
   - Check token validity
   - Implement token refresh logic

2. **Missing messages during disconnect**
   - Re-subscribe to all channels on reconnect
   - Consider implementing message buffering for critical updates

---

## Security Considerations

### Token Security

The current implementation passes the JWT token via:
- Query parameter: `?Authorization=<token>`
- Socket.IO auth option: `{ auth: { token: '...' } }`

> **Note:** This is a known security consideration. For production, consider:
> 1. Using HTTP-only cookies for session management
> 2. Implementing post-connection authentication
> 3. Using WebSocket subprotocols for auth handshake

### Permission Filtering

The server filters messages by project membership:
- Only project members receive project-related updates
- Owner has same permissions as members
- Filtering happens server-side before broadcast

---

## Related Documentation

- [WebSocket Contract](../REWRITEPLAN/WEBSOCKET_CONTRACT.md) - Detailed message format specification
- [WebSocket Broadcasting Architecture](../docs/WEBSOCKET_BROADCASTING_ARCHITECTURE.md) - Backend architecture details
- [WebSocket Implementation Plan](../plans/WEBSOCKET_IMPLEMENTATION_PLAN.md) - Implementation roadmap