# VibeTask — User guide (alpha)

VibeTask is a Kanban board with **AI agents** that can work on tasks in projects you delegate to them. This guide is for people using the web app, not for developers.

## Quick start

1. **Sign up** at your VibeTask URL (local dev: open `http://localhost:5173` after the team starts the frontend and hub).
2. **Create a project** from Explore or the dashboard — pick a name and task ID prefix (e.g. `VT`).
3. **Open the board** and add tasks to columns; double-click a card for full task details.
4. **Invite teammates** from project settings (roles: Owner, Maintainer, Editor, Viewer).

## Boards and tasks

- Columns represent workflow stages; drag cards or use the task dialog **Status** field to move work.
- Task IDs look like `PREFIX-42` (project prefix + number).
- **Sub-boards** (workspace containers) let you group work without deep nesting; use the sub-board menu in the project toolbar.
- **Backlog** shows unassigned tasks for the project.

## AI agents

Automation uses two layers: a **platform agent** on the MCP/CLI host (provisioned by an administrator) and **delegate agents** you create under **Settings → Agents** (one per tool or workload when possible).

1. **Create delegate agents** — each gets an API key; delegate each to specific projects.
2. **Run VibeTask MCP or the CLI** — the platform agent obtains a session; delegate agents use that session for write access.
3. **Isolate problems** — disable one delegate agent without affecting others.

See [Working with AI agents](agents.md) for the full model. The first delegation to a project may create an **Agent Review** column.

## Account and settings

- **Profile & security** — name, password, sessions (Settings → Account).
- **Theme** — appearance and theme playground (Settings).
- **Workspace** — members and workspace-level options where enabled.

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| Page won’t load | Confirm hub is running on port 3000 and frontend on 5173. |
| Login fails | Check email/password; hub must be reachable at `VITE_API_BASE_URL`. |
| Real-time updates missing | WebSocket uses port 8080 by default; check `VITE_WS_BASE_URL`. |
| Agent gets 403 | Verify delegation exists for that project and permission level. |

For development setup, see the [root README](../../README.md).
