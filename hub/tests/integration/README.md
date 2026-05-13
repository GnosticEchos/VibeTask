# Integration Tests

This directory contains integration tests for the Kanban backend API. These tests use real database connections (no mocks) to ensure end-to-end functionality.

## Overview

### Test Architecture

```
tests/integration/
├── setup/
│   ├── test-db.ts        # Database connection and cleanup tracking
│   ├── test-server.ts    # Express app setup for testing
│   └── fixtures.ts       # Test data factories and existing data constants
├── auth.integration.test.ts     # Authentication endpoints
├── projects.integration.test.ts # Project management endpoints
├── tasks.integration.test.ts    # Task management endpoints
├── columns.integration.test.ts  # Column management endpoints
├── members.integration.test.ts  # Member management endpoints
├── agents.integration.test.ts   # Agent/API key management endpoints
├── e2e.flow.test.ts             # End-to-end workflow tests
└── verify-data-preservation.ts  # Data preservation verification script
```

### Key Principles

1. **Real Database**: Tests use the same PostgreSQL database as development
2. **Data Preservation**: Tests only delete entities they create (IDs > 10000)
3. **Entity Tracking**: All created entities are tracked and cleaned up after each test
4. **Isolated Tests**: Each test creates its own data and cleans up afterward

## Running Tests

### Prerequisites

1. PostgreSQL database running
2. Database seeded with test data (see `prisma/DATADUMP/`)
3. Environment variables configured in `.env.test`

### Run All Integration Tests

```bash
npm run test:integration
```

### Run Specific Test File

```bash
npx vitest run --config vitest.integration.config.ts tests/integration/auth.integration.test.ts
```

### Run with Verbose Output

```bash
TEST_DEBUG=true npm run test:integration
```

### Run Data Preservation Verification

```bash
npx tsx tests/integration/verify-data-preservation.ts
```

## Adding New Tests

### 1. Create Test File

Create a new file in `tests/integration/` with the `.integration.test.ts` suffix:

```typescript
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { testApp, testPrisma } from './setup/test-server.js';
import { authenticateExistingUser, createTestProject } from '../helpers/integration-helpers.js';
import { trackEntity } from './setup/test-db.js';

describe('My Feature Integration Tests', () => {
  let token: string;
  let userId: number;

  beforeAll(async () => {
    const auth = await authenticateExistingUser();
    token = auth.token;
    userId = auth.user.id;
  });

  afterEach(async () => {
    // Cleanup is automatic via test-db.ts
  });

  it('should do something', async () => {
    // Create test data with tracking
    const project = await createTestProject(userId);
    trackEntity('projects', project.id);
    
    // Make API request
    const response = await testApp
      .get(`/api/projects/${project.id}`)
      .set('Authorization', `Bearer ${token}`);
    
    expect(response.status).toBe(200);
  });
});
```

### 2. Use Test Helpers

Import helpers from `tests/helpers/integration-helpers.ts`:

- `authenticateExistingUser()` - Login with existing test user
- `createTestUser(userData)` - Create a new test user
- `createTestProject(ownerId)` - Create a test project
- `createTestTask(projectId, createdById, prefix)` - Create a test task
- `createTestColumn(projectId, order)` - Create a test column

### 3. Track Created Entities

Always track entities you create for proper cleanup:

```typescript
import { trackEntity } from './setup/test-db.js';

// After creating an entity
trackEntity('users', user.id);
trackEntity('projects', project.id);
trackEntity('tasks', task.id);
trackEntity('columns', column.id);
trackEntity('comments', comment.id);
```

## Data Preservation Strategy

### Protected Data

The following existing data is protected and should NEVER be modified by tests:

| Entity | IDs | Description |
|--------|-----|-------------|
| Users | 1-5 | Test users with password `admin1234` |
| Projects | 1, 2, 4-10 | Test projects (note: no project 3) |
| Tasks | Various 1-50 | ~41 tasks across projects |
| Columns | Various | Project columns |
| Comments | Various | Task comments |
| Logs | Various | Task logs |

### ID Boundary

- **Protected IDs**: 1-10000 (existing data)
- **Test IDs**: > 10000 (test-created data)

The `MIN_TEST_ID` constant in `test-db.ts` enforces this boundary.

### Cleanup Process

1. Tests track all created entities in `createdEntities` sets
2. After each test, `cleanupTrackedEntities()` is called
3. Entities are deleted in reverse dependency order:
   - Agent audit logs
   - Agent delegations
   - Task logs
   - Comments
   - Tasks
   - Columns
   - Project users
   - Projects
   - Sessions
   - Accounts
   - Users

### Verification

Run the verification script after tests to confirm data preservation:

```bash
npx tsx tests/integration/verify-data-preservation.ts
```

Expected output:
```
📁 Cleanup: 7/7 checks passed
   ✅ Found 0 test users with ID > 10000
   ✅ Found 0 test projects with ID > 10000
   ✅ Found 0 test tasks with ID > 10000
   ...
```

## Existing Test Users

| ID | Name | Email | Password |
|----|------|-------|----------|
| 1 | Łukasz Podlipski | lukaszpodlipskikontakt@example.com | admin1234 |
| 2 | Andrzej Podlipski | andrzejpodlipski@example.com | admin1234 |
| 3 | Jan Kowalski | jakkowalski@example.com | admin1234 |
| 4 | Adam Mickiewicz | adammickiewicz@example.com | admin1234 |
| 5 | Juliusz Słowacki | juliuszslowacki@example.com | admin1234 |

Use `EXISTING_USER` or `authenticateExistingUser()` for tests that need an authenticated user.

## Troubleshooting

### Tests Fail with Database Connection Error

1. Ensure PostgreSQL is running
2. Check `.env.test` has correct `DATABASE_URL`
3. Run `npx prisma generate` to ensure client is up to date

### Tests Fail with Unique Constraint Error

This usually means previous test run didn't clean up properly:

1. Run verification script to check for orphaned data
2. Manually clean up with:
   ```sql
   DELETE FROM "TaskLog" WHERE id > 10000;
   DELETE FROM "TaskComment" WHERE id > 10000;
   DELETE FROM "Task" WHERE id > 10000;
   DELETE FROM "ProjectColumn" WHERE id > 10000;
   DELETE FROM "ProjectUser" WHERE id > 10000;
   DELETE FROM "Project" WHERE id > 10000;
   DELETE FROM "Session" WHERE id > 10000;
   DELETE FROM "Account" WHERE id > 10000;
   DELETE FROM "User" WHERE id > 10000;
   ```

### Tests Pass but Data is Missing

Check if tests are accidentally deleting protected data:

1. Review test cleanup code
2. Ensure `trackEntity` is only called for IDs > 10000
3. Run verification script before and after tests

### Rate Limiting Issues

Rate limiting is disabled in tests via `.env.test`:

```
TEST_RATE_LIMIT=false
```

If you see rate limit errors, check this setting.

## Best Practices

1. **Always track entities**: Call `trackEntity()` after creating any entity
2. **Use helpers**: Use provided helpers for common operations
3. **Don't modify existing data**: Never update/delete entities with ID <= 10000
4. **Clean up in tests**: Call cleanup in `afterEach` or `afterAll` hooks
5. **Isolate tests**: Each test should create its own data
6. **Use unique identifiers**: Use `generateUniqueSuffix()` for unique names/emails
