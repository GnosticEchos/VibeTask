# Project summary API — gap analysis & implementation spec

**Status:** Gap analysis (pre-implementation)  
**Last updated:** 2026-05-26 (open-question decisions captured)  
**Audience:** Hub, frontend, app (MCP/CLI)  
**Related:** [`frontend/docs/OPENAPI_UI_GAP_ANALYSIS.md`](../../frontend/docs/OPENAPI_UI_GAP_ANALYSIS.md), [`CONTRACT.md`](../../CONTRACT.md)

---

## Goals

1. **Agents:** One (or two) lightweight calls return meaningful project stats without loading full task lists into context.
2. **Frontend:** Explore/dashboard cards use the same counts-only contract as agents — not `GET /api/projects` with nested tasks.
3. **Contract:** All new/changed routes documented in OpenAPI, validated in CI, with types generated for frontend and Rust hub-client.

**Non-goals (this mission):** Changing board/kanban payloads, rewriting `read_project_state` drill-down semantics, or building a full analytics dashboard.

---

## Current state

### Three “summary” paths today

| Path | Auth | Payload | Used by |
|------|------|---------|---------|
| `GET /api/projects` | User Bearer | Projects + columns + **all tasks** | Explore (`useProjectsQuery` → `ProjectSummaryCard`) |
| `GET /api/projects/{id}/summary` | User Bearer | Members + `columnSummary` (name + count) | **Nothing in SPA** |
| `GET /api/agent/projects/summary` | User Bearer **or** agent API key | `groupBy` counts per column, no tasks | **`read_project_overview` MCP**, integration tests |

Explore builds card UI client-side from heavy list data:

```text
ExploreProjectsView → useProjectsQuery → GET /api/projects?limit=100
  → hub includes columns.tasks → ProjectSummaryCard counts column.tasks.length
```

Agent overview already does the right thing at the HTTP layer:

```text
read_project_overview → GET /api/agent/projects/summary
  → { projects: [{ id, name, prefix, totalTasks, columns: [{ name, roleType, taskCount }] }] }
```

### MCP / CLI tools

| Tool | Behavior | Context risk |
|------|----------|--------------|
| `read_project_overview` | Fleet summary via agent `/summary` | **Low** |
| `read_project_state` | Fetches **all tasks**, groups in Rust, optional recent slice | **High** on large boards |
| `query_tasks` / `GET .../tasks` | Full task list | **High** |

### OpenAPI / contract gaps

| Item | Status |
|------|--------|
| `GET /api/agent/projects/summary` | **Implemented in hub, missing from `hub/src/openapi.json`** |
| `ProjectSummary` schema (human) | Documents members + `columnSummary`; **does not match** agent summary shape |
| `GET /api/projects` list | Spec implies project list; **implementation embeds full tasks** (undocumented heaviness) |
| Agent Review (`roleType: AGENT_REVIEW`) | In DB/schema; **not surfaced** in summary counts |
| Document counts | **Not in any summary endpoint** |
| Open help requests | **Not in summary** |
| Blocked tasks | **Not in summary** |

### Access model (agents)

- **Delegated agent (e.g. AgentSmith):** `/api/agent/projects/summary` scopes to **active delegations**.
- **User Bearer on agent route:** summary scopes to **all membership projects** (see `hub/tests/integration/agent-docs.integration.test.ts`).
- **Platform agent (API key):** read-only; route must appear in `allowedReadEndpoints` metadata or 403. Session/JWT path is separate.

Clarify product intent for “Platform Agent, summarize **all my** projects”: user-scoped read via platform session vs delegation list vs explicit user Bearer on agent summary.

---

## Workspaces (sub-boards) and counting semantics

Workspaces are **container tasks** (`isContainer: true`) with **child tasks** linked via `parentId`. They are not a separate REST resource or column set — children reuse the project’s shared `projectColumnId` values (see accept-plan in `hub/src/api/routes/plan-acceptance.ts`).

### Data model (reference)

| Kind | Typical fields | Visible on |
|------|----------------|------------|
| **Main-board task** | `parentId: null`, `isContainer: false` | Main kanban |
| **Workspace container** | `isContainer: true`, usually `parentId: null` | Main kanban (workspace tile) |
| **Workspace child** | `parentId: <container task id>` | Workspace sub-board only |

