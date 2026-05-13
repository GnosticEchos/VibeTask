# Agent Delegation Architecture

## Overview

This document outlines the architecture for allowing users to delegate their project permissions to **agents** - automated entities (AI assistants, scripts, integrations) that can act on behalf of users with either **user-level** or **viewer-level** access to specific projects.

## Core Concepts

### What is an Agent?

An Agent is a non-human entity that:
- Acts on behalf of a delegating user (the "principal")
- Has limited, scoped permissions to specific projects
- Authenticates via API keys or tokens
- All actions are auditable and traceable to the delegating user

### Delegation Model

```
┌─────────────────────────────────────────────────────────────┐
│                    DELEGATION FLOW                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐        Delegates         ┌─────────────────┐ │
│  │  User    │ ───────────────────────▶ │  Agent          │ │
│  │ (Owner)  │   project + permission   │  (API Key)      │ │
│  └──────────┘                          └────────┬────────┘ │
│       │                                          │         │
│       │ owns                                     │ acts    │
│       ▼                                          ▼         │
│  ┌──────────┐                          ┌─────────────────┐ │
│  │ Project  │ ◀─────────────────────── │  Actions        │ │
│  │          │   reads/writes/modifies  │  (audited)      │ │
│  └──────────┘                          └─────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Agent vs User Authentication

### Why Not Use Better Auth for Agents?

Better Auth is optimized for **human user authentication** with features like:
- Session management (cookies/JWT)
- OAuth providers (Google, GitHub, etc.)
- Email verification & password reset flows
- Multi-factor authentication
- Browser-based login flows

Agents (automated systems, scripts, AI assistants) have different requirements:
- **Stateless authentication** - no session state
- **Long-lived credentials** - API keys that don't expire frequently
- **Machine-to-machine communication** - no browser involved
- **Simple revocation** - disable key without password reset
- **Audit trails** - every action must be traceable

### Coexistence Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     AUTHENTICATION LAYERS                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────┐    ┌─────────────────────┐        │
│  │   HUMAN USERS       │    │      AGENTS         │        │
│  │   (Better Auth)     │    │   (API Keys)        │        │
│  ├─────────────────────┤    ├─────────────────────┤        │
│  │ • OAuth Login       │    │ • API Key Header    │        │
│  │ • Session Cookies   │    │   X-Agent-API-Key   │        │
│  │ • JWT Tokens        │    │ • Stateless Auth    │        │
│  │ • Password Reset    │    │ • Per-request Auth  │        │
│  │ • MFA Support       │    │ • No Sessions       │        │
│  └──────────┬──────────┘    └──────────┬──────────┘        │
│             │                          │                   │
│             ▼                          ▼                   │
│  ┌────────────────────────────────────────────────────┐  │
│  │          UNIFIED AUTHORIZATION LAYER                │  │
│  │   • Project permissions (roles)                    │  │
│  │   • Agent delegations (viewer/user)               │  │
│  │   • Audit logging                                   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Both systems converge at authorization** - whether you're a user or an agent, the same permission checking logic applies:
- Can you view this project?
- Can you create tasks?
- Can you modify columns?

### Authentication Flow Comparison

| Aspect | Human Users (Better Auth) | Agents (API Keys) |
|--------|---------------------------|-------------------|
| **Login Method** | Browser OAuth / Email+Password | API Key in Header |
| **Token Format** | JWT Session Token | `ag_<prefix>_<secret>` |
| **Token Lifetime** | Short-lived (hours/days) | Long-lived (months/years) |
| **Refresh** | Automatic refresh | Manual regeneration |
| **Revocation** | Logout / session invalidate | Key rotation / disable |
| **Storage** | HttpOnly cookies / localStorage | Environment variables |
| **MFA** | Supported | Not applicable |
| **Audit** | User actions logged | All actions logged |

### Integration Points

1. **Same User Model**: Agents are owned by users (the `ownerId` field references the User model managed by Better Auth)

2. **Shared Authorization**: After authentication, both use the same permission checking:
   ```typescript
   // Works for both users and agents
   const canCreateTask = await checkPermission({
     userId: user?.id || agent?.ownerId,
     projectId: 123,
     action: 'task:create'
   });
   ```

3. **Unified Middleware**: The `unifiedAuthMiddleware` tries Better Auth first, then falls back to agent API key:
   ```typescript
   // Try user auth (Better Auth session)
   const user = await auth.api.getSession({ headers });
   if (user) return { type: 'user', user };
   
   // Try agent auth (API key)
   const agent = await authenticateAgent(apiKey);
   if (agent) return { type: 'agent', agent };
   ```

4. **Audit Trail**: Both user and agent actions are logged, but agent logs include additional context (API key prefix, IP, etc.)

### When to Use Each

**Use Better Auth (User Session) when:**
- Building a web UI or mobile app
- User is interacting via browser
- You need OAuth/social login
- Session persistence across page loads

**Use Agent API Keys when:**
- Building integrations (Slack bot, GitHub webhook)
- Running automated scripts
- AI assistants accessing project data
- Third-party service needs API access
- CI/CD pipelines need to create tasks

## Permission Levels

Agents can be delegated two permission levels:

| Level | Description | Can Do | Cannot Do |
|-------|-------------|--------|-----------|
| **viewer** | Read-only access | View tasks, columns, members, project details | Create/edit/delete anything |
| **user** | Full project user | Create/edit/delete tasks, add comments, view everything | Delete project, modify columns, manage members, change project settings |

**Note:** Agent permissions are always a subset of the delegating user's permissions. If the user loses access, the agent's delegation is automatically revoked.

## Database Schema

### New Enum: AgentPermissionLevel

```prisma
enum AgentPermissionLevel {
  VIEWER  // Read-only access
  USER    // Can modify tasks but not project structure
}
```

### New Model: Agent

```prisma
model Agent {
  id            String    @id @default(cuid())
  name          String    // Human-readable name (e.g., "My Slack Bot")
  description   String?   // Optional description
  
  // Authentication
  apiKeyHash    String    @unique  // Hashed API key for authentication
  apiKeyPrefix  String             // First 8 chars of key for identification (e.g., "ag_abc1234")
  
  // Ownership
  ownerId       Int                // User who created the agent
  owner         User      @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  
  // Status
  isActive      Boolean   @default(true)
  lastUsedAt    DateTime?
  expiresAt     DateTime? // Optional expiration date
  
  // Metadata
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  // Relations
  delegations   AgentDelegation[]
  auditLogs     AgentAuditLog[]
  
  @@index([ownerId])
  @@index([apiKeyPrefix])
  @@index([isActive])
}
```

### New Model: AgentDelegation

```prisma
model AgentDelegation {
  id              String               @id @default(cuid())
  
  // Relations
  agentId         String
  agent           Agent                @relation(fields: [agentId], references: [id], onDelete: Cascade)
  
  projectId       Int
  project         Project              @relation(fields: [projectId], references: [id], onDelete: Cascade)
  
  // Delegation Details
  permissionLevel AgentPermissionLevel @default(VIEWER)
  delegatedById   Int                  // User who granted this delegation
  delegatedBy     User                 @relation(fields: [delegatedById], references: [id], onDelete: Cascade)
  
  // Status
  isActive        Boolean              @default(true)
  revokedAt       DateTime?
  revokedById     Int?
  
  // Metadata
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt
  
  @@unique([agentId, projectId])  // One delegation per agent-project pair
  @@index([agentId])
  @@index([projectId])
  @@index([delegatedById])
  @@index([isActive])
}
```

### New Model: AgentAuditLog

```prisma
model AgentAuditLog {
  id          String   @id @default(cuid())
  
  agentId     String
  agent       Agent    @relation(fields: [agentId], references: [id], onDelete: Cascade)
  
  // Action Details
  action      String   // e.g., "task.create", "task.update", "project.view"
  entityType  String   // e.g., "Task", "Project", "Column"
  entityId    Int?
  
  // Request Context
  ipAddress   String?
  userAgent   String?
  
  // Payload (for debugging/auditing)
  requestBody Json?    // Sanitized request payload
  responseStatus Int?
  
  createdAt   DateTime @default(now())
  
  @@index([agentId])
  @@index([createdAt])
  @@index([action])
}
```

### Updated User Model

```prisma
model User {
  // ... existing fields ...
  
  // New relations
  agents        Agent[]           // Agents owned by this user
  delegationsGranted AgentDelegation[] @relation("DelegatedBy")
}
```

### Updated Project Model

```prisma
model Project {
  // ... existing fields ...
  
  // New relations
  agentDelegations AgentDelegation[]
}
```

## Authentication Flow

### Agent API Key Format

```
ag_<prefix>_<random>

