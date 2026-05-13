# Code Skeptic Audit Report — Kanban-rewrite (Backend)

> **Audit Date:** 2026-03-31
> **Scope:** Backend only (Express 5 + Better Auth + Prisma 7 + Socket.IO)
> **Auditor:** Code Skeptic Mode
> **Status:** Findings documented, remediation pending

---

## Executive Summary

The Kanban-rewrite backend (Express 5 + Better Auth + Prisma 7 + Socket.IO) is architecturally sound but contains numerous regression risks, dead code, inconsistent patterns, and technical debt from the recent massive refactoring.

This report identifies **29 findings** across four severity levels:

| Severity | Count | Priority |
|----------|-------|----------|
| Critical (P0) | 5 | Immediate Action Required |
| High (P1) | 8 | Fix Before Release |
| Medium (P2) | 11 | Fix in Next Sprint |
| Low (P3) | 5 | Nice to Have |

---

## Completed Fixes

The following findings from the original audit have been addressed:

- ✅ **Finding #1 (Dead Legacy Password Hashing Code)** — DELETED `hashPassword` and `verifyPassword` from `src/infrastructure/auth/index.ts`
- ✅ **Finding #2 (Duplicate Authentication Middleware)** — Consolidated into `src/infrastructure/http/middleware/auth.ts`, deleted `src/infrastructure/auth/authorization.ts`, updated 4 admin route imports
- ✅ **Finding #5 (Broadcaster Singleton Pattern)** — Removed legacy `broadcastDatabaseEvent` export, updated `pg-listener.ts` to use `getBroadcaster().broadcastDatabaseEvent()`
- ✅ **Finding #9 (Agent API Key Regeneration Atomicity)** — Reordered operations in `POST /api/agents/:id/regenerate-key` to create new key before deleting old one
- ✅ **Finding #15 (argon2 Dependency)** — REMOVED from `package.json` (correctly identified as unused)
- ⚠️ **Finding #16 (ioredis Dependency)** — INCORRECTLY flagged as unused; restored to `package.json`. It IS used by `src/infrastructure/http/rate-limiter.ts`

---

## CRITICAL FINDINGS (P0 — Immediate Action Required)

### 1. Dead Legacy Password Hashing Code

- **File:** [`src/infrastructure/auth/index.ts`](../src/infrastructure/auth/index.ts:67-78)
- **Severity:** CRITICAL
- **Description:** `hashPassword()` and `verifyPassword()` functions use a custom SHA-256 + salt scheme that is **never imported or called** anywhere in the codebase. The admin temporary password service imports `hashPassword` from `better-auth/crypto` instead. This dead code is dangerous — if accidentally used, it would create passwords incompatible with Better Auth's Argon2id.
- **Remediation:** Delete both functions immediately.

### 2. Duplicate Authentication Middleware

- **Files:** [`src/infrastructure/http/middleware/auth.ts`](../src/infrastructure/http/middleware/auth.ts) vs [`src/infrastructure/auth/authorization.ts`](../src/infrastructure/auth/authorization.ts)
- **Severity:** CRITICAL
- **Description:** Two separate `requireRole` implementations exist with different signatures and behavior. `auth.ts` exports `requireRole(...allowedRoles: string[])` while `authorization.ts` exports `requireRole(...allowedRoles: UserRole[])` using the Prisma enum. Routes import from different sources, creating inconsistent auth enforcement.
- **Remediation:** Consolidate into a single module. Delete `authorization.ts` and update all imports to use `middleware/auth.ts`.

### 3. Hardcoded CORS Origins Not Synced with Frontend

- **File:** [`src/index.ts`](../src/index.ts:68-71)
- **Severity:** CRITICAL
- **Description:** Default CORS origins include `http://localhost:5173` (Vite default) but the frontend's `vite.config.ts` runs on port `4000`. The `.env.example` documents `4000,5173` but the hardcoded fallback in `index.ts` may allow unintended origins in production if `DEVELOPMENT_FE_ORIGIN` is unset.
- **Remediation:** Remove `localhost:5173` from hardcoded defaults or make it environment-specific. Add production CORS validation.

### 4. Test Suite Uses Mocks Instead of Real Integration

- **File:** [`tests/api/endpoints.test.ts`](../tests/api/endpoints.test.ts)
- **Severity:** CRITICAL
- **Description:** The "API Endpoints Tests" file mocks the entire Prisma client and auth module. These are **unit tests pretending to be integration tests** — they test nothing real. The actual integration tests in `tests/integration/` are the real ones, but this file creates false confidence.
- **Remediation:** Either delete this file or rename it to `tests/unit/api-endpoints.unit.test.ts` and clearly document it tests mock behavior only.

