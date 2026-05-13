# Rewrite Architecture Recommendations

## Executive Summary

The current codebase has fundamental architectural issues (mixed module systems, SQL injection vulnerabilities, race conditions, poor separation of concerns). This document provides a clean architecture for a complete rewrite while maintaining API/WebSocket contract compatibility.

**Key Principles:**
1. Clean Architecture (Domain-driven)
2. Unified ES Module system
3. Dependency Injection
4. Type Safety throughout
5. Testability
6. Security by default

---

## Recommended Tech Stack

### Core
- **Runtime**: Node.js 20+ LTS
- **Language**: TypeScript 5.x (strict mode)
- **Framework**: Express 4.x or Fastify
- **Database**: PostgreSQL 15+
- **ORM**: Prisma (recommended) or TypeORM

### Why Prisma over Sequelize:
- Type-safe queries (prevents SQL injection)
- Automatic migration generation
- Better TypeScript support
- Modern query API

### Supporting Libraries
- **Validation**: Zod (recommended) or Yup (current)
- **Authentication**: jsonwebtoken (current) + bcrypt
- **WebSockets**: ws library (current) with socket.io as alternative
- **Testing**: Vitest + Supertest
- **Linting**: ESLint 8+ with @typescript-eslint

---

## Project Structure

```
src/
├── config/              # Configuration (env, db, etc.)
│   ├── env.ts
│   ├── database.ts
│   └── websocket.ts
├── domain/              # Domain layer (business logic)
│   ├── entities/        # Domain entities
│   │   ├── User.ts
│   │   ├── Project.ts
│   │   ├── Task.ts
│   │   └── ...
│   ├── repositories/    # Repository interfaces
│   │   ├── IUserRepository.ts
│   │   ├── IProjectRepository.ts
│   │   └── ...
│   └── services/        # Domain services
│       ├── AuthService.ts
│       ├── ProjectService.ts
│       └── ...
├── infrastructure/      # Infrastructure layer
│   ├── database/        # ORM implementations
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── repositories/
│   │   │       ├── PrismaUserRepository.ts
│   │   │       └── ...
│   │   └── connection.ts
│   ├── http/            # HTTP layer
│   │   ├── server.ts
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── projects.ts
│   │   │   └── ...
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   ├── errorHandler.ts
│   │   │   └── validate.ts
│   │   └── controllers/
│   │       ├── AuthController.ts
│   │       └── ...
│   └── websocket/       # WebSocket layer
│       ├── server.ts
│       ├── channels/
│       └── broadcaster.ts
├── shared/              # Shared utilities
│   ├── errors/          # Custom error classes
│   ├── validators/      # Zod schemas
│   └── utils/
└── index.ts            # Application entry point
```

---

## Key Architectural Patterns

### 1. Dependency Injection

Instead of importing models directly, inject repositories:

```typescript
// Current (bad)
import UsersModel from '../database/models/users';
const user = await UsersModel.findByPk(id);

// New (good)
class AuthService {
  constructor(private userRepository: IUserRepository) {}
  
  async login(email: string, password: string) {
    const user = await this.userRepository.findByEmail(email);
    // ...
  }
}
```

### 2. Repository Pattern

Abstract database operations behind interfaces:

```typescript
// domain/repositories/IUserRepository.ts
export interface IUserRepository {
  findById(id: number): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(data: CreateUserDTO): Promise<User>;
  update(id: number, data: UpdateUserDTO): Promise<User>;
  delete(id: number): Promise<void>;
}

// infrastructure/database/prisma/repositories/PrismaUserRepository.ts
export class PrismaUserRepository implements IUserRepository {
  constructor(private prisma: PrismaClient) {}
  
  async findById(id: number): Promise<User | null> {
    const record = await this.prisma.user.findUnique({ where: { id } });
    return record ? this.toDomain(record) : null;
  }
  
  private toDomain(record: PrismaUser): User {
    return new User({
      id: record.id,
      email: record.email,
      // ...
    });
  }
}
```

### 3. Domain Entities

Rich domain models with business logic:

```typescript
// domain/entities/Task.ts
export class Task {
  constructor(
    public readonly id: number,
    public name: string,
    public description: string | null,
    public projectId: number,
    public assigneeId: number | null,
    private _order: number,
    public readonly identifier: string,
  ) {}
  
  get order(): number { return this._order; }
  
  moveToColumn(columnId: number, newOrder: number): void {
    // Business logic for moving
  }
  
  canBeEditedBy(userId: number, userRole: Role): boolean {
    // Permission logic
  }
}
```

### 4. Unit of Work / Transactions

Use transactions for multi-step operations:

```typescript
class ProjectService {
  async deleteProject(projectId: number, userId: number) {
    return this.transactionManager.run(async (trx) => {
      // 1. Verify ownership
      const project = await this.projectRepo.findById(projectId, trx);
      if (!project || project.ownerId !== userId) {
        throw new ForbiddenError();
      }
      
      // 2. Delete related data
      await this.taskRepo.deleteByProjectId(projectId, trx);
      await this.columnRepo.deleteByProjectId(projectId, trx);
      await this.memberRepo.deleteByProjectId(projectId, trx);
      
      // 3. Delete project
      await this.projectRepo.delete(projectId, trx);
      
      // 4. Broadcast change
      this.websocket.broadcast({ ... });
    });
  }
}
```

### 5. DTOs and Validation

Strictly typed DTOs with Zod validation:

```typescript
// shared/validators/project.ts
import { z } from 'zod';

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(100),
  prefix: z.string().length(3),
  description: z.string().max(500).optional(),
  members: z.array(z.object({
    id: z.number().int(),
    role: z.enum(['Owner', 'Maintainer', 'Editor', 'Viewer'])
  })).optional(),
  columns: z.array(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    order: z.number().int().positive()
  })).optional()
});

export type CreateProjectDTO = z.infer<typeof CreateProjectSchema>;

// Middleware
export const validate = <T>(schema: z.ZodSchema<T>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      throw new ValidationError(result.error);
    }
    req.validatedBody = result.data;
    next();
  };
};
```

---

## Security Improvements

### 1. SQL Injection Prevention

**Current issue:**
```typescript
// VULNERABLE
Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('description')), {
  [Op.iLike]: `%${query.toLowerCase()}%`,
})
```

**With Prisma (safe):**
```typescript
// SAFE - parameterized automatically
const tasks = await prisma.task.findMany({
  where: {
    description: {
      contains: query,
      mode: 'insensitive'
    }
  }
});
```

### 2. Rate Limiting

Add rate limiting to all endpoints, especially auth:

```typescript
import rateLimit from 'express-rate-limit';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: 'Too many login attempts' }
});

app.use('/api/login', authLimiter);
```

### 3. Input Sanitization

Sanitize user-generated content:

```typescript
import DOMPurify from 'isomorphic-dompurify';

class TaskService {
  async createTask(data: CreateTaskDTO) {
    return this.taskRepo.create({
      ...data,
      name: DOMPurify.sanitize(data.name),
      description: data.description ? DOMPurify.sanitize(data.description) : null
    });
  }
}
```

### 4. WebSocket Authentication

**Current (insecure):** Token in URL query params
**Recommended:** Authenticate after connection

```typescript
// infrastructure/websocket/server.ts
wss.on('connection', (ws) => {
  let userId: number | null = null;
  
  ws.on('message', async (data) => {
    const message = JSON.parse(data);
    
    // First message must be auth
    if (message.type === 'auth') {
      try {
        const payload = jwt.verify(message.token, secretKey);
        userId = payload.id;
        ws.send(JSON.stringify({ type: 'auth_success' }));
      } catch {
        ws.close(4001, 'Invalid token');
      }
      return;
    }
    
    // Reject non-auth messages if not authenticated
    if (!userId) {
      ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
      return;
    }
    
    // Process authenticated messages...
  });
});
```

---

## Better Auth Integration (Recommended)

### Why Better Auth Over Hand-Rolled JWT

| Feature | Hand-Rolled JWT | Better Auth |
|---------|----------------|-------------|
| Session Management | Manual | Built-in |
| CSRF Protection | Manual | Built-in |
| Organization/Team Support | Custom implementation | Native plugin |
| RBAC | Custom implementation | Native plugin |
| 2FA/MFA | Custom implementation | Plugin available |
| Social Sign-in | Custom per provider | Unified API |
| Type Safety | Partial | Full |
| Security Updates | Manual | Automatic via library |

