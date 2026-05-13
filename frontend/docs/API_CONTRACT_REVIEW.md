# API Contract Review: Frontend vs Kanban-rewrite OpenAPI

This document compares the **current frontend API usage** with the **Kanban-rewrite OpenAPI**. Focus: **removals or breaking changes** (updates/extensions are fine; removing or changing existing contract is not).

**Spec source:** `openapi.json` in this repo (canonical copy from `Kanban-rewrite/src/openapi.json`). To refresh after backend spec edits: run **`npm run openapi:sync`** from this repo (sibling `Kanban-rewrite` required), or `npm run openapi:sync-fe` from `Kanban-rewrite`.

**Backend integration tests:** `Kanban-rewrite/tests/`. See **`docs/BACKEND_INTEGRATION_TESTS.md`** for a summary of the last run (7 files, 221 tests) and which APIs are covered. Raw run output: `Kanban-rewrite/IntegrationTesting.txt`.

The spec includes:
- **`/api/users/me`** (profile, password, preferences, sessions, **settings-layout** GET/PUT/DELETE) and **`/api/admin/*`** (rate limits, user roles)
- task `relationId`/`relationMode` (create & update)
- single-column **PATCH** `/api/columns/{id}` and **DELETE** `/api/columns/{id}`
- **GET** `/api/members/{id}` (single member)
- **GET /api/tasks** without projectId ("My Tasks" - returns user's tasks across all projects)

**Base URL:** Frontend uses `VITE_API_BASE_URL` + `/api/` (e.g. `http://localhost:3000/api/`).

### Contract resolution status

| Item | Status |
|------|--------|
| relationId / relationMode | ✅ Fixed (in spec) |
| PATCH /columns/:id | ✅ Fixed (in spec) |
| DELETE /columns/:id | ✅ Fixed (in spec) |
| GET /members/:id | ✅ Fixed (documented) |
| DELETE /members/:id | ✅ Fixed (frontend now sends `projectId` via `membersApi.deleteMember`) |
| Task comment | ✅ Works (both routes supported) |
| GET /tasks without projectId | ✅ Fixed (backend supports; returns user's tasks across all projects) |

---

## 1. Auth

| Frontend | OpenAPI | Notes |
|----------|---------|--------|
| POST `/login` `{ email, password }` | POST `/api/login` same body | ✓ Aligned |
| (no register/session/logout in frontend indexApi) | Register, session, logout documented | Extension only |

---

## 2. Projects

| Frontend | OpenAPI | Notes |
|----------|---------|--------|
| GET `/projects` | GET `/api/projects` | ✓ |
| POST `/projects` `{ name, description?, prefix? }` | POST `/api/projects` required `name`, `prefix`; optional `description` | ✓ Frontend may omit prefix in type; backend requires it |
| GET `/projects/:id` | GET `/api/projects/{id}` | ✓ |
| PATCH `/projects/:id` body | PATCH `/api/projects/{id}` body `name`, `description`, `status` (optional, enum ACTIVE/ARCHIVED/DELETED) | ✓ Matches `patchProjectSchema`. Do **not** send `prefix` or membership `role` here — use member APIs for roles. |
| DELETE `/projects/:id` | DELETE `/api/projects/{id}` | ✓ |
| GET `/projects/:id/board` | GET `/api/projects/{id}/board` | ✓ |
| ~~GET `/projects/:id/summary`~~ | GET `/api/projects/{id}/summary` in OpenAPI | Frontend removed getProjectSummary (dead code). No conflict. |

---

## 3. Tasks

| Frontend | OpenAPI | Notes |
|----------|---------|--------|
| GET `/tasks` `?projectId=&unassigned=true` (backlog) | GET `/api/tasks` `?projectId` (required) | ✓ `unassigned` is extension; backend should accept or ignore |
| GET `/tasks` no params (useUserTasksQuery) | GET `/api/tasks` **optional** projectId | ✅ Supported - returns user's tasks across all projects |
| POST `/tasks` body `projectId, name, description, projectColumnId, assigneeId, relationId, relationMode` | POST `/api/tasks` same; spec + Zod use `relationId` + `relationMode` together (`blocks`, `blocked-by`, `relates-to`, `duplicate-of`) | ✓ Aligned |
| GET `/tasks/:id` `?projectId=` | GET `/api/tasks/{id}` | ✓ |
| PATCH `/tasks/:id` body + `?projectId=` | PATCH `/api/tasks/{id}` body includes `relationId`, `relationMode` (same enum when set) | ✓ Aligned |
| PATCH `/tasks/comment/:taskId` / POST `/api/tasks/{id}/comments` `{ content }` | Both routes supported | ✓ Works (both routes) |
| (Board DnD: PATCH task + bulk PATCH columns) | POST `/api/tasks/{id}/move` `{ targetColumnId, targetIndex }` | OpenAPI adds dedicated move endpoint. Frontend uses existing PATCH task + updateColumns. Both can coexist. |

---

## 4. Columns

| Frontend | OpenAPI | Notes |
|----------|---------|--------|
| GET `/columns` `?projectId=` | GET `/api/columns` `?projectId=` | ✓ |
| POST `/columns` body | POST `/api/columns` required `name`, `projectId`; optional `order`, `color`, `type` | ✓ |
| PATCH `/columns/:id` body + `?projectId=` | PATCH `/api/columns/{id}` (single column) | ✓ Aligned |
| PATCH `/columns` batch `{ projectId, columns }` | PATCH `/api/columns` same | ✓ |
| DELETE `/columns/:id` | DELETE `/api/columns/{id}` (204) | ✓ Aligned |

---

## 5. Members

| Frontend | OpenAPI | Notes |
|----------|---------|--------|
| GET `/members` `?projectId=` | GET `/api/members` `?projectId=` | ✓ |
| GET `/members/:id` `?projectId=` | GET `/api/members/{id}` (documented) | ✓ Aligned |
| PATCH `/members/:id` body + `?projectId=` | PATCH `/api/members/{id}` body `role`, `projectId` required | ✓ Frontend sends params via store (projectId in query). |
| DELETE `/members/:id` with `?projectId=` | DELETE `/api/members/{id}` **requires `projectId` in query** | ✓ Aligned — frontend uses `membersApi.deleteMember(projectId, memberId)`. |
| GET `/members/check_email` `?projectId=&email=` | GET `/api/members/check_email` same | ✓ |
| POST `/members/invite` body | POST `/api/members/invite` same | ✓ |

---

## 6. Summary

All contract items are resolved. Frontend sends `projectId` when removing a member via `membersApi.deleteMember(projectId, memberId)`; backend supports GET /tasks without projectId for "my tasks".

---

## 7. Remaining frontend task list (non-API)

- **DRY — Task move persistence:** Clarify with backend whether bulk columns update and/or per-task PATCH is required; document and stick to one strategy.
- **DRY — ID validation:** Ensure `validation.ts` is used at all API/composable entry points (audit and fix any remaining).
- **CQRS:** Define clear query/command boundaries; ensure no store fetches data without going through composables where appropriate.
- **Practices — Task comments API:** Unify `addComment` (e.g. in `tasks` store) with the rest of the API — currently uses `axiosApi.patch('/tasks/comment...')` directly; consider `api.updateItem` or a dedicated tasks API.
- **Practices — ProjectSettings:** Remove commented/unused `layoutStore` import and any dead code in `ProjectSettings.vue`.