### 5. Broadcaster Singleton Pattern Is Fragile

- **File:** [`src/infrastructure/websocket/broadcaster.ts`](../src/infrastructure/websocket/broadcaster.ts:257-286)
- **Severity:** CRITICAL
- **Description:** The module exports both a class and singleton functions. `pg-listener.ts` imports `broadcastDatabaseEvent` (the legacy function) while other code uses `getBroadcaster()`. If `initializeBroadcaster()` is called after `pg-listener` imports, the legacy function will throw.
- **Remediation:** Remove the legacy `broadcastDatabaseEvent` export. All consumers should use `getBroadcaster()`.

---

## HIGH SEVERITY FINDINGS (P1 — Fix Before Release)

### 6. No Input Sanitization on Rich Text Fields

- **File:** [`src/infrastructure/http/middleware/sanitize.ts`](../src/infrastructure/http/middleware/sanitize.ts)
- **Severity:** HIGH
- **Description:** The sanitize middleware uses `isomorphic-dompurify` but only applies to explicitly listed fields. The `task.description` and `project.description` fields are sanitized, but there's no guarantee all user-input fields are covered. New fields added without sanitization are XSS vectors.
- **Remediation:** Add a middleware that sanitizes ALL string fields by default, with an opt-out mechanism.

### 7. Zod v4 Migration Risk

- **File:** [`package.json`](../package.json:47) — `"zod": "^4.3.6"`
- **Severity:** HIGH
- **Description:** Zod v4 has breaking API changes from v3. The codebase uses `z.coerce.number()` and `ZodError` patterns that may behave differently. The `ZodError` import in `validation.ts:9` uses `instanceof ZodError` which may fail across package boundaries in v4.
- **Remediation:** Verify all Zod patterns work with v4. Consider pinning to a specific version instead of using `^`.

### 8. Prisma 7 Adapter Compatibility

- **File:** [`package.json`](../package.json:33-34) — `"@prisma/adapter-pg": "^7.6.0"`
- **Severity:** HIGH
- **Description:** Prisma 7 is a major version with potential breaking changes. The codebase uses `@prisma/adapter-pg` (node-postgres adapter) but the generated client is in a custom output directory. Any mismatch between Prisma CLI version and runtime version will cause runtime failures.
- **Remediation:** Pin Prisma versions explicitly. Add a startup version check.

### 9. Agent API Key Regeneration Deletes Old Key Before Creating New

- **File:** [`src/api/routes/agents.ts`](../src/api/routes/agents.ts:347-350)
- **Severity:** HIGH
- **Description:** The regenerate-key endpoint deletes the old API key (line 348) BEFORE creating the new one (line 353). If `auth.api.createApiKey()` fails, the agent is left with no key — a destructive operation without atomicity.
- **Remediation:** Create the new key first, then delete the old one, then update delegations. Use a transaction.

### 10. No Rate Limiting on Agent Endpoints

- **File:** [`src/api/routes/agent/index.ts`](../src/api/routes/agent/index.ts)
- **Severity:** HIGH
- **Description:** The `/api/agent/*` routes use `unifiedAuthMiddleware` but have no rate limiting applied. Agents could exhaust API resources or cause DoS.
- **Remediation:** Apply the dynamic rate limiter to agent routes with agent-specific limits.

### 11. Database Triggers Not Verified at Startup

- **File:** [`src/infrastructure/database/ensure-websocket-triggers.ts`](../src/infrastructure/database/ensure-websocket-triggers.ts)
- **Severity:** HIGH
- **Description:** The `ensureWebsocketTriggers()` function is called at startup but errors are caught and logged without preventing startup. The server runs without real-time updates if triggers fail, but there's no health check endpoint that reports this degradation.
- **Remediation:** Add trigger status to the `/health` endpoint response.

### 12. Project Role Stored as String, Not Enum

- **File:** [`prisma/schema.prisma`](../prisma/schema.prisma:272)
- **Severity:** HIGH
- **Description:** `ProjectUser.role` is `String` with comment values `'Owner', 'Maintainer', 'Editor', 'Viewer'`. This is not enforced by the database. A typo in any route checking these values silently grants access.
- **Remediation:** Convert to a proper enum type in the schema.

### 13. No OpenAPI Spec Validation in CI

- **File:** [`scripts/sync-openapi-to-frontend.mjs`](../scripts/sync-openapi-to-frontend.mjs)
- **Severity:** HIGH
- **Description:** The OpenAPI spec sync script exists but there's no CI check that the spec matches the actual routes. The `src/openapi.json` can drift from reality.
- **Remediation:** Add a CI step that generates OpenAPI from routes and diffs against the committed spec.

