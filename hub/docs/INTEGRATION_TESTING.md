# Integration Testing Guide

This guide provides comprehensive documentation for running and maintaining integration tests for the Kanban backend.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Running Tests](#running-tests)
4. [Understanding Test Output](#understanding-test-output)
5. [CI/CD Integration](#cicd-integration)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

- **Node.js**: v18.x or higher
- **PostgreSQL**: v14.x or higher
- **npm**: v9.x or higher

### Database Setup

1. **Ensure PostgreSQL is running**:
   ```bash
   # Linux (systemd)
   sudo systemctl start postgresql
   
   # macOS (Homebrew)
   brew services start postgresql@14
   ```

2. **Verify database exists**:
   ```bash
   psql -U postgres -l | grep kanban_rewrite
   ```

3. **Seed database if needed**:
   ```bash
   # From prisma/DATADUMP directory
   cd prisma/DATADUMP
   ./dump.sh  # Or import CSVs manually
   ```

### Dependencies

Install all dependencies:
```bash
npm install
```

Generate Prisma client:
```bash
npx prisma generate
```

---

## Environment Setup

### Configuration File

Integration tests use `.env.test` for configuration:

```env
# Server
PORT=3000
WS_PORT=8080
NODE_ENV=test

# Database
DATABASE_URL="postgresql://postgres:sparkles@localhost:5432/kanban_rewrite"

# Better Auth
BETTER_AUTH_SECRET="test-secret-key-min-32-chars-long-here!!"
BETTER_AUTH_URL="http://localhost:3000"

# Test-specific settings
TEST_RATE_LIMIT=false
TEST_DB_LOG=false
```

### Local Overrides

Create `.env.test.local` for local configuration overrides (git-ignored):

```env
# Override database URL for local testing
DATABASE_URL="postgresql://postgres:mypassword@localhost:5432/kanban_rewrite"

# Enable debug logging
TEST_DEBUG=true
TEST_DB_LOG=true
```

### Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Yes | - | Secret for session tokens (min 32 chars) |
| `BETTER_AUTH_URL` | Yes | - | Base URL for auth callbacks |
| `PORT` | No | 3000 | API server port |
| `TEST_RATE_LIMIT` | No | false | Enable/disable rate limiting |
| `TEST_DB_LOG` | No | false | Enable database query logging |
| `TEST_DEBUG` | No | false | Enable verbose test output |

---

## Running Tests

### Run All Integration Tests

```bash
npm run test:integration
```

This runs all test files matching `tests/integration/**/*.integration.test.ts`.

### Run Specific Test File

```bash
npx vitest run --config vitest.integration.config.ts tests/integration/auth.integration.test.ts
```

### Run Specific Test Suite

```bash
npx vitest run --config vitest.integration.config.ts -t "Authentication Flow"
```

### Run with Watch Mode

```bash
npx vitest --config vitest.integration.config.ts tests/integration/
```

### Run with Coverage

```bash
npx vitest run --config vitest.integration.config.ts --coverage
```

### Debug Mode

Enable verbose output for debugging:

```bash
TEST_DEBUG=true npm run test:integration
```

This shows:
- Entity tracking logs
- Cleanup operations
- Login attempts

---

## Understanding Test Output

### Successful Test Run

```
 ✓ tests/integration/auth.integration.test.ts (23 tests) 1231ms
 ✓ tests/integration/projects.integration.test.ts (35 tests) 5709ms
 ✓ tests/integration/tasks.integration.test.ts (39 tests) 4203ms
 ✓ tests/integration/columns.integration.test.ts (28 tests) 3102ms
 ✓ tests/integration/members.integration.test.ts (30 tests) 2891ms
 ✓ tests/integration/agents.integration.test.ts (27 tests) 2503ms
 ✓ tests/integration/e2e.flow.test.ts (33 tests) 678ms

 Test Files  7 passed (7)
      Tests  221 passed (221)
   Duration  40.12s
```

### Cleanup Logs

Each test shows cleanup activity:

```
[Cleanup] Cleaning up 4 tracked entities: {
  users: 0,
  projects: 1,
  columns: 1,
  tasks: 2,
  comments: 0,
  projectUsers: 0
}
[Cleanup] Successfully cleaned up 4 entities
```

### Login Logs

Authentication attempts are logged:

```
[Login] Attempting Better Auth sign-in for: lukaszpodlipskikontakt@example.com
[Login] Better Auth result: success
```

### Error Indicators

Watch for these warning signs:

| Log Message | Meaning |
|-------------|---------|
| `[Cleanup] Error during cleanup` | Database cleanup failed |
| `[Login] Better Auth error` | Authentication failed |
| `Found N test users with ID > 10000` | Data leak from tests |

---

## CI/CD Integration

### GitHub Actions

Example workflow:

```yaml
name: Integration Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: kanban_rewrite_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Generate Prisma Client
        run: npx prisma generate
      
      - name: Run migrations
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/kanban_rewrite_test
      
      - name: Seed test data
        run: npx tsx scripts/seed-test-data.ts
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/kanban_rewrite_test
      
      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/kanban_rewrite_test
          BETTER_AUTH_SECRET: ${{ secrets.BETTER_AUTH_SECRET }}
          BETTER_AUTH_URL: http://localhost:3000
          NODE_ENV: test
```

### Pre-commit Hook

Add to `.husky/pre-commit`:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Run integration tests before commit
npm run test:integration
```

### Test Database for CI

For CI environments, use a separate test database:

```yaml
env:
  DATABASE_URL: postgresql://postgres:postgres@localhost:5432/kanban_rewrite_ci
```

---

## Troubleshooting

### Common Issues

#### 1. Database Connection Failed

**Error**: `Can't reach database server at localhost:5432`

**Solution**:
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Start if not running
sudo systemctl start postgresql

# Verify connection
psql -U postgres -c "SELECT 1"
```

#### 2. Unique Constraint Violation

**Error**: `Unique constraint failed on the fields: (email)`

**Solution**: Previous test run didn't clean up properly:
```bash
# Run verification
npx tsx tests/integration/verify-data-preservation.ts

# Manual cleanup if needed
psql -U postgres -d kanban_rewrite -c "DELETE FROM \"User\" WHERE id > 10000;"
```

#### 3. Tests Timeout

**Error**: `Test timed out in 30000ms`

**Solution**: Increase timeout in `vitest.integration.config.ts`:
```typescript
export default defineConfig({
  test: {
    testTimeout: 60000,
    // ...
  },
});
```

#### 4. Authentication Fails

**Error**: `[Login] Better Auth error: Invalid email or password`

**Solution**: Verify test user exists:
```bash
psql -U postgres -d kanban_rewrite -c "SELECT id, email FROM \"User\" WHERE id <= 5;"
```

If users are missing, re-seed from `prisma/DATADUMP/`.

#### 5. Port Already in Use

**Error**: `EADDRINUSE: address already in use :::3000`

**Solution**:
```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Reset Test Environment

Complete reset of test environment:

```bash
# 1. Stop any running processes
pkill -f "node.*vitest"

# 2. Clean database
psql -U postgres -d kanban_rewrite -c "
  DELETE FROM \"TaskLog\" WHERE id > 10000;
  DELETE FROM \"TaskComment\" WHERE id > 10000;
  DELETE FROM \"Task\" WHERE id > 10000;
  DELETE FROM \"ProjectColumn\" WHERE id > 10000;
  DELETE FROM \"ProjectUser\" WHERE id > 10000;
  DELETE FROM \"Project\" WHERE id > 10000;
  DELETE FROM \"Session\" WHERE id > 10000;
  DELETE FROM \"Account\" WHERE id > 10000;
  DELETE FROM \"User\" WHERE id > 10000;
"

# 3. Re-seed if needed
cd prisma/DATADUMP && ./dump.sh

# 4. Run tests
npm run test:integration
```

---

## Test Data Reference

### Existing Users

| ID | Name | Email | Password |
|----|------|-------|----------|
| 1 | Łukasz Podlipski | lukaszpodlipskikontakt@example.com | admin1234 |
| 2 | Andrzej Podlipski | andrzejpodlipski@example.com | admin1234 |
| 3 | Jan Kowalski | jakkowalski@example.com | admin1234 |
| 4 | Adam Mickiewicz | adammickiewicz@example.com | admin1234 |
| 5 | Juliusz Słowacki | juliuszslowacki@example.com | admin1234 |

### Existing Projects

| ID | Name | Prefix | Owner |
|----|------|--------|-------|
| 1 | Pierwszy projekt | PIE | User 1 |
| 2 | Drugi projekt | DRU | User 1 |
| 4 | Changed Board Name | NEW | User 1 |
| 5 | New Project Name | PRO | User 1 |
| 6 | James Project 1 | JAM | User 5 |
| 7 | this is a new projec | THI | User 5 |
| 8 | 14234 | 142 | User 1 |
| 9 | NewBoard | NEW | User 1 |
| 10 | API Test Project | API | User 1 |

> Note: Project ID 3 does not exist

### ID Boundaries

| Range | Purpose |
|-------|---------|
| 1-10000 | Protected existing data |
| > 10000 | Test-created data (auto-cleaned) |

---

## Additional Resources

- [Integration Tests README](../tests/integration/README.md) - Detailed test documentation
- [API Documentation](./REST_API_DOCUMENTATION.md) - API endpoint reference
- [Prisma Schema](../prisma/schema.prisma) - Database schema