Example: ag_abc1234_xyz789...
```

- `ag_` - Prefix to identify agent keys
- `<prefix>` - First 8 chars stored in DB for identification
- `<random>` - 48+ character random string (hashed in DB)

### Authentication Middleware

```typescript
// src/infrastructure/auth/agent-auth.ts

/**
 * Authenticate agent via API key
 * Returns agent with active delegations if valid
 */
export async function authenticateAgent(apiKey: string): Promise<{
  agent: Agent;
  delegations: AgentDelegation[];
} | null> {
  // Extract prefix from key
  const prefix = apiKey.substring(3, 11); // After "ag_"
  
  // Find agent by prefix
  const agent = await prisma.agent.findFirst({
    where: {
      apiKeyPrefix: prefix,
      isActive: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ]
    },
    include: {
      delegations: {
        where: { isActive: true },
        include: { project: true }
      }
    }
  });
  
  if (!agent) return null;
  
  // Verify full key against hash
  const isValid = await bcrypt.compare(apiKey, agent.apiKeyHash);
  if (!isValid) return null;
  
  // Update last used timestamp
  await prisma.agent.update({
    where: { id: agent.id },
    data: { lastUsedAt: new Date() }
  });
  
  return { agent, delegations: agent.delegations };
}
```

### Permission Checking

```typescript
// src/infrastructure/auth/agent-permissions.ts

