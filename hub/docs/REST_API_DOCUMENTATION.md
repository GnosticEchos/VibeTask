# REST API Documentation

This document provides detailed REST API documentation for the Kanban backend. For OpenAPI specification, see [`src/openapi.json`](../src/openapi.json).

## Base URL

```
http://localhost:3000/api
```

## Authentication

### Session-Based Authentication (Human Users)

All endpoints (except login/register) require a Bearer token in the Authorization header:

```http
Authorization: Bearer <token>
```

The token is obtained from the login or register endpoints.

### API Key Authentication (AI Agents)

Agents authenticate using API keys created via the agent management endpoints:

```http
x-agent-api-key: <api_key>
```

The API key must have the `ag` prefix and be associated with delegations for project access.
For platform agents, default access is read-only and limited to `GET /api/agent/health` and `GET /api/agent/me` unless additional read endpoints are explicitly enabled by an admin.

### Login

**POST** `/api/login`

Authenticate a user and obtain a session token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response (200):**
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": 1,
    "name": "John Doe",
    "fullName": "John Doe",
    "email": "user@example.com",
    "avatarUrl": null,
    "role": "ADMIN",
    "permissions": {
      "isAdmin": true,
      "canManageRateLimits": true,
      "canManageUsers": true,
      "canManageSystem": true
    }
  }
}
```

### Register

**POST** `/api/register`

Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "John Doe"
}
```

**Response (200):**
```json
{
  "token": "jwt_token_here",
  "user": {
    "id": 1,
    "name": "John Doe",
    "fullName": "John Doe",
    "email": "user@example.com",
    "avatarUrl": null,
    "role": "USER",
    "permissions": {
      "isAdmin": false,
      "canManageRateLimits": false,
      "canManageUsers": false,
      "canManageSystem": false
    }
  }
}
```

### Get Session

**GET** `/api/session`

Verify the current session and get user details including system role and permissions.

