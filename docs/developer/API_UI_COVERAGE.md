# API & UI coverage (developer reference)

**Audience:** Hub, frontend, and app developers and coding agents — not end users.

Maps **hub OpenAPI** to **SPA behavior**, **summary/count semantics**, and **known gaps**. For contract ownership and sync commands, see [`CONTRACT.md`](../../CONTRACT.md) and [`DEVELOPER_HELPER_TOOLS.md`](DEVELOPER_HELPER_TOOLS.md).

**Spec:** `hub/src/openapi.json` → `frontend/openapi.json` via `openapi:sync`.

**Last updated:** 2026-06-03

---

## Labels

| Label | Meaning |
|-------|---------|
| **Covered** | Typical users can drive the capability from the SPA |
| **Partial** | API/types exist; workflow incomplete or narrow entry point |
| **Gap** | Contract exposes capability; no meaningful UI |
| **Agent-only** | `/api/agent/*` — MCP/CLI by design, not web UI |
| **Won't do (v1)** | Explicit product rejection |

Human OpenAPI: ~86 operations across ~75 paths. Agent MCP surface: 21 operations under `/api/agent/*`.

---

## Summary routes & consumers

| Route | Auth | Payload | Consumer |
|-------|------|---------|----------|
| `GET /api/projects` | User Bearer | Projects + columns + **all tasks** | Settings, TopBar, member pickers — `useProjectsQuery` |
| `GET /api/projects/summary` | User Bearer | `{ projects: ProjectStats[] }` | Explore — `useProjectsSummaryQuery` |
| `GET /api/projects/{id}/summary` | User Bearer | `{ project, members }` | `ProjectStatsBar` — `useProjectDetailSummaryQuery` |
| `GET /api/agent/projects/summary` | Agent key or user Bearer | `{ projects: ProjectStats[] }` | MCP `read_project_overview`, CLI `project overview` |
| `GET /api/agent/projects/{id}/summary` | Agent key (+ access) | `{ project: ProjectStats }` | MCP `read_project_summary`, CLI `project summary` |

**Hub implementation:** `hub/src/services/project-stats-summary.ts` — `buildProjectStatsSummary`, `parseSummaryScope`, `parseSummaryIncludeOptions`. Register human `GET /summary` **before** `GET /:id` in `hub/src/api/routes/projects.ts`.

**Schema:** `ProjectStats` + `HumanProjectDetailSummaryResponse`. Legacy `ProjectSummary` removed from OpenAPI.

---

## Workspace counting semantics

Workspaces are **container tasks** (`isContainer: true`); children use `parentId`. They are not a separate REST resource.

| Kind | Fields | Visible on |
|------|--------|------------|
| Main-board task | `parentId: null`, not container | Main kanban |
| Workspace container | `isContainer: true` | Main kanban tile |
| Workspace child | `parentId: <container>` | Workspace board only |

**Board UI** filters in `frontend/src/utils/boardTaskScope.ts`:

| View | Filter |
|------|--------|
| Main board | `parentId === null` (+ Agent Review column exception) |
| Sub-board / `?workspace=` | `parentId === workspaceId` |

**Summary API** uses explicit scope — do not assume board parity without checking scope:

| `scope` | Column counts | Typical use |
|---------|---------------|-------------|
| `main` (default) | `parentId IS NULL` — `taskCountMain` | Explore cards, agent overview default |
| `all` | All tasks in column | Fleet toggle **All tasks** |
| `workspace:{id\|identifier\|title}` | Children of one container | Sub-board stats bar |

`totalTasks` ≥ `mainBoardTasks` when workspace children exist. Explore defaults to **main-board-oriented** counts; optional “+N in workspaces” when `workspaceChildTasks > 0`.

On **`scope=main`**, Agent Review column counts include nested workspace tasks (board parity with `includeNestedReviewOnMain`).

---

## `scope` and `include` (summary routes)

| Param | Values / purpose |
|-------|------------------|
| `scope` | `main` \| `all` \| `workspace:{…}` |
| `workspace` | Container identifier or title → same as workspace scope |
| `include` | Stat buckets: `documents`, `agentReview`, `helpRequests`, `blocked` |
| `include` / flags | Workspaces: `workspaces` (top-N), `workspaces:all` (single-project); CLI `--list-workspaces` |
| `projectId` | Filter fleet to one project (agent + human) |

Fleet responses stay lean — workspace digests are opt-in. Resolve `workspace=` / identifier to `isContainer: true` or 404.