export enum ProjectAction {
  VIEW_PROJECT = 'project:view',
  UPDATE_PROJECT = 'project:update',
  DELETE_PROJECT = 'project:delete',
  
  VIEW_TASKS = 'tasks:view',
  CREATE_TASK = 'task:create',
  UPDATE_TASK = 'task:update',
  DELETE_TASK = 'task:delete',
  
  VIEW_COLUMNS = 'columns:view',
  CREATE_COLUMN = 'column:create',
  UPDATE_COLUMN = 'column:update',
  DELETE_COLUMN = 'column:delete',
  
  VIEW_MEMBERS = 'members:view',
  MANAGE_MEMBERS = 'members:manage',
  
  ADD_COMMENT = 'comment:add',
}

const PERMISSION_MATRIX: Record<AgentPermissionLevel, ProjectAction[]> = {
  [AgentPermissionLevel.VIEWER]: [
    ProjectAction.VIEW_PROJECT,
    ProjectAction.VIEW_TASKS,
    ProjectAction.VIEW_COLUMNS,
    ProjectAction.VIEW_MEMBERS,
  ],
  [AgentPermissionLevel.USER]: [
    ProjectAction.VIEW_PROJECT,
    ProjectAction.VIEW_TASKS,
    ProjectAction.CREATE_TASK,
    ProjectAction.UPDATE_TASK,
    ProjectAction.DELETE_TASK,
    ProjectAction.VIEW_COLUMNS,
    ProjectAction.VIEW_MEMBERS,
    ProjectAction.ADD_COMMENT,
  ],
};

export function canPerformAction(
  delegation: AgentDelegation,
  action: ProjectAction
): boolean {
  return PERMISSION_MATRIX[delegation.permissionLevel].includes(action);
}
```

## API Endpoints

### Agent Management (Authenticated Users)

```typescript
// POST /api/agents
// Create a new agent
{
  "name": "My Slack Bot",
  "description": "Integration with Slack workspace",
  "expiresAt": "2026-12-31T23:59:59Z" // optional
}
// Response:
{
  "agent": { "id": "...", "name": "...", ... },
  "apiKey": "ag_abc1234_xyz789..." // ONLY SHOWN ONCE
}

// GET /api/agents
// List user's agents
// Response:
{
  "agents": [
    {
      "id": "...",
      "name": "My Slack Bot",
      "apiKeyPrefix": "ag_abc1234",
      "isActive": true,
      "lastUsedAt": "2026-03-05T10:30:00Z",
      "delegationsCount": 3,
      "expiresAt": null
    }
  ]
}

// PATCH /api/agents/:id
// Update agent (name, description, expiresAt, isActive)
{
  "name": "Updated Name",
  "isActive": false // Revoke agent
}

// DELETE /api/agents/:id
// Permanently delete agent and all delegations

