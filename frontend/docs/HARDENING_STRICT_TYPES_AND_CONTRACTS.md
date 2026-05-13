# Hardening: Strict Types and Contracts

This note tracks the "Later" hardening items around strict typing and frontend/backend contract sharing.

## Current State

- Frontend `tsconfig.json` already has `"strict": true`.
- Remaining risk is not global strict mode; it is local `any` usage and loosely typed API boundaries.

## Strictness Rollout Plan

1. **API boundary hardening**
   - Replace `any` in `src/api/v1/indexApi.ts` helper signatures with explicit generic payload/result shapes.
   - Prefer `unknown` + narrowing over `any` in parsing paths.
2. **Store boundary hardening**
   - Prioritize stores with widest fan-out (`auth`, `project`, `tasks`, `websocket`).
   - Add typed action payload interfaces for mutation-like methods.
3. **No-`any` budget**
   - Introduce CI check for `@typescript-eslint/no-explicit-any` with targeted allowlist comments where needed.
   - Burn down allowlist over time.

## OpenAPI Contract Hardening

- Added generator script: `npm run openapi:gen-types`
- Output: `src/api/generated/openapi-types.ts`
- Recommended use:
  - Import generated path/operation types in API modules first.
  - Avoid big-bang migration; convert high-change endpoints first (`projects`, `tasks`, `agents`, `session`).

## Shared Contract Types Package (Monorepo Candidate)

If we decide to share types directly between repos:

1. Create workspace package (e.g. `packages/contracts`).
2. Publish shared primitives:
   - user role enums
   - websocket event envelopes
   - common id and pagination types
3. Keep OpenAPI as source of truth for HTTP; use shared package for non-HTTP contracts and convenience re-exports.

## Acceptance Criteria

- API helpers no longer expose broad `any` in public signatures.
- Critical store actions are explicitly typed.
- OpenAPI generated types are consumed by at least one production endpoint module.
