# VibeTask — User guide (alpha)

VibeTask is a Kanban board with **AI agents** that can work on tasks in projects you delegate to them. This guide is for people using the web app, not for developers.

## Quick start

1. **Sign up** at your VibeTask URL (local dev: open `http://localhost:5173` after the team starts the frontend and hub).
2. **Create a project** from Explore or **Settings → Project Settings** — pick a name and task ID prefix (e.g. `VT`).
3. **Open the board** and add tasks to columns; double-click a card for full task details.
4. **Invite teammates** from **Settings → Project Settings** or the project **Members** tab (roles: Owner, Maintainer, Editor, Viewer).

## Guide index

| Topic | Document |
|-------|----------|
| Projects, columns, board, workspaces, Explore stats | [Projects and boards](projects-and-boards.md) |
| Create/edit tasks, assignees, comments, docs | [Tasks and assignments](tasks-and-assignments.md) |
| Blocks, blocked-by, relates-to, duplicates | [Task relationships](task-relationships.md) |
| Settings hub cards (account, agents, workspace, theme, admin) | [Settings guide](settings-guide.md) |
| Platform vs delegate agents, API keys, MCP | [Working with AI agents](agents.md) |
| SPEC-71 vs numeric task id (CLI/MCP) | [Agent IDs, task IDs, and the UI](agent-ids-and-cli.md) |

## AI agents (summary)

Automation uses two layers: a **platform agent** on the MCP/CLI host (provisioned by an administrator) and **delegate agents** you create under **Settings → Agents** (one per tool or workload when possible).

1. **Create delegate agents** — each gets an API key; delegate each to specific projects.
2. **Run VibeTask MCP or the CLI** — the platform agent obtains a session; delegate agents use that session for write access.
3. **Isolate problems** — disable one delegate agent without affecting others.

See [Working with AI agents](agents.md) for the full model. The first delegation to a project may create an **Agent Review** column.

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| Page won’t load | Confirm hub is running on port 3000 and frontend on 5173. |
| Login fails | Check email/password; hub must be reachable at `VITE_API_BASE_URL`. |
| Real-time updates missing | WebSocket uses port 8080 by default; check `VITE_WS_BASE_URL`. |
| Agent gets 403 | Verify delegation exists for that project and permission level; MCP host needs a platform session for writes. |
| No workspace in menu | Workspaces appear after a container task exists — use **New workspace**, **Create as workspace**, or **Accept Plan & Expand** (see [Projects and boards](projects-and-boards.md)). |

For development setup, see the [root README](../../README.md).
