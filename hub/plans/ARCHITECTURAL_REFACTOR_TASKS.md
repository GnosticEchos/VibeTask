# Architectural Refactor Tasks

## Overview
This document breaks down the architectural audit findings into actionable tasks for implementation. Each task is designed to be completed by Code mode and should return to Architect mode for review upon completion.

## Task Structure
- **Task ID**: Unique identifier
- **Priority**: Critical/High/Medium/Low
- **Estimated Effort**: Quick (< 1 hour) / Short (1-4 hours) / Medium (4-8 hours) / Long (1+ days)
- **Dependencies**: Tasks that must be completed first
- **Files to Modify**: Specific files that need changes
- **Acceptance Criteria**: How to verify the task is complete

---

## Phase 1: Foundation (Critical)

### TASK-001: Extract Authentication Middleware
**Priority**: Critical  
**Effort**: Quick (30 min)  
**Dependencies**: None  
**Assigned To**: Code Mode

#### Description
Extract the duplicated `getUserFromRequest()` function from route files into a centralized authentication middleware.

#### Files to Modify
- Create: `src/infrastructure/http/middleware/auth.ts`
- Modify: `src/api/routes/tasks.ts`
- Modify: `src/api/routes/columns.ts`
- Modify: `src/api/routes/projects.ts`
- Modify: `src/api/routes/members.ts`
- Modify: `src/api/routes/agents.ts`

#### Current State
```typescript
// Duplicated in each route file
async function getUserFromRequest(req: any): Promise<{ id: number; email: string; name?: string | null } | null> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  
  try {
    const session = await auth.api.getSession({
      headers: { authorization: `Bearer ${token}` },
    });
    if (!session?.user) return null;
    return {
      ...session.user,
      id: parseInt(session.user.id as string, 10),
    };
  } catch {
    return null;
  }
}
```

#### Target State
```typescript
// src/infrastructure/http/middleware/auth.ts
import { auth } from '../../auth/index.js';

export interface AuthUser {
  id: number;
  email: string;
  name?: string | null;
}

export async function getUserFromRequest(req: any): Promise<AuthUser | null> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  
  try {
    const session = await auth.api.getSession({
      headers: { authorization: `Bearer ${token}` },
    });
    if (!session?.user) return null;
    return {
      ...session.user,
      id: parseInt(session.user.id as string, 10),
    };
  } catch {
    return null;
  }
}

export async function requireAuth(req: any, res: any, next: any) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = user;
  next();
}
```

#### Acceptance Criteria
- [ ] New middleware file created at `src/infrastructure/http/middleware/auth.ts`
- [ ] All route files import from middleware instead of defining their own
- [ ] Existing tests pass
- [ ] No breaking changes to API behavior

#### Return To
After completion, return to Architect mode for review.

---

### TASK-002: Create Global Error Handler
**Priority**: Critical  
**Effort**: Short (1 hour)  
**Dependencies**: TASK-001  
**Assigned To**: Code Mode

#### Description
Implement a global error handling middleware to replace inconsistent try-catch blocks in routes.

#### Files to Modify
- Create: `src/infrastructure/http/error-handler.ts`
- Modify: `src/index.ts`
- Modify: All route files (remove try-catch, throw AppError instead)

#### Current State
```typescript
// In each route
try {
  // ... route logic
} catch (error: any) {
  console.error('Error creating task:', error);
  res.status(500).json({ error: 'Failed to create task' });
}
```

#### Target State
```typescript
// src/infrastructure/http/error-handler.ts
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational: boolean = true
  ) {
    super(message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(404, `${resource} not found`);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied') {
    super(403, message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message);
  }
}

// Global error handler middleware
export const errorHandler = (err: Error, req: any, res: any, next: any) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }
  
  // Log unexpected errors
  console.error('Unexpected error:', err);
  res.status(500).json({ error: 'Internal server error' });
};

// Route example
router.post('/', async (req, res, next) => {
  try {
    // ... route logic
  } catch (error) {
    next(error);
  }
});
```

#### Acceptance Criteria
- [ ] Error handler classes created
- [ ] Global error handler middleware registered in `src/index.ts`
- [ ] At least 3 route files updated to use new error classes
- [ ] Error responses have consistent format
- [ ] Existing tests pass

#### Return To
After completion, return to Architect mode for review.

---

