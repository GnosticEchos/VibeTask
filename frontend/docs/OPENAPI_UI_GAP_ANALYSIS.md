# OpenAPI ↔ Frontend UI Gap Analysis

This document maps **hub OpenAPI capabilities** to **what the Vue frontend actually exposes in the UI**. It complements path/param alignment work: the goal is feature coverage and product gaps, not whether query strings match.

**Spec source:** `hub/src/openapi.json` (canonical), copied to `frontend/openapi.json` via `npm run openapi:sync` from `frontend/` or `npm run openapi:sync-fe` from `hub/`.

**Last reviewed:** 2026-05-19 (code + GitNexus symbol traces; narrative docs may lag).

---

## How to read this doc

| Label | Meaning |
|-------|---------|
| **Covered** | Typical users can drive the capability from the SPA |
| **Partial** | API client or types exist; workflow incomplete or narrow entry point |
| **Gap** | Contract exposes capability; no meaningful UI |
| **Agent-only** | `/api/agent/*` — MCP/CLI, not web UI (by design) |
| **UI-only** | Frontend calls a hub route **not** documented in OpenAPI |

Human-facing OpenAPI: **~86 operations** across **75 paths**. Agent MCP surface: **21 operations** under `/api/agent/*`.

---

## Critical hub quirk: `POST /api/tasks` and `isContainer`

The Zod schema (`hub/src/validation/schemas/task.schemas.ts`) allows `isContainer`, `parentId`, and `subBoardOutlineColor` on create. OpenAPI **does not** document `isContainer` / `parentId` on `POST /api/tasks`.

The route handler validates with `createTaskSchema` but **does not persist `isContainer`**:

```277:330:hub/src/api/routes/tasks.ts
router.post('/', requireAuth, validateBody(createTaskSchema), ...
  const { projectId, name, description, assigneeId, projectColumnId, relationMode, relationId, parentId } = body;
  // ...
  const task = await prisma.task.create({
    data: {
      // parentId is persisted; isContainer is NOT included
    },
```

**Implications:**

- Sending `isContainer: true` on create is a no-op today (silent drop).
- Container tasks for humans are created via **`POST /api/projects/{projectId}/accept-plan/{taskId}`** (sets `isContainer: true` and spawns children), or via **`PATCH /api/tasks/{id}`** with `isContainer` (UI does not expose this).
- Sub-boards are **not** a separate REST resource — they are container tasks plus optional `parentId` children.

---

## Sub-boards (container tasks)

### API model

| Concept | Implementation |
|---------|----------------|
| Container | Task with `isContainer: true` |
| Child task | Task with `parentId` set to container id |
| Plan expansion | `accept-plan` parses `##` / `###` headings from linked `IMPLEMENTATION_PLAN` doc |
| Workspace list | `GET /api/projects/{id}/active-workspaces` — containers with metadata |
| Sub-board board | `GET /api/projects/{id}/board?parentId={containerId}` |

### UI coverage

| User intent | API | UI status |
|-------------|-----|-----------|
| Switch between sub-boards | `GET .../active-workspaces` | **Covered** — `ProjectView`, `BoardTopbar` |
| View sub-board kanban | `GET .../board?parentId=` | **Covered** — `SubBoardView` |
| Accept plan → create container + children | `POST .../accept-plan/{taskId}` | **Partial** — `TaskDialog` only; requires `IMPLEMENTATION_PLAN` doc-link and Maintainer+ |
| “New sub-board” / mark task as container | `POST` or `PATCH` with `isContainer` | **Gap** — create dialog omits fields; PATCH save omits `isContainer`; POST create ignores it |
| Add child task on sub-board | `POST /api/tasks` with `parentId` | **Gap** — `AddNewTaskDialog` never sends `parentId` |
| Edit outline color | `subBoardOutlineColor` on task / project settings | **Gap** — display only |
| Column protection on sub-board | `PATCH /api/projects/{id}/settings` | **Gap** — no settings editor |

```mermaid
flowchart LR
  subgraph ui [Frontend today]
    A[Add task] --> B[Link IMPLEMENTATION_PLAN]
    B --> C[Accept plan in TaskDialog]
    C --> D[View sub-board]
  end
  subgraph api [Hub]
    C --> E[POST accept-plan]
    E --> F[isContainer + children]
    F --> D
  end
```

---

## Gap matrix (OpenAPI → UI)

