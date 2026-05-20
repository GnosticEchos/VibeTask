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
- Cards show a **container** badge (⧉) when the task is a sub-board parent.
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

## Sub-boards (container tasks)

A **sub-board** is not a separate project. It is a **container task** on the main board with its own child tasks shown on a filtered board view.

### How sub-boards are created today

There is no **“New sub-board”** button. The supported human workflow is:

1. Create or open a **parent task** on the main board.
2. In the task dialog, **link a document** with role **Implementation plan** (`IMPLEMENTATION_PLAN`).
3. Write the plan in Markdown with sub-work as **`##` or `###` headings** (each heading becomes a child task name).
4. If you are **Maintainer** or **Owner**, click **Accept Plan & Expand** in the task dialog.
5. The app marks the parent as a container, accepts the plan, and creates child tasks in columns.

### Using sub-boards after creation

- Open the **Sub-board** menu on the board toolbar to switch between **Main board** and **active sub-boards**.
- **DRAFT** on a sub-board means the container exists but the plan is not fully accepted (or children exist before acceptance).
- Open a sub-board to see only that container’s child tasks.

For automation (agents creating containers), see [Working with AI agents](agents.md).

## Search

From **Explore** (and on some project views), use the **search** bar to find tasks across projects you can access. Open a result to jump into the task dialog.

## Related guides

- [Tasks and assignments](tasks-and-assignments.md)
- [Task relationships](task-relationships.md)
- [Settings guide](settings-guide.md)
- [User guide index](README.md)
