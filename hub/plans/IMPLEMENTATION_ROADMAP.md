# Implementation Roadmap: Role System + Agent Delegation

## Overview

This roadmap covers implementing both:
1. **User Role System** - System-level roles (ADMIN, SUPPORT, USER) from USER_ROLE_SYSTEM_PLAN.md
2. **Agent Delegation** - API key-based agent access with project-specific permissions

These systems work together: system roles control who can create agents, while agent delegation controls what projects agents can access.

---

## Phase 1: Foundation - User Role System (Week 1)

### 1.1 Database Schema Changes

**Files:**
- [`prisma/schema.prisma`](prisma/schema.prisma)

**Changes:**
```prisma
// Add UserRole enum
enum UserRole {
  USER
  SUPPORT
  ADMIN
}

// Add to User model
model User {
  // ... existing fields ...
  role          UserRole  @default(USER)
}
```

**Estimated Time:** 30 minutes

### 1.2 Create Migration

```bash
npx prisma migrate dev --name add_user_role
npx prisma generate
```

**Estimated Time:** 15 minutes

### 1.3 Create Authorization Middleware

**New File:** `src/infrastructure/auth/authorization.ts`

```typescript
/**
 * Authorization Middleware
 * Role-based access control for system-level roles
 */

import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { getUserIdFromRequest, prisma } from './index.js';

export function requireRole(...allowedRoles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = await getUserIdFromRequest(req);
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, role: true },
      });
      
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: allowedRoles,
          current: user.role,
        });
      }
      
      (req as any).user = user;
      next();
    } catch (error) {
      console.error('Authorization error:', error);
      res.status(500).json({ error: 'Authorization check failed' });
    }
  };
}

export const requireAdmin = requireRole(UserRole.ADMIN);
export const requireAdminOrSupport = requireRole(UserRole.ADMIN, UserRole.SUPPORT);
```

**Estimated Time:** 30 minutes

### 1.4 Update Admin Routes

**File:** `src/api/routes/admin/rate-limits.ts`

Replace env var check with role check:
```typescript
import { requireAdmin } from '../../../infrastructure/auth/authorization.js';

router.use(requireAdmin); // Apply to all routes
```

**Estimated Time:** 20 minutes

### 1.5 Create Admin User Management API

**New File:** `src/api/routes/admin/users.ts`

Endpoints:
- `GET /admin/users` - List all users
- `PATCH /admin/users/:id/role` - Update user role

**Estimated Time:** 1 hour

### Phase 1 Summary
- ✅ Database schema updated
- ✅ Migration created and applied
- ✅ Authorization middleware
- ✅ Admin routes protected
- ✅ User management API

**Phase 1 Total: ~2.5 hours**

---

## Phase 2: Fix Project Role Enum Mismatch (Week 1)

### 2.1 Update Validation Schema

**File:** `src/validation/schemas/member.schemas.ts`

Fix enum values to match database:
```typescript
// Change from:
export const projectRoleEnum = z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']);

// To:
export const projectRoleEnum = z.enum(['Owner', 'Maintainer', 'Editor', 'Viewer']);
```

**Estimated Time:** 15 minutes

### Phase 2 Summary
- ✅ Validation aligned with database

**Phase 2 Total: ~15 minutes**

---

## Phase 3: Agent Delegation - Database (Week 1-2)

### 3.1 Install Better Auth API Key Plugin

```bash
npm install @better-auth/api-key
```

**Estimated Time:** 5 minutes

### 3.2 Update Better Auth Configuration

**File:** `src/infrastructure/auth/better-auth.ts`

```typescript
import { apiKey } from '@better-auth/api-key';

export const auth = betterAuth({
  database: prismaAdapter(prisma),
  plugins: [
    apiKey({
      apiKeyHeaders: ['x-agent-api-key'],
      enableMetadata: true,
      permissions: {
        defaultPermissions: {
          agent: ['viewer'],
        },
      },
    }),
  ],
});
```

**Estimated Time:** 20 minutes

### 3.3 Add Agent Delegation Model

**File:** `prisma/schema.prisma`