### TASK-003: Extract Domain Service Layer
**Priority**: Critical  
**Effort**: Long (2-3 days)  
**Dependencies**: TASK-001, TASK-002  
**Assigned To**: Code Mode

#### Description
Extract business logic from route handlers into domain services following the repository pattern.

#### Files to Modify
- Create: `src/domain/services/task.service.ts`
- Create: `src/domain/services/project.service.ts`
- Create: `src/domain/services/column.service.ts`
- Create: `src/domain/repositories/task.repository.ts`
- Create: `src/domain/repositories/project.repository.ts`
- Create: `src/domain/repositories/column.repository.ts`
- Create: `src/infrastructure/database/repositories/prisma-task.repository.ts`
- Create: `src/infrastructure/database/repositories/prisma-project.repository.ts`
- Create: `src/infrastructure/database/repositories/prisma-column.repository.ts`
- Modify: `src/api/routes/tasks.ts`
- Modify: `src/api/routes/projects.ts`
- Modify: `src/api/routes/columns.ts`

#### Target Structure
```typescript
// src/domain/repositories/task.repository.ts
export interface ITaskRepository {
  findById(id: number): Promise<Task | null>;
  findByProject(projectId: number): Promise<Task[]>;
  findByAssignee(assigneeId: number): Promise<Task[]>;
  create(data: CreateTaskDTO): Promise<Task>;
  update(id: number, data: UpdateTaskDTO): Promise<Task>;
  delete(id: number): Promise<void>;
  count(where?: Prisma.TaskWhereInput): Promise<number>;
}

// src/domain/services/task.service.ts
export class TaskService {
  constructor(
    private taskRepo: ITaskRepository,
    private projectRepo: IProjectRepository
  ) {}

  async createTask(data: CreateTaskDTO, userId: number): Promise<Task> {
    // Business logic
    const project = await this.projectRepo.findById(data.projectId);
    if (!project) throw new NotFoundError('Project');
    
    const membership = await this.checkMembership(data.projectId, userId);
    if (!membership || !['Owner', 'Maintainer', 'Editor'].includes(membership.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }
    
    const identifier = await this.generateIdentifier(data.projectId);
    const maxOrder = await this.taskRepo.count({ projectColumnId: data.projectColumnId });
    
    return this.taskRepo.create({
      ...data,
      identifier,
      order: maxOrder + 1,
      createdById: userId,
    });
  }

  async moveTask(taskId: number, targetColumnId: number, targetIndex: number): Promise<void> {
    // Business logic with transaction
    await this.taskRepo.transaction(async (tx) => {
      await tx.task.update({
        where: { id: taskId },
        data: { projectColumnId: targetColumnId, order: targetIndex }
      });
      
      // Reorder other tasks
      const tasksInColumn = await tx.task.findMany({
        where: { projectColumnId: targetColumnId, id: { not: taskId } },
        orderBy: { order: 'asc' }
      });
      
      for (let i = 0; i < tasksInColumn.length; i++) {
        const newOrder = i >= targetIndex ? i + 1 : i;
        if (tasksInColumn[i].order !== newOrder) {
          await tx.task.update({
            where: { id: tasksInColumn[i].id },
            data: { order: newOrder }
          });
        }
      }
    });
  }
}

// src/api/routes/tasks.ts (simplified)
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const task = await taskService.createTask(req.body, req.user.id);
    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
});
```

#### Acceptance Criteria
- [ ] Repository interfaces created in `src/domain/repositories/`
- [ ] Service classes created in `src/domain/services/`
- [ ] Prisma repository implementations created
- [ ] At least 2 route files refactored to use services
- [ ] All existing tests pass
- [ ] New unit tests for services

#### Return To
After completion, return to Architect mode for review.

---

## Phase 2: Security & Performance (High)

### TASK-004: Add Input Sanitization
**Priority**: High  
**Effort**: Short (1-2 hours)  
**Dependencies**: TASK-002  
**Assigned To**: Code Mode

#### Description
Add input sanitization middleware to prevent XSS attacks.

#### Files to Modify
- Create: `src/infrastructure/http/middleware/sanitize.ts`
- Modify: `src/index.ts` (add middleware)
- Modify: Route files (specify fields to sanitize)

