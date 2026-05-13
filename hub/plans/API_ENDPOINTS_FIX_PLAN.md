# API Endpoints Fix Plan

## Missing Endpoints Analysis

### Issue 1: GET /members/:id - Missing Implementation

**Current State:** No endpoint exists to get a specific member by ID.

**Required per API Contract:**
```
GET /members/:id?projectId=:id
Get specific member details.
```

**Proposed Implementation:**

**File:** `src/api/routes/members.ts` (addition)

```typescript
// GET /api/members/:id?projectId=:id - Get specific member details
router.get('/:id', validateParams(idParamSchema), validateQuery(projectIdQuerySchema), async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const memberId = parseInt(req.params.id);
    const { projectId } = req.query as unknown as { projectId: number };

    // Check if requester is a member of the project
    const requesterMembership = await prisma.projectUser.findFirst({
      where: {
        projectId,
        userId: user.id,
      },
    });

    if (!requesterMembership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get the target member
    const member = await prisma.projectUser.findFirst({
      where: {
        projectId,
        userId: memberId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            surname: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    res.json({
      id: member.user.id,
      userId: member.user.id,
      name: member.user.name,
      surname: member.user.surname,
      email: member.user.email,
      avatarUrl: member.user.avatarUrl,
      role: member.role,
      createdAt: member.createdAt.toISOString(),
    });
  } catch (error: any) {
    console.error('Error fetching member:', error);
    res.status(500).json({ error: 'Failed to fetch member' });
  }
});
```

---

### Issue 2: PATCH /members/:id - Wrong Parameter Source

**Current State:** Uses `req.body.projectId` and `req.params.userId` instead of `req.params.id`.

**Problem:** The API contract specifies:
```
PATCH /members/:id
Request Body: { "role": "...", "projectId": "..." }
```

But current implementation uses `req.params.userId` which doesn't match the route definition.

**Current Code:**
```typescript
// Line 200 in members.ts
router.patch('/:id', validateParams(userIdParamSchema), validateBody(updateMemberRoleSchema), async (req, res) => {
  // ...
  const memberId = req.params.userId; // WRONG - route is '/:id', not '/:userId'
  // ...
});
```

**Fix:** Update validation schema and route handler to use `id` consistently.

**File:** `src/validation/schemas/member.schemas.ts` (addition)

```typescript
// Member ID param schema for /members/:id
export const memberIdParamSchema = z.object({
  id: z.coerce.number().positive('Member ID must be a positive integer'),
});

export type MemberIdParamInput = z.infer<typeof memberIdParamSchema>;
```

**File:** `src/api/routes/members.ts` (update)

```typescript
import { 
  // ... existing imports
  memberIdParamSchema,  // ADD
} from '../../validation/schemas/index.js';

// Update the route
router.patch('/:id', validateParams(memberIdParamSchema), validateBody(updateMemberRoleSchema), async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const memberId = parseInt(req.params.id);  // FIXED: use 'id' not 'userId'
    const { role, projectId } = req.body;

    if (!role || !projectId) {
      return res.status(400).json({ error: 'role and projectId are required' });
    }

    // Check if current user is owner
    const currentMembership = await prisma.projectUser.findFirst({
      where: { projectId, userId: user.id },
    });

    if (!currentMembership || currentMembership.role !== 'Owner') {
      return res.status(403).json({ error: 'Only owner can update member roles' });
    }

    // Get the target member by projectId and memberId (userId)
    const targetMembership = await prisma.projectUser.findFirst({
      where: { 
        projectId, 
        userId: memberId 
      },
    });

    if (!targetMembership) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const updatedMember = await prisma.projectUser.update({
      where: { id: targetMembership.id },
      data: { role },
      include: {
        user: { select: { id: true, name: true, surname: true, email: true, avatarUrl: true } },
      },
    });

    res.json({
      id: updatedMember.user.id,
      userId: updatedMember.user.id,
      name: updatedMember.user.name,
      surname: updatedMember.user.surname,
      email: updatedMember.user.email,
      avatarUrl: updatedMember.user.avatarUrl,
      role: updatedMember.role,
      createdAt: updatedMember.createdAt.toISOString(),
    });
  } catch (error: any) {
    console.error('Error updating member:', error);
    res.status(500).json({ error: 'Failed to update member' });
  }
});
```

---

## Implementation Steps

### Step 1: Add Validation Schema (10 minutes)
- Add `memberIdParamSchema` to `src/validation/schemas/member.schemas.ts`
- Export from `src/validation/schemas/index.ts`

### Step 2: Fix PATCH /members/:id (20 minutes)
- Update route to use `memberIdParamSchema`
- Fix param extraction from `req.params.userId` to `req.params.id`
- Add logic to find member by both projectId and userId
- Add 404 handling for member not found

### Step 3: Add GET /members/:id (20 minutes)
- Add new route handler
- Validate requester has access to project
- Return formatted member object matching API contract

### Step 4: Test (30 minutes)
- Test PATCH with correct ID param
- Test GET returns correct member details
- Test 404 cases
- Test authorization (non-members can't access)

## Files to Modify

```
src/
├── api/
│   └── routes/
│       └── members.ts          # MODIFY - fix PATCH, add GET
└── validation/
    └── schemas/
        ├── member.schemas.ts   # MODIFY - add memberIdParamSchema
        └── index.ts            # MODIFY - export new schema
```

## Total Estimated Time: 1.5 hours
- Step 1: 10 minutes
- Step 2: 20 minutes
- Step 3: 20 minutes
- Step 4: 30 minutes

## Risk Assessment
- **Very Low Risk**: Minor endpoint fixes, no breaking changes
- **Backward Compatible**: Existing PATCH calls still work with fixed implementation
