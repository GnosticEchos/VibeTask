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

## Why the UI does not show the numeric id today

The task dialog and board tiles emphasize **identifier** because it is unique per project and readable in stand-ups and docs. The numeric id is an implementation detail for APIs and automation.

That creates a gap when you run the CLI or MCP against task `193` but only see `SPEC-71` in the browser.

## How to map CLI output to the UI

1. Run a read-only command that returns both fields, e.g.  
   `vibetask-cli project tasks 10 --limit 20`  
   (text output lists tasks; JSON format includes structured fields when available).
2. After **task create**, read the CLI message: it prints **both** `ID: 193` and the identifier line (`SPEC-71`).
3. In the UI, open the task with matching **identifier** or title from the create command.
4. For Verify commands, convert: if you know `SPEC-152` and project `10`, resolve numeric id via project tasks list or hub `GET /api/tasks/:id` (browser network tab) before using `10-152`.

Documents use numeric **document id** in agent/CLI paths (`read-doc 10 104`) while titles appear in the UI—same pattern as tasks.

## Product direction (recommended)

These are sensible improvements; none are required to use agents today:

1. **UI — copy-friendly technical row**  
   In the task dialog header or footer, show a subdued line:  
   `API task id: 193 · project: 10` with a copy button. Optional “developer details” collapse so casual users are not cluttered.

2. **CLI — always dual-label**  
   Standardize create/move/status output:  
   `Task SPEC-71 (id 193) on project 10`.

3. **CLI — accept identifier**  
   Optional flags, e.g.  
   `task move --identifier SPEC-71 --column-id 53`  
   resolving via hub search (same as the UI).

4. **MCP tools**  
   Return `id`, `identifier`, and `project_id` together in tool results so agents do not guess.

5. **Settings**  
   Optional “Show API ids on cards” for agent operators (off by default).

Until then, treat **identifier** as the human handle and **numeric id** as the machine handle; use CLI create/list output to link them.

## See also

- [Working with AI agents](agents.md)
- [Tasks and assignments](tasks-and-assignments.md)
- [app/scripts/README.md](../../app/scripts/README.md) — CLI test scripts
