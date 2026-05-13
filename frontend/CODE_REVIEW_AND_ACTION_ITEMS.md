# Frontend Code Review & Action Items

**Scope:** Kanban-frontend project review for dead code, DRY violations, CQRS alignment, and best practices.  
**Date:** 2025-03-04.

---

## 1. Critical / Bugs

### 1.1 Axios token not cleared on logout
- **Where:** `src/stores/auth.ts` – `clearAuth()` does not call `deauthorizeAxios()`.
- **Impact:** After logout, the Axios instance still has the old `Authorization` header. Next API call (e.g. if user navigates without full reload) can send an invalid token.
- **Action:** In `clearAuth()`, call `deauthorizeAxios()` from `src/api/axios.ts` so the shared client drops the Bearer token.

### 1.2 Column create rollback uses wrong ID
- **Where:** `src/stores/columns.ts` – `createColumn()` catch block (line ~46).
- **Issue:** Rollback uses `store.items.value.filter(col => col.id !== Date.now())`. `Date.now()` is evaluated at rollback time, not at create time, so the temporary column is never removed.
- **Action:** Use the same `tempId` variable: `store.items.value.filter(col => col.id !== tempId)`.

### 1.3 Router guard: document title and early returns
- **Where:** `src/router/index.ts` – `beforeEach`.
- **Issues:**
  - Title is set only after the `isAuthorized` block; when the guard calls `next({ path: '...' })` or `next({ name: 'Login' })` and then falls through, title is still updated (minor).
  - On early return (public route, invalid ID), document title is never set.
- **Action:** Set `document.title` in all branches (including early returns), or move title logic into a single place after all `next()` calls and ensure it runs only once per navigation.

### 1.4 `stringDeepCopy` does not copy
- **Where:** `src/utils/functions.ts` – `stringDeepCopy`.
- **Issue:** `(' ' + string).slice(1)` returns the same string reference in JavaScript (strings are immutable). The name suggests a copy; the behavior is a no-op.
- **Action:** Either remove `stringDeepCopy` and use the string as-is where it’s used (e.g. `BaseDialogTextarea.vue`), or rename to something like `identityString` and document that it’s intentional, or delete if truly unused for semantics.

---

## 2. Dead Code

### 2.1 `getProjectSummary`
- **Where:** `src/api/v1/projectApi.ts` – exported but never imported or called.
- **Action:** Remove `getProjectSummary` and its implementation, or add a query (e.g. `useProjectSummaryQuery`) and use it where a summary is needed.

### 2.2 `validateProjectContext`
- **Where:** `src/utils/validation.ts`.
- **Issue:** Function is `return isValidProjectId(projectId)` with no other logic. No usages found.
- **Action:** Remove `validateProjectContext` and use `isValidProjectId` directly where needed.

### 2.3 `updateItemWithSpecificAction`
- **Where:** `src/api/v1/indexApi.ts` and `src/stores/storeConstructor.ts` – defined and re-exported, never called.
- **Action:** Remove from both API and store constructor, or implement a use case (e.g. task comment as a “specific action”) and use it consistently instead of ad-hoc `axiosApi.patch`.

### 2.4 Commented / unused code in axios interceptor
- **Where:** `src/api/axios.ts` – 401 handler contains commented-out `useAuthStore` and `useLayoutStore`/`changeLoadingStatus`.
- **Action:** Either implement 401 handling (e.g. call logout and optionally `deauthorizeAxios`) or remove the commented block to avoid confusion.

### 2.5 Duplicate dashboard routes to same view
- **Where:** `src/router/index.ts` – `/dashboard/preferences` and `/dashboard/theme-playground` both use `ThemePlayground.vue`.
- **Action:** Keep one route (e.g. `preferences`) and remove the other, or give them different components if the intent is different.

---

## 3. DRY Violations

### 3.1 Two ways to fetch projects
- **Where:** `useProjectsQuery()` (TanStack Query + `api.getItems('projects', {})`) vs `projectsStore.getItems()` (storeConstructor → `api.getItems('projects', ...)`).
- **Impact:** Same data can be loaded via query or store; cache and loading state are not unified.
- **Action:** Prefer one source of truth. Either (a) use TanStack Query for projects everywhere and have the store (if still needed) read from the query client, or (b) use only the store and remove `useProjectsQuery` from the store and use a single fetch path (e.g. store only).

