# Test Suite Documentation

## Overview

This test suite provides comprehensive coverage for the Kanban backend using **Vitest** with a combination of unit tests (with mocks) and a roadmap for integration tests.

## Test Structure

```
tests/
├── setup.ts           # Global test setup and teardown
├── helpers/
│   └── index.ts       # Mock factories and test utilities
├── auth/
│   └── auth.test.ts   # Authentication tests (19 tests)
├── agents/
│   └── delegations.test.ts  # Agent delegation tests (22 tests)
├── rate-limit/
│   └── rate-limit.test.ts    # Rate limiting tests (26 tests)
└── api/
    └── endpoints.test.ts     # API endpoint tests (36 tests)
```

## Running Tests

### Basic Commands

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run with interactive UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

### Test Configuration

The test configuration is in [`vitest.config.ts`](vitest.config.ts):

- **Environment**: Node.js
- **Test timeout**: 30 seconds
- **Files included**: `tests/**/*.test.ts`
- **Setup file**: `tests/setup.ts`

## Test Categories

### 1. Unit Tests (Current)

These tests use **mocked dependencies** to isolate the code under test:

- **Auth Tests**: Test registration, login, session management, token validation
- **Agent Tests**: Test agent CRUD, delegation management, permissions
- **Rate Limit Tests**: Test configuration, middleware, pattern matching, response handling
- **API Tests**: Test project/task/column/member operations

**Advantages**:
- Fast execution (no database connection needed)
- Deterministic results
- Easy to test edge cases

**Disadvantages**:
- 0% code coverage (mocks replace real implementations)
- Doesn't test actual database queries or HTTP behavior

### 2. Integration Tests (Planned - See below)

Integration tests connect to a real database and test the actual application flow.

## Test Utilities

### Mock Factories ([`tests/helpers/index.ts`](tests/helpers/index.ts))

```typescript
import { 
  createMockUser,
  createMockProject,
  createMockTask,
  createMockColumn,
  createMockAgent,
  createMockDelegation,
  createMockRequest,
  createMockResponse,
  createMockPrisma
} from './tests/helpers/index.js';
```

### Example: Creating a Test

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createMockUser, createMockRequest } from './tests/helpers/index.js';

describe('My Feature', () => {
  it('should do something', () => {
    // Arrange
    const user = createMockUser({ id: 1, email: 'test@example.com' });
    
    // Act & Assert
    expect(user.email).toBe('test@example.com');
  });
});
```

## Writing New Tests

### 1. Use Existing Mock Factories

```typescript
// Create test data using factories
const mockProject = createMockProject({
  name: 'My Project',
  prefix: 'MP',
});
```

### 2. Mock Dependencies

```typescript
// Mock the module being tested
vi.mock('../../src/infrastructure/auth/index.js', () => ({
  auth: { /* mock */ },
  prisma: { /* mock */ },
}));
```

### 3. Test Both Positive and Negative Cases

```typescript
it('should create project with valid data', async () => { /* ... */ });
it('should reject project with missing name', async () => { /* ... */ });
it('should reject project with invalid prefix', async () => { /* ... */ });
```

## Best Practices

1. **One assertion per test** - Makes failures easier to diagnose
2. **Descriptive test names** - Should explain what is being tested
3. **Arrange-Act-Assert** - Clear structure for each test
4. **Use beforeEach/afterEach** - Clean state between tests
5. **Test edge cases** - Empty inputs, null values, maximum lengths

## Troubleshooting

### Tests aren't running
- Check `vitest.config.ts` includes your test files
- Ensure test files end with `.test.ts`

### Mock errors
- Make sure `vi.mock` calls are at the top of the file
- Use `vi.clearAllMocks()` in `beforeEach`

### Timeouts
- Increase `testTimeout` in `vitest.config.ts` for slow operations