#### Target Implementation
```typescript
// src/infrastructure/http/middleware/sanitize.ts
import DOMPurify from 'isomorphic-dompurify';

export const sanitize = (fields: string[]) => (req: any, res: any, next: any) => {
  for (const field of fields) {
    if (req.body[field] && typeof req.body[field] === 'string') {
      req.body[field] = DOMPurify.sanitize(req.body[field]);
    }
  }
  next();
};

// Usage in routes
router.post('/', 
  requireAuth,
  sanitize(['name', 'description']),
  validateBody(createTaskSchema),
  async (req, res, next) => {
    // req.body.name and req.body.description are now sanitized
  }
);
```

#### Acceptance Criteria
- [ ] Sanitization middleware created
- [ ] DOMPurify added to package.json
- [ ] Applied to at least 3 route files
- [ ] Existing tests pass
- [ ] XSS test cases added

#### Return To
After completion, return to Architect mode for review.

---

### TASK-005: Implement Database Transactions
**Priority**: High  
**Effort**: Short (2-3 hours)  
**Dependencies**: TASK-003  
**Assigned To**: Code Mode

#### Description
Add transaction support for multi-step operations like task moves.

#### Files to Modify
- Modify: `src/domain/repositories/task.repository.ts`
- Modify: `src/infrastructure/database/repositories/prisma-task.repository.ts`
- Modify: `src/domain/services/task.service.ts`

#### Target Implementation
```typescript
// src/domain/repositories/task.repository.ts
export interface ITaskRepository {
  // ... existing methods
  transaction<T>(fn: (tx: PrismaTransaction) => Promise<T>): Promise<T>;
}

// src/infrastructure/database/repositories/prisma-task.repository.ts
export class PrismaTaskRepository implements ITaskRepository {
  async transaction<T>(fn: (tx: PrismaTransaction) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}

// Usage in service
async moveTask(taskId: number, targetColumnId: number, targetIndex: number): Promise<void> {
  await this.taskRepo.transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: { projectColumnId: targetColumnId, order: targetIndex }
    });
    
    const tasksInColumn = await tx.task.findMany({
      where: { projectColumnId: targetColumnId, id: { not: taskId } },
      orderBy: { order: 'asc' }
    });
    
    for (let i = 0; i < tasksInColumn.length; i++) {
      const newOrder = i >= targetIndex ? i + 1 : i;
      if (tasksInColumn[i].order !== newOrder) {
        await tx.task.update({
          where: { id: tasksInColumn[i].id },
          data: { order: newOrder }
        });
      }
    }
  });
}
```

#### Acceptance Criteria
- [ ] Transaction method added to repository interface
- [ ] Implemented in Prisma repository
- [ ] Task move operation uses transaction
- [ ] Project delete operation uses transaction
- [ ] Existing tests pass
- [ ] Transaction rollback tests added

#### Return To
After completion, return to Architect mode for review.

---

### TASK-006: Add Pagination to List Endpoints
**Priority**: High  
**Effort**: Short (1-2 hours)  
**Dependencies**: TASK-003  
**Assigned To**: Code Mode

#### Description
Add pagination support to list endpoints to prevent performance issues.

#### Files to Modify
- Create: `src/validation/schemas/pagination.schema.ts`
- Modify: `src/api/routes/tasks.ts`
- Modify: `src/api/routes/projects.ts`
- Modify: `src/api/routes/columns.ts`

#### Target Implementation
```typescript
// src/validation/schemas/pagination.schema.ts
import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const paginatedResponse = <T>(data: T[], page: number, limit: number, total: number) => ({
  data,
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1,
  }
});

// Usage in routes
router.get('/', 
  requireAuth,
  validateQuery(paginationSchema.extend({ projectId: z.coerce.number().optional() })),
  async (req, res, next) => {
    try {
      const { page, limit, projectId } = req.query;
      
      const where = projectId ? { projectId } : {};
      const total = await taskService.count(where);
      const tasks = await taskService.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
      });
      
      res.json(paginatedResponse(tasks, page, limit, total));
    } catch (error) {
      next(error);
    }
  }
);
```

#### Acceptance Criteria
- [ ] Pagination schema created
- [ ] Pagination helper function created
- [ ] GET /tasks endpoint paginated
- [ ] GET /projects endpoint paginated
- [ ] GET /columns endpoint paginated
- [ ] Existing tests updated
- [ ] Pagination tests added

#### Return To
After completion, return to Architect mode for review.

---

### TASK-007: Connect WebSocket Broadcaster
**Priority**: High  
**Effort**: Medium (3-4 hours)  
**Dependencies**: TASK-003  
**Assigned To**: Code Mode

#### Description
Integrate the WebSocket broadcaster with data change operations to enable real-time updates.