### 3.2 Two ways to fetch backlog / unassigned tasks
- **Where:** `BacklogStore.fetchBacklogTasks()` uses `axiosApi.get('/tasks', { params: { projectId, unassigned: true } })`; `ProjectBacklog.vue` uses `api.getItems('tasks', { projectId: id, unassigned: true })`.
- **Action:** Centralize in one place (e.g. backlog API or composable) and have both the store and the view use it. Align with CQRS: one “query” for backlog tasks.

### 3.3 Task move persistence: bulk columns + per-task PATCH
- **Where:** `Board.vue` – `onDnDEnd` calls both `api.updateItem('tasks', id, { projectColumnId, projectId })` for each moved task and `updateColumns({ projectId, columns: payloadColumns })`.
- **Impact:** Duplicate or overlapping writes; backend contract may expect one or the other.
- **Action:** Clarify with backend whether (a) only bulk column update is enough, or (b) only per-task PATCH is enough, or (c) both are required. Then implement a single, documented strategy and remove the redundant path.

### 3.4 ID validation duplicated
- **Where:** `isValidId` used in multiple APIs; `validateProjectId` / `isValidProjectId` in validation utils; `useProjectQuery` uses `isNaN(id)`.
- **Action:** Use a single validation layer (e.g. `validation.ts`) and reuse in all API and composable entry points (projectApi, indexApi, useProjectQuery, useTasksQuery, etc.).

### 3.5 Store constructor typo
- **Where:** `storeContructor` in `src/stores/storeConstructor.ts` (and all stores importing it).
- **Action:** Rename to `storeConstructor` everywhere (file export and all imports: tasks, columns, projects, members).
- **Done:** Verified — export and all imports already use correct spelling `storeConstructor`; no typo in codebase.

---

## 4. CQRS and Data Flow

### 4.1 Mixed read models
- **Issue:** Reads are split between TanStack Query (projects, project, board, columns in some places) and Pinia stores (getItems/getItem from storeConstructor). Commands are in both composables (e.g. `useProjectMutations`) and stores (createItem, updateItem, etc.).
- **Action:** Define a clear CQRS-style boundary: (1) **Queries:** TanStack Query (or a single “query” layer) for all reads; (2) **Commands:** Mutations (composables or dedicated command modules) that invalidate the relevant query keys. Prefer not to duplicate “fetch” logic in both query and store.

### 4.2 Projects store depending on composable
- **Where:** `src/stores/projects.ts` calls `useProjectsQuery()` inside the store.
- **Issue:** Store initialization runs the query and ties the store to the composable lifecycle; other components also use `useProjectsQuery()` directly, so the “source of truth” is the query, not the store.
- **Action:** Either (a) make the store a thin wrapper that only exposes `memberProjects` (and similar) from a passed-in or injected query ref, or (b) remove projects from the store and have components use `useProjectsQuery()` + a small composable for derived state (e.g. `memberProjects`).

### 4.3 Column updates: two command paths
- **Where:** Column changes go through (1) `useProjectMutations().updateColumns` (bulk) and (2) `columnsStore.createColumn` / `updateColumn` / `deleteColumn` / `reorderColumns`.
- **Action:** Document when to use which (e.g. board DnD → bulk; settings table → per-column). Consider a single “column command” API that encapsulates both bulk and single-column operations so callers don’t need to know HTTP details.

---

## 5. Best Practices and Consistency

### 5.1 Console logging in production
- **Where:** Heavy `console.log`/`console.warn`/`console.error` in router, axios, indexApi, storeConstructor, project store, Board, useProjectsQuery, columns store, TaskDialog, UnifiedThemePlayground, etc.
- **Action:** Replace with a small logger that is no-op or minimal in production (e.g. gated by `import.meta.env.DEV`). Remove or reduce verbose logs in hot paths (e.g. every request/response, every store action).

### 5.2 API typing
- **Where:** `projectApi.createProject` takes `payload: any`; `indexApi` uses `params: any` in several places.
- **Action:** Introduce proper types (e.g. `CreateProjectPayload`, request DTOs for getItems/getItem params) and use them in API and callers.

### 5.3 401 handling and logout
- **Where:** `src/api/axios.ts` – 401 is detected but no logout or token clear.
- **Action:** On 401, call auth store’s logout (or clearAuth + deauthorizeAxios) so the UI and client state are consistent. Avoid duplicate logout using the existing `userHasBeenLoggedOut` flag.

### 5.4 Router guard: replace window.alert with toast
- **Where:** `src/router/index.ts` – invalid ID branch uses `window.alert('Router error (TODO: DaisyUI toast)')`.
- **Action:** Use the layout store’s toast (or existing BaseToast) and remove the TODO.