---

## MEDIUM SEVERITY FINDINGS (P2 — Fix in Next Sprint)

### 14. Repository Interfaces Are Unused

- **Files:** [`src/domain/repositories/*.ts`](../src/domain/repositories/)
- **Severity:** MEDIUM
- **Description:** Interface files exist (`task.repository.ts`, `project.repository.ts`, etc.) but the actual implementations in `src/infrastructure/database/repositories/` don't implement these interfaces. The interfaces are dead code.
- **Remediation:** Either make implementations implement the interfaces, or delete the interface files.

### 15. `argon2` Dependency Is Unused

- **File:** [`package.json`](../package.json:35) — `"argon2": "^0.44.0"`
- **Severity:** MEDIUM
- **Description:** The `argon2` package is listed as a direct dependency, but Better Auth handles password hashing internally. No code in the codebase imports from `argon2`.
- **Remediation:** Remove from `package.json` dependencies.

### 16. `ioredis` Dependency IS Used — Audit Was Wrong

- **File:** [`package.json`](../package.json:41) — `"ioredis": "^5.10.0"`
- **File (Usage):** [`src/infrastructure/http/rate-limiter.ts`](../src/infrastructure/http/rate-limiter.ts)
- **Severity:** MEDIUM (Finding was incorrect)
- **Description:** The original audit incorrectly flagged ioredis as unused. It is imported and used by `src/infrastructure/http/rate-limiter.ts` for Redis-backed rate limiting. The dependency is required and should remain in `package.json`.
- **Remediation:** None — dependency is correctly used. Remove from remediation list.

### 17. Console.log in Production Code

- **Files:** Multiple (20+ instances)
- **Severity:** MEDIUM
- **Description:** `console.log`, `console.error`, and `console.warn` are used throughout production code (`index.ts`, `auth.ts`, `pg-listener.ts`, etc.). These leak sensitive information and add I/O overhead.
- **Remediation:** Replace with a structured logger (e.g., pino) with log levels.

### 18. No Request ID / Correlation ID

- **Severity:** MEDIUM
- **Description:** There's no request ID middleware. When debugging production issues, logs from concurrent requests cannot be correlated.
- **Remediation:** Add a `request-id` middleware that generates/propagates correlation IDs.

### 19. Test Database Setup Creates Tables Manually

- **File:** [`tests/integration/setup/test-db.ts`](../tests/integration/setup/test-db.ts:248-293)
- **Severity:** MEDIUM
- **Description:** The test setup manually creates `UserSettingsLayout` and `AdminAuditLog` tables with raw SQL instead of running migrations. This drifts from the schema when columns are added.
- **Remediation:** Run `prisma migrate deploy` in test setup instead of manual table creation.

### 20. No Health Check for WebSocket Port

- **File:** [`src/index.ts`](../src/index.ts:233-265)
- **Severity:** MEDIUM
- **Description:** The `/health/websocket` endpoint hardcodes `status: 'ok'` and only changes to error if `io.sockets.sockets.size` throws. It doesn't actually check if the WS server is listening.
- **Remediation:** Add an actual TCP health check to port 8080.

### 21. `ensureAgentReviewColumn` Has Race Condition

- **File:** [`src/api/routes/agent/index.ts`](../src/api/routes/agent/index.ts:41-88)
- **Severity:** MEDIUM
- **Description:** The check-then-create pattern for agent review columns is not atomic. Concurrent requests can create duplicate columns. The P2002 catch helps but doesn't prevent the duplicate from being attempted.
- **Remediation:** Use a unique constraint on `(projectId, roleType)` or use `upsert`.

### 22. No TypeScript `strict` Mode

- **File:** [`tsconfig.json`](../tsconfig.json)
- **Severity:** MEDIUM
- **Description:** TypeScript strict mode is not enabled. The codebase uses `any` extensively (e.g., `req as any`, `error: any`).
- **Remediation:** Enable `strict: true` incrementally, fixing type errors as you go.

### 23. Backend `express-rate-limit` Types Are Incompatible

- **File:** [`package.json`](../package.json:52) — `"@types/express-rate-limit": "^5.1.3"`
- **Severity:** MEDIUM
- **Description:** The types package is for v5 but the runtime is v8 (`"express-rate-limit": "^8.2.1"`). This can cause type mismatches.
- **Remediation:** Remove the `@types/express-rate-limit` package — v8 ships with its own types.

### 24. No API Versioning