### Installation

```bash
npm install better-auth
npm install @better-auth/express  # Express adapter
```

### Configuration

```typescript
// config/auth.ts
import { betterAuth } from 'better-auth';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { prisma } from './database';

export const auth = betterAuth({
  database: prismaAdapter(prisma),
  secret: process.env.AUTH_SECRET,
  
  // Use session + cookie (more secure than pure JWT)
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session daily
  },
  
  // Email/password authentication
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    password: {
      hash: async (password) => {
        return await bcrypt.hash(password, 10);
      },
      verify: async (password, hash) => {
        return await bcrypt.compare(password, hash);
      },
    },
  },
  
  // Organizations plugin (maps to projects)
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      organizationLimit: 50,
    }),
    admin(), // Admin plugin for user management
  ],
});
```

### Database Schema Changes

Better Auth requires specific tables. Updated Prisma schema:

```prisma
// Better Auth required tables
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  emailVerified Boolean   @default(false)
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  // Better Auth relations
  sessions      Session[]
  accounts      Account[]
  members       Member[]  // Organization memberships
  
  // Application specific
  projects      ProjectUser[]
  createdTasks  Task[]        @relation("CreatedTasks")
  assignedTasks Task[]        @relation("AssignedTasks")
  comments      TaskComment[]
  logs          TaskLog[]
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId])
}

model Account {
  id                    String    @id @default(cuid())
  userId               String
  accountId            String
  providerId           String
  accessToken          String?
  refreshToken         String?
  accessTokenExpiresAt DateTime?
  refreshTokenExpiresAt DateTime?
  scope                String?
  idToken              String?
  password             String?   // For email/password
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([providerId, accountId])
}

// Better Auth Organization plugin tables
model Organization {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  logo        String?
  metadata    String?  // JSON
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  members     Member[]
  invitations Invitation[]
  
  // Maps to Project
  project     Project?
}

model Member {
  id             String   @id @default(cuid())
  organizationId String
  userId         String
  role           String   // owner, admin, member
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([organizationId, userId])
}

model Invitation {
  id             String    @id @default(cuid())
  organizationId String
  email          String
  role           String
  status         String    @default("pending") // pending, accepted, rejected, canceled
  expiresAt      DateTime
  inviterId      String
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
}

// Application models (unchanged except User reference)
model Project {
  id          Int     @id @default(autoincrement())
  name        String
  description String?
  prefix      String  @db.VarChar(3)
  ownerId     String  // Changed to String for Better Auth
  
  // Link to Better Auth Organization
  organizationId String? @unique
  organization   Organization? @relation(fields: [organizationId], references: [id])
  
  columns ProjectColumn[]
  members ProjectUser[]
  tasks   Task[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([ownerId])
}

model ProjectUser {
  id        Int    @id @default(autoincrement())
  userId    String // Changed to String for Better Auth
  projectId Int
  role      String // Owner, Maintainer, Editor, Viewer
  
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  
  @@unique([userId, projectId])
  @@index([projectId])
}

// ... rest of models unchanged
```

### Express Integration

```typescript
// infrastructure/http/server.ts
import express from 'express';
import { auth } from '../../config/auth';
import { toNodeHandler } from '@better-auth/express';

const app = express();

// Better Auth mounts at /api/auth
app.use('/api/auth', toNodeHandler(auth));

// Your custom routes
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
// ... etc
```

### API Compatibility Layer

Better Auth provides `/api/auth/sign-in/email` but you need to maintain the old `/api/login` contract:

```typescript
// infrastructure/http/controllers/AuthController.ts
import { auth } from '../../../config/auth';

export class AuthController {
  async login(req: Request, res: Response) {
    const { email, password } = req.body;
    
    // Use Better Auth's signIn function
    const result = await auth.api.signInEmail({
      body: { email, password },
      headers: req.headers,
    });
    
    if (result.error) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Transform to old API contract
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      }
    });
    
    return res.json({
      token: result.token, // Session token
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.image,
      }
    });
  }
}
```

### WebSocket with Better Auth Sessions

