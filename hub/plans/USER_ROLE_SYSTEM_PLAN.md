# User Role System Implementation Plan

## Current State

Admin authorization in `src/api/routes/admin/rate-limits.ts` currently uses environment variable:

```typescript
const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || [];
const isAdmin = adminEmails.includes(user.email);
```

**Problems:**
1. Hard to manage (requires code changes/env updates to add admins)
2. Not scalable (what if you want to add 50 admins?)
3. No audit trail (who changed admin status?)
4. Can't support role hierarchies (support staff, moderators, etc.)

---

## Proposed Solution

Add a `role` field to the User model with an enum type.

### Schema Changes

**File:** `prisma/schema.prisma` (additions)

```prisma
// Add enum definition
enum UserRole {
  USER      // Regular user (default)
  SUPPORT   // Support staff (can view but not modify rate limits)
  ADMIN     // Full admin access
}

// Update User model
model User {
  id            Int       @id @default(autoincrement())
  email         String    @unique
  name          String?
  surname       String?
  password      String?   // Better Auth hashed password
  avatarUrl     String?
  emailVerified Boolean   @default(false)
  image         String?
  role          UserRole  @default(USER)  // NEW FIELD
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Relations (existing)
  sessions      Session[]
  accounts      Account[]
  ownedProjects    Project[]      @relation("ProjectOwner")
  projectMemberships ProjectUser []
  createdTasks    Task[]         @relation("TaskCreator")
  assignedTasks   Task[]         @relation("TaskAssignee")
  comments        TaskComment[] @relation("UserToComment")
  taskLogs        TaskLog[]
}
```

### Migration

**File:** `prisma/migrations/20260304_add_user_role/migration.sql`

```sql
-- Create enum type
CREATE TYPE "UserRole" AS ENUM ('USER', 'SUPPORT', 'ADMIN');

-- Add role column with default
ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';

-- Create index for role queries
CREATE INDEX "User_role_idx" ON "User"("role");

-- Optional: Migrate existing admin emails to ADMIN role
-- UPDATE "User" SET "role" = 'ADMIN' 
-- WHERE "email" IN ('admin@example.com', 'superuser@company.com');
```

---

## Implementation Steps

### Phase 1: Database Migration (30 minutes)

1. Update `prisma/schema.prisma` with UserRole enum and role field
2. Generate migration: `npx prisma migrate dev --name add_user_role`
3. Apply migration to database

### Phase 2: Update Prisma Client Types (15 minutes)

After migration, regenerate Prisma client:
```bash
npx prisma generate
```

This automatically includes `UserRole` enum in the TypeScript types.

### Phase 3: Create Authorization Middleware (30 minutes)

**File:** `src/infrastructure/auth/authorization.ts` (new)

```typescript
/**
 * Authorization Middleware
 * 
 * Role-based access control middleware for Express routes.
 */

import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { getUserIdFromRequest, prisma } from './index.js';

/**
 * Middleware factory that requires specific roles
 * @param allowedRoles Array of roles that can access this route
 */
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
      
      // Attach user to request for use in route handlers
      (req as any).user = user;
      next();
    } catch (error) {
      console.error('Authorization error:', error);
      res.status(500).json({ error: 'Authorization check failed' });
    }
  };
}

/**
 * Convenience middleware for admin-only routes
 */
export const requireAdmin = requireRole(UserRole.ADMIN);

/**
 * Convenience middleware for admin or support routes
 */
export const requireAdminOrSupport = requireRole(UserRole.ADMIN, UserRole.SUPPORT);
```

### Phase 4: Update Admin Routes (20 minutes)

**File:** `src/api/routes/admin/rate-limits.ts` (update)

```typescript
import { Router } from 'express';
import { RateLimitService } from '../../../domain/services/rate-limit.service.js';
import { requireAdmin } from '../../../infrastructure/auth/authorization.js';

const router = Router();

// Apply admin check to all routes in this router
router.use(requireAdmin);

// Remove the old requireAdmin middleware function
// All routes now inherit from router.use(requireAdmin)

// GET /admin/rate-limits - List all rate limit configurations
router.get('/', async (req, res) => {
  // ... existing logic (no auth check needed)
});

// POST /admin/rate-limits - Create new rate limit configuration
router.post('/', async (req, res) => {
  // ... existing logic (no auth check needed)
});

// ... other routes

export default router;
```

