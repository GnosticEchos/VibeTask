# Code Skeptic Audit Report — Kanban-frontend (Frontend)

## Executive Summary

The Kanban-frontend (Vue 3 + Pinia + Vue Query + Socket.IO + Tailwind v4 + DaisyUI) is a well-structured SPA but contains critical bugs, inconsistent patterns, and technical debt from the recent massive refactoring.

---

## CRITICAL FINDINGS (P0 — Immediate Action Required)

### 1. Missing `logout` Export from Auth Store

- **File:** [`src/stores/auth.ts`](src/stores/auth.ts:257-268)
- **Severity:** CRITICAL
- **Description:** The `logout` function is defined at line 162 but **not exported** in the return statement. Any component calling `authStore.logout()` will get `undefined`, causing silent failures where users think they logged out but didn't.
- **Remediation:** Add `logout` to the return object at line 267.

> **Maintainer validation (2026-03-31):** Already fixed before this audit pass. `logout` is exported in `src/stores/auth.ts` return object.

### 2. WebSocket Store Creates Stores at Definition Time

- **File:** [`src/stores/websocket.ts`](src/stores/websocket.ts:60-66)
- **Severity:** CRITICAL
- **Description:** `storesList` and `projectStore` are created at module evaluation time, not inside the `defineStore` callback. This means stores are instantiated before Pinia is ready, potentially causing `"getActivePinia()"` errors during SSR or test environments.
- **Remediation:** Move all store instantiations inside the `defineStore` callback body.

> **Maintainer validation (2026-03-31):** Already fixed before this audit pass. Store composables are called inside the `defineStore` callback, not at module top level.

### 3. Router Guard Mutates Global State During Navigation

- **File:** [`src/router/index.ts`](src/router/index.ts:133-203)
- **Severity:** CRITICAL
- **Description:** The `beforeEach` guard calls `authStore.refreshSession()` which is an async operation during navigation. If the session refresh fails with a network error (not 401), the guard still proceeds, potentially allowing stale auth state. The catch block only redirects on 401.
- **Remediation:** Add explicit handling for network errors vs auth errors. Consider a retry mechanism.

> **Maintainer validation (2026-03-31):** Confirmed behavior risk. Implemented explicit network/server-error handling in guard: failed session refresh now blocks navigation (`next(false)`) with user warning toast instead of silently proceeding on stale auth.

---

## HIGH SEVERITY FINDINGS (P1 — Fix Before Release)

### 4. Frontend Axios Timeout Too Aggressive

- **File:** [`src/api/axios.ts`](src/api/axios.ts:37)
- **Severity:** HIGH
- **Description:** 5-second timeout may be insufficient for complex queries (project board loads, bulk task operations). Users on slow connections will experience silent failures.
- **Remediation:** Increase to 15-30 seconds or make it endpoint-specific.

> **Maintainer validation (2026-03-31):** Implemented. Default timeout increased from 5s to 15s.

### 5. Missing Error Boundary in Frontend

- **File:** [`src/App.vue`](src/App.vue)
- **Severity:** HIGH
- **Description:** No Vue error boundary or `errorCaptured` hook is configured. Any unhandled error in a child component will crash the entire app with a white screen.
- **Remediation:** Add an error boundary component or `app.config.errorHandler`.

> **Maintainer validation (2026-03-31):** Implemented baseline global error handling via `app.config.errorHandler` in `src/main.ts` with centralized logging.

### 6. Frontend `normalizeUser` Accepts Any Role String

- **File:** [`src/stores/auth.ts`](src/stores/auth.ts:43)
- **Severity:** HIGH
- **Description:** The role validation only checks `['USER', 'SUPPORT', 'ADMIN']`. If the backend returns a new role (e.g., `MODERATOR`), it silently downgrades to `USER` without logging or alerting.
- **Remediation:** Add explicit logging when an unknown role is received.

> **Maintainer validation (2026-03-31):** Implemented. Unknown role strings now emit a dev warning before safe fallback to `USER`.

### 7. `updateItems` Endpoint Has No Backend Route

- **File:** [`src/api/v1/indexApi.ts`](src/api/v1/indexApi.ts:93-108)
- **Severity:** HIGH
- **Description:** The frontend has an `updateItems` function that calls `PATCH /{endpoint}` (plural bulk update), but no backend route handles this pattern. This will 404 or hit the wrong route.
- **Remediation:** Either remove the frontend function or implement the backend endpoint.

> **Maintainer validation (2026-03-31):** Implemented guardrail. `updateItems` is now explicitly restricted to supported bulk endpoint(s) (`columns`) and rejects others with a clear error.

### 8. Frontend `getItems` Auto-Paginates Without User Awareness

