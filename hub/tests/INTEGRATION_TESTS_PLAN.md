# Integration Tests Plan

## Overview

Integration tests verify that the application works end-to-end by connecting to a real database and testing actual HTTP requests. This complements our unit tests which use mocks.

## Current Test Coverage

| Test Type | Coverage | Purpose |
|-----------|----------|---------|
| Unit Tests | 103 tests | Logic & behavior verification |
| Integration Tests | 0 tests | End-to-end verification |

## Why Integration Tests Are Needed

### Limitations of Unit Tests (with mocks)

1. **Zero code coverage** - Mocks don't execute actual source code
2. **Can't detect bugs in queries** - Prisma queries not executed
3. **Can't verify HTTP behavior** - Express routes not invoked
4. **Missing database constraints** - FK, unique, not-null not validated

### What Integration Tests Provide

1. **Actual code execution** - All source code runs
2. **Real database queries** - SQL/Prisma queries tested
3. **HTTP behavior** - Request/response flow verified
4. **Schema validation** - Database constraints enforced
5. **Confidence** - Tests mirror production behavior

## Implementation Plan

### Phase 1: Test Database Setup

```bash
# Option 1: Use testcontainers (recommended for CI)
npm install --save-dev @testcontainers/postgresql

# Option 2: Use a separate local database
# Create test database: kanban_test
```

### Phase 2: Configuration

Add integration test configuration:

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/**/*.integration.ts'], // Current: skip integration
    // For integration tests:
    // include: ['tests/**/*.integration.ts'],
  },
});
```

### Phase 3: Integration Test Structure

```typescript
// tests/integration/auth.integration.test.ts

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { app } from '../../src/index.js';

describe('Auth Integration Tests', () => {
  const prisma = new PrismaClient();
  
  beforeAll(async () => {
    // Set up test database
    await prisma.$connect();
  });
  
  afterAll(async () => {
    // Clean up
    await prisma.$disconnect();
  });
  
  beforeEach(async () => {
    // Clean data between tests
    await prisma.session.deleteMany();
    await prisma.user.deleteMany();
  });

  it('should register a new user', async () => {
    const response = await request(app)
      .post('/api/register')
      .send({ email: 'test@example.com', password: 'Test123!', name: 'Test' });
    
    expect(response.status).toBe(200);
    expect(response.body.token).toBeDefined();
    expect(response.body.user.email).toBe('test@example.com');
  });
});
```

### Phase 4: Test Categories

#### 1. Auth Integration Tests
- Registration with database persistence
- Login with password verification
- Session creation and validation
- Token refresh flow

#### 2. Projects Integration Tests
- Create project (verify DB record)
- List projects (verify query)
- Update project (verify FK constraints)
- Delete project (verify cascade)

#### 3. Tasks Integration Tests
- Create task (verify column FK)
- Move task (verify ordering)
- Task assignment (verify user FK)

#### 4. Rate Limiting Integration Tests
- Actual 429 responses after limit
- Redis integration (if enabled)
- Cache invalidation

#### 5. WebSocket Integration Tests
- Real-time event broadcasting
- Channel subscriptions

### Phase 5: Fixtures and Helpers

Create integration test utilities:

```typescript
// tests/fixtures.ts

export async function createTestUser(prisma: PrismaClient) {
  return prisma.user.create({
    data: {
      email: `test-${Date.now()}@example.com`,
      name: 'Test User',
      // Use better-auth's user table structure
    },
  });
}

export async function createTestProject(prisma: PrismaClient, ownerId: number) {
  return prisma.project.create({
    data: {
      name: 'Test Project',
      prefix: 'TEST',
      ownerId,
      members: {
        create: { userId: ownerId, role: 'Owner' },
      },
    },
  });
}
```

## Test Database Strategy

### Option A: TestContainers (Recommended)

```typescript
import { PostgreSQLContainer } from '@testcontainers/postgresql';

const container = await new PostgreSQLContainer()
  .withDatabase('kanban_test')
  .withUsername('test')
  .withPassword('test')
  .start();

const databaseUrl = container.getConnectionUri();
```

### Option B: Separate Local Database

```bash
# Create test database
createdb kanban_test

# Use DATABASE_URL env var
DATABASE_URL="postgresql://user:pass@localhost:5432/kanban_test" npm run test:integration
```

## CI/CD Integration

```yaml
# .github/workflows/test.yml
test:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:15
      env:
        POSTGRES_DB: kanban_test
        POSTGRES_USER: test
        POSTGRES_PASSWORD: test
      options: >-
        --health-cmd pg_isready
        --health-interval 10s
        --health-timeout 5s
        --health-retries 5
      ports:
        - 5432:5432
  steps:
    - run: npm run test:integration
      env:
        DATABASE_URL: postgresql://test:test@localhost:5432/kanban_test
```

## Running Integration Tests

```bash
# Run only integration tests
npm run test:integration

# Run all tests (unit + integration)
npm run test:all
```

## Migration Strategy

1. **Keep unit tests** - Fast, focused on logic
2. **Add integration tests** - For critical paths
3. **Prioritize** - Start with auth, then projects, then tasks
4. **Mock external services** - Keep tests isolated

## Priority List for Integration Tests

1. **Authentication** - Critical for security
2. **Project CRUD** - Core functionality  
3. **Task Operations** - Main user interaction
4. **Rate Limiting** - Security enforcement
5. **Agent Delegation** - Complex permission system
6. **WebSocket** - Real-time features

## Estimated Test Count

| Area | Unit Tests | Integration Tests |
|------|-------------|-------------------|
| Auth | 19 | ~15 |
| Projects | 10 | ~10 |
| Tasks | 12 | ~12 |
| Columns | 6 | ~6 |
| Members | 6 | ~6 |
| Agents | 22 | ~15 |
| Rate Limit | 26 | ~10 |
| WebSocket | 0 | ~10 |
| **Total** | **103** | **~84** |

This would bring total test coverage to ~187 tests.