### Phase 5: Create Admin User Management API (Optional - 1 hour)

**File:** `src/api/routes/admin/users.ts` (new)

```typescript
/**
 * Admin User Management API
 * 
 * Allows admins to manage user roles.
 */

import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { prisma } from '../../../infrastructure/auth/index.js';
import { requireAdmin } from '../../../infrastructure/auth/authorization.js';
import { validateBody, validateParams } from '../../../infrastructure/http/validation.js';
import { z } from 'zod';

const router = Router();

// All routes require admin
router.use(requireAdmin);

// Validation schemas
const updateUserRoleSchema = z.object({
  role: z.nativeEnum(UserRole),
});

const userIdParamSchema = z.object({
  id: z.coerce.number().positive(),
});

// GET /admin/users - List all users with their roles
router.get('/', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        surname: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    
    res.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PATCH /admin/users/:id/role - Update user role
router.patch(
  '/:id/role',
  validateParams(userIdParamSchema),
  validateBody(updateUserRoleSchema),
  async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { role } = req.body;
      
      // Prevent self-demotion
      if (userId === (req as any).user.id && role !== UserRole.ADMIN) {
        return res.status(403).json({ error: 'Cannot demote yourself' });
      }
      
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { role },
        select: {
          id: true,
          email: true,
          name: true,
          surname: true,
          role: true,
        },
      });
      
      res.json({
        user: updatedUser,
        message: `User role updated to ${role}`,
      });
    } catch (error) {
      console.error('Error updating user role:', error);
      res.status(500).json({ error: 'Failed to update user role' });
    }
  }
);

export default router;
```

### Phase 6: Migration Script for Existing Admins (15 minutes)

**File:** `prisma/seed-admins.ts` (new)

```typescript
/**
 * Migration script to set admin roles from environment variable
 * Run: npx tsx prisma/seed-admins.ts
 */

import { prisma } from '../src/infrastructure/auth/prisma.js';

async function main() {
  const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || [];
  
  if (adminEmails.length === 0) {
    console.log('No ADMIN_EMAILS set, skipping admin migration');
    return;
  }
  
  console.log(`Setting admin role for ${adminEmails.length} users...`);
  
  for (const email of adminEmails) {
    try {
      await prisma.user.update({
        where: { email },
        data: { role: 'ADMIN' },
      });
      console.log(`  ✓ ${email} is now an admin`);
    } catch (error) {
      console.error(`  ✗ Failed to update ${email}:`, error.message);
    }
  }
  
  console.log('Admin migration complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

### Phase 7: Update Environment Documentation (10 minutes)

**File:** `.env.example` (addition)

```bash
# Admin configuration (legacy - use database roles instead)
# ADMIN_EMAILS=admin@example.com,superuser@company.com
```

---

## Files to Create/Modify

```
src/
├── api/
│   └── routes/
│       └── admin/
│           ├── rate-limits.ts    # MODIFY - use requireAdmin
│           └── users.ts          # NEW - user management
└── infrastructure/
    └── auth/
        └── authorization.ts      # NEW - role middleware
prisma/
├── schema.prisma                 # MODIFY - add UserRole enum
├── migrations/
│   └── 20260304_add_user_role/   # NEW - migration
│       └── migration.sql
└── seed-admins.ts                # NEW - migration script
```

## Migration Path

1. **Deploy schema changes** (Phase 1)
2. **Run migration script** (Phase 6): `npx tsx prisma/seed-admins.ts`
3. **Deploy code changes** (Phases 2-5)
4. **Verify** admin access still works
5. **Remove** ADMIN_EMAILS from env (optional cleanup)

## Rollback Plan

If issues occur:
1. Revert code changes (Phases 2-5)
2. Restore ADMIN_EMAILS env var
3. Database schema can remain (backward compatible)

## Total Estimated Time: 3.5 hours
- Phase 1: 30 minutes
- Phase 2: 15 minutes
- Phase 3: 30 minutes
- Phase 4: 20 minutes
- Phase 5: 60 minutes (optional)
- Phase 6: 15 minutes
- Phase 7: 10 minutes

## Risk Assessment
- **Low Risk**: Non-breaking change, existing users get USER role by default
- **Migration Safe**: Can run incrementally without downtime