Nested sub-boards (child of child) are rejected at accept-plan time.

### Board UI — scoped counts (correct for kanban)

Hub `GET /api/projects/{id}/board` returns **all** tasks on all columns. The SPA filters client-side in `frontend/src/utils/boardTaskScope.ts`:

| View | Filter | Counts |
|------|--------|--------|
| **Main board** (`Board.vue`) | `parentId === null` (+ Agent Review column exception) | Main tasks + workspace **containers**; excludes workspace **children** |
| **Sub-board** (`SubBoardView.vue`) | `parentId === workspaceId` | That workspace’s children only |

```text
Main board "Plan: 5"  ≠  Explore card "Plan: 15"
                         (15 may include 10 workspace children still assigned to Plan column)
```

### Summary / explore today — **unscoped** (misleading vs main board)

| Surface | Filters `parentId`? | What `totalTasks` / column bars include |
|---------|---------------------|----------------------------------------|
| Explore `GET /api/projects` → `ProjectSummaryCard` | **No** | Every task row in the project, bucketed by `projectColumnId` |
| Agent `GET /api/agent/projects/summary` | **No** | Same — `groupBy` on all tasks |
| Human `GET /api/projects/{id}/summary` | **No** | Same |
| `GET /api/projects/{id}/active-workspaces` | N/A (containers only) | Lists `isContainer: true` tasks — **not** used for explore card math |

**Implication:**

```text
explore / summary totalTasks  ≥  mainBoardVisibleTasks
                              (strictly greater when workspace children exist)
```

Example: explore shows **71 tasks** while the main board might show ~43 tiles — the gap is largely workspace children (and possibly double-counting semantics if users expect “main board only”).

### Decision required for new summary API

Do **not** inherit today’s implicit “count everything” behavior without explicit fields and query scope.

#### Recommended `ProjectStats` task buckets

| Field | SQL / rule | Default in agent text? |
|-------|------------|------------------------|
| `totalTasks` | All tasks in project | Yes — label **“all tasks (incl. workspace children)”** |
| `mainBoardTasks` | `parentId IS NULL` | Yes — matches main kanban scope |
| `workspaceContainers` | `isContainer = true` | Optional line |
| `workspaceChildTasks` | `parentId IS NOT NULL` | Optional line |
| `columns[].taskCountMain` | Group by column where `parentId IS NULL` | **Default for explore bar** (matches board UX) |
| `columns[].taskCountAll` | Group by column, no parent filter | Opt-in / legacy parity |

#### Query param: `scope`

| Value | Behavior |
|-------|----------|
| `main` ( **default** ) | Column counts use `parentId IS NULL`; totals expose both `mainBoardTasks` and `totalTasks` |
| `all` | Column counts include workspace children (today’s explore/agent behavior) |
| `workspace:{id}` | Single-workspace digest: children only, per-column counts for that `parentId` |

Agents: **`read_project_overview` / `read_project_summary` default `scope=main`** so “summarize our project” does not inflate counts with hidden sub-board work. Use `scope=all` only when the user asks for project-wide inventory.

#### Explore frontend (Phase 5)

- **Recommended:** Progress bar and footer badge use **`mainBoardTasks`** and `columns[].taskCountMain` so cards align with what users see opening the board.
- **Optional subtitle:** “+N in workspaces” when `workspaceChildTasks > 0` (DaisyUI ghost text, no toggle).
- Document in UI copy that fleet cards are **main-board-oriented**, not full inventory.

#### Hub shared builder

Extend `buildProjectStats(projectId, includeFlags, scope)`:

```text
-- mainBoardTasks
SELECT COUNT(*) FROM Task WHERE projectId = ? AND parentId IS NULL

-- workspaceChildTasks
SELECT COUNT(*) FROM Task WHERE projectId = ? AND parentId IS NOT NULL

-- workspaceContainers
SELECT COUNT(*) FROM Task WHERE projectId = ? AND isContainer = true

-- per-column (main scope)
SELECT projectColumnId, COUNT(*) FROM Task
WHERE projectId = ? AND parentId IS NULL
GROUP BY projectColumnId
```

When `include=workspaces`: add `workspaces.activeCount` (containers) and optionally top containers by `childCount` (cap 5, identifiers only — no task bodies).

