# Backend integration tests (Kanban-rewrite)

The backend’s integration test run is captured in `Kanban-rewrite/IntegrationTesting.txt`. This doc summarizes what is covered so the frontend can rely on those APIs.

**Last run (from IntegrationTesting.txt):** 7 test files, 221 tests passed — re-run `npm run test:integration` after adding `users-settings-layout.integration.test.ts` to refresh counts.

## Test files and APIs covered

| File | Tests | APIs covered |
|------|-------|--------------|
| `users-settings-layout.integration.test.ts` | (local) | GET/PUT/DELETE /api/users/me/settings-layout |
| `tasks.integration.test.ts` | 39 | GET/POST/PATCH /api/tasks, GET /api/tasks/:id, POST /api/tasks/:id/comments, PATCH /api/tasks/comment/:id, filters (projectId, unassigned, assigneeIds, query) |
| `members.integration.test.ts` | 33 | GET /api/members, GET /api/members/:id, GET /api/members/check_email, POST /api/members/invite, PATCH /api/members/:id, DELETE /api/members/:id |
| `columns.integration.test.ts` | 31 | GET/POST/PATCH/DELETE /api/columns (including single-column PATCH/DELETE) |
| `projects.integration.test.ts` | 35 | GET/POST /api/projects, GET/PATCH/DELETE /api/projects/:id, GET /api/projects/:id/board, GET /api/projects/:id/summary |
| `agents.integration.test.ts` | 27 | POST/GET/PATCH/DELETE /api/agents, POST /api/agents/:id/regenerate-key |
| `auth.integration.test.ts` | 23 | Auth (Better Auth) flows used by the above |
| `e2e.flow.test.ts` | 33 | End-to-end: login, session, logout, projects CRUD + board, columns CRUD, tasks CRUD, members (list, check_email, invite, PATCH, DELETE), agents (create, list, update, regenerate-key, delete) |

## APIs in the app but not in this integration suite

- **Admin:** `/api/admin/rate-limits`, `/api/admin/users` — mounted on the integration test server (`tests/integration/setup/test-server.ts`) but **no dedicated integration test file** in the 7. Safe to call from the frontend; behaviour is defined by the backend and OpenAPI.
- **Agent delegations:** `/api/agents/:agentId/delegations` — mounted; agents tests touch “delete associated delegations” only. Frontend can still wire list/create/update delegations to the real routes.

## Frontend takeaway

- **Auth, projects, board, columns, tasks, task comments, members, agents (CRUD + regenerate-key)** are all covered by 221 passing integration tests. You can wire Account (session/user), Board, Grid, Members, and Settings → API Agents to these endpoints.
- **Admin (rate-limits, users)** and **agent delegations** are available in the backend and on the test server; use OpenAPI and backend docs for request/response shape and handle 403 when the user is not admin.
