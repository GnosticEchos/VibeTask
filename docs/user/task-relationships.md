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

### Types to avoid in the UI

**Duplicated by** may appear in some create-task screens but is **not** accepted by the server. Use **Duplicate of** instead and pick the task you are duplicating.

## Where to set relationships

- **Add New Task** — optional **Relation** section (both type and related task required if you start either field).
- **Task dialog** — **Relationships** section: type dropdown + related task, then save the task.

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

**Important:** Relationships are **metadata for people** right now. Moving a card to Done does **not** check whether the task is still blocked by an incomplete task.

Column **protection** (who may move into/out of certain columns) is separate and is enforced on move when configured in project settings — that feature is not fully exposed in the UI yet.

## Practical usage tips

- Use **Blocked by** when you want readers to see “waiting on VT-12” in the task details.
- Use **Blocks** when this task is the gate for another (same information, reversed direction).
- Use **Related to** for epics, spikes, or loose coupling without implying order.
- Use **Duplicate of** when closing duplicate tickets or tracking the same fix in two places.

When moving into a **Done** column, the server blocks the move if a **Blocked by** dependency is not yet in a Done column. Other columns are not gated by relations yet.

## Planned improvements (product direction)

These are not promises — common next steps discussed for the product:

1. Badges on board cards (e.g. “Blocked by VT-12”).
2. Optional guard when moving into “done” columns if blockers are open.
3. Clearer inverse links (“tasks blocked by this”).

## Related guides

- [Tasks and assignments](tasks-and-assignments.md)
- [Projects and boards](projects-and-boards.md)
- [User guide index](README.md)