```typescript
// infrastructure/websocket/server.ts
import { auth } from '../../config/auth';

wss.on('connection', async (ws, req) => {
  // Extract session from cookie
  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies['better-auth.session_token'];
  
  if (!sessionToken) {
    ws.close(4001, 'No session');
    return;
  }
  
  // Validate session with Better Auth
  const session = await auth.api.getSession({
    headers: new Headers({ cookie: `better-auth.session_token=${sessionToken}` }),
  });
  
  if (!session) {
    ws.close(4001, 'Invalid session');
    return;
  }
  
  const userId = session.user.id;
  
  // Store userId for this connection
  connections.set(ws, { userId, channels: [] });
  
  ws.send(JSON.stringify({ type: 'welcome', userId }));
});
```

### Organization → Project Mapping

Better Auth's Organization plugin maps directly to your Project concept:

```typescript
// domain/services/ProjectService.ts
export class ProjectService {
  async createProject(userId: string, data: CreateProjectDTO) {
    // 1. Create Better Auth organization
    const org = await auth.api.createOrganization({
      body: {
        name: data.name,
        slug: generateSlug(data.name),
      },
      headers: { authorization: `Bearer ${userToken}` },
    });
    
    // 2. Create your Project record linked to organization
    const project = await prisma.project.create({
      data: {
        name: data.name,
        prefix: data.prefix,
        description: data.description,
        ownerId: userId,
        organizationId: org.id,
        columns: {
          create: data.columns || defaultColumns()
        }
      }
    });
    
    return project;
  }
  
  async getProjectMembers(projectId: number) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { organization: true }
    });
    
    if (!project?.organizationId) {
      // Fallback for legacy projects without org
      return this.getLegacyMembers(projectId);
    }
    
    // Get members from Better Auth organization
    const members = await auth.api.getOrganizationMembers({
      params: { organizationId: project.organizationId },
    });
    
    // Map to your API contract
    return members.map(m => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      avatarUrl: m.user.image,
      role: this.mapOrgRoleToProjectRole(m.role),
    }));
  }
  
  private mapOrgRoleToProjectRole(orgRole: string): string {
    const mapping: Record<string, string> = {
      'owner': 'Owner',
      'admin': 'Maintainer',
      'member': 'Editor',
    };
    return mapping[orgRole] || 'Viewer';
  }
}
```

### Migration Path from Current Auth

1. **Phase 1: Setup Better Auth alongside existing JWT**
   - Install Better Auth
   - Add new tables to database
   - Keep existing `/api/login` endpoint

2. **Phase 2: Dual auth support**
   - Accept both old JWT and Better Auth sessions
   - Middleware checks both
   - Gradually migrate users

3. **Phase 3: Full migration**
   - Disable old JWT endpoints
   - Remove JWT middleware
   - All users on Better Auth

### Benefits Summary

1. **Security**: CSRF protection, secure session handling, automatic security updates
2. **Features**: 2FA, social login, password reset, email verification out of the box
3. **Organization Support**: Built-in team/organization management maps to projects
4. **Type Safety**: Full TypeScript support with generated types
5. **Maintainability**: Community-maintained, battle-tested auth logic
6. **Frontend Compatibility**: Can maintain existing API contract while using Better Auth internally

---

## Frontend Compatibility Requirements

### API Endpoints (Must Maintain)

