# Task relationships

VibeTask lets you link one task to another with a **relationship type**. This guide explains what each type means and what the app actually does with them today (alpha).

## One link per task

Each task can point to **at most one** related task (`relation` + related task). This is a single pointer, not a full dependency graph. If you need many dependencies, pick the most important link or use documents/comments for the rest.

## Relationship types

When creating or editing a task, choose a **type** and a **related task**:

| Type in UI | API value | Meaning (plain language) |
|------------|-----------|-------------------------|
| **Related to** | `relates-to` | Loose association — “these belong together” with **no automatic rule** |
| **Blocks** | `blocks` | **This task** should be finished before the **other** task can proceed |
| **Blocked by** | `blocked-by` | **This task** cannot proceed until the **other** task is finished |
| **Duplicate of** | `duplicate-of` | This task tracks the same work as the other (dedupe / tracking) |

Use **Duplicate of** and pick the canonical task you are tracking — not a separate “duplicated by” type (the API does not accept `duplicated-by`).

## Where to set relationships

- **Add New Task** — **Task link** (optional) and **Workspace** membership (optional).
- **Task dialog** — **Relationships** section:
  - **Task link** — type (`— None —`, Related to, Blocked by, …) + related task. Choose **— None —** to clear a blocker or other link.
  - **Workspace** — pick a workspace root or **— None (main board) —** to move the task back to the main board (or switch to another workspace).
- **Make this a workspace** (Editor+) — checkbox on the task dialog for container roots (separate from membership).

## What the app does today

| Behavior | Supported? |
|----------|------------|
| Store relation on create/update | Yes |
| Show relation in task dialog | Yes (when loaded from API) |
| Show relation on board cards | **Yes** — small badge with type and related task id |
| Block drag into **Done** when “blocked by” open task | **Yes** — server rejects the move; board shows an error toast |
| Block drag-and-drop in other cases | **No** |
| Filter board by “blocked” | **No** |
| List all tasks blocked by X | **No** |

**Done-column rule:** If this task is **Blocked by** another task, you cannot drag it into a **Done** column until that blocker is in a Done column. The board shows an error toast when the server rejects the move.

**Column protection** (minimum role to enter or leave a column) is separate from task relations. Configure it under **Settings → Project Settings → Columns & descriptions** → **Save move policies**. Drag-and-drop enforces those rules on the server.

## Practical usage tips

- Use **Blocked by** when you want readers to see “waiting on VT-12” in the task details.
- Use **Blocks** when this task is the gate for another (same information, reversed direction).
- Use **Related to** for epics, spikes, or loose coupling without implying order.
- Use **Duplicate of** when closing duplicate tickets or tracking the same fix in two places.

When moving into a **Done** column, the server blocks the move if a **Blocked by** dependency is not yet in a Done column. Other columns are not gated by relations yet.

## Planned improvements (product direction)

Possible follow-ups (not committed):

1. **Inverse links** — e.g. list tasks that are blocked by this task on the task dialog.
2. **Board filters** — show only blocked tasks, or highlight dependency chains.
3. **Broader move rules** — optional guards in columns other than Done (today only Done is relation-gated).

## Related guides

- [Tasks and assignments](tasks-and-assignments.md)
- [Projects and boards](projects-and-boards.md)
- [User guide index](README.md)