#### Files to Modify
- Modify: `src/infrastructure/websocket/broadcaster.ts`
- Modify: `src/domain/services/task.service.ts`
- Modify: `src/domain/services/project.service.ts`
- Modify: `src/domain/services/column.service.ts`
- Modify: `src/index.ts` (initialize broadcaster)

#### Target Implementation
```typescript
// src/infrastructure/websocket/broadcaster.ts
export class Broadcaster {
  private io: Server | null = null;

  initialize(io: Server) {
    this.io = io;
  }

  broadcast(channel: string, message: any, params: Record<string, any> = {}) {
    if (!this.io) return;
    
    const room = `${channel}:${JSON.stringify(params)}`;
    this.io.to(room).emit('message', {
      identifier: { channel, params },
      message,
    });
  }
}

export const broadcaster = new Broadcaster();

// src/index.ts
import { broadcaster } from './infrastructure/websocket/broadcaster.js';

// After Socket.IO setup
broadcaster.initialize(io);

// src/domain/services/task.service.ts
export class TaskService {
  async createTask(data: CreateTaskDTO, userId: number): Promise<Task> {
    // ... create task
    
    // Broadcast to project subscribers
    broadcaster.broadcast('TasksIndexChannel', {
      actionType: 'create',
      data: task,
    }, { projectId: task.projectId });
    
    return task;
  }

  async updateTask(id: number, data: UpdateTaskDTO): Promise<Task> {
    // ... update task
    
    broadcaster.broadcast('TasksIndexChannel', {
      actionType: 'update',
      data: task,
    }, { projectId: task.projectId });
    
    return task;
  }

  async deleteTask(id: number): Promise<void> {
    const task = await this.taskRepo.findById(id);
    if (!task) throw new NotFoundError('Task');
    
    await this.taskRepo.delete(id);
    
    broadcaster.broadcast('TasksIndexChannel', {
      actionType: 'delete',
      data: { id },
    }, { projectId: task.projectId });
  }
}
```

#### Acceptance Criteria
- [ ] Broadcaster initialized in main app
- [ ] Task create broadcasts update
- [ ] Task update broadcasts update
- [ ] Task delete broadcasts update
- [ ] Project create/update/delete broadcasts
- [ ] Column create/update/delete broadcasts
- [ ] Integration tests for broadcasting

#### Return To
After completion, return to Architect mode for review.

---

## Phase 3: Polish (Medium)

### TASK-008: Add Response Transformers
**Priority**: Medium  
**Effort**: Short (2-3 hours)  
**Dependencies**: TASK-003  
**Assigned To**: Code Mode

#### Description
Create response transformers to ensure consistent date formatting and field selection.

#### Files to Modify
- Create: `src/shared/transformers/task.transformer.ts`
- Create: `src/shared/transformers/project.transformer.ts`
- Create: `src/shared/transformers/column.transformer.ts`
- Modify: Route files (use transformers)

#### Target Implementation
```typescript
// src/shared/transformers/task.transformer.ts
import { Task, User, Project } from '@prisma/client';

type TaskWithRelations = Task & {
  createdBy?: Pick<User, 'id' | 'name' | 'surname'>;
  assignee?: Pick<User, 'id' | 'name' | 'surname'>;
  project?: Pick<Project, 'id' | 'name' | 'prefix'>;
};

export const transformTask = (task: TaskWithRelations) => ({
  id: task.id,
  name: task.name,
  description: task.description,
  order: task.order,
  identifier: task.identifier,
  projectId: task.projectId,
  projectColumnId: task.projectColumnId,
  assigneeId: task.assigneeId,
  createdById: task.createdById,
  relationMode: task.relationMode,
  relationId: task.relationId,
  createdAt: task.createdAt.toISOString(),
  updatedAt: task.updatedAt.toISOString(),
  ...(task.createdBy && {
    createdBy: {
      id: task.createdBy.id,
      name: task.createdBy.name,
      surname: task.createdBy.surname,
    }
  }),
  ...(task.assignee && {
    assignee: {
      id: task.assignee.id,
      name: task.assignee.name,
      surname: task.assignee.surname,
    }
  }),
  ...(task.project && {
    project: {
      id: task.project.id,
      name: task.project.name,
      prefix: task.project.prefix,
    }
  }),
});

export const transformTasks = (tasks: TaskWithRelations[]) => 
  tasks.map(transformTask);

// Usage in routes
router.get('/', async (req, res, next) => {
  try {
    const tasks = await taskService.findMany({ projectId });
    res.json(transformTasks(tasks));
  } catch (error) {
    next(error);
  }
});
```