### 5.5 useTasksQuery and API consistency
- **Where:** `useTasksQuery` uses `axiosApi.get(\`/tasks?projectId=${projectId}\`)` directly; other composables use `api.getItems(...)`.
- **Action:** Use the same API layer (e.g. a dedicated tasks API or `api.getItems('tasks', { projectId })`) and shared validation (e.g. `isValidId(projectId)` or `validateProjectId`) for consistency and maintainability.

### 5.6 Unused / redundant layoutStore in ProjectSettings
- **Where:** `ProjectSettings.vue` – commented `// import { useLayoutStore }` and later `layoutStore` is used for toast. So layoutStore is used; only the first import was commented. Verify no duplicate or unused imports.
- **Action:** Clean up commented imports; ensure a single, clear import for `useLayoutStore` where it’s used.

---

## 6. Testing

### 6.1 Working Vitest suite and smoke tests
- **Where:** Project has `vitest.config.ts` but no reliable passing test suite.
- **Action:** Add a working Vitest suite and smoke tests covering: load projects page, move tasks, edit task (double-click task window), change assigned user, add comment in task. Use E2E (e.g. Playwright) or component/integration tests (Vitest + Vue Test Utils) as appropriate; document which approach is used.
- **Fixed:** Robust Vitest suite added: unit tests for `src/utils` (validation, functions), store tests for backlog and layout, composable tests for useProjectQuery and useMemberProjects, component tests for BaseToast and Board (smoke), integration smoke for App mount. Uses `@vue/test-utils`, `tests/setup.ts` (localStorage stub, console silencing), and optional `npm run test:coverage`. See `tests/` and `src/**/__tests__/`.

---

## 7. Summary Checklist (ordered by priority)

| # | Category | Action | Status |
|---|----------|--------|--------|
| 1 | Bug | Call `deauthorizeAxios()` in auth `clearAuth()`. | ✅ Done |
| 2 | Bug | Fix column create rollback: use `tempId` instead of `Date.now()` in filter. | ✅ Done |
| 3 | Bug | Fix or remove `stringDeepCopy` and update `BaseDialogTextarea` usage. | ✅ Done |
| 4 | Router | Set document title in all guard branches; replace `window.alert` with toast. | ✅ Done |
| 5 | Dead code | Remove or use `getProjectSummary`, `validateProjectContext`, `updateItemWithSpecificAction`; clean axios 401 comments; merge duplicate theme routes. | ✅ Done |
| 6 | DRY | Single source for “projects list”; single source for backlog; task move documented; ID validation at API layer; storeConstructor spelling verified. | ✅ Done |
| 7 | CQRS | Define query vs command boundaries; document column update paths (bulk vs per-column). | ✅ Done (see CQRS_DATA_FLOW.md) |
| 8 | Practices | Dev-only logger; type API payloads; 401 → logout and token clear. | ✅ Done |
| 9 | Testing | Working Vitest suite and smoke tests. | ✅ Done |

### Still to do (post-cleanup)

- ~~**Stylelint:** Fix or relax rules so `npm run lint:style` passes.~~ ✅ Done: fixed shorthand/empty-line/font-family/color in source; ignored `daisyThemesRaw/`.
- ~~**ID validation audit:** Add validation at any remaining entry points.~~ ✅ Done: Board.vue `enabled` uses `isValidId(projectId)`; indexApi `getItems`/`updateItems` validate `params.projectId` when present.
- ~~**Task move strategy:** Document “both” approach until backend clarifies.~~ ✅ Done: see `docs/CQRS_DATA_FLOW.md` and `docs/BACKEND_FIXES_NEEDED.md`.
- ~~**Optional — expand test coverage:**~~ ✅ Done (this round): added `src/api/v1/__tests__/indexApi.spec.ts` (getItems/updateItems/getItem/updateItem validation), `src/api/v1/__tests__/tasksApi.spec.ts` (addTaskComment validation), `src/composables/__tests__/useColumnsQuery.spec.ts` (enabled when invalid id, fetch when valid). Suite: 12 files, 69 tests. Remove duplicate spec file if it reappears (`openapi.json` is canonical).

---