**Agent access:** Delegated agents see active delegations; user Bearer on agent routes sees membership projects; platform agents need allowlisted read endpoints.

---

## Agents: summary vs drill-down

| Tool | Context risk | Use when |
|------|--------------|----------|
| `read_project_overview` / `read_project_summary` | Low | Default — counts + optional capped identifiers |
| `read_project_state` | **High** | Drill-down only; loads full task lists |
| `query_tasks` / `GET …/tasks` | **High** | Explicit task search/list |

Recommend summary tools first; document `read_project_state` as deliberate second call.

---

## OpenAPI → SPA gaps

Operations with **no or minimal UI** (agent-only routes omitted).

| Method | Path | Notes |
|--------|------|-------|
| `DELETE` | `/api/tasks/{id}` | **Gap** — product prefers **Archive** |
| `POST` | `/api/tasks/{id}/monitor-pass/{columnId}` | **Gap** — types only |
| `DELETE` | `/api/tasks/{id}/monitor-pass/{columnId}` | **Gap** |
| `POST` | `/api/tasks/{id}/monitor-reject/{columnId}` | **Gap** |
| `GET` | `/api/admin/audit-log` | **Gap** — no audit viewer |
| `POST` | `/api/admin/rate-limits` | **Partial** — admin UI: get/put/toggle only |
| `DELETE` | `/api/admin/rate-limits/{id}` | **Gap** |
| `POST` | `/api/logout` | SPA clears token locally |
| `POST` | `/api/signin`, `/api/signup` | Aliases; UI uses `/api/login`, `/api/register` |

### Partial / product choices

| Area | Status |
|------|--------|
| `POST …/accept-plan` | **Partial** — Task dialog after `IMPLEMENTATION_PLAN` doc-link |
| Workspace membership via drag | **Won't do (v1)** — task dialog **Workspace** dropdown only |
| Backlog wall → column via drag | **Gap** — `TaskWall` uses batch PATCH + **Apply** |
| Comments | UI uses legacy `PATCH /api/tasks/comment/{id}`; `POST …/comments` also exists |

### Covered (recent mission work)

| Area | UI |
|------|-----|
| Fleet + per-project stats | Explore toggle **Main board / All tasks**; `ProjectStatsBar` on board/grid/docs |
| Backlog / archive | Stats bar modes → `TaskWall`; PATCH `archived` / `archivedAt` in OpenAPI |
| Workspaces | SubBoard, `?workspace=`, New workspace, accept-plan, Settings column policies |
| Relations | Board badges, blocked-by policy, WebSocket `mergeBoardTaskFromWebsocket` |
| Documents | `DocsView` search + delete; task doc-links |

---

## Where to look in the SPA

| Domain | Primary UI / composable |
|--------|-------------------------|
| Auth | `LoginView`, `SignUpView` |
| Projects list (heavy) | `useProjectsQuery` — settings, TopBar |
| Projects stats (lean) | `useProjectsSummaryQuery`, `useProjectDetailSummaryQuery` |
| Board / grid | `useBoardQuery`, `boardTaskScope`, `ProjectStatsBar`, `TaskWall` |
| Tasks | Board, dialogs, backlog/archive walls, `POST …/move` |
| Search | `SearchInput` — syntax help collapses on search/Enter/clear/Escape |
| Agents (human) | Settings → Agents, delegations |
| Agent API | MCP/CLI — [`docs/user/agents.md`](../user/agents.md) |

See also [`frontend/docs/CQRS_DATA_FLOW.md`](../../frontend/docs/CQRS_DATA_FLOW.md) for query vs command boundaries.

---

## Optional backlog

Pick one slice when continuing API/UI work; none block current shipping.

| Item | Notes |
|------|-------|
| Monitor pass/reject on Review Inbox | API exists |
| Backlog wall drag-to-column | Batch PATCH works today |
| Task delete in SPA | Archive is retention path |
| Board parity test | `scope=main` vs `applyBoardTaskScope` on seed data |
| Slim `GET /api/projects` | Only if Settings/TopBar payload hurts perf |
| `read_project_state` defaults / docs | High context risk for agents |
| Admin audit viewer; rate-limit DELETE | Admin gaps |
| OpenAPI auth alias cleanup | Cosmetic |

---

## Keeping this doc honest

1. After hub OpenAPI edits: validate → sync → `gen-types` → `cargo build -p vibetask-hub-client` (see helper tools doc).
2. After large API, Explore, workspace, or backlog/archive changes: update the tables above.
3. Prefer **GitNexus** `context` / `impact` on route handlers over trusting stale markdown alone.