#### Acceptance Criteria
- [ ] Transformer files created
- [ ] All date fields use `.toISOString()`
- [ ] Consistent field selection
- [ ] Applied to at least 3 route files
- [ ] Existing tests pass

#### Return To
After completion, return to Architect mode for review.

---

### TASK-009: Update OpenAPI Specification
**Priority**: Medium  
**Effort**: Short (2-3 hours)  
**Dependencies**: TASK-006, TASK-008  
**Assigned To**: Code Mode

#### Description
Update the OpenAPI specification to match the current API implementation.

#### Files to Modify
- Modify: `src/openapi.json`
- Create: `scripts/generate-openapi.ts` (optional)

#### Tasks
- [ ] Add pagination parameters to list endpoints
- [ ] Update response schemas to match transformers
- [ ] Add error response schemas
- [ ] Document WebSocket endpoints
- [ ] Add agent API documentation
- [ ] Add admin API documentation

#### Acceptance Criteria
- [ ] OpenAPI spec matches actual API
- [ ] All endpoints documented
- [ ] Request/response schemas accurate
- [ ] Error responses documented

#### Return To
After completion, return to Architect mode for review.

---

### TASK-010: Enhance Health Check Endpoint
**Priority**: Medium  
**Effort**: Quick (30 min)  
**Dependencies**: None  
**Assigned To**: Code Mode

#### Description
Add database and Redis health checks to the health endpoint.

#### Files to Modify
- Modify: `src/index.ts`

#### Target Implementation
```typescript
// src/index.ts
app.get('/health', async (req, res) => {
  const checks = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: await checkDatabase(),
      redis: await checkRedis(),
      websocket: io?.engine?.clientsCount !== undefined,
    }
  };
  
  const allHealthy = Object.values(checks.checks).every(v => v === true);
  checks.status = allHealthy ? 'ok' : 'degraded';
  
  res.status(allHealthy ? 200 : 503).json(checks);
});

async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function checkRedis(): Promise<boolean> {
  if (!process.env.REDIS_ENABLED) return true;
  try {
    // Redis health check
    return true;
  } catch {
    return false;
  }
}
```

#### Acceptance Criteria
- [ ] Database health check added
- [ ] Redis health check added (if enabled)
- [ ] WebSocket status included
- [ ] Returns 503 if any check fails
- [ ] Includes uptime and timestamp

#### Return To
After completion, return to Architect mode for review.

---

## Task Execution Order

### Recommended Sequence
1. **TASK-001** → Extract Auth Middleware (Quick win, unblocks others)
2. **TASK-002** → Create Global Error Handler (Quick win, improves consistency)
3. **TASK-003** → Extract Domain Service Layer (Foundation for other tasks)
4. **TASK-004** → Add Input Sanitization (Security improvement)
5. **TASK-005** → Implement Database Transactions (Data integrity)
6. **TASK-006** → Add Pagination (Performance improvement)
7. **TASK-007** → Connect WebSocket Broadcaster (Real-time features)
8. **TASK-008** → Add Response Transformers (Consistency)
9. **TASK-009** → Update OpenAPI Specification (Documentation)
10. **TASK-010** → Enhance Health Check Endpoint (Monitoring)

### Parallel Execution
Tasks 004, 005, 006, 007 can be executed in parallel after TASK-003 is complete.

---

## Testing Requirements

Each task should include:
- [ ] Unit tests for new functions/classes
- [ ] Integration tests for modified endpoints
- [ ] Regression tests to ensure existing functionality works
- [ ] Edge case tests

---

## Rollback Plan

If any task causes issues:
1. Revert the specific task changes
2. Return to Architect mode for analysis
3. Adjust approach and retry

---

## Success Metrics

After all tasks complete:
- [ ] All existing tests pass
- [ ] Code coverage increased by 10%
- [ ] No TypeScript errors
- [ ] API response times improved by 20%
- [ ] Real-time updates working
- [ ] Documentation up to date

---

## Notes for Code Mode

- Always run tests before and after changes
- Commit after each task completion
- Return to Architect mode for review after each task
- If blocked, document the issue and return to Architect mode
- Follow existing code style and patterns
- Update AGENTS.md if new patterns are introduced