- **File:** [`src/api/v1/indexApi.ts`](src/api/v1/indexApi.ts:22-23)
- **Severity:** HIGH
- **Description:** `getItems` automatically sets `limit: REWRITE_MAX_LIST_PAGE_SIZE` for certain endpoints. If this constant changes, all list fetches are affected without explicit caller changes.
- **Remediation:** Make pagination explicit at the call site.

> **Maintainer validation (2026-03-31):** Deferred intentionally. Current project policy uses centralized high-limit defaults for rewrite paginated endpoints to avoid partial data loads in existing views.

### 9. Frontend `VITE_API_BASE_URL` Not Validated

- **File:** [`src/api/axios.ts`](src/api/axios.ts:36)
- **Severity:** HIGH
- **Description:** If `VITE_API_BASE_URL` is undefined, the baseURL becomes `undefined/api/` which produces invalid URLs.
- **Remediation:** Add a startup validation that throws if required env vars are missing.

> **Maintainer validation (2026-03-31):** Implemented. Axios setup now validates `VITE_API_BASE_URL` at startup and throws a clear error if missing.

---

## MEDIUM SEVERITY FINDINGS (P2 — Fix in Next Sprint)

### 10. Frontend `useWebsocketStore` Has No Reconnection Logic

- **File:** [`src/stores/websocket.ts`](src/stores/websocket.ts:145-151)
- **Severity:** MEDIUM
- **Description:** `connectWS()` and `disconnectWS()` are manual. If the WebSocket drops, there's no automatic reconnection. The `useWebSocket` composable may handle this, but the store doesn't expose reconnection state.
- **Remediation:** Add reconnection logic and expose connection state to components.

### 11. Frontend Has Unused Dependencies

- **File:** [`package.json`](package.json)
- **Severity:** MEDIUM
- **Description:** `vue-grid-layout-v3`, `data-grid-vue`, and `dragon-drop-vue` are all grid/drag-drop libraries. Having three competing libraries increases bundle size.
- **Remediation:** Audit which libraries are actually used and remove unused ones.

### 12. Frontend `console.log` in Production

- **File:** [`src/api/v1/indexApi.ts`](src/api/v1/indexApi.ts:14)
- **Severity:** MEDIUM
- **Description:** `console.log` calls in API functions will execute in production builds.
- **Remediation:** Use a conditional logger that's disabled in production.

### 13. Frontend Stylelint Config Is Complex

- **File:** [`.stylelintrc.json`](.stylelintrc.json)
- **Severity:** MEDIUM
- **Description:** Stylelint config includes Tailwind, SCSS, and Vue configs. This may conflict with Tailwind v4's CSS-first approach.
- **Remediation:** Review if stylelint is still needed with Tailwind v4.

### 14. No TypeScript `strict` Mode

- **File:** [`tsconfig.json`](tsconfig.json)
- **Severity:** MEDIUM
- **Description:** TypeScript strict mode is not fully enabled. The codebase uses `any` extensively.
- **Remediation:** Enable `strict: true` incrementally, fixing type errors as you go.

### 15. Frontend Has No E2E Tests

- **Severity:** MEDIUM
- **Description:** Only unit/browser vitest configs exist. No Playwright or Cypress E2E tests.
- **Remediation:** Add E2E test coverage for critical user flows.

### 16. Vitest Version Mismatch with Backend

- **File:** [`package.json`](package.json:63) — `"vitest": "^3.2.4"`
- **Severity:** MEDIUM
- **Description:** The frontend uses Vitest v3 while the backend uses Vitest v4. This can cause inconsistent test behavior and shared test utilities may break.
- **Remediation:** Align Vitest versions across both repos.

---

## LOW SEVERITY FINDINGS (P3 — Nice to Have)

### 17. Frontend `console.log` Throughout API Layer

- **Severity:** LOW
- **Description:** Every API function in `indexApi.ts` has `console.log` calls that will execute in production.
- **Remediation:** Replace with a conditional logger.

### 18. No Docker/Containerization Support

- **Severity:** LOW
- **Description:** No Dockerfile or docker-compose.yml.
- **Remediation:** Add containerization for reproducible deployments.

### 19. Skip Link Implementation

- **File:** [`src/App.vue`](src/App.vue:35)
- **Severity:** LOW
- **Description:** A skip link exists but targets `#main-content` which may not exist on all routed views.
- **Remediation:** Ensure all views have a `#main-content` anchor.

---

## CROSS-REPOSITORY INCONSISTENCIES

| # | Backend (Kanban-rewrite) | Frontend (Kanban-frontend) | Issue |
|---|--------------------------|----------------------------|-------|
| 1 | Uses `UserRole` enum (`USER`, `SUPPORT`, `ADMIN`) | Uses string literals `'USER'`, `'ADMIN'` | Role type mismatch — frontend should use a shared type |
| 2 | Returns `permissions.isAdmin` as boolean | Checks `permissions.isAdmin === true` explicitly | Inconsistent boolean handling |
| 3 | OpenAPI spec at `src/openapi.json` | No generated API client from OpenAPI | Manual API calls can drift from spec |
| 4 | WebSocket events use `actionType` field | Frontend dispatches on `message.actionType` | Contract is implicit — no shared types |
| 5 | Backend uses integer IDs | Frontend sometimes treats IDs as strings | Type inconsistency in ID handling |
| 6 | Vitest v4 in backend | Vitest v3 in frontend | Different test framework versions |
| 7 | TypeScript ~5.0 | TypeScript ~5.8 | Different TS versions may cause type mismatches |