```prisma
// Agent permission level enum
enum AgentPermissionLevel {
  VIEWER
  USER
}

// Agent delegation model
model AgentDelegation {
  id              String               @id @default(cuid())
  
  apiKeyId        String
  projectId       Int
  project         Project              @relation(fields: [projectId], references: [id], onDelete: Cascade)
  
  permissionLevel AgentPermissionLevel @default(VIEWER)
  delegatedById   Int
  delegatedBy     User                 @relation(fields: [delegatedById], references: [id], onDelete: Cascade)
  
  isActive        Boolean              @default(true)
  revokedAt       DateTime?
  
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt
  
  auditLogs       AgentAuditLog[]
  
  @@unique([apiKeyId, projectId])
  @@index([apiKeyId])
  @@index([projectId])
  @@index([delegatedById])
}

// Agent audit log
model AgentAuditLog {
  id          String   @id @default(cuid())
  
  delegationId String
  delegation   AgentDelegation @relation(fields: [delegationId], references: [id], onDelete: Cascade)
  
  action      String   // e.g., "task:create"
  entityType  String?  // e.g., "Task"
  entityId    Int?
  
  ipAddress   String?
  userAgent   String?
  requestBody Json?
  responseStatus Int?
  
  createdAt   DateTime @default(now())
  
  @@index([delegationId])
  @@index([createdAt])
  @@index([action])
}

// Update Project model
model Project {
  // ... existing fields ...
  agentDelegations AgentDelegation[]
}

// Update User model  
model User {
  // ... existing fields ...
  delegationsGranted AgentDelegation[] @relation("DelegatedBy")
}
```

**Estimated Time:** 30 minutes

### 3.4 Create Migration

```bash
npx prisma migrate dev --name add_agent_delegation
npx prisma generate
```

**Estimated Time:** 15 minutes

### Phase 3 Summary
- ✅ Better Auth API Key plugin installed
- ✅ Better Auth configured
- ✅ AgentDelegation model created
- ✅ AgentAuditLog model created
- ✅ Migrations applied

**Phase 3 Total: ~1 hour**

---

## Phase 4: Agent Management API (Week 2)

### 4.1 Create Agent Management Routes

**New File:** `src/api/routes/agents.ts`

Endpoints:
- `POST /api/agents` - Create agent (requires USER role)
- `GET /api/agents` - List user's agents
- `PATCH /api/agents/:id` - Update agent
- `DELETE /api/agents/:id` - Delete agent
- `POST /api/agents/:id/regenerate-key` - Rotate API key

**Estimated Time:** 2 hours

### 4.2 Create Delegation Management Routes

**New File:** `src/api/routes/agents/delegations.ts`

Endpoints:
- `POST /api/agents/:id/delegations` - Delegate to project
- `GET /api/agents/:id/delegations` - List delegations
- `PATCH /api/agents/:id/delegations/:delegationId` - Update permission level
- `DELETE /api/agents/:id/delegations/:delegationId` - Revoke delegation

**Estimated Time:** 1.5 hours

### Phase 4 Summary
- ✅ Agent CRUD API
- ✅ Delegation management API

**Phase 4 Total: ~3.5 hours**

---

## Phase 5: Unified Authentication Middleware (Week 2)

### 5.1 Create Unified Auth Middleware

**New File:** `src/infrastructure/auth/unified-auth.ts`

```typescript
/**
 * Unified Authentication Middleware
 * Handles both user sessions and agent API keys
 */

import { Request, Response, NextFunction } from 'express';
import { auth } from './better-auth.js';
import { prisma } from './prisma.js';

export interface AuthContext {
  type: 'user' | 'agent';
  user?: { id: number; email: string; role: string };
  agent?: { apiKeyId: string; name: string };
  delegations?: any[];
}

export async function unifiedAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Try to get session (works for both user sessions and API keys)
    const session = await auth.api.getSession({
      headers: req.headers,
    });
    
    if (!session) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const authContext: AuthContext = {
      type: 'user',
      user: session.user as any,
    };
    
    // Check if this is an API key session
    if (session.session?.impersonatedBy === 'api-key') {
      const apiKeyId = session.session.metadata?.apiKeyId;
      
      if (apiKeyId) {
        // Load delegations for this agent
        const delegations = await prisma.agentDelegation.findMany({
          where: {
            apiKeyId,
            isActive: true,
          },
          include: { project: true },
        });
        
        authContext.type = 'agent';
        authContext.agent = {
          apiKeyId,
          name: session.user.name || 'Agent',
        };
        authContext.delegations = delegations;
      }
    }
    
    (req as any).auth = authContext;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}
```

