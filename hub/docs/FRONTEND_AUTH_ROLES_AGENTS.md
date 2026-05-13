# Frontend Authentication, Roles & Agents Documentation

> **Quick Reference** for frontend developers integrating with the Kanban backend.
> 
> For detailed architecture, see: [Agent Delegation Architecture](../plans/AGENT_DELEGATION_ARCHITECTURE.md)
> For detailed role system, see: [User Role System Plan](../plans/USER_ROLE_SYSTEM_PLAN.md)
> For REST API details, see: [REST API Documentation](./REST_API_DOCUMENTATION.md)

---

## Table of Contents

1. [Authentication Flow](#a-authentication-flow)
2. [Agent API Keys](#b-agent-api-keys)
3. [Role System](#c-role-system)
4. [Agent Features](#d-agent-features)
5. [Rate Limiting](#e-rate-limiting)

---

## A. Authentication Flow

### Overview

The Kanban backend uses **Better Auth** for user authentication with:
- Session-based authentication (cookies + tokens)
- Email/password login
- Automatic token refresh (rolling sessions)
- 30-day session expiration

### Authentication Endpoints

The server exposes **two** surfaces:

**A. Legacy / SPA contract** (Express routes on `/api`, matches the existing Kanban frontend and `openapi.json`):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/login` | POST | User login |
| `/api/signin` | POST | Alias for login |
| `/api/register` | POST | User registration |
| `/api/signup` | POST | Alias for register |
| `/api/logout` | POST | User logout |
| `/api/session` | GET | Current user, **global `role`**, and **`permissions`** |

**B. Better Auth native** (handled by Better Auth at `/api/auth/*` — use if you integrate with the Better Auth client directly, not required for the legacy SPA contract above.)

### Login Flow

```typescript
// 1. Send credentials
const response = await fetch('/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'securepassword123'
  })
});

const { token, user } = await response.json();

// 2. Store token securely
localStorage.setItem('auth_token', token);

// 3. Use token in subsequent requests
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};
```

### Login Response Format

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

### Session Management

#### Check Session (Validate Token)

```typescript
async function verifySession(token: string): Promise<User | null> {
  const response = await fetch('/api/session', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!response.ok) return null;
  
  const { user } = await response.json();
  return user;
}
```

#### Logout Flow

```typescript
async function logout(token: string): Promise<void> {
  await fetch('/api/logout', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  // Always clear local storage
  localStorage.removeItem('auth_token');
}
```

### Token Refresh

Better Auth uses **rolling sessions** - the session is automatically refreshed on each request when:
- The session is older than 24 hours (`updateAge`)
- The session expires in 30 days (`expiresIn`)

You don't need to implement manual token refresh - the backend handles it automatically via cookies.

### Frontend Best Practices

```typescript
// API client wrapper with auth
class KanbanApiClient {
  private baseUrl = '/api';
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('auth_token');
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('auth_token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('auth_token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>)
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers
    });

    // Handle 401 - token expired or invalid
    if (response.status === 401) {
      this.clearToken();
      // Redirect to login or emit auth error event
      window.dispatchEvent(new CustomEvent('auth:expired'));
    }

    // Handle rate limiting (429)
    if (response.status === 429) {
      const { retryAfter } = await response.json();
      throw new RateLimitError(retryAfter);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  }

  // Convenience methods
  async login(email: string, password: string) {
    const result = await this.request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    this.setToken(result.token);
    return result;
  }

  async logout() {
    await this.request('/auth/logout', { method: 'POST' });
    this.clearToken();
  }
}
```

---

## B. Agent API Keys

### Overview

Agents (AI assistants, scripts, integrations) authenticate using **API keys** instead of user sessions. This is ideal for:
- AI assistants accessing project data
- Automated scripts and CI/CD pipelines
- Third-party integrations (Slack, GitHub, etc.)
- Machine-to-machine communication

### Agent Authentication Header

```typescript
// For agent requests, use the custom header
const agentHeaders = {
  'x-agent-api-key': 'ag_abc1234_xyz789...',
  'Content-Type': 'application/json'
};
```

### Creating Agent API Keys

> **Note:** Only users with USER, SUPPORT, or ADMIN roles can create agents.

```typescript
async function createAgent(token: string, name: string, description?: string) {
  const response = await fetch('/api/agents', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name,
      description: description || '',
      expiresIn: 31536000 // 1 year in seconds (optional)
    })
  });

  const { agent, apiKey } = await response.json();
  
  // IMPORTANT: apiKey is only shown ONCE - store securely
  console.log('Store this key securely:', apiKey);
  console.log('Agent ID:', agent.id);
  
  return { agent, apiKey };
}

// Usage
const { agent, apiKey } = await createAgent(
  userToken, 
  'My Slack Bot',
  'Integration with Slack workspace'
);
```

### Response Format (Create Agent)

```json
{
  "agent": {
    "id": "ag_abc123",
    "name": "My Slack Bot",
    "prefix": "ag",
    "expiresAt": "2025-01-01T00:00:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "apiKey": "ag_abc123_xyz789"  // ONLY SHOWN ONCE - SAVE IMMEDIATELY!
}
```

### Listing Your Agents

```typescript
async function listAgents(token: string) {
  const response = await fetch('/api/agents', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const { agents } = await response.json();
  return agents;
}

// Returns array of agents (without the actual key)
const agents = await listAgents(userToken);
// [
//   {
//     "id": "ag_abc123",
//     "name": "My Agent",
//     "prefix": "ag",
//     "isActive": true,
//     "lastUsedAt": null,
//     "expiresAt": "2025-01-01T00:00:00.000Z"
//   }
// ]
```

### Updating an Agent

```typescript
async function updateAgent(token: string, agentId: string, updates: {
  name?: string;
  description?: string;
  isActive?: boolean;
}) {
  const response = await fetch(`/api/agents/${agentId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(updates)
  });
  
  const { agent } = await response.json();
  return agent;
}

// Deactivate an agent (revoke access)
await updateAgent(userToken, 'ag_abc123', { isActive: false });
```

### Regenerating Agent Key

> **Warning:** This invalidates the old key immediately. Update all integrations before calling.

```typescript
async function regenerateAgentKey(token: string, agentId: string) {
  const response = await fetch(`/api/agents/${agentId}/regenerate-key`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const { agent, apiKey } = await response.json();
  
  // New key shown only once
  return { agent, apiKey };
}
```

### Deleting an Agent

```typescript
async function deleteAgent(token: string, agentId: string) {
  const response = await fetch(`/api/agents/${agentId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  // Returns 204 No Content on success
}
```

### Using Agent Keys in Requests

```typescript
// Agent makes API request
async function agentGetProjects(apiKey: string) {
  const response = await fetch('/api/agent/projects', {
    headers: {
      'x-agent-api-key': apiKey
    }
  });
  
  return response.json();
}

// Get tasks for a specific project
async function agentGetTasks(apiKey: string, projectId: number) {
  const response = await fetch(`/api/agent/projects/${projectId}/tasks`, {
    headers: {
      'x-agent-api-key': apiKey
    }
  });
  
  return response.json();
}

// Create a task (requires USER permission)
async function agentCreateTask(apiKey: string, projectId: number, task: {
  name: string;
  description?: string;
  projectColumnId?: number;
}) {
  const response = await fetch(`/api/agent/projects/${projectId}/tasks`, {
    method: 'POST',
    headers: {
      'x-agent-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(task)
  });
  
  return response.json();
}
```

---

## C. Role System

### Overview

The Kanban backend implements a **global role system** with three levels:

| Role | Description | Capabilities |
|------|-------------|--------------|
| `USER` | Regular user | Create projects, manage own tasks, create agents |
| `SUPPORT` | Support staff | All USER capabilities + view/admin features |
| `ADMIN` | Administrator | Full system access, manage rate limits, user management |

### Role Hierarchy

```
ADMIN (Level 3)
   │
   ├── Can access /api/admin/* endpoints
   ├── Can manage rate limit configurations
   └── Can manage user roles
   │
SUPPORT (Level 2)
   │
   ├── All USER capabilities
   └── Additional support features
   │
USER (Level 1) ── Default for new users
   │
   ├── Create and manage own projects
   ├── Create and manage tasks
   └── Create and manage agents
```

### Getting User Role

The user role is now included in the session response. Call `/api/session` after login to get the user's role and permissions:

```typescript
// After login, call session to get role and permissions
async function getCurrentUser(token: string) {
  const response = await fetch('/api/session', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const { user } = await response.json();
  
  // user.role is now included: 'USER', 'SUPPORT', or 'ADMIN'
  // user.permissions contains computed permissions based on role
  return user;
}

// Example response:
// {
//   id: 1,
//   name: "John Doe",
//   fullName: "John Doe",
//   email: "user@example.com",
//   avatarUrl: null,
//   role: "ADMIN",
//   permissions: {
//     isAdmin: true,
//     canManageRateLimits: true,
//     canManageUsers: true,
//     canManageSystem: true
//   }
// }

async function getUserWithRole(token: string) {
  // User role is available in auth context on protected routes
  const response = await fetch('/api/projects', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  // Role is attached to request internally
  // Check response headers or admin endpoints for role info
}
```

#### Using Permissions in Frontend

```typescript
// TypeScript interface for user with permissions
interface UserWithPermissions {
  id: number;
  name: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  role: 'USER' | 'SUPPORT' | 'ADMIN';
  permissions: {
    isAdmin: boolean;
    canManageRateLimits: boolean;
    canManageUsers: boolean;
    canManageSystem: boolean;
  };
}

// Example: Conditionally render admin UI
function AdminPanel({ user }: { user: UserWithPermissions }) {
  if (!user.permissions.isAdmin) {
    return null; // Don't show admin panel to non-admins
  }
  
  return (
    <div>
      <h2>Admin Settings</h2>
      {user.permissions.canManageRateLimits && <RateLimitConfig />}
      {user.permissions.canManageUsers && <UserManagement />}
    </div>
  );
}
```

### Role-Based Access Control

#### Protected Endpoints by Role

| Endpoint | Required Role |
|----------|---------------|
| `POST /api/agents` | USER, SUPPORT, ADMIN |
| `GET /api/admin/rate-limits` | ADMIN |
| `POST /api/admin/rate-limits` | ADMIN |
| `PATCH /api/admin/rate-limits/:id` | ADMIN |
| `DELETE /api/admin/rate-limits/:id` | ADMIN |

#### Error Response for Insufficient Permissions

```json
{
  "error": "USER role or higher required",
  "required": ["USER", "SUPPORT", "ADMIN"],
  "current": "VIEWER"
}
```

### Project Roles (vs Global Roles)

> **Note:** Global roles (USER, SUPPORT, ADMIN) are separate from **project-level roles**.

Project roles are assigned per-project:

| Project Role | Description |
|--------------|-------------|
| `Owner` | Full project control, can delete project |
| `Maintainer` | Manage members, edit project settings |
| `Editor` | Create/edit/delete tasks |
| `Viewer` | Read-only access |

```typescript
// Get project with role info
async function getProject(token: string, projectId: number) {
  const response = await fetch(`/api/projects/${projectId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const project = await response.json();
  
  // Project includes role for current user
  console.log(project.role); // "Owner", "Maintainer", "Editor", or "Viewer"
  return project;
}
```

---

## D. Agent Features

### Overview

Agents are automated entities that can perform actions on behalf of users. They need:
1. **An API key** - For authentication
2. **Delegations** - Permission to access specific projects

### Agent Delegation Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                   DELEGATION FLOW                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Create Agent (get API key)                              │
│           │                                                  │
│           ▼                                                  │
│  2. Delegate Agent to Project (grant access)                │
│           │                                                  │
│           ▼                                                  │
│  3. Agent can access project based on permission level      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Permission Levels

| Level | Can Do | Cannot Do |
|-------|--------|-----------|
| `VIEWER` | View tasks, columns, members, project details | Create/edit/delete anything |
| `USER` | Create/edit/delete tasks, add comments, view everything | Delete project, modify columns, manage members |

### Creating a Delegation

> **Note:** You must be a member of the project to delegate an agent to it.

```typescript
async function delegateAgentToProject(
  token: string,
  agentId: string,
  projectId: number,
  permissionLevel: 'VIEWER' | 'USER'
) {
  const response = await fetch(`/api/agents/${agentId}/delegations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      projectId,
      permissionLevel
    })
  });
  
  const { delegation } = await response.json();
  return delegation;
}

// Example: Delegate agent to project with USER permissions
const delegation = await delegateAgentToProject(
  userToken,
  'ag_abc123',  // Agent ID
  1,            // Project ID
  'USER'        // Permission level
);
```

### Delegation Response Format

```json
{
  "delegation": {
    "id": "del_abc123",
    "apiKeyId": "ag_abc123",
    "projectId": 1,
    "projectName": "My Project",
    "permissionLevel": "USER",
    "isActive": true,
    "delegatedById": 1,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Listing Delegations

```typescript
async function listDelegations(token: string, agentId: string) {
  const response = await fetch(`/api/agents/${agentId}/delegations`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const { delegations } = await response.json();
  return delegations;
}

// Returns array of delegations
const delegations = await listDelegations(userToken, 'ag_abc123');
// [
//   {
//     "id": "del_abc123",
//     "projectId": 1,
//     "projectName": "My Project",
//     "permissionLevel": "USER",
//     "isActive": true,
//     "createdAt": "2024-01-01T00:00:00.000Z"
//   }
// ]
```

### Updating Delegation Permission

```typescript
async function updateDelegation(
  token: string,
  agentId: string,
  delegationId: string,
  permissionLevel: 'VIEWER' | 'USER'
) {
  const response = await fetch(
    `/api/agents/${agentId}/delegations/${delegationId}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ permissionLevel })
    }
  );
  
  const { delegation } = await response.json();
  return delegation;
}

// Example: Downgrade from USER to VIEWER
await updateDelegation(userToken, 'ag_abc123', 'del_abc123', 'VIEWER');
```

### Revoking Delegation

```typescript
async function revokeDelegation(
  token: string,
  agentId: string,
  delegationId: string
) {
  const response = await fetch(
    `/api/agents/${agentId}/delegations/${delegationId}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );
  
  const { delegation } = await response.json();
  // delegation.isActive === false
  // delegation.revokedAt === timestamp
  return delegation;
}
```

### Agent API Endpoints

Agents use a separate base path with their authentication:

| Endpoint | Method | Description | Required Permission |
|----------|--------|-------------|---------------------|
| `/api/agent/projects` | GET | List accessible projects | Any |
| `/api/agent/projects/:projectId/tasks` | GET | View tasks | VIEWER or USER |
| `/api/agent/projects/:projectId/tasks` | POST | Create task | USER |
| `/api/agent/projects/:projectId/tasks/:taskId` | PATCH | Update task | USER |
| `/api/agent/projects/:projectId/tasks/:taskId` | DELETE | Delete task | USER |
| `/api/agent/projects/:projectId/comments` | POST | Add comment | USER |
| `/api/agent/projects/:projectId/columns` | GET | View columns | VIEWER or USER |
| `/api/agent/projects/:projectId/members` | GET | View members | VIEWER or USER |

### Complete Agent Integration Example

```typescript
class AgentClient {
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(endpoint, {
      ...options,
      headers: {
        'x-agent-api-key': this.apiKey,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    if (response.status === 403) {
      const error = await response.json();
      throw new AgentPermissionError(error.error);
    }
    
    return response.json();
  }
  
  // Get projects the agent has access to
  async getProjects() {
    return this.request<{ projects: Project[] }>('/api/agent/projects');
  }
  
  // Get tasks for a project
  async getTasks(projectId: number) {
    return this.request<Task[]>(`/api/agent/projects/${projectId}/tasks`);
  }
  
  // Create a task (requires USER permission)
  async createTask(projectId: number, task: { name: string; description?: string }) {
    return this.request<Task>(`/api/agent/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(task)
    });
  }
  
  // Update a task (requires USER permission)
  async updateTask(projectId: number, taskId: number, updates: Partial<Task>) {
    return this.request<Task>(`/api/agent/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }
  
  // Delete a task (requires USER permission)
  async deleteTask(projectId: number, taskId: number) {
    return this.request<void>(`/api/agent/projects/${projectId}/tasks/${taskId}`, {
      method: 'DELETE'
    });
  }
  
  // Add comment (requires USER permission)
  async addComment(projectId: number, taskId: number, content: string) {
    return this.request<Comment>(
      `/api/agent/projects/${projectId}/tasks/${taskId}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ content })
      }
    );
  }
}

class AgentPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentPermissionError';
  }
}

// Usage
const agent = new AgentClient('ag_abc123_xyz789...');

try {
  const projects = await agent.getProjects();
  console.log('Accessible projects:', projects);
  
  const tasks = await agent.getTasks(1);
  console.log('Project tasks:', tasks);
  
  const newTask = await agent.createTask(1, {
    name: 'New Task from Agent',
    description: 'Created by my AI assistant'
  });
  console.log('Created task:', newTask);
} catch (error) {
  if (error instanceof AgentPermissionError) {
    console.error('Permission denied:', error.message);
  } else {
    console.error('Error:', error);
  }
}
```

---

## E. Rate Limiting

### Overview

The backend implements **rate limiting** to prevent abuse. Different endpoints have different limits.

### Default Rate Limits

| Endpoint Pattern | Limit | Window |
|------------------|-------|--------|
| `/api/auth/*` | 5 requests | 15 minutes |
| `/api/*` (general) | 100 requests | 15 minutes |
| `/api/tasks/*` | 1,000 requests | 1 minute |
| `/api/columns/*` | 1,000 requests | 1 minute |
| `/api/projects/*` | 1,000 requests | 1 minute |
| `/api/members/*` | 1,000 requests | 1 minute |
| `/api/agent/*` | 1,000 requests | 1 minute |
| `/api/members/*/invite` | 10 requests | 1 hour |
| `/api/admin/*` | 50 requests | 15 minutes |

### Rate Limit Headers

Each response includes headers to help you track your rate limit status:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1704067200000
```

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed in the window |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |

### Rate Limit Error Response

When rate limited, you'll receive:

```json
{
  "error": "Too many requests, please try again later.",
  "retryAfter": 60
}
```

With headers:
```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 0
```

### Handling Rate Limits in Frontend

```typescript
class RateLimitedClient {
  private rateLimitInfo = {
    limit: 0,
    remaining: 0,
    reset: 0
  };

  private updateRateLimitInfo(headers: Headers) {
    this.rateLimitInfo = {
      limit: parseInt(headers.get('X-RateLimit-Limit') || '0', 10),
      remaining: parseInt(headers.get('X-RateLimit-Remaining') || '0', 10),
      reset: parseInt(headers.get('X-RateLimit-Reset') || '0', 10)
    };
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(endpoint, options);
    
    // Update rate limit info from response headers
    this.updateRateLimitInfo(response.headers);
    
    if (response.status === 429) {
      const { retryAfter } = await response.json();
      throw new RateLimitExceededError(retryAfter, this.rateLimitInfo);
    }
    
    return response.json();
  }

  // Get current rate limit status
  getRateLimitStatus() {
    return this.rateLimitInfo;
  }
}

class RateLimitExceededError extends Error {
  retryAfter: number;
  rateLimitInfo: { limit: number; remaining: number; reset: number };

  constructor(
    retryAfter: number,
    rateLimitInfo: { limit: number; remaining: number; reset: number }
  ) {
    super(`Rate limit exceeded. Retry after ${retryAfter} seconds.`);
    this.name = 'RateLimitExceededError';
    this.retryAfter = retryAfter;
    this.rateLimitInfo = rateLimitInfo;
  }
}

// Usage with retry logic
async function makeRequestWithRetry<T>(
  client: RateLimitedClient,
  endpoint: string,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await client.request<T>(endpoint);
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        const waitTime = error.retryAfter * 1000;
        console.log(`Rate limited. Waiting ${waitTime}ms before retry...`);
        
        // Wait and retry
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        // Re-throw non-rate-limit errors
        throw error;
      }
    }
  }
  
  throw new Error('Max retries exceeded');
}
```

### Rate Limit Best Practices

1. **Track remaining requests** - Monitor `X-RateLimit-Remaining` header
2. **Implement exponential backoff** - When rate limited, wait before retrying
3. **Batch requests** - Combine multiple operations when possible
4. **Cache responses** - Reduce redundant API calls
5. **Show user feedback** - Inform users when approaching limits

```typescript
// Example: Warn user when approaching rate limit
function checkRateLimitWarning(headers: Headers) {
  const remaining = parseInt(headers.get('X-RateLimit-Remaining') || '0', 10);
  const limit = parseInt(headers.get('X-RateLimit-Limit') || '0', 10);
  
  const percentage = (remaining / limit) * 100;
  
  if (percentage < 20) {
    console.warn(`Rate limit warning: Only ${remaining} requests remaining (${percentage.toFixed(0)}%)`);
    // Could emit event or show UI notification
  }
}
```

---

## Quick Reference

### Common Frontend Patterns

#### API Client Setup

```typescript
const api = {
  baseUrl: '/api',
  token: localStorage.getItem('auth_token'),
  
  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>)
    };
    
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers
    });
    
    return response.json();
  }
};
```

#### Authentication Headers

```typescript
// For user requests
{ 'Authorization': `Bearer ${userToken}` }

// For agent requests
{ 'x-agent-api-key': `${agentApiKey}` }
```

#### Error Handling

```typescript
try {
  const result = await api.request('/endpoint');
} catch (error: any) {
  switch (error.status) {
    case 401:
      // Token expired or invalid
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
      break;
    case 403:
      // Permission denied
      console.error('Access denied:', error.error);
      break;
    case 429:
      // Rate limited
      const retryAfter = error.retryAfter;
      await sleep(retryAfter * 1000);
      break;
    default:
      console.error('Request failed:', error);
  }
}
```

---

## Related Documentation

- [REST API Documentation](./REST_API_DOCUMENTATION.md) - Complete API endpoint reference
- [WebSocket Frontend Guide](./WEBSOCKET_FRONTEND_GUIDE.md) - Real-time updates
- [Agent Delegation Architecture](../plans/AGENT_DELEGATION_ARCHITECTURE.md) - Detailed agent system design
- [User Role System Plan](../plans/USER_ROLE_SYSTEM_PLAN.md) - Role system implementation details
- [OpenAPI Specification](../src/openapi.json) - Machine-readable API spec