---

## PHASED REMEDIATION ROADMAP

### Phase 1: Critical Fixes (Week 1)

1. Export `logout` from auth store return object
2. Move store instantiations inside `defineStore` callback in websocket store
3. Add explicit network error handling in router guard
4. Remove or fix the `updateItems` frontend function

### Phase 2: High-Priority Fixes (Week 2)

1. Increase axios timeout to 15-30 seconds
2. Add Vue error boundary / `app.config.errorHandler`
3. Add logging for unknown role strings in `normalizeUser`
4. Add `VITE_API_BASE_URL` startup validation
5. Make pagination explicit in `getItems`

### Phase 3: Medium-Priority Fixes (Week 3-4)

1. Add WebSocket reconnection logic
2. Audit and remove unused dependencies (`vue-grid-layout-v3`, etc.)
3. Replace `console.log` with conditional logger
4. Review stylelint config for Tailwind v4 compatibility
5. Enable TypeScript strict mode incrementally
6. Add E2E tests with Playwright
7. Align Vitest versions with backend

### Phase 4: Cleanup and Hardening (Week 5+)

1. Add Docker support
2. Ensure skip link targets exist on all views
3. Generate API client from OpenAPI spec
4. Create shared types package for frontend/backend contract

---

## APPENDIX

---

## Accepted Backlog Checklist (Maintainer)

This is the execution-oriented backlog after validation and rebuttal review.

### Now (current cycle)

- [x] Validate required frontend env var `VITE_API_BASE_URL` at startup.
- [x] Increase default Axios timeout from 5s to 15s.
- [x] Add unknown-role warning in auth normalization path.
- [x] Restrict `updateItems` bulk PATCH to explicitly supported endpoint(s).
- [x] Handle session-refresh network/server failures in router guard without silently continuing.
- [x] Add global Vue error handling baseline (`app.config.errorHandler`).

### Next (next sprint)

- [x] Add endpoint-specific timeout overrides for known long-running requests (board/load-heavy flows).
- [x] Decide whether to keep or retire implicit high-limit pagination defaults in `getItems`.
  - Decision: keep implicit defaults for rewrite list endpoints, but make policy explicit/configurable via `VITE_ENABLE_IMPLICIT_LIST_LIMIT` and dev warnings when callers omit `limit`.
- [x] Reduce API-layer console noise by migrating remaining logs to dev-only logger wrappers.
- [x] Add route-level recovery UX copy for blocked navigation when session verification fails.

### Later (hardening)

- [x] Add Playwright E2E coverage for core auth + board + settings workflows.
  - Added Playwright scaffold and first smoke spec (`tests/e2e/auth-smoke.spec.ts`).
- [x] Review dependency footprint (multiple grid/drag libs) and remove unused packages.
  - Removed unused `dragon-drop-vue`; kept `vue-grid-layout-v3` and `data-grid-vue` (active usage).
- [x] Evaluate strict TypeScript rollout plan (`strict` subsets, per-folder gating).
  - `strict` is already enabled globally; added a targeted no-`any`/API-boundary hardening plan.
- [x] Explore OpenAPI-generated frontend client for contract drift prevention.
  - Added generated OpenAPI type flow (`openapi:gen-types`) and output under `src/api/generated/openapi-types.ts`.
- [ ] Consider shared contract/types package for frontend/backend primitives.
  - Design note drafted; pending repo/workspace decision.

### Audit Scope

This audit covers the **Kanban-frontend** project exclusively. The backend (Kanban-rewrite) is referenced only for cross-repository inconsistency analysis.

### Technology Stack

| Category | Technology |
|----------|------------|
| Framework | Vue 3 (Composition API) |
| State Management | Pinia |
| Data Fetching | Vue Query |
| Real-time | Socket.IO |
| Styling | Tailwind CSS v4 + DaisyUI |
| Testing | Vitest v3 |
| Build Tool | Vite |
| Language | TypeScript |

### Severity Definitions

| Severity | Priority | Description |
|----------|----------|-------------|
| CRITICAL | P0 | Immediate action required; causes data loss, security vulnerability, or complete feature breakage |
| HIGH | P1 | Fix before release; causes degraded UX, silent failures, or potential crashes |
| MEDIUM | P2 | Fix in next sprint; technical debt, maintainability issues, or missing best practices |
| LOW | P3 | Nice to have; minor improvements, documentation gaps, or optional enhancements |