**Estimated Time:** 45 minutes

### 5.2 Create Agent Permission Middleware

**New File:** `src/infrastructure/auth/agent-permissions.ts`

```typescript
/**
 * Agent Permission Checking
 */

import { Request, Response, NextFunction } from 'express';
import { AgentPermissionLevel } from '@prisma/client';
import { AuthContext } from './unified-auth.js';

export enum ProjectAction {
  VIEW_PROJECT = 'project:view',
  VIEW_TASKS = 'tasks:view',
  CREATE_TASK = 'task:create',
  UPDATE_TASK = 'task:update',
  DELETE_TASK = 'task:delete',
  VIEW_COLUMNS = 'columns:view',
  VIEW_MEMBERS = 'members:view',
  ADD_COMMENT = 'comment:add',
}

const ACTION_PERMISSIONS: Record<ProjectAction, AgentPermissionLevel> = {
  [ProjectAction.VIEW_PROJECT]: AgentPermissionLevel.VIEWER,
  [ProjectAction.VIEW_TASKS]: AgentPermissionLevel.VIEWER,
  [ProjectAction.VIEW_COLUMNS]: AgentPermissionLevel.VIEWER,
  [ProjectAction.VIEW_MEMBERS]: AgentPermissionLevel.VIEWER,
  [ProjectAction.CREATE_TASK]: AgentPermissionLevel.USER,
  [ProjectAction.UPDATE_TASK]: AgentPermissionLevel.USER,
  [ProjectAction.DELETE_TASK]: AgentPermissionLevel.USER,
  [ProjectAction.ADD_COMMENT]: AgentPermissionLevel.USER,
};

export function requireAgentProjectAccess(action: ProjectAction) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as any).auth as AuthContext;
    
    if (auth.type !== 'agent') {
      return res.status(403).json({ error: 'Agent access required' });
    }
    
    const projectId = parseInt(req.params.projectId);
    const delegation = auth.delegations?.find(
      d => d.projectId === projectId && d.isActive
    );
    
    if (!delegation) {
      return res.status(403).json({ error: 'No access to this project' });
    }
    
    const requiredLevel = ACTION_PERMISSIONS[action];
    
    if (requiredLevel === AgentPermissionLevel.USER && 
        delegation.permissionLevel !== AgentPermissionLevel.USER) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: 'USER',
        current: delegation.permissionLevel,
      });
    }
    
    (req as any).agentDelegation = delegation;
    next();
  };
}
```

**Estimated Time:** 30 minutes

### Phase 5 Summary
- ✅ Unified auth middleware
- ✅ Agent permission checking

**Phase 5 Total: ~1.25 hours**

---

## Phase 6: Agent-Scoped API Endpoints (Week 2-3)

### 6.1 Create Agent Router

**New File:** `src/api/routes/agent/index.ts`

Base router for all agent endpoints with authentication.

**Estimated Time:** 20 minutes

### 6.2 Create Agent Project Routes

**New File:** `src/api/routes/agent/projects.ts`

- `GET /api/agent/projects` - List accessible projects

**Estimated Time:** 30 minutes

### 6.3 Create Agent Task Routes

**New File:** `src/api/routes/agent/tasks.ts`

- `GET /api/agent/projects/:projectId/tasks`
- `POST /api/agent/projects/:projectId/tasks` (USER only)
- `PATCH /api/agent/projects/:projectId/tasks/:taskId` (USER only)
- `DELETE /api/agent/projects/:projectId/tasks/:taskId` (USER only)

