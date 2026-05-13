/**
 * NOTE: This composable is currently unused.
 *
 * Tasks for a project are loaded via:
 * - Board.vue: /projects/:id/board endpoint (columns + tasks)
 * - BacklogStore: /tasks?projectId=X&unassigned=true for unassigned tasks
 * - TasksStore: CRUD and websocket updates for individual tasks
 *
 * If you need a TanStack Query-based tasks list in the future,
 * prefer to:
 * - Reuse BacklogStore for unassigned tasks, and/or
 * - Use `api.getItems('tasks', { projectId, ... })` from indexApi (unwraps
 *   `{ data, pagination }` and defaults `limit` to 100 for rewrite), or
 * - Call axios with `unwrapListItems` from `@/utils/paginatedListResponse`.
 *
 * Keeping this file as documentation of the intended pattern,
 * but it is not exported or used anywhere.
 */ 