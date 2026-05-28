# Projects and boards

This guide explains how projects, columns, and boards work in the VibeTask web app (alpha).

## Projects

A **project** is a workspace for one team’s Kanban board: columns, tasks, members, and documents.

### Create a project

1. Open **Explore** (sidebar) or use **Settings → Project Settings**.
2. Choose **Create new project** / **Create project**.
3. Enter a **name** and optional **description**.
4. Set a **prefix** (2–8 letters or numbers, e.g. `VT`). Task IDs use this prefix: `VT-1`, `VT-2`, …
5. If templates are offered when creating a project, pick one to pre-fill defaults (optional).

You must be signed in. New projects make you the **Owner**.

### Open a project

From **Explore**, click a project card to open its **board** tab (default view).

### Explore project overview

On **Explore**, each project card shows **column counts** from the fleet summary API. Use **Main board** vs **All tasks** to match how the main Kanban counts tasks (main excludes workspace children except **Agent Review**, which includes nested tasks for parity with the board). Counts refresh after task changes when you revisit Explore or when caches invalidate.

### Project roles

| Role | Typical use |
|------|-------------|
| **Owner** | Full control, including membership and delete |
| **Maintainer** | Manage members, columns, invites, accept implementation plans |
| **Editor** | Create and edit tasks, move cards |
| **Viewer** | Read-only on the board |

Exact permissions can vary by screen; **Maintainer** and above manage workspace settings under **Settings → Project Settings**.

## The board

The **board** is a column-based Kanban view for one project.

### Columns

- Each column is a workflow stage (e.g. To Do, In Progress, Done).
- **Drag** a task card to another column to change its stage, or open the task and change **Status** (column) in the dialog.
- Column **descriptions** (what belongs in each stage) can be edited under **Settings → Project Settings → Columns & descriptions** (Maintainer+).

### Task cards

- **Double-click** a card (or open from search) for the full **task dialog**: description, assignee, relations, comments, linked documents.
- Cards show a **container** badge (⧉) when the task is a **workspace** root (nested board parent).
- Use the **card size** slider on the board toolbar to zoom tiles.

### Tabs on a project

| Tab | Purpose |
|-----|---------|
| **Board** | Main Kanban |
| **Grid** | Alternate grid layout of tasks |
| **Members** | Opens the members dialog (invite, roles) |
| **Docs** | Project documents (specs, plans, notes) |
| **Add New Task** | Quick-add task dialog |

### Backlog

The **Backlog** view (sidebar) lists tasks for your projects that are not assigned to a column (unassigned). Use it to triage work before pulling items onto the board.

## Workspaces (container tasks)

A **workspace** (sometimes called a sub-board in older copy) is not a separate project. It is a **container task** on the main board with its own child tasks on a filtered board view.

### How workspaces are created

- **New workspace** tab on the project board (creates a container and can open its workspace board).
- **This task is a workspace** in the task dialog (Editor+) on an existing card.
- **Create as workspace** when adding a task (checkbox on the main board).

To place an existing task inside a workspace, use **Relationships → Workspace** in the task dialog, or add a task while viewing that workspace board (main board **Workspace** menu or workspace route). Drag-and-drop onto workspace cards is not supported yet.

Per-workspace **outline color** can be set in the task dialog for workspace roots; the project **default workspace color** is under **Settings → Project Settings → Columns & descriptions**.

The main workflow to spawn many child tasks from a plan is still:

1. Create or open a **parent task** on the main board.
2. In the task dialog, **link a document** with role **Implementation plan** (`IMPLEMENTATION_PLAN`).
3. Write the plan in Markdown with sub-work as **`##` or `###` headings** (each heading becomes a child task name).
4. If you are **Maintainer** or **Owner**, click **Accept Plan & Expand** in the task dialog.
5. The app marks the parent as a container, accepts the plan, and creates child tasks in columns.

### Using workspaces after creation

- Open the **Workspace** menu on the board toolbar to switch between **Main board** and active workspaces.
- **DRAFT** on a workspace means the container exists but the plan is not fully accepted (or children exist before acceptance).
- Open a workspace to see only that container’s child tasks.

For automation (agents creating containers), see [Working with AI agents](agents.md).

## Search

From **Explore** (and on some project views), use the **search** bar to find tasks across projects you can access. Open a result to jump into the task dialog.

## Related guides

- [Tasks and assignments](tasks-and-assignments.md)
- [Task relationships](task-relationships.md)
- [Settings guide](settings-guide.md)
- [User guide index](README.md)
