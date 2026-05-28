# CQRS-style data flow

Short reference for where **reads** (queries) and **writes** (commands) live so we avoid duplicate fetch paths and keep a clear boundary.

---

## Queries (reads)

| Data | Source | Notes |
|------|--------|------|
| **Projects list** | `useProjectsQuery()` | TanStack Query; settings/topbar/member pickers. No projects Pinia store. |
| **Projects fleet stats (explore)** | `useProjectsSummaryQuery()` | TanStack Query; `GET /api/projects/summary?scope=main`. |
| **Single project** | `useProjectQuery(id)` | TanStack Query via `projectsApi.getSingleProject`. |
| **Board (columns + tasks)** | `useBoardQuery(projectId)` | TanStack Query; fetches `/projects/:id/board`. Board and grid consume this. |
| **Columns (standalone)** | `useColumnsQuery(projectId)` | TanStack Query; use when you need columns without full board. |
| **User tasks (“My Tasks”)** | `useUserTasksQuery()` | TanStack Query; GET `/tasks` with no projectId. |
| **Backlog (unassigned tasks)** | `backlogStore.fetchBacklogTasks(projectId)` | Pinia; GET `/tasks?projectId=X`, filter client-side. Preload from Board. |
| **Task detail (single)** | `tasksStore.getItem(id)` | Store + API; used by TaskDialog after open. |
| **Members / tasks / columns (list)** | Stores via `getItems()` | When data comes from board payload, stores are hydrated from that; otherwise `getItems()` for modals/settings. |

**Rule:** Prefer TanStack Query for list/screen-level data. Use store `getItem`/`getItems` when the data is scoped to a modal or derived from an already-fetched payload (e.g. board).

---

## Commands (writes)

| Action | Where | Invalidates |
|--------|--------|-------------|
| **Project CRUD** | `useProjectMutations()` | `['projects']`, `['project', id]` |
| **Board columns (bulk)** | `useProjectMutations().updateColumns(projectId, columns)` | `['project', projectId]`, `['columns', projectId]` |
| **Column create/update/delete** | `columnsStore.createColumn` / `updateColumn` / `deleteColumn` | — (board refetch or explicit invalidation) |
| **Task CRUD** | `tasksStore.createItem` / `updateItem` / `deleteItem` | Callers invalidate `['board', projectId]` when needed (e.g. AddNewTaskDialog). |
| **Task move (DnD)** | Board: per-task PATCH + `updateColumns()` | `refetch()` board query. See *Task move strategy* below. |
| **Member** | `membersStore` (invite, update, `deleteMember(projectId, id)`) | — |
| **Comments** | `tasksStore.addComment` (direct axios) | — |

**Rule:** Mutations and store actions should invalidate the relevant query keys so the next read is fresh.

**Task move strategy (Board DnD):** We currently send **both** (1) a PATCH per moved task with `projectColumnId` and (2) a bulk `PATCH /columns` with the new column order. This is intentional until the backend confirms that only one is required. If the backend later documents a single preferred approach (e.g. only `POST /api/tasks/:id/move` or only bulk columns), we can simplify. See `src/stores/columns.ts` and `docs/BACKEND_FIXES_NEEDED.md`.

---

## Boundaries

1. **No store as sole source for list data that has a query.** Projects list is from `useProjectsQuery` only; no projects store.
2. **Stores hold UI state and cache for modals** (e.g. current task in TaskDialog, members list in AddNewTaskDialog). They can be hydrated from a parent query (e.g. board) or filled via `getItems`/`getItem`.
3. **ID validation** at API and composable entry points: use `isValidId` / `validateProjectId` from `src/utils/validation.ts` so invalid IDs never hit the API.