### Acceptance criteria (workspace-specific)

- [ ] Project with accept-plan children: `totalTasks > mainBoardTasks`
- [ ] `scope=main` column counts match `applyBoardTaskScope(..., null)` on same seed data
- [ ] `scope=workspace:{id}` counts match sub-board view for that container
- [ ] `scope=all` matches current explore card totals (regression baseline)
- [ ] MCP `summary_line` states scope, e.g. `Spec Task Board: 43 on main board, 71 total (28 in workspaces)`

---

## Target architecture

### Design principles

1. **Summary = counts + optional tiny identifiers** — never task bodies, descriptions, or comments.
2. **One canonical JSON schema** shared by human and agent consumers where auth allows (field-level auth may hide members on agent responses).
3. **Drill-down is explicit** — `read_project_state`, `query_tasks`, board routes require a deliberate second call with limits.
4. **Column semantics by `roleType`** — Agent Review, Complete, etc. are first-class in counts, not only display names.

### Endpoints (proposed)

#### A. Fleet summary (extend existing)

`GET /api/agent/projects/summary`

Query params (all optional):

| Param | Purpose |
|-------|---------|
| `projectId` | Single-project filter (AgentSmith “our project”) |
| `scope` | `main` (default), `all`, or `workspace:{id}` — see [Workspaces](#workspaces-sub-boards-and-counting-semantics) |
| `include` | Comma list of optional stat buckets — see [Workspace & include semantics](#workspace--include-semantics) |
| `workspace` | Optional: container task **identifier** or **title** (single workspace); sets counting scope to that container’s children |

Response: `{ projects: ProjectStats[] }` where each `ProjectStats` includes:

```yaml
id, name, prefix, description?   # description optional/truncated
totalTasks: number              # all rows (incl. workspace children)
mainBoardTasks: number          # parentId IS NULL — default agent headline
workspaceContainers?: number    # isContainer = true
workspaceChildTasks?: number    # parentId IS NOT NULL
columns:
  - id, name, roleType, taskCountMain, taskCountAll?, color?
documents?: { total, byType: { SPECIFICATION: n, ... } }
agentReview?: { taskCount, identifiers?: string[] }   # identifiers capped (default 5)
helpRequests?: { open: number }
blocked?: { taskCount: number }
workspaces?: { activeCount: number, items?: [{ id, identifier, title?, childCount, columns? }] }  # only when workspace include requested
summaryLine: string   # one line for MCP text mode; must mention scope
```

**Auth:** unchanged (agent key + user Bearer on agent router). Document platform-agent allowlist requirement.

#### Workspace & include semantics

**Fleet responses stay lean:** per-project totals only unless the client opts in to workspace detail.

| Client intent | HTTP (query) | MCP / CLI |
|---------------|--------------|-----------|
| Default fleet / overview | `scope=main` (default), no workspace include | `project overview` (default) |
| List workspace containers (names/ids, light metadata) | `include=workspaces` or `listWorkspaces=true` | `--list-workspaces` |
| Top-N busiest workspaces only (default when `include=workspaces`) | `include=workspaces` (cap 5 in fleet; configurable on single-project) | `--list-workspaces` |
| All workspace digests for one project | `include=workspaces:all` on single-project summary; **not** default on fleet | `include=all` or `--include-workspaces all` |
| Counts for one workspace by identifier/title | `scope=workspace:{id}` **or** `workspace={identifier\|title}` | `include={workspaceIdentifier}` (e.g. `include=SPEC-42`) |
| Project-wide inventory (all tasks in all columns) | `scope=all` | `--scope all` |

**`include` token rules (do not overload `scope`):**

- **Stat buckets** (any summary call): `documents`, `agentReview`, `helpRequests`, `blocked` — comma-separated.
- **Workspaces list/digest:** `workspaces` (top-N), `workspaces:all` (every container with child counts; single-project only recommended for fleet).
- **Single workspace by name/id:** prefer query param `workspace=SPEC-42` (or title if unique); MCP/CLI may accept `include=SPEC-42` as sugar that implies `scope=workspace:{resolvedId}` after hub resolves identifier.

Resolve `workspace` / `include=<identifier>` server-side to a container task (`isContainer: true`); 404 if ambiguous title or not a container.

**Product decision (2026-05-26):** Agreed — fleet does **not** embed workspace digests by default; use `include=workspaces`, `workspaces:all`, or `workspace=` / `include=<name>` when the user or agent needs sub-board visibility.

#### B. Single-project summary (new)

`GET /api/agent/projects/{projectId}/summary`

Same `ProjectStats` schema as one element of fleet response. Requires delegation / membership (existing agent project access).

#### C. Human explore list (new or extended)

**Option C1 (preferred):** `GET /api/projects/summary` — membership-scoped fleet summary, **same `ProjectStats` schema** as agent fleet (minus agent-only fields if any).

**Option C2:** Add `?view=summary` to `GET /api/projects` — avoids new path but blurs list vs stats semantics.

Recommend **C1** for clarity and cache keys; keep `GET /api/projects` for settings/admin flows that need full project metadata without tasks.

#### D. Human single-project (align)

Extend `GET /api/projects/{id}/summary` to return **`ProjectStats`** (or redirect internally to shared handler) instead of the legacy `{ projectName, members, columnSummary }` shape.

Deprecation: map old fields for one release or version bump in OpenAPI `operationId`.

---

## Frontend migration (explore)

| Step | Change |
|------|--------|
| 1 | Add `useProjectsSummaryQuery()` → `GET /api/projects/summary?scope=main` (or shared client method) |
| 2 | `ProjectSummaryCard` uses `mainBoardTasks` + `columns[].taskCountMain` + `color` — stop reading `column.tasks` |
| 3 | Optional ghost hint: “+N in workspaces” when `workspaceChildTasks > 0` |
| 4 | Modal click: column counts from summary; “View Board” unchanged |
| 5 | Remove dependency on embedded tasks in explore fetch (large payload win) |

**UI note:** Cards become **main-board-oriented** (aligned with kanban), not full project inventory. Use `scope=all` only if product later adds an “include workspace tasks” affordance.

Update [`OPENAPI_UI_GAP_ANALYSIS.md`](../../frontend/docs/OPENAPI_UI_GAP_ANALYSIS.md): mark project summary dashboard **Partial → Covered** after explore migration; remove “no summary dashboard” for fleet view.

---

## MCP / CLI

| Tool | Change |
|------|--------|
| `read_project_overview` | Pass `scope` (default `main`) + optional stat `include` + `list_workspaces`; format `summaryLine` per project + fleet total |
| `read_project_summary` (new) | `project_id` + optional `scope` / stat `include` / `workspace` / `list_workspaces` / `workspaces_all`; calls `GET /api/agent/projects/{id}/summary` |
| `read_project_state` | Docstring: **drill-down only**; recommend summary tools first; consider default `per_column_limit=3` |

CLI:

- `vibetask-cli project overview [--scope main|all] [--list-workspaces] [--include documents,agentReview,...]` — existing tool, add flags
- `vibetask-cli project summary <id> [--scope main|all|workspace:ID] [--list-workspaces] [--include-workspaces all] [--include <workspaceIdentifier>] [--include documents,...]` — new

**CLI flag mapping:** `--list-workspaces` → `include=workspaces`; `--include-workspaces all` → `include=workspaces:all`; `--include SPEC-42` → resolve container and `scope=workspace:{id}`.

After OpenAPI update: prefer **generated** hub-client method for `/summary` instead of raw `serde_json::Value` in `get_project_summary`.

---

## OpenAPI & code generation pipeline

**Canonical spec (today):** `hub/src/openapi.json`  
**Consumers:**

| Consumer | Generation |
|----------|------------|
| Frontend TS | `frontend/openapi.json` copy → `npm run openapi:gen-types` |
| Rust MCP/CLI | `app/crates/vibetask-hub-client/build.rs` → Progenitor (`/api/agent/*` only) |

### Required spec additions

1. Path: `GET /api/agent/projects/summary` (document existing behavior + new query params + response).
2. Path: `GET /api/agent/projects/{projectId}/summary` (new).
3. Path: `GET /api/projects/summary` (new human fleet) **or** documented query on list.
4. Schemas: `ProjectStats`, `ColumnStats` (`taskCountMain`, `taskCountAll`), `WorkspaceStats`, `DocumentStats`, `AgentReviewStats`, `ProjectSummaryResponse`, etc.
5. Document query param `scope` on all summary routes.
6. Update human `ProjectSummary` or replace with `ProjectStats` + migration note.
7. Document `roleType` enum on column stats (`AGENT_REVIEW`, …).

### Validation checklist (every PR touching contract)

Run in order (from [`frontend/docs/DEVELOPER_HELPER_TOOLS.md`](../../frontend/docs/DEVELOPER_HELPER_TOOLS.md)):

```bash
cd hub && npm run openapi:validate
cd hub && npm run openapi:sync-fe    # or: cd frontend && npm run openapi:sync
cd frontend && npm run openapi:check-sync
cd frontend && npm run openapi:gen-types
cd app && unset ARGV0 && cargo build -p vibetask-hub-client   # Progenitor regen
cd app && unset ARGV0 && cargo test -p vibetask-hub-client
cd hub && npm run test:integration   # extend agent-docs tests for new fields
```

CI already runs frontend `openapi:check-sync`; ensure hub validate runs if not already on summary-related PRs.

---

## Contract governance — `CONTRACT.md` & repo-root OpenAPI

### Formalize `CONTRACT.md` (recommended Phase 0)

Expand [`CONTRACT.md`](../../CONTRACT.md) beyond the current table:

1. **Ownership** — Hub team owns routes + OpenAPI; frontend/app are consumers.
2. **Single source of truth** — path to editable spec (see below).
3. **Breaking change policy** — additive fields OK; renames/removals require OpenAPI version note + consumer sync in same commit.
4. **Security schemes** — `bearerAuth`, `agentAuth`, `x-platform-session` where applicable.
5. **Validation matrix** — copy/paste command block above.
6. **Undocumented routes** — forbidden for new work; agent `/summary` is existing debt to fix in this mission.
7. **Link** to this gap doc + `OPENAPI_UI_GAP_ANALYSIS.md`.

### Should OpenAPI live at repo root?

| Approach | Pros | Cons |
|----------|------|------|
| **Keep `hub/src/openapi.json` (recommended)** | Hub owns routes; scripts already wired; minimal churn | Less visible at monorepo root |
| **Move to `/openapi.json` at root** | One obvious path for humans/tools | Update build.rs, sync scripts, CI, docs, IDE bookmarks |
| **Root symlink → hub/src** | Discoverability without duplicate edit surface | Symlink friction on Windows/ some tools |
| **Root = bundled publish artifact only** | Clean “published contract” | Two files unless bundle replaces copy |

**Recommendation:**

- **Do not** maintain two editable OpenAPI files.
- **Phase 0:** Formalize `CONTRACT.md`; add explicit pointer: “Editable spec: `hub/src/openapi.json`”.
- **Optional:** Add repo-root **`openapi.json` symlink** to `hub/src/openapi.json` *or* document that `hub npm run openapi:bundle` output is the portable artifact — only if you want root visibility without moving source.
- **Defer** full move to root until a dedicated “API packaging” mission; if moved, update Progenitor path in one commit with sync scripts.

**Reading from project root in tooling:** Unify on an env var or relative path in `CONTRACT.md`, e.g. `OPENAPI_SPEC=hub/src/openapi.json`, so future root move is one constant change.

---

## Hub implementation notes

Shared handler: `buildProjectStats(projectId, includeFlags)` used by:

- Agent fleet summary
- Agent single summary
- Human fleet/single summary (auth wrapper differs)

SQL strategy (keep lightweight):

- Task buckets: `totalTasks`, `mainBoardTasks` (`parentId IS NULL`), `workspaceChildTasks`, `workspaceContainers` — see [Workspaces](#workspaces-sub-boards-and-counting-semantics)
- `task.groupBy` by `projectColumnId` **twice** when `scope=all` or when returning both `taskCountMain` and `taskCountAll`; single groupBy when `scope=main` only
- `document.groupBy` by `docType` when `include` contains `documents`
- Agent Review: filter columns where `roleType = 'AGENT_REVIEW'`, count tasks; optional `identifier` list with `take(5)`
- Help requests: count where status open (confirm schema)
- Blocked: count tasks with open `blocked-by` relation (reuse relation policy tables)
- Workspaces (`include=workspaces`): `activeCount` + optional top containers by child count (identifiers only, cap 5)

Performance: batch fleet query with `projectId in (...)` — avoid N+1 per project for column counts (today’s agent summary does per-project `groupBy`; optimize in same mission).

Platform agent: add `/api/agent/projects/summary` and `/api/agent/projects/:projectId/summary` to default platform read templates / seed metadata where appropriate.

---

## Testing & acceptance criteria

### API

- [ ] Agent key: delegated project appears with correct column counts
- [ ] Agent key: non-delegated project → 403 on single summary
- [ ] User Bearer on agent summary: all membership projects
- [ ] `include=agentReview` returns count; identifiers length ≤ cap
- [ ] `include=documents` returns byType counts without doc bodies
- [ ] `projectId` filter returns one project
- [ ] Human `GET /api/projects/summary` matches agent stats shape (minus forbidden fields)
- [ ] Workspace regression: `scope=main` vs `scope=all` vs `scope=workspace:{id}` on seed project with accept-plan children

### MCP / CLI

- [ ] `read_project_overview` output ≤ agreed size budget on seed project 10 (smoke: no full task arrays)
- [ ] `read_project_summary` for project 10 matches hub JSON
- [ ] Generated Progenitor client compiles; new methods used in hub-client wrapper

### Frontend

- [ ] Explore cards use main-board counts; optional “+N in workspaces” hint
- [ ] Explore card totals no longer exceed main board totals unless `scope=all` explicitly requested

### Contract

- [ ] `hub npm run openapi:validate` passes
- [ ] `frontend openapi:check-sync` passes
- [ ] `openapi-types.ts` updated
- [ ] `CONTRACT.md` updated with validation matrix
- [ ] This doc + `OPENAPI_UI_GAP_ANALYSIS.md` status updated

---

## Implementation phases (sequential)

| Phase | Scope | Deliverable |
|-------|--------|-------------|
| **0** | Governance | `CONTRACT.md` expansion; optional root symlink/bundle note; OpenAPI debt ticket for undocumented `/summary` |
| **1** | OpenAPI + agent fleet | Document `GET /api/agent/projects/summary`; add schemas; `include` + `projectId`; Progenitor + TS types |
| **2** | Hub stats engine | Shared `buildProjectStats` with `scope`; workspace buckets; agentReview, documents, helpRequests, blocked |
| **3** | Agent single + MCP | `GET /api/agent/projects/{id}/summary`; `read_project_summary` tool; CLI subcommand |
| **4** | Human summary | `GET /api/projects/summary`; align `GET /api/projects/{id}/summary` |
| **5** | Frontend explore | `useProjectsSummaryQuery`; migrate `ProjectSummaryCard` |
| **6** | Docs & platform | `agents.md` tool guide; platform allowlist; update gap analyses |

**Implementation:** Open questions below are decided (2026-05-26). Phase 0+ may proceed when explicitly requested.

---

## Open-question decisions (2026-05-26)

1. **Platform “all my projects”:** Allow platform agent multi-project macro stats under user scope (example: "how many tasks/plans need my review across projects?").
2. **Human vs agent schema:** Agent response is a subset of `ProjectStats`; do not include member emails in agent payloads.
3. **Legacy `ProjectSummary`:** Keep `ProjectSummary` available for now; implement new DB-side aggregation as `ProjectStats` and migrate consumers to it.
4. **Explore pagination:** Keep explore pagination behavior as-is for now (fleet summary path should remain paginated for large project counts).
5. **Root OpenAPI file:** Stay hub-only (`hub/src/openapi.json`) for now.
6. **Explore card scope (product):** Default to `scope=main`.
7. **Per-workspace summary in fleet call:** **Lean by default.** Opt in via `include=workspaces` (top-N), `include=workspaces:all` / CLI `include=all` (single-project; heavy), `workspace=` / `include=<identifier>` for one workspace, or CLI `--list-workspaces`. See [Workspace & include semantics](#workspace--include-semantics).

---

## Supersedes / updates

- Updates fleet-summary row in [`OPENAPI_UI_GAP_ANALYSIS.md`](../../frontend/docs/OPENAPI_UI_GAP_ANALYSIS.md) when Phase 5 completes.
- Does **not** replace WebSocket or auth contract docs.