// POST /api/agents/:id/regenerate-key
// Generate new API key (invalidates old one)
// Response:
{
  "apiKey": "ag_def5678_newkey..." // ONLY SHOWN ONCE
}
```

### Delegation Management

```typescript
// POST /api/agents/:id/delegations
// Delegate agent to a project
{
  "projectId": 123,
  "permissionLevel": "USER" // or "VIEWER"
}

// GET /api/agents/:id/delegations
// List agent's delegations
// Response:
{
  "delegations": [
    {
      "id": "...",
      "projectId": 123,
      "projectName": "My Project",
      "permissionLevel": "USER",
      "isActive": true,
      "createdAt": "2026-03-01T12:00:00Z"
    }
  ]
}

// DELETE /api/agents/:id/delegations/:delegationId
// Revoke delegation

// PATCH /api/agents/:id/delegations/:delegationId
// Update permission level
{
  "permissionLevel": "VIEWER"
}
```

### Agent-Scoped API Endpoints

Agents use a separate API base path with their own authentication:

```typescript
// All routes under /api/agent/* require Agent API Key header
// Header: X-Agent-API-Key: ag_abc1234_xyz789...

// GET /api/agent/projects
// List projects this agent has access to
// Response:
{
  "projects": [
    {
      "id": 123,
      "name": "My Project",
      "permissionLevel": "USER",
      "delegatedAt": "2026-03-01T12:00:00Z"
    }
  ]
}

// GET /api/agent/projects/:projectId/tasks
// View tasks (viewer or user)

// POST /api/agent/projects/:projectId/tasks
// Create task (user only)
{
  "name": "New Task",
  "description": "...",
  "columnId": 456
}

// PATCH /api/agent/projects/:projectId/tasks/:taskId
// Update task (user only)

// DELETE /api/agent/projects/:projectId/tasks/:taskId
// Delete task (user only)

// Similar patterns for comments, columns (view only), members (view only)
```

## Better Auth 1.5+ API Key Plugin

**Better Auth 1.5 (February 2026)** introduced specialized modules for AI agents, including a native **API Key Plugin** that's perfect for our use case.

### Why Use Better Auth's API Key Plugin?

The API Key Plugin provides:
- **Built-in key management** - Create, revoke, rotate API keys
- **Fine-grained permissions** - JSON-based permission scopes
- **Rate limiting** - Per-key request limits
- **Expiration support** - Time-bound keys
- **Audit logging** - Built-in access logs
- **Integration with Better Auth** - Works with your existing user system

### Installation

```bash
npm install better-auth @better-auth/api-key
```

### Configuration

```typescript
// src/infrastructure/auth/better-auth.ts
import { betterAuth } from "better-auth";
import { apiKey } from "@better-auth/api-key";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { prisma } from "./prisma.js";

export const auth = betterAuth({
  database: prismaAdapter(prisma),
  plugins: [
    apiKey({
      // Custom header for agent API keys
      apiKeyHeaders: ["x-agent-api-key"],
      
      // Enable metadata storage
      enableMetadata: true,
      
      // Default permissions for new API keys
      permissions: {
        defaultPermissions: {
          agent: ["viewer"],  // Default to viewer access
        },
      },
      
      // Custom API key getter (optional - for complex extraction)
      customAPIKeyGetter: (ctx) => {
        // Extract from custom location if needed
        const headerKey = ctx.headers?.["x-agent-api-key"];
        if (headerKey) return headerKey;
        
        // Or from query param
        return ctx.query?.apiKey || null;
      },
    }),
  ],
});
```

### Key Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `apiKeyHeaders` | `string \| string[]` | Headers to check for API keys (default: `"x-api-key"`) |
| `enableMetadata` | `boolean` | Allow storing metadata with API keys |
| `permissions` | `object` | Default permissions configuration |
| `customAPIKeyGetter` | `function` | Custom function to extract API key from request |

### Database Schema Integration

Better Auth's API Key plugin creates its own tables. We extend them for delegation:

```prisma
// Better Auth creates: ApiKey, ApiKeyConfig tables
// We add our delegation model:

model AgentDelegation {
  id              String               @id @default(cuid())
  
  // Link to Better Auth's apiKey
  apiKeyId        String
  // Note: Better Auth's ApiKey table references User
  
  projectId       Int
  project         Project              @relation(fields: [projectId], references: [id], onDelete: Cascade)
  
  permissionLevel AgentPermissionLevel @default(VIEWER)
  delegatedById   Int                  
  delegatedBy     User                 @relation(fields: [delegatedById], references: [id], onDelete: Cascade)
  
  isActive        Boolean              @default(true)
  revokedAt       DateTime?
  
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt
  
  @@unique([apiKeyId, projectId])
  @@index([apiKeyId])
  @@index([projectId])
}
```

### Creating Agent API Keys

```typescript
import { auth } from "../infrastructure/auth/better-auth.js";