The frontend uses these specific endpoints (analyzed from Vue stores):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/login` | POST | Authenticate - MUST return `{ token, user }` |
| `/api/projects` | GET | List user's projects |
| `/api/projects` | POST | Create project |
| `/api/projects/:id` | GET | Get project with columns/tasks |
| `/api/projects/:id/summary` | GET | Get project summary |
| `/api/projects/:id` | PATCH | Update project |
| `/api/tasks` | GET | Get tasks (params: projectId) |
| `/api/tasks/:id` | GET | Get single task |
| `/api/tasks` | POST | Create task |
| `/api/tasks/:id` | PATCH | Update task |
| `/api/tasks` | PATCH | Bulk update tasks |
| `/api/tasks/comment/:id` | PATCH | Add comment (non-standard endpoint!) |
| `/api/columns` | GET | Get columns (params: projectId) |
| `/api/columns/:id` | PATCH | Update column |
| `/api/columns` | POST | Create column |
| `/api/columns` | PATCH | Bulk update columns |
| `/api/columns/:id` | DELETE | Delete column |
| `/api/members/check_email` | GET | Check if user exists (params: projectId, email) |
| `/api/members/invite` | POST | Invite members |
| `/api/members/:id` | PATCH | Update member role |
| `/api/members/:id` | DELETE | Remove member |

### Login Response Contract

**MUST return exactly:**
```typescript
{
  token: string,      // JWT token
  user: {
    id: number,
    name: string,
    fullName: string, // NOT name + surname separately
    email: string,
    avatarUrl: string | null
  }
}
```

### WebSocket Requirements

**Frontend WebSocket URL:**
```
ws://<host>:8080?Authorization=<token>
```

**Subscribe message:**
```json
{
  "command": "subscribe",
  "identifier": { "channel": "TasksIndexChannel", "params": { "projectId": 1 } }
}
```

**Unsubscribe message:**
```json
{
  "command": "unsubscribe",
  "identifier": { "channel": "TasksIndexChannel" }
}
```

**Server broadcast format:**
```json
{
  "identifier": { "channel": "TasksIndexChannel" },
  "message": {
    "actionType": "create|update|delete",
    "data": { /* resource object */ }
  }
}
```

### Channels Used by Frontend

| Channel | Subscribe Params | Purpose |
|---------|-----------------|---------|
| `TasksIndexChannel` | `{ projectId }` | Task list CRUD |
| `TaskIndexChannel` | `{ projectId, taskId? }` | Single task updates |
| `ColumnsIndexChannel` | `{ projectId }` | Column list CRUD |
| `MembersIndexChannel` | `{ projectId }` | Member list CRUD |
| `MemberIndexChannel` | `{ projectId, memberId }` | Single member updates |
| `ProjectIndexChannel` | `{ projectId }` | Project metadata updates |
| `UserProjectsIndexChannel` | `{}` | User's project list |

### Frontend Stack

- **Framework:** Vue 3 with Composition API
- **State:** Pinia
- **HTTP Client:** Axios
- **Routing:** Vue Router
- **Build:** Vite
- **WebSocket:** Native WebSocket API

### Environment Variables Used by Frontend

```
VITE_API_BASE_URL  # Backend API base URL (e.g., http://localhost:3000)
VITE_WS_BASE_URL   # WebSocket URL (e.g., ws://localhost:8080)
```

---

## WebSocket Alternatives Analysis

### Current Implementation (Native WebSocket)

**Issues:**
- Token in URL query param (security risk - visible in logs, browser history)
- Manual reconnection logic needed
- No automatic fallback to HTTP polling
- Custom room/channel implementation required
- No built-in acknowledgment/response pattern

### Option 1: Socket.IO (Recommended)

**Pros:**
- Built-in authentication via `auth` object (not in URL)
- Native room support (maps to channels)
- Auto-reconnection with exponential backoff
- HTTP long-polling fallback when WS blocked
- Namespace support for multi-service architecture
- Event-based (matches current channel pattern)
- Large community, well-maintained
- Benchmark Score: 92

**Cons:**
- Larger bundle size (~40KB vs ~5KB native)
- Slightly more overhead than raw WS
- Protocol overhead for simple use cases

**Migration:**
```typescript
// Backend (Express + Socket.IO)
import { Server } from 'socket.io';
import { createServer } from 'http';

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

// Auth middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  // Verify token properly
  next();
});

io.on('connection', (socket) => {
  // Join rooms (like channels)
  socket.join(`project:${projectId}`);
  
  // Emit to room
  io.to(`project:${projectId}`).emit('task:created', task);
});
```

```typescript
// Frontend (Vue)
import { io } from 'socket.io-client';

const socket = io(WS_URL, {
  auth: { token: userToken },  // NOT in URL!
  transports: ['websocket', 'polling']
});