Operations with **no or minimal UI**. Agent-only routes omitted here (see [Agent API](#agent-api-by-design)).

| Method | Path | Summary | Notes |
|--------|------|---------|-------|
| `PATCH` | `/api/projects/{id}/settings` | Update project settings | `columnProtection`, default `subBoardOutlineColor` — types exist, no editor |
| `GET` | `/api/projects/{id}/summary` | Project summary | No summary dashboard |
| `DELETE` | `/api/tasks/{id}` | Documented as “move to review” | Hub **hard-deletes**; no delete control in UI |
| `POST` | `/api/tasks/{id}/monitor-pass/{columnId}` | Record monitor pass | Types only |
| `DELETE` | `/api/tasks/{id}/monitor-pass/{columnId}` | Clear monitor pass | Types only |
| `POST` | `/api/tasks/{id}/monitor-reject/{columnId}` | Reject to previous column | Types only |
| `GET` | `/api/admin/audit-log` | Admin audit log | Admin UI has no audit viewer |
| `POST` | `/api/admin/rate-limits` | Create rate limit config | Admin UI: get/put/toggle only |
| `DELETE` | `/api/admin/rate-limits/{id}` | Delete rate limit config | Not exposed |
| `POST` | `/api/logout` | Logout | SPA clears token locally; no API call |
| `POST` | `/api/signin` | Sign-in alias | UI uses `/api/login` |
| `POST` | `/api/signup` | Sign-up alias | UI uses `/api/register` |

---

## Partial coverage

| Area | Operation(s) | Gap detail |
|------|----------------|------------|
| **Tasks — create** | `POST /api/tasks` | UI sends name, column, assignee, relations only; hub drops `isContainer` even if sent |
| **Tasks — update** | `PATCH /api/tasks/{id}` | Hub allows `isContainer`, `subBoardOutlineColor`, `parentId`; `TaskDialog` save does not send them |
| **Plan / sub-board** | `POST .../accept-plan` | Single entry: task dialog after plan doc-link |
| **Documents** | CRUD + search | `deleteDocument` and `useDocumentSearch` exist; `DocsView` does not wire delete or `DocumentSearchOverlay` |
| **Projects — delete** | `DELETE /api/projects/{id}` | Implemented in settings / explore (easy to miss in spec-only reviews) |
| **Comments** | `PATCH /api/tasks/comment/{id}` vs `POST .../comments` | UI uses legacy PATCH; both routes exist on hub |

---

## Well covered (reference)

| Domain | Primary UI |
|--------|------------|
| Auth | `LoginView`, `SignUpView`, session restore |
| Projects | Explore, board, settings, create/delete |
| Tasks | Board, backlog, dialogs, drag → `POST .../move` |
| Columns | Board, workspace settings |
| Members | Project members, invite, role patch |
| Search | `SearchInput`, overlays |
| Documents | `DocsView`, `TaskDialog` doc-links |
| Human agents | Settings → Agents, delegations |
| Account | Settings hub — profile, password, preferences, sessions, layout |
| Admin (most) | Rate limits, users, health, platform agents |

---

## UI-only routes (not in OpenAPI)

These hub routes are used by the frontend but **missing from** `hub/src/openapi.json`. Add them on the next spec sync.

| Method | Path (effective) | UI consumer |
|--------|------------------|-------------|
| `GET` | `/api/projects/templates` | `CreateNewProjectDialog` (`axiosApi.get` directly; `projectApi.getProjectTemplates` is unused) |
| `GET` | `/api/projects/{id}/delegates` | `TaskDialog` — agent assignee picker |

---

## OpenAPI spec accuracy issues

| Issue | Detail |
|-------|--------|
| Incomplete `POST /api/tasks` body | Omits `isContainer`, `parentId` though Zod allows them |
| Wrong `DELETE /api/tasks/{id}` summary | Says “move to review”; handler deletes the row |
| Duplicate comment paths | `PATCH /tasks/comment/{id}` and `POST /tasks/{id}/comments` |
| Missing routes | `templates`, `delegates` (see above) |

Generated `frontend/src/api/generated/openapi-types.ts` inherits these gaps.

---

## Agent API (by design)

**21 operations** under `/api/agent/*` for **VibeTask MCP** / CLI (`app/crates/vibetask-mcp`). Not expected in the SPA. See [`docs/user/agents.md`](../../docs/user/agents.md) for platform session vs delegate agents.

---

## Verification tips

1. Refresh spec: `cd frontend && npm run openapi:sync`
2. Regenerate types: `cd frontend && npm run openapi:generate` (if scripted)
3. For behavior vs docs: prefer **GitNexus** `context` / `impact` on API wrappers (e.g. `acceptPlan`, `getActiveWorkspaces`) and read hub route handlers under `hub/src/api/routes/`
4. Do not rely on this file alone after large API changes — re-run a gap pass against `openapi.json` and `frontend/src/api/`

---

## Suggested implementation priority (product)

1. Sub-board creation UX (explicit action + fix hub `POST` create to persist `isContainer` if product wants that path)
2. Project settings UI for `PATCH .../settings`
3. OpenAPI sync: document `templates` / `delegates`; fix task create/delete summaries and request body
4. Documents: wire search overlay and delete in `DocsView`
5. Monitor pass/reject and task delete if review-column workflow is required

---

## Supersedes

This document replaces **`API_CONTRACT_REVIEW.md`**, which tracked path/param alignment only and is no longer maintained.