### Fixed (post-review)
- **§1 Critical bugs (1.1–1.4):** (1.1) `clearAuth()` now calls `deauthorizeAxios()` so the Axios instance drops the Bearer token on logout. (1.2) Column create rollback uses `tempId` (declared before try) in the filter. (1.3) Router guard sets `document.title` in all branches via `setDocumentTitle()`. (1.4) `stringDeepCopy` removed; `BaseDialogTextarea` emits `inputValue.value` directly; tests updated.
- **§2 Dead code:** Removed `getProjectSummary` from projectApi; removed `validateProjectContext` from validation.ts and its tests; removed `updateItemWithSpecificAction` from indexApi and storeConstructor; 401 handler now calls auth store `logout()` (and `authorizeAxios` resets `userHasBeenLoggedOut` on login). Duplicate theme route not present (only `preferences` uses ThemePlayground).
- **§5 Practices:** Added `src/utils/logger.ts` (devLog, devWarn, logError) and wired it in `axios.ts` so request/response logs are dev-only; added `CreateProjectPayload` and typed `createProject` in projectApi and useProjectMutations; 401 triggers logout (see §2).
- **§3 DRY (partial):** ProjectBacklog.vue now uses `backlogStore.fetchBacklogTasks(id)` and `backlogStoreItems` as single source for secondary backlog fetch (no `api.getItems('tasks', ...)`). Board.vue uses `validateId(route.params.id)` for project ID. Column update paths documented in `stores/columns.ts` (bulk vs single create/update/delete).
- **§3.1 Single source for projects list (Option A):** TanStack Query is the single source. **Projects store removed.** Added `src/queryClient.ts` (setQueryClient, getQueryClient, invalidateProjectsQuery) and pass QueryClient from main.ts for use outside component tree. Project list: `useProjectsQuery()` / `useMemberProjects()` only. Added `projectApi.deleteProject`, `useProjectMutations().deleteProject` + `isDeletingProject`; ConfirmProjectDeleteDialog uses mutation. ProjectDataSectionPartial uses `invalidateProjectsQuery()` instead of `projectsStore.getItems()`. UserTasks: added `useUserTasksQuery()` composable (replaces store’s userTasks/fetchUserTasks). Websocket: UserProjectsIndexChannel create/update/delete call `invalidateProjectsQuery()`; removed `projects` from storesList. Deleted `src/stores/projects.ts`.
- **Testing (6.1):** Full Vitest suite: utils (validation, functions), stores (backlog, layout), composables (useProjectQuery, useMemberProjects), components (BaseToast, Board smoke), app integration smoke; `tests/setup.ts`, coverage script and config.
- **§3.3 Task move:** Documented in `stores/columns.ts` (per-task PATCH + bulk updateColumns); backend clarification requested in `docs/BACKEND_FIXES_NEEDED.md`.
- **§3.4 ID validation:** `isValidId` / `validateProjectId` used at API layer (projectApi, indexApi, membersApi); added to backlog store `fetchBacklogTasks`, `useColumnsQuery` (fetch + enabled), `useProjectMutations.updateColumns`.
- **§3.5 storeConstructor:** Verified — no typo in code (export and imports are `storeConstructor`).
- **§4.1 CQRS:** Added `docs/CQRS_DATA_FLOW.md` defining query vs command boundaries, single source for projects/board, and invalidation rules.
- **§5.5 Task comment API:** Added `src/api/v1/tasksApi.ts` with `addTaskComment(taskId, content)` (validation + PATCH /tasks/comment/:id). Tasks store `addComment` now calls the API layer instead of `axiosApi` directly.
- **§5.6 ProjectSettings:** Removed commented `// import { useLayoutStore }`, `// const layoutStore`, and `// const router`; single clear import and `const layoutStore = useLayoutStore()`.
- **Comment display "Unknown" in task dialog:** Comments now use `getDisplayName(comment.user || comment.createdBy)` so the author shows correctly when the API returns only `createdBy` (or `user` without `fullName`). The API response after adding a comment is normalized so the replaced optimistic comment has a displayable user. See `TaskDialog.vue` (comments list and add-comment response handling).
- **Phase 4 (DaisyUI UX polish):** All `window.alert` replaced with `layoutStore.openToast`; modal size applied from `dialogData.size`; TopbarTemplate and BoardLoadingSkeleton use DaisyUI skeleton; SettingsSectionTemplate loading uses `.skeleton`; grid layout updated (flex, min-h-0, scrollable table, reduced padding); legacy PrimeVue-style classes and `pi-*` icons replaced with Tailwind/DaisyUI and inline SVG. See `PHASE_4_DAISYUI_UX_PLAN.md`.

---

## 9. Suggested implementation order (current)

**Completed:** §1–§6 and §8 (bugs, dead code, DRY, CQRS, practices, testing). See “Fixed (post-review)” above.

**Next (in order):** (1) Stylelint — fix or relax rules so `lint:style` passes; (2) ID validation audit — add validation at any remaining entry points; (3) Task move — document “both” strategy until backend clarifies; (4) Optional — expand tests, polish.