socket.emit('subscribe', { channel: 'TasksIndexChannel', params: { projectId } });
socket.on('task:created', (data) => { /* handle */ });
```

### Option 2: Native ws + Frontend (Lightweight)

**Pros:**
- Minimal overhead (~5KB)
- Full control over protocol
- No extra dependencies

**Cons:**
- Must implement reconnection manually
- Must implement room/broadcast logic
- No HTTP fallback
- More code to maintain

### Option 3: uWebSockets.js (Highest Performance)

**Pros:**
- 10x+ faster than Node.js WS
- Minimal memory usage
- Binary message support

**Cons:**
- More complex setup
- Less community support
- TypeScript support not as strong
- May need separate WS server from Express

### Recommendation

**Use Socket.IO** for this rewrite because:

1. **Security fix**: Auth via `auth` object, not URL
2. **Reliability**: Auto-reconnection + polling fallback
3. **Familiar pattern**: Event-based rooms map to channels
4. **Low risk**: Well-tested, easy migration
5. **Frontend support**: Works with Vue via socket.io-client

The bundle size increase (~35KB) is acceptable for the reliability gains.

---

## Better Auth + Socket.IO Integration

### Do They Work Together?

**Yes, perfectly.** These are complementary, not competing technologies:

- **Better Auth**: Authentication/session management
- **Socket.IO**: Real-time bidirectional communication

They integrate via the auth token:

```typescript
// Socket.IO server receives Better Auth session
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  
  // Verify Better Auth session
  const session = await auth.api.getSession({
    headers: new Headers({ cookie: `better-auth.session_token=${token}` })
  });
  
  if (!session) {
    return next(new Error('Unauthorized'));
  }
  
  socket.userId = session.user.id;
  next();
});
```

### Auth Delegation (OAuth / Social Login)

**Better Auth supports 30+ OAuth providers out of the box:**

| Provider | Status | Setup Required |
|----------|--------|----------------|
| Google | ✅ Built-in | Google Cloud Console |
| GitHub | ✅ Built-in | GitHub OAuth App |
| Apple | ✅ Built-in | Apple Developer |
| Discord | ✅ Built-in | Discord Developer Portal |
| Microsoft | ✅ Built-in | Azure AD |
| 26+ others | ✅ Built-in | Respective dev portals |

**Configuration:**
```typescript
import { betterAuth } from 'better-auth';

export const auth = betterAuth({
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
    // Add any of 30+ providers
  },
});
```

### Other Better Auth Features

| Feature | Plugin | Notes |
|---------|--------|-------|
| Multi-tenancy | `organization` | Maps directly to Projects |
| 2FA/TOTP | Built-in | Optional per-user |
| Passkeys | `@better-auth/passkey` | WebAuthn support |
| API Keys | Built-in | For server-to-server |
| Magic Links | Built-in | Email-less auth |
| Username | Built-in | Alt to email |

### Migration Path with OAuth

1. **Phase 1**: Deploy Better Auth alongside existing JWT
2. **Phase 2**: Enable social login, users can link accounts
3. **Phase 3**: Migrate email/password users, deprecate old auth

This allows gradual migration without forcing users to create new accounts.

---

## Database Schema (Prisma)

```prisma
// infrastructure/database/prisma/schema.prisma

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String
  surname   String
  password  String   // hashed
  avatarUrl String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  projects      ProjectUser[]
  createdTasks  Task[]        @relation("CreatedTasks")
  assignedTasks Task[]        @relation("AssignedTasks")
  comments      TaskComment[]
  logs          TaskLog[]
}

model Project {
  id          Int     @id @default(autoincrement())
  name        String
  description String?
  prefix      String  @db.VarChar(3)
  ownerId     Int

  columns ProjectColumn[]
  members ProjectUser[]
  tasks   Task[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([ownerId])
}

model ProjectUser {
  id        Int    @id @default(autoincrement())
  userId    Int
  projectId Int
  role      String // Owner, Maintainer, Editor, Viewer

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([userId, projectId])
  @@index([projectId])
}

model ProjectColumn {
  id          Int     @id @default(autoincrement())
  name        String
  order       Int
  color       String  @db.VarChar(7)
  type        String? @db.VarChar(10) // start, end
  description String?
  projectId   Int

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  tasks   Task[]

  @@index([projectId])
  @@index([projectId, order])
}

model Task {
  id              Int     @id @default(autoincrement())
  name            String
  description     String? @db.Text
  order           Int
  identifier      String
  projectId       Int
  projectColumnId Int?
  createdById     Int
  assigneeId      Int?
  relationMode    String? // Blocked by, Blocks, Relates to, Duplicate of, Duplicated by
  relationId      Int?

  project     Project        @relation(fields: [projectId], references: [id], onDelete: Cascade)
  column      ProjectColumn? @relation(fields: [projectColumnId], references: [id])
  createdBy   User           @relation("CreatedTasks", fields: [createdById], references: [id])
  assignee    User?          @relation("AssignedTasks", fields: [assigneeId], references: [id])
  comments    TaskComment[]
  logs        TaskLog[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([projectId])
  @@index([projectId, projectColumnId])
  @@index([assigneeId])
  @@unique([identifier])
}

model TaskComment {
  id        Int    @id @default(autoincrement())
  content   String @db.Text
  taskId    Int
  userId    Int
  createdAt DateTime @default(now())

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id])

  @@index([taskId])
}