**Headers:**
```http
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "user": {
    "id": 1,
    "name": "John Doe",
    "fullName": "John Doe",
    "email": "user@example.com",
    "avatarUrl": null,
    "role": "ADMIN",
    "permissions": {
      "isAdmin": true,
      "canManageRateLimits": true,
      "canManageUsers": true,
      "canManageSystem": true
    }
  }
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `user.id` | integer | User's unique identifier |
| `user.name` | string | User's display name |
| `user.fullName` | string | Alias for name |
| `user.email` | string | User's email address |
| `user.avatarUrl` | string \| null | User's avatar URL |
| `user.role` | string | System role: `USER`, `SUPPORT`, or `ADMIN` |
| `user.permissions.isAdmin` | boolean | Whether the user has admin privileges |
| `user.permissions.canManageRateLimits` | boolean | Whether the user can manage rate limit configurations |
| `user.permissions.canManageUsers` | boolean | Whether the user can manage user roles |
| `user.permissions.canManageSystem` | boolean | Whether the user has full system access |

**Permission Mapping:**
| Role | `isAdmin` | `canManageRateLimits` | `canManageUsers` | `canManageSystem` |
|------|-----------|----------------------|------------------|-------------------|
| USER | false | false | false | false |
| SUPPORT | false | false | false | false |
| ADMIN | true | true | true | true |

### Logout

**POST** `/api/logout`

End the current session.

**Headers:**
```http
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true
}
```

---

## Projects

### List Projects

**GET** `/api/projects`

Get all projects the user is a member of.

**Headers:**
```http
Authorization: Bearer <token>
```

**Response (200):**
```json
[
  {
    "id": 1,
    "name": "My Project",
    "description": "Project description",
    "prefix": "PROJ",
    "ownerId": 1,
    "columns": [...],
    "isMember": true
  }
]
```

### Create Project

**POST** `/api/projects`

Create a new project.

**Headers:**
```http
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "My Project",
  "prefix": "PROJ",
  "description": "Optional description"
}
```

**Response (201):**
```json
{
  "id": 1,
  "name": "My Project",
  "description": "Optional description",
  "prefix": "PROJ",
  "ownerId": 1,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### Get Project

**GET** `/api/projects/:id`

Get a specific project with columns and tasks.

**Headers:**
```http
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "id": 1,
  "name": "My Project",
  "description": "Project description",
  "prefix": "PROJ",
  "role": "Owner",
  "userId": 1,
  "members": [...],
  "columns": [...]
}
```

### Update Project

**PATCH** `/api/projects/:id`

Update project details. Only the owner can update.

**Headers:**
```http
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "New Name",
  "description": "New description"
}
```

**Response (200):**
```json
{
  "id": 1,
  "name": "New Name",
  "description": "New description",
  ...
}
```

### Delete Project

**DELETE** `/api/projects/:id`

Delete a project. Only the owner can delete.

**Headers:**
```http
Authorization: Bearer <token>
```

**Response (200):**
```json
{}
```

### Get Project Board

**GET** `/api/projects/:id/board`

Get the complete board data for a project.

**Headers:**
```http
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "board": {
    "id": 1,
    "name": "My Project",
    "description": "..."
  },
  "columns": [...],
  "members": [...],
  "tags": [],
  "permissions": {
    "canEdit": true,
    "canAddColumn": true,
    "canMoveTask": true
  }
}
```

---

## Tasks

### List Tasks

**GET** `/api/tasks?projectId=<id>`

Get tasks for a specific project.

**Headers:**
```http
Authorization: Bearer <token>
```

**Query Parameters:**
- `projectId` (required): The project ID

**Response (200):**
```json
[
  {
    "id": 1,
    "name": "Task name",
    "description": "Task description",
    "order": 1,
    "identifier": "PROJ-1",
    "projectId": 1,
    "projectColumnId": 1,
    "assigneeId": 1,
    "createdById": 1,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

### Get Task

**GET** `/api/tasks/:id`

Get a specific task with comments and history.

**Headers:**
```http
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "id": 1,
  "name": "Task name",
  "description": "Task description",
  "identifier": "PROJ-1",
  "projectId": 1,
  "projectColumnId": 1,
  "comments": [...],
  "history": [...]
}
```

### Create Task

**POST** `/api/tasks`

Create a new task. Requires Editor, Maintainer, or Owner role.

**Headers:**
```http
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "projectId": 1,
  "name": "Task name",
  "description": "Optional description",
  "assigneeId": 1,
  "projectColumnId": 1,
  "relationMode": "blocked_by",
  "relationId": 5
}
```

**Response (201):**
```json
{
  "id": 1,
  "name": "Task name",
  ...
}
```

### Update Task

**PATCH** `/api/tasks/:id`

Update task details.

**Headers:**
```http
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "New name",
  "description": "New description",
  "assigneeId": 2,
  "projectColumnId": 3,
  "relationMode": "blocks",
  "relationId": 10
}
```

**Response (200):**
```json
{
  "id": 1,
  "name": "New name",
  ...
}
```

### Move Task

**POST** `/api/tasks/:id/move`

Move a task to a different column and position.

**Headers:**
```http
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "targetColumnId": 2,
  "targetIndex": 0
}
```

**Response (200):**
```json
{}
```

### Add Comment

**POST** `/api/tasks/:id/comments`

Add a comment to a task.

**Headers:**
```http
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "content": "Comment text"
}
```

**Response (200):**
```json
{
  "id": 1,
  "content": "Comment text",
  "taskId": 1,
  "userId": 1,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

---

## Columns

### List Columns

**GET** `/api/columns?projectId=<id>`

Get all columns for a project.

**Headers:**
```http
Authorization: Bearer <token>
```

**Query Parameters:**
- `projectId` (required): The project ID

**Response (200):**
```json
[
  {
    "id": 1,
    "name": "To Do",
    "order": 0,
    "color": "#6366f1",
    "type": null,
    "description": null,
    "projectId": 1,
    "tasks": [...]
  }
]
```

### Create Column

**POST** `/api/columns`

Create a new column. Requires Editor, Maintainer, or Owner role.

**Headers:**
```http
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "In Progress",
  "projectId": 1,
  "order": 1,
  "color": "#f59e0b",
  "type": null,
  "description": null
}
```

**Response (201):**
```json
{
  "id": 2,
  "name": "In Progress",
  ...
}
```

### Batch Update Columns

**PATCH** `/api/columns`

Create, update, and delete columns in a batch operation.

**Headers:**
```http
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "projectId": 1,
  "columns": [
    { "id": 1, "name": "Updated", "order": 0, "toDelete": false },
    { "id": 2, "name": "Done", "order": 1, "toDelete": false },
    { "name": "New Column", "order": 2, "toDelete": false }
  ]
}
```

**Response (200):**
```json
{}
```

---

## Members

### List Members

**GET** `/api/members?projectId=<id>`

Get all members of a project.

**Headers:**
```http
Authorization: Bearer <token>
```

**Query Parameters:**
- `projectId` (required): The project ID

**Response (200):**
```json
[
  {
    "id": 1,
    "userId": 1,
    "name": "John",
    "surname": "Doe",
    "email": "john@example.com",
    "avatarUrl": null,
    "role": "Owner",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

### Get Member

**GET** `/api/members/:id?projectId=<id>`

Get a specific member's details.

**Headers:**
```http
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "id": 1,
  "userId": 1,
  "name": "John",
  "surname": "Doe",
  "email": "john@example.com",
  "avatarUrl": null,
  "role": "Owner",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### Check Invite Eligibility

**GET** `/api/members/check_email?projectId=<id>&email=<email>`

Check if a user can be invited to a project.

**Headers:**
```http
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "email": "user@example.com",
  "id": 2,
  "avatarUrl": null
}
```

### Invite Members

**POST** `/api/members/invite`

Invite users to a project. Requires Owner or Maintainer role.

**Headers:**
```http
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "projectId": 1,
  "users": [
    { "id": 2, "role": "Editor" },
    { "id": 3, "role": "Viewer" }
  ]
}
```

**Response (200):**
```json
{}
```

### Update Member Role

**PATCH** `/api/members/:id`

Update a member's role. Only the owner can change roles.

**Headers:**
```http
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "role": "Maintainer",
  "projectId": 1
}
```

**Response (200):**
```json
{
  "id": 2,
  "role": "Maintainer",
  ...
}
```

### Remove Member

**DELETE** `/api/members/:id?projectId=<id>`

Remove a member from a project.

**Headers:**
```http
Authorization: Bearer <token>
```

**Query Parameters:**
- `projectId` (required): The project ID

**Response (200):**
```json
{
  "id": 2,
  "userId": 2,
  ...
}
```

---

## Agents

### List Agents

**GET** `/api/agents`

List all agents (API keys) owned by the current user. Requires USER role or higher.

**Headers:**
```http
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "agents": [
    {
      "id": "ag_abc123",
      "name": "My Agent",
      "prefix": "ag",
      "isActive": true,
      "lastUsedAt": null,
      "expiresAt": "2025-01-01T00:00:00.000Z",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "metadata": {
        "isAgent": true,
        "description": "Agent description"
      }
    }
  ]
}
```

### Create Agent

**POST** `/api/agents`

Create a new agent (API key). Requires USER role or higher.

**Headers:**
```http
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "My Agent",
  "description": "Agent for task automation",
  "expiresIn": 31536000
}
```

**Response (201):**
```json
{
  "agent": {
    "id": "ag_abc123",
    "name": "My Agent",
    "prefix": "ag",
    "expiresAt": "2025-01-01T00:00:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "apiKey": "ag_abc123_xyz789"  // ONLY SHOWN ONCE
}
```

### Update Agent

**PATCH** `/api/agents/:id`

Update agent details.

**Headers:**
```http
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "isActive": false,
  "expiresIn": 86400
}
```

**Response (200):**
```json
{
  "agent": {
    "id": "ag_abc123",
    "name": "Updated Name",
    "isActive": false,
    ...
  }
}
```

### Delete Agent

**DELETE** `/api/agents/:id`

Delete an agent and all its delegations.

**Headers:**
```http
Authorization: Bearer <token>
```

**Response (204):**
```
(No content)
```

### Regenerate Agent Key

**POST** `/api/agents/:id/regenerate-key`

Rotate an agent's API key.

### Platform Agent Registry (Admin)

Platform agents are admin-managed API keys intended for system integrations that need controlled read-only access across `/api/agent/*` routes.

**Default access (always enabled for platform agents):**
- `GET /api/agent/health`
- `GET /api/agent/me`

**Admin-configurable additional read-only access:**
- `GET /api/agent/projects`
- `GET /api/agent/projects/:projectId/tasks`
- `GET /api/agent/projects/:projectId/tasks/:taskId`

Platform-agent management endpoints (ADMIN only):
- `GET /api/admin/platform-agents`
- `POST /api/admin/platform-agents`
- `PATCH /api/admin/platform-agents/:id`
- `DELETE /api/admin/platform-agents/:id`
- `POST /api/admin/platform-agents/:id/regenerate-key`
- `GET /api/admin/platform-agents/endpoint-catalog`

**Headers:**
```http
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "agent": {
    "id": "ag_new123",
    "name": "My Agent",
    ...
  },
  "apiKey": "ag_new123_xyz789"  // ONLY SHOWN ONCE
}
```

---

## Agent Delegations

Delegations grant agents access to specific projects with defined permission levels.

### List Delegations

**GET** `/api/agents/:agentId/delegations`

List all delegations for an agent.

**Headers:**
```http
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "delegations": [
    {
      "id": "del_123",
      "apiKeyId": "ag_abc123",
      "projectId": 1,
      "projectName": "My Project",
      "projectPrefix": "PROJ",
      "permissionLevel": "USER",
      "isActive": true,
      "revokedAt": null,
      "delegatedById": 1,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### Create Delegation

**POST** `/api/agents/:agentId/delegations`

Delegate an agent to a project.

**Headers:**
```http
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "projectId": 1,
  "permissionLevel": "VIEWER"
}
```

**Response (201):**
```json
{
  "delegation": {
    "id": "del_123",
    "apiKeyId": "ag_abc123",
    "projectId": 1,
    "projectName": "My Project",
    "permissionLevel": "VIEWER",
    "isActive": true,
    ...
  }
}
```

### Update Delegation

**PATCH** `/api/agents/:agentId/delegations/:delegationId`

Update a delegation's permission level.

**Headers:**
```http
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "permissionLevel": "USER"
}
```

**Response (200):**
```json
{
  "delegation": {
    "permissionLevel": "USER",
    ...
  }
}
```

### Revoke Delegation

**DELETE** `/api/agents/:agentId/delegations/:delegationId`

Revoke an agent's access to a project.

**Headers:**
```http
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "delegation": {
    "id": "del_123",
    "isActive": false,
    "revokedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## Admin

### List Rate Limit Configs

**GET** `/api/admin/rate-limits`

List all rate limit configurations. Requires ADMIN role.

**Headers:**
```http
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "configs": [
    {
      "id": 1,
      "name": "Authentication",
      "endpointPattern": "/api/auth/*",
      "windowMs": 900000,
      "maxRequests": 5,
      "enabled": true,
      "description": "Limit authentication attempts",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### Create Rate Limit Config

**POST** `/api/admin/rate-limits`

Create a new rate limit configuration.

**Headers:**
```http
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "Custom API",
  "endpointPattern": "/api/custom/*",
  "windowMs": 60000,
  "maxRequests": 100,
  "enabled": true,
  "description": "Custom rate limit"
}
```

**Response (201):**
```json
{
  "config": { ... }
}
```

### Update Rate Limit Config

**PUT** `/api/admin/rate-limits/:id`

Update a rate limit configuration.

**Headers:**
```http
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "maxRequests": 200
}
```

**Response (200):**
```json
{
  "config": { ... }
}
```

### Delete Rate Limit Config

**DELETE** `/api/admin/rate-limits/:id`

Delete a rate limit configuration.

**Headers:**
```http
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "message": "Rate limit configuration deleted successfully"
}
```

### Toggle Rate Limit Config

**POST** `/api/admin/rate-limits/:id/toggle`

Enable or disable a rate limit configuration.

**Headers:**
```http
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "config": { ... },
  "message": "Rate limit configuration enabled"
}
```

---

## Health

### Health Check

**GET** `/health`

Check if the HTTP server is running.

**Response (200):**
```json
{
  "status": "ok"
}
```

### WebSocket Health Check

**GET** `/health/websocket`

Check if the WebSocket server is running.

**Response (200):**
```json
{
  "status": "ok",
  "websocket": {
    "enabled": true,
    "port": 8080
  }
}
```

---

## Rate Limiting

Rate limiting is applied globally to all API endpoints. When exceeded, the server returns:

**Response (429):**
```json
{
  "error": "Too many requests, please try again later.",
  "retryAfter": 60
}
```

**Headers:**
```
Retry-After: 60
X-RateLimit-Limit: 100
X-RateLimit-Window: 900000ms
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Invalid request body"
}
```

### 401 Unauthorized
```json
{
  "error": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "error": "Access denied"
}
```

### 404 Not Found
```json
{
  "error": "Resource not found"
}
```

### 429 Too Many Requests
```json
{
  "error": "Too many requests, please try again later.",
  "retryAfter": 60
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error"
}
```

---

## See Also

- [API Contract Status](./API_CONTRACT_STATUS.md) - Frontend contract compatibility
- [OpenAPI Specification](../src/openapi.json) - Machine-readable API spec
- [WebSocket Guide](./WEBSOCKET_FRONTEND_GUIDE.md) - Real-time updates documentation