// Create an agent API key
const result = await auth.api.createApiKey({
  body: {
    name: "My Slack Bot",
    prefix: "ag",                    // Custom prefix for agent keys
    expiresIn: 60 * 60 * 24 * 365,   // 1 year
    
    // Rate limiting
    rateLimitEnabled: true,
    rateLimitMax: 1000,              // 1000 requests per window
    rateLimitTimeWindow: 1000 * 60 * 60, // per hour
    
    // Request quota
    remaining: 10000,                // Total requests allowed
    refillAmount: 1000,              // Refill amount
    refillInterval: 1000 * 60 * 60 * 24, // Refill daily
    
    // Permissions
    permissions: {
      agent: ["viewer", "user"],     // Can be assigned either role
    },
    
    // Metadata
    metadata: {
      isAgent: true,
      description: "Slack workspace integration",
      createdFor: "automation",
    },
  },
  headers: req.headers, // User's session headers (for ownership)
});

// Result includes the key (shown ONLY ONCE)
console.log(result.key); // "ag_xxxxxxxxxxxxxx"
```

### Verifying API Keys

Better Auth automatically validates API keys from configured headers:

```typescript
// In your route handler - Better Auth has already validated the key
// Access via session/context

import { auth } from "../infrastructure/auth/better-auth.js";

export async function handler(req, res) {
  // Better Auth extracts key from x-agent-api-key header
  // and validates it automatically
  
  // Get session from API key (Better Auth feature)
  const session = await auth.api.getSession({
    headers: req.headers,
  });
  
  if (!session) {
    return res.status(401).json({ error: "Invalid API key" });
  }
  
  // session.user is the API key owner
  // session contains apiKey metadata
}
```

### Manual Verification (for custom logic)

```typescript
// Verify with permission checking
const result = await auth.api.verifyApiKey({
  body: {
    key: "ag_xxxxxxxxxxxxxx",
    permissions: {
      agent: ["user"],  // Required permissions
    },
  },
});

if (!result.valid) {
  console.log("Invalid key or insufficient permissions:", result.error);
  return;
}

// result.key contains API key details (without the secret)
console.log(result.key.metadata);
console.log(result.key.permissions);
```

### Sessions from API Keys

Better Auth can create sessions from API keys automatically:

```typescript
// When API key is present in header, Better Auth creates a session
// The session.user is the owner of the API key

// In middleware - unified handling
export async function unifiedAuthMiddleware(req, res, next) {
  try {
    // This works for both:
    // - Regular session cookies
    // - Bearer tokens
    // - API keys (from configured headers)
    const session = await auth.api.getSession({
      headers: req.headers,
    });
    
    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    // Check if this is an API key session
    const isApiKeySession = session.session?.impersonatedBy === "api-key";
    
    if (isApiKeySession) {
      // It's an agent/API key
      req.auth = {
        type: "agent",
        user: session.user,
        apiKeyId: session.session.metadata?.apiKeyId,
      };
      
      // Load delegations for this API key
      req.auth.delegations = await prisma.agentDelegation.findMany({
        where: { apiKeyId: req.auth.apiKeyId, isActive: true },
      });
    } else {
      // Regular user session
      req.auth = { type: "user", user: session.user };
    }
    
    next();
  } catch (error) {
    res.status(401).json({ error: "Authentication failed" });
  }
}
```

### Updating API Keys

```typescript
// Update key properties
await auth.api.updateApiKey({
  body: {
    keyId: "api-key-id-123",
    name: "Updated Name",
    enabled: true,
    expiresIn: 60 * 60 * 24 * 30, // Extend 30 days
    rateLimitMax: 500,
    metadata: {
      updated: true,
    },
    permissions: {
      agent: ["viewer"], // Downgrade permissions
    },
  },
});
```

### Revoking API Keys

```typescript
// Delete/revoke a key
await auth.api.deleteApiKey({
  body: {
    keyId: "api-key-id-123",
  },
});
```

### Listing API Keys

```typescript
// List all API keys for the user
const keys = await auth.api.listApiKeys({
  headers: req.headers, // User's session
});