- **Severity:** MEDIUM
- **Description:** All API routes are unversioned (`/api/projects`, `/api/tasks`). When breaking changes are needed, there's no versioning strategy.
- **Remediation:** Add `/api/v1/` prefix to all routes.

---

## LOW SEVERITY FINDINGS (P3 — Nice to Have)

### 25. Inconsistent Error Response Formats

- **Severity:** LOW
- **Description:** Some routes return `{ error: 'message' }`, others return `{ error: 'message', details: [...] }`, and the error handler returns different shapes.
- **Remediation:** Standardize on a single error response format.

### 26. No API Response Caching Headers

- **Severity:** LOW
- **Description:** No `Cache-Control` headers are set on any responses. Static data (project lists, column definitions) could be cached.
- **Remediation:** Add cache headers to appropriate GET endpoints.

### 27. Missing `.env.test` Documentation

- **File:** [`.env.test`](../.env.test)
- **Severity:** LOW
- **Description:** The `.env.test` file exists but isn't documented in the README.
- **Remediation:** Document test environment setup.

### 28. No Docker/Containerization Support

- **Severity:** LOW
- **Description:** No Dockerfile or docker-compose.yml.
- **Remediation:** Add containerization for reproducible deployments.

### 29. No Database Seed Script for Development

- **File:** [`prisma/seed.ts`](../prisma/seed.ts)
- **Severity:** LOW
- **Description:** The seed script exists but `package.json` points `db:seed` to `restore-from-dump.ts` instead. The seed script may be outdated.
- **Remediation:** Align seed scripts or remove unused ones.

---

## PHASED REMEDIATION ROADMAP

### Phase 1: Critical Fixes (Week 1)

| # | Action | File(s) |
|---|--------|---------|
| 1 | Delete dead `hashPassword`/`verifyPassword` | `src/infrastructure/auth/index.ts` |
| 2 | Consolidate duplicate `requireRole` middleware | `src/infrastructure/http/middleware/auth.ts`, `src/infrastructure/auth/authorization.ts` |
| 3 | Fix broadcaster singleton pattern (remove legacy export) | `src/infrastructure/websocket/broadcaster.ts` |
| 4 | Remove unused `argon2` and `ioredis` dependencies | `package.json` |
| 5 | Fix agent key regeneration atomicity (create before delete) | `src/api/routes/agents.ts` |

### Phase 2: High-Priority Fixes (Week 2)

| # | Action | File(s) |
|---|--------|---------|
| 1 | Add rate limiting to agent endpoints | `src/api/routes/agent/index.ts` |
| 2 | Convert `ProjectUser.role` to enum | `prisma/schema.prisma` |
| 3 | Add OpenAPI-to-routes CI validation | `scripts/sync-openapi-to-frontend.mjs` |
| 4 | Pin Zod and Prisma versions | `package.json` |
| 5 | Add WebSocket trigger status to health endpoint | `src/infrastructure/database/ensure-websocket-triggers.ts` |

### Phase 3: Medium-Priority Fixes (Week 3-4)

| # | Action | File(s) |
|---|--------|---------|
| 1 | Implement or delete repository interfaces | `src/domain/repositories/*.ts` |
| 2 | Replace console.log with structured logger | Multiple files |
| 3 | Add request ID middleware | `src/infrastructure/http/middleware/` |
| 4 | Fix test database setup to use migrations | `tests/integration/setup/test-db.ts` |
| 5 | Add WebSocket health check | `src/index.ts` |
| 6 | Enable TypeScript strict mode incrementally | `tsconfig.json` |
| 7 | Remove incompatible express-rate-limit types | `package.json` |

### Phase 4: Cleanup and Hardening (Week 5+)

| # | Action |
|---|--------|
| 1 | Standardize error response formats |
| 2 | Add cache headers to GET endpoints |
| 3 | Add API versioning (`/api/v1/`) |
| 4 | Add Docker support (Dockerfile, docker-compose.yml) |
| 5 | Align seed scripts or remove unused ones |

---

## APPENDIX: Risk Summary

```
CRITICAL (P0): ████████████████████████████████████████████████████████████  5 findings
HIGH     (P1): ████████████████████████████████████████████████████████████  8 findings
MEDIUM   (P2): ████████████████████████████████████████████████████████████ 11 findings
LOW      (P3): ████████████████████████████████████████████████████████████  5 findings
────────────────────────────────────────────────────────────────────────────
TOTAL:                                                                       29 findings
```

**Recommendation:** Address all P0 and P1 findings before the next production release. P2 items should be scheduled for the next sprint cycle. P3 items can be addressed as time permits or deferred to a technical debt sprint.