**Estimated Time:** 1.5 hours

### 6.4 Create Agent Comment Routes

**New File:** `src/api/routes/agent/comments.ts`

- `POST /api/agent/projects/:projectId/tasks/:taskId/comments` (USER only)

**Estimated Time:** 45 minutes

### Phase 6 Summary
- ✅ Agent router
- ✅ Project endpoints
- ✅ Task endpoints
- ✅ Comment endpoints

**Phase 6 Total: ~3 hours**

---

## Phase 7: Audit Logging (Week 3)

### 7.1 Create Audit Service

**New File:** `src/services/agent-audit.service.ts`

```typescript
/**
 * Agent Audit Logging Service
 */

import { prisma } from '../infrastructure/auth/prisma.js';

export async function logAgentAction(
  delegationId: string,
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
  // Sanitize sensitive data
  const sanitizedBody = context.requestBody
    ? sanitizePayload(context.requestBody)
    : null;
  
  await prisma.agentAuditLog.create({
    data: {
      delegationId,
      action,
      entityType: context.entityType,
      entityId: context.entityId,
      requestBody: sanitizedBody,
      responseStatus: context.responseStatus,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    },
  });
}

function sanitizePayload(payload: any): any {
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

**Estimated Time:** 45 minutes

### 7.2 Integrate Audit Logging

Add logging to all agent route handlers.

**Estimated Time:** 1 hour

### Phase 7 Summary
- ✅ Audit service
- ✅ Logging integrated

**Phase 7 Total: ~1.75 hours**

---

## Phase 8: Testing & Documentation (Week 3-4)

### 8.1 Unit Tests

- Authorization middleware tests
- Permission checking tests
- Agent delegation logic tests

**Estimated Time:** 4 hours

### 8.2 Integration Tests

- End-to-end agent API tests
- Authentication flow tests
- Audit logging tests

**Estimated Time:** 4 hours

### 8.3 Documentation

- Update API documentation
- Add agent integration guide
- Document permission levels

**Estimated Time:** 2 hours

### Phase 8 Summary
- ✅ Unit tests
- ✅ Integration tests
- ✅ Documentation

**Phase 8 Total: ~10 hours**

---

## Implementation Timeline

| Week | Phase | Focus | Est. Hours |
|------|-------|-------|------------|
| Week 1 | Phase 1-3 | User roles, project enum fix, agent DB | 4.5 hours |
| Week 2 | Phase 4-6 | Agent API, auth middleware, agent endpoints | 7.75 hours |
| Week 3 | Phase 7-8 | Audit logging, testing start | 11.75 hours |
| Week 4 | Phase 8 | Complete testing & documentation | 10 hours |

**Total: ~34 hours (4-5 weeks with buffer)**

---

## Dependencies Between Systems

```
User Role System
├── Prerequisite for: Agent creation (USER role required)
└── Enables: Admin user management

Agent Delegation
├── Depends on: Better Auth API Key plugin
├── Depends on: User authentication
└── Provides: Project-scoped API access

Integration Points
├── unifiedAuthMiddleware - handles both systems
├── Authorization checks - system roles + project permissions
└── Audit logging - tracks all agent actions
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing auth | Keep existing session auth unchanged |
| Database migration issues | Test migrations in staging first |
| API key security | Use Better Auth's built-in hashing |
| Permission confusion | Clear documentation + tests |
| Performance impact | Add indexes, cache delegations |

---

## Success Criteria

- [ ] Users can be assigned roles (ADMIN, SUPPORT, USER)
- [ ] Admin routes check roles, not env vars
- [ ] Users can create API keys for agents
- [ ] Agents can be delegated to projects with viewer/user permissions
- [ ] Agents can authenticate via `x-agent-api-key` header
- [ ] Agent actions are audited
- [ ] All tests pass
- [ ] Documentation complete

---

## Next Steps

1. **Review this roadmap** - Any changes needed?
2. **Decide on priority** - Implement role system first, then agents?
3. **Set up staging environment** - For testing migrations
4. **Begin Phase 1** - Start with user role system

Ready to proceed with implementation?