// Returns array of keys (without secret values)
// Each key includes: id, name, prefix, expiresAt, metadata, permissions, etc.
```

### Unified Auth Middleware

```typescript
// src/infrastructure/auth/unified-auth.ts
import { auth } from "./better-auth.js";
import { authenticateAgent } from "./agent-auth.js";

export async function unifiedAuthMiddleware(req, res, next) {
  try {
    // Try Better Auth session first (for human users)
    const session = await auth.api.getSession({
      headers: req.headers,
    });
    
    if (session) {
      req.auth = { type: "user", user: session.user };
      return next();
    }
    
    // Try agent API key
    const agentData = await authenticateAgent(req);
    
    if (agentData) {
      req.auth = {
        type: "agent",
        agent: agentData.agent,
        owner: agentData.owner,
        delegations: agentData.delegations,
      };
      return next();
    }
    
    return res.status(401).json({ error: "Authentication required" });
  } catch (error) {
    console.error("Auth error:", error);
    return res.status(500).json({ error: "Authentication failed" });
  }
}
```

### Permission Checking with Better Auth

```typescript
// src/infrastructure/auth/agent-permissions.ts
import { AgentPermissionLevel } from "@prisma/client";

// Map actions to required permission levels
const ACTION_PERMISSIONS: Record<string, AgentPermissionLevel> = {
  "project:view": AgentPermissionLevel.VIEWER,
  "task:view": AgentPermissionLevel.VIEWER,
  "column:view": AgentPermissionLevel.VIEWER,
  "member:view": AgentPermissionLevel.VIEWER,
  
  "task:create": AgentPermissionLevel.USER,
  "task:update": AgentPermissionLevel.USER,
  "task:delete": AgentPermissionLevel.USER,
  "comment:add": AgentPermissionLevel.USER,
};

export function canPerformAction(
  delegations: AgentDelegation[],
  projectId: number,
  action: string
): boolean {
  const delegation = delegations.find(
    d => d.projectId === projectId && d.isActive
  );
  
  if (!delegation) return false;
  
  const requiredLevel = ACTION_PERMISSIONS[action];
  if (!requiredLevel) return false;
  
  // USER can do everything VIEWER can
  if (requiredLevel === AgentPermissionLevel.VIEWER) {
    return true; // Both VIEWER and USER have this
  }
  
  return delegation.permissionLevel === AgentPermissionLevel.USER;
}
```

### Agent Route Middleware

```typescript
// src/infrastructure/auth/agent-route-wrapper.ts
import { canPerformAction } from "./agent-permissions.js";

export function requireAgentProjectAccess(action: string) {
  return (req, res, next) => {
    const auth = req.auth;
    
    if (auth.type !== "agent") {
      return res.status(403).json({ error: "Agent access required" });
    }
    
    const projectId = parseInt(req.params.projectId);
    
    if (!canPerformAction(auth.delegations, projectId, action)) {
      return res.status(403).json({
        error: "Insufficient permissions",
        action,
        projectId,
      });
    }
    
    // Find the specific delegation for this project
    req.agentDelegation = auth.delegations.find(
      d => d.projectId === projectId
    );
    
    next();
  };
}
```

### Better Auth Agent Features (1.5+)

Better Auth 1.5 includes additional features perfect for our use case:

#### 1. On-Behalf-Of (OBO) Claims
JWT tokens can represent identity chaining:
```typescript
// Token includes both agent and owner identity
{
  "sub": "agent_123",        // Agent ID
  "obo": "user_456",         // Original user (owner)
  "delegations": ["proj_789"], // Allowed projects
  "permissions": ["agent:user"]
}
```

#### 2. Token Exchange
Agents can request short-lived tokens:
```typescript
const token = await auth.api.tokenExchange({
  body: {
    grantType: "urn:ietf:params:oauth:grant-type:token-exchange",
    subjectToken: apiKey,
    requestedTokenType: "urn:ietf:params:oauth:token-type:access_token",
  },
});
```

#### 3. MCP (Model Context Protocol) Auth
For AI tool integrations:
```typescript
import { mcpAuth } from "better-auth/plugins";

plugins: [
  mcpAuth({
    // MCP-specific auth configuration
  }),
]
```

### API Key Management Endpoints

Better Auth provides built-in endpoints:

```typescript
// List API keys for user
GET /api/auth/api-key/list

// Create new API key
POST /api/auth/api-key/create
{
  "name": "My Agent",
  "expiresIn": 86400,
  "permissions": { "agent": ["user"] }
}

// Revoke API key
POST /api/auth/api-key/revoke
{
  "keyId": "key_123"
}

// Verify API key (for debugging)
POST /api/auth/api-key/verify
{
  "key": "ag_abc1234_xyz789..."
}
```

### Benefits of Using Better Auth's Plugin

| Feature | Custom Middleware | Better Auth Plugin |
|---------|-------------------|-------------------|
| Key hashing | Manual bcrypt | Built-in |
| Key rotation | Custom logic | Built-in |
| Rate limiting | Custom implementation | Built-in |
| Expiration | Custom cron job | Built-in |
| Audit logs | Custom logging | Built-in |
| Permissions | Custom JSON | Structured |
| Session integration | Manual bridging | Native |
| Type safety | Manual | Full TS support |

### Migration from Custom Middleware

If you started with custom middleware, migrating to Better Auth's plugin:

1. **Export existing keys** from your Agent table
2. **Import into Better Auth** using the admin API
3. **Update delegations** to reference Better Auth's apiKey.id
4. **Remove custom auth code** (keep delegation logic)
5. **Update middleware** to use Better Auth's verification

## Middleware Integration

### Unified Auth Middleware

```typescript
// src/infrastructure/auth/unified-auth.ts

export interface AuthContext {
  type: 'user' | 'agent';
  user?: User;
  agent?: Agent;
  delegations?: AgentDelegation[];
}

/**
 * Middleware that handles both user and agent authentication
 * Priority: Bearer token (user) > X-Agent-API-Key (agent)
 */
export async function unifiedAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const bearerToken = req.headers.authorization?.replace('Bearer ', '');
  const agentApiKey = req.headers['x-agent-api-key'] as string;
  
  let authContext: AuthContext | null = null;
  
  if (bearerToken) {
    // Authenticate as user
    const user = await authenticateUser(bearerToken);
    if (user) {
      authContext = { type: 'user', user };
    }
  } else if (agentApiKey) {
    // Authenticate as agent
    const agentData = await authenticateAgent(agentApiKey);
    if (agentData) {
      authContext = {
        type: 'agent',
        agent: agentData.agent,
        delegations: agentData.delegations
      };
    }
  }
  
  if (!authContext) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  (req as any).auth = authContext;
  next();
}
```

### Agent-Specific Route Handler Wrapper

```typescript
// src/infrastructure/auth/agent-route-wrapper.ts

/**
 * Wrapper for agent routes that checks project access
 */
export function requireAgentProjectAccess(
  action: ProjectAction
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as any).auth as AuthContext;
    
    if (auth.type !== 'agent') {
      return res.status(403).json({ error: 'Agent access required' });
    }
    
    const projectId = parseInt(req.params.projectId);
    const delegation = auth.delegations?.find(d => d.projectId === projectId);
    
    if (!delegation || !delegation.isActive) {
      return res.status(403).json({ error: 'No access to this project' });
    }
    
    if (!canPerformAction(delegation, action)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: action,
        current: delegation.permissionLevel
      });
    }
    
    // Attach delegation to request for use in handler
    (req as any).agentDelegation = delegation;
    next();
  };
}
```

## Audit Logging

All agent actions are logged for security and debugging:

```typescript
// src/infrastructure/audit/agent-audit.ts

