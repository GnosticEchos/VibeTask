# Tasks and assignments

How to create, edit, assign, and discuss tasks in VibeTask (alpha).

## Task identity

Every task has:

- A **title** and optional **description** (rich text in the dialog).
- An **identifier** like `PREFIX-42` (project prefix + number) — shown on the board and in the task dialog.
- A numeric **API task id** (integer) used by the hub API, CLI, and MCP; usually not shown in the UI. See [Agent IDs, task IDs, and the UI](agent-ids-and-cli.md).
- A **column** (status on the board), or none if it lives in the **backlog** unassigned.
- An **assignee** — a human member and/or an **agent** (see below).

## Create a task

### From the project

1. Open a project.
2. Click the **Add New Task** tab, or use controls on the board/backlog as available.
3. Fill in **name**, **description**, **column** (optional), **assignee** (optional).
4. Optionally set a **relation** to another task (type + related task). See [Task relationships](task-relationships.md).
5. Submit to create the task.

### From backlog

Open **Backlog** in the sidebar, add a task, then assign it to a column later from the board or task dialog.

## Edit a task

Open the task (double-click on the board or from search):

| Field | Notes |
|-------|--------|
| **Name / description** | Save with the dialog’s save action |
| **Status** | Column on the board |
| **Assignee** | Human user or delegated **agent** for this project |
| **Relationships** | Task link and **Workspace** membership (optional; use **— None —** to clear) |
| **Workspace** | Checkbox to mark the task as a workspace root; outline color when it is a workspace |
| **Linked documents** | Attach specs, implementation plans, etc. |
| **Comments** | Thread at the bottom of the dialog |

Changes sync to the board for other viewers when real-time updates are connected (WebSocket).

## Assigning work

### Human assignee

Choose a **project member** with Editor-capable access in the assignee field. Members are managed under **Settings → Project Settings → Members** or the project **Members** tab.

### Agent assignee

If agents are **delegated** to the project, they appear in the assignee list (from the project’s delegate list). Agents work via API/MCP, not by logging into the web UI.

Requirements for agents:

- A **delegate agent** you created under **Settings → Agents**, with access to this project.
- For writes, a valid **platform session** on the automation host (see [agents.md](agents.md)).

The first agent delegation to a project may add an **Agent Review** column for human review of agent moves.

## Comments and history

- **Comments** — add text in the task dialog; useful for handoff and review.
- **History** — audit-style events when available in the dialog.

## Documents and plans

From the task dialog you can:

- **Link** existing project documents (with a role such as specification or implementation plan).
- **Open** linked docs in the project **Docs** tab.

Linking an **implementation plan** is required before **Accept Plan & Expand** (workspace creation). See [Projects and boards — Workspaces](projects-and-boards.md#workspaces-container-tasks).

## What the app does not do yet (alpha)

These are common expectations that are **limited or missing** today:

- **Delete task** from the UI (API may exist; no board control).
- **Drag** a card onto a workspace to assign membership (use **Workspace** in the task dialog or **Add New Task** while viewing that workspace).
- **Blocked by** only blocks moves into **Done** columns (not every column). See [Task relationships](task-relationships.md).

## Related guides

- [Task relationships](task-relationships.md)
- [Projects and boards](projects-and-boards.md)
- [Settings guide](settings-guide.md)
- [Working with AI agents](agents.md)