model TaskLog {
  id        Int    @id @default(autoincrement())
  text      String @db.Text
  taskId    Int
  userId    Int
  createdAt DateTime @default(now())

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id])

  @@index([taskId])
}
```

---

## Migration Strategy

### Phase 1: Setup (1-2 days)
1. Create new repository/branch
2. Setup TypeScript + Prisma + Express
3. Create database schema
4. Write basic tests

### Phase 2: Core Features (1 week)
1. Authentication (login, middleware)
2. Project CRUD
3. Task CRUD (without move)
4. Column CRUD

### Phase 3: Advanced Features (1 week)
1. Task move/reordering
2. Member management
3. WebSocket implementation
4. Board endpoint

### Phase 4: Polish (2-3 days)
1. Comprehensive testing
2. Performance optimization
3. Security audit
4. Documentation

### Data Migration
```bash
# From old database
pg_dump --data-only old_db > data.sql

# Import to new schema (with transformations as needed)
psql new_db < data.sql
```

---

## Testing Strategy

### Unit Tests
```typescript
// domain/services/ProjectService.test.ts
describe('ProjectService', () => {
  let service: ProjectService;
  let mockRepo: MockProjectRepository;
  
  beforeEach(() => {
    mockRepo = new MockProjectRepository();
    service = new ProjectService(mockRepo);
  });
  
  it('should create project with owner', async () => {
    const result = await service.create({
      name: 'Test',
      prefix: 'TST',
      ownerId: 1
    });
    
    expect(result.name).toBe('Test');
    expect(mockRepo.save).toHaveBeenCalled();
  });
});
```

### Integration Tests
```typescript
// tests/projects.e2e.test.ts
describe('Projects API', () => {
  it('GET /projects should return user projects', async () => {
    const response = await request(app)
      .get('/api/projects')
      .set('Authorization', token);
    
    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(Array);
  });
});
```

---

## Performance Considerations

### 1. Database Indexing
Critical indexes (see schema above):
- Project lookup by owner
- Task lookup by project + column
- Member lookup by project

### 2. Query Optimization
```typescript
// Bad - N+1 queries
const projects = await prisma.project.findMany();
for (const p of projects) {
  const tasks = await prisma.task.findMany({ where: { projectId: p.id } });
}

// Good - Single query with include
const projects = await prisma.project.findMany({
  include: {
    columns: {
      include: { tasks: true }
    }
  }
});
```

### 3. Pagination
Add pagination to all list endpoints:
```typescript
GET /tasks?projectId=1&page=1&limit=20
```

### 4. Caching (Future)
Consider Redis for:
- Session storage
- Rate limiting counters
- Project metadata caching

---

## Deployment

### Docker Configuration
```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate
EXPOSE 3000 8080
CMD ["node", "dist/index.js"]
```

### Environment Variables
```env
NODE_ENV=production
PORT=3000
WS_PORT=8080
DATABASE_URL=postgresql://user:pass@db:5432/kanban
SECRET_KEY=your-secret-key
REDIS_URL=redis://redis:6379
```

---

## Summary

This architecture provides:
- ✅ Type safety throughout
- ✅ No SQL injection vulnerabilities
- ✅ Proper transaction handling
- ✅ Clean separation of concerns
- ✅ Testable code
- ✅ Scalable structure
- ✅ API contract compatibility

**Estimated effort**: 2-3 weeks for full rewrite with testing.