export async function logAgentAction(
  agentId: string,
  action: string,
  context: {
    entityType?: string;
    entityId?: number;
    requestBody?: any;
    responseStatus?: number;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<void> {
  // Sanitize request body (remove sensitive data)
  const sanitizedBody = context.requestBody 
    ? sanitizePayload(context.requestBody)
    : null;
  
  await prisma.agentAuditLog.create({
    data: {
      agentId,
      action,
      entityType: context.entityType,
      entityId: context.entityId,
      requestBody: sanitizedBody,
      responseStatus: context.responseStatus,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    }
  });
}

function sanitizePayload(payload: any): any {
  // Remove sensitive fields like passwords, API keys, etc.
  const sensitiveFields = ['password', 'apiKey', 'token', 'secret'];
  const sanitized = { ...payload };
  
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}
```

## Security Considerations

### 1. API Key Storage
- Keys are hashed with bcrypt before storage
- Only the prefix is stored in plaintext for identification
- Keys are only shown once at creation time

### 2. Permission Boundaries
- Agents cannot exceed the permissions of their owner
- If owner loses project access, agent delegations are automatically revoked
- Agents cannot delegate to other agents (no permission escalation)

### 3. Rate Limiting
- Agents have separate, stricter rate limits than users
- Rate limits are per-agent, not per-delegation
- Failed authentication attempts are logged and rate-limited

### 4. Audit Requirements
- All agent actions are logged with full context
- Logs include: who (agent), what (action), when (timestamp), where (IP), on what (entity)
- Logs are retained for 90 days minimum

### 5. Key Rotation
- Users can regenerate agent API keys at any time
- Old keys are immediately invalidated
- Regeneration events are logged

## Implementation Phases

### Phase 1: Core Infrastructure (2-3 days)
- [ ] Add Agent, AgentDelegation, AgentAuditLog models to schema
- [ ] Create migration
- [ ] Implement agent authentication middleware
- [ ] Implement permission checking utilities
- [ ] Create audit logging system

### Phase 2: Agent Management API (1-2 days)
- [ ] POST /api/agents (create)
- [ ] GET /api/agents (list)
- [ ] PATCH /api/agents/:id (update)
- [ ] DELETE /api/agents/:id (delete)
- [ ] POST /api/agents/:id/regenerate-key

### Phase 3: Delegation API (1 day)
- [ ] POST /api/agents/:id/delegations
- [ ] GET /api/agents/:id/delegations
- [ ] DELETE /api/agents/:id/delegations/:delegationId
- [ ] PATCH /api/agents/:id/delegations/:delegationId

### Phase 4: Agent-Scoped API (2-3 days)
- [ ] GET /api/agent/projects
- [ ] Task endpoints (view, create, update, delete)
- [ ] Comment endpoints
- [ ] Column endpoints (view only)
- [ ] Member endpoints (view only)

### Phase 5: Testing & Documentation (1-2 days)
- [ ] Unit tests for permission logic
- [ ] Integration tests for agent API
- [ ] API documentation
- [ ] Security audit

**Total Estimated Time: 7-11 days**

## Migration Path

1. **Deploy schema changes** (Phase 1)
2. **Deploy API changes** (Phases 2-4)
3. **Update documentation**
4. **Monitor audit logs** for any issues

## Rollback Plan

If issues occur:
1. Disable agent authentication middleware (revert to user-only)
2. Keep database schema (backward compatible)
3. Mark all agents as inactive: `UPDATE Agent SET isActive = false`

## Future Enhancements

1. **Time-bound delegations** - Auto-expire after time period
2. **Action limits** - Max number of actions per day/hour
3. **Webhook notifications** - Notify owner of agent actions
4. **IP allowlisting** - Restrict agent access to specific IPs
5. **Agent groups** - Organize agents into teams
6. **Inherited permissions** - Agents inherit user's role-based permissions

## Files to Create/Modify

```
prisma/
├── schema.prisma                          # MODIFY - add Agent models
└── migrations/
    └── 20260305_add_agent_delegation/     # NEW
        └── migration.sql

src/
├── api/
│   └── routes/
│       ├── agents.ts                      # NEW - agent management
│       └── agent/                         # NEW - agent-scoped routes
│           ├── index.ts
│           ├── projects.ts
│           ├── tasks.ts
│           └── comments.ts
├── infrastructure/
│   └── auth/
│       ├── agent-auth.ts                  # NEW - agent authentication
│       ├── agent-permissions.ts           # NEW - permission checking
│       ├── unified-auth.ts                # NEW - combined auth
│       └── agent-route-wrapper.ts         # NEW - route middleware
└── services/
    └── audit/
        └── agent-audit.ts                 # NEW - audit logging
```

## Related Documents

- [USER_ROLE_SYSTEM_PLAN.md](./USER_ROLE_SYSTEM_PLAN.md) - System-level roles (ADMIN, SUPPORT, USER)
- [WEBSOCKET_BROADCASTING_ARCHITECTURE.md](../docs/WEBSOCKET_BROADCASTING_ARCHITECTURE.md) - Real-time updates for agent actions
- [API_CONTRACT.md](../REWRITEPLAN/API_CONTRACT.md) - API standards

---

**Status:** Draft  
**Last Updated:** 2026-03-05  
**Author:** Kilo Code Architect
