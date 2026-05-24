# Task IDs for agents, CLI, and the web UI

VibeTask uses more than one way to refer to a task. They are all valid; they serve different layers of the system.

## Three ways to point at a task

| Kind | Example | Where you see it |
|------|---------|------------------|
| **Identifier** (display) | `SPEC-71` | Board cards, task dialog badge, search results |
| **Numeric task id** (database) | `193` | Hub API, `vibetask-cli task …`, MCP tools that take `task_id` |
| **Compound task id** | `10-152` | Some Verify-column CLI/MCP commands (`reflect`, `approve`, `reject`) |

### Identifier (`PREFIX-N`)

- Assigned per project from the project **prefix** (e.g. `SPEC`) and a sequence number (`71` → `SPEC-71`).
- This is what humans expect on a Kanban card.
- Stable within a project for communication (“fix SPEC-71”).

### Numeric task id

- Integer primary key in the database (`Task.id`).
- Required for most agent and CLI mutations:  
  `POST /api/agent/projects/10/tasks/193/…`,  
  `vibetask-cli task move 10 193 53`.
- Shown in CLI output when you create a task, e.g. `ID: 193` alongside `SPEC-71`.

### Compound id (`projectId-taskId`)

- String form: `{projectId}-{numericTaskId}`, e.g. `10-152` for project 10, task 152.
- Used only for **Verify** workflow entrypoints that were designed around “project + task” in one token.
- **Not** the same as the display suffix: `10-152` is not “SPEC-152”.

## UI and CLI now show both (human + API ids)

The task dialog header shows the **identifier** badge plus subdued **task** / **project** numeric ids (DaisyUI `badge-ghost`, copy button). Document editor shows **doc {id}** the same way.

CLI and MCP output use a shared dual label, e.g. `SPEC-71 (task id 193, project 10)`, and `task move` accepts numeric id, compound id (`10-152`), or identifier (`SPEC-71`).

## How to map CLI output to the UI

1. Run a read-only command that returns both fields, e.g.  
   `vibetask-cli project tasks 10 --limit 20`  
   (text output lists tasks; JSON format includes structured fields when available).
2. After **task create**, read the CLI message: it prints **both** `ID: 193` and the identifier line (`SPEC-71`).
3. In the UI, open the task with matching **identifier** or title from the create command.
4. For Verify commands, convert: if you know `SPEC-152` and project `10`, resolve numeric id via project tasks list or hub `GET /api/tasks/:id` (browser network tab) before using `10-152`.

Documents use numeric **document id** in agent/CLI paths (`read-doc 10 104`) while titles appear in the UI—same pattern as tasks.

## Implemented behavior

1. **UI** — Task dialog and document editor: ghost badges + copy (no global “show API ids on cards” toggle).
2. **CLI** — Dual-label on create (MCP text), move (JSON `label` + `identifier`), progress updates, and task list queries.
3. **CLI task reference** — `task move`, `update-progress`, `link-document`, and `request-help` accept numeric id, compound id, or identifier (resolved via agent search).
4. **MCP** — `create_task`, `query_tasks`, and `update_task_progress` include the dual label in text results; `task move` JSON includes `id`, `identifier`, `projectId`, and `label`.

Treat **identifier** as the human handle and **numeric id** as the machine handle; copy from the task dialog copies `"{projectId} {taskId}"` for `vibetask-cli task move`.

## See also

- [Working with AI agents](agents.md)
- [Tasks and assignments](tasks-and-assignments.md)
- [app/scripts/README.md](../../app/scripts/README.md) — CLI test